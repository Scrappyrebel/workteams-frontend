"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";

export default function ApprovalsPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member, loading } = useCompany();
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("training_enrollments")
      .select(`
        id, status, started_at,
        training_courses!inner(title, slug, recert_months),
        company_members!training_enrollments_member_id_fkey(id, display_name),
        training_evidence(id, file_url, notes, submitted_at)
      `)
      .eq("company_id", companyId)
      .eq("status", "pending_approval")
      .order("started_at");
    setPending(data || []);
  }

  useEffect(() => {
    if (!loading && isManager) load();
  }, [loading, isManager]);

  async function decide(enrollment, approved) {
    const notes = approved ? null : prompt("What needs to be fixed? (sent to the employee)");
    if (!approved && notes === null) return;
    setBusy(enrollment.id);
    const sb = supabase();
    await sb.from("training_approvals").insert({
      enrollment_id: enrollment.id,
      reviewer_member_id: member.id,
      decision: approved ? "approved" : "rejected",
      notes,
      decided_at: new Date().toISOString(),
    });
    if (approved) {
      const months = enrollment.training_courses.recert_months || 12;
      const expires = new Date();
      expires.setMonth(expires.getMonth() + months);
      const { data: course } = await sb
        .from("training_courses")
        .select("id")
        .eq("slug", enrollment.training_courses.slug)
        .single();
      // member id for certification
      const { data: enr } = await sb
        .from("training_enrollments")
        .select("member_id, course_id")
        .eq("id", enrollment.id)
        .single();
      await sb.from("training_certifications").insert({
        company_id: companyId,
        member_id: enr.member_id,
        course_id: enr.course_id,
        expires_at: expires.toISOString(),
      });
      await sb
        .from("training_enrollments")
        .update({ status: "certified", completed_at: new Date().toISOString() })
        .eq("id", enrollment.id);
      // Mark steps 10-11 complete.
      const { data: steps } = await sb
        .from("training_step_progress")
        .select("id, training_steps!inner(step_number)")
        .eq("enrollment_id", enrollment.id);
      for (const s of steps || []) {
        if ([10, 11].includes(s.training_steps.step_number)) {
          await sb
            .from("training_step_progress")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", s.id);
        }
      }
    } else {
      await sb
        .from("training_enrollments")
        .update({ status: "in_progress" })
        .eq("id", enrollment.id);
      // Re-open the evidence step so they can resubmit.
      const { data: steps } = await sb
        .from("training_step_progress")
        .select("id, training_steps!inner(step_number)")
        .eq("enrollment_id", enrollment.id);
      for (const s of steps || []) {
        if (s.training_steps.step_number === 9) {
          await sb
            .from("training_step_progress")
            .update({ status: "available", completed_at: null })
            .eq("id", s.id);
        }
      }
    }
    setBusy(null);
    load();
  }

  if (loading) return <p>Loading…</p>;
  if (!isManager) return <p>Only owners and admins can review approvals.</p>;

  return (
    <div>
      <Link href={`/app/${companyId}/training`} className="card-link">← Training Center</Link>
      <h2 style={{ fontSize: "1.8rem", marginTop: 12 }}>Approvals</h2>
      {pending.length === 0 && (
        <p style={{ color: "var(--muted)" }}>Nothing waiting for review.</p>
      )}
      {pending.map((e) => (
        <div key={e.id} className="portal-card" style={{ marginBottom: 12 }}>
          <span className="card-kicker">{e.training_courses.title}</span>
          <h3 style={{ margin: "6px 0" }}>
            {e.company_members?.display_name || "Employee"}
          </h3>
          {(e.training_evidence || []).map((ev) => (
            <div key={ev.id} style={{ margin: "8px 0", fontSize: "0.92rem" }}>
              {ev.file_url && (
                <EvidenceImage path={ev.file_url} />
              )}
              {ev.notes && <p style={{ color: "var(--muted)" }}>Notes: {ev.notes}</p>}
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                Submitted {new Date(ev.submitted_at).toLocaleString()}
              </p>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              onClick={() => decide(e, true)}
              disabled={busy === e.id}
              style={{ background: "green", color: "#fff", fontWeight: 800, padding: "10px 22px", borderRadius: 999, border: "none" }}
            >
              Approve
            </button>
            <button
              onClick={() => decide(e, false)}
              disabled={busy === e.id}
              style={{ background: "#b91c1c", color: "#fff", fontWeight: 800, padding: "10px 22px", borderRadius: 999, border: "none" }}
            >
              Send back
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceImage({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase().storage
        .from("training-evidence")
        .createSignedUrl(path, 3600);
      setUrl(data?.signedUrl || null);
    })();
  }, [path]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Evidence"
      style={{ maxWidth: "100%", borderRadius: 10, marginTop: 6 }}
    />
  );
}
