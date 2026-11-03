"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import {
  EXAM_KIND_LABELS,
  STEP_STATUS_LABELS,
  groupByEnrollment,
  latestFinishedAttempt,
  sortExamAttempts,
  sortPriorDecisions,
  sortStepProgress,
  stepProgressSummary,
} from "../../../../../lib/training-approvals.mjs";

export default function ApprovalsPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member, loading } = useCompany();
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);
  const [review, setReview] = useState({ steps: {}, attempts: {}, decisions: {} });

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
    // The stored training record behind each request (migration 021
    // tables, stored since the academy launched — this page simply
    // never read them): step progress with scores and attempt counts,
    // graded exam attempts, and any earlier review decisions on the
    // same enrollment. Display only — the decision flow below is
    // unchanged. Fail-soft on purpose, the training records page's
    // pattern: if any of these reads error, the queue renders exactly
    // as it did before, with the evidence above each decision.
    const enrollments = data || [];
    const ids = enrollments.map((e) => e.id);
    if (ids.length === 0) {
      setReview({ steps: {}, attempts: {}, decisions: {} });
      return;
    }
    const next = { steps: {}, attempts: {}, decisions: {} };
    const { data: stepRows, error: stepError } = await sb
      .from("training_step_progress")
      .select("enrollment_id, status, score, attempts, completed_at, training_steps!inner(step_number, step_key, title)")
      .in("enrollment_id", ids);
    if (!stepError) next.steps = groupByEnrollment(stepRows);
    const { data: attemptRows, error: attemptError } = await sb
      .from("training_exam_attempts")
      .select("id, enrollment_id, kind, variant, score, passed, started_at, completed_at")
      .in("enrollment_id", ids)
      .order("started_at", { ascending: false });
    if (!attemptError) next.attempts = groupByEnrollment(attemptRows);
    const { data: decisionRows, error: decisionError } = await sb
      .from("training_approvals")
      .select("id, enrollment_id, decision, notes, decided_at")
      .in("enrollment_id", ids)
      .order("decided_at", { ascending: false });
    if (!decisionError) next.decisions = groupByEnrollment(decisionRows);
    setReview(next);
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
      {pending.length > 0 && (
        <p style={{ color: "var(--muted)" }}>
          {pending.length} waiting for review
        </p>
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
          <ReviewRecord
            enrollment={e}
            steps={review.steps[e.id] || []}
            attempts={review.attempts[e.id] || []}
            decisions={review.decisions[e.id] || []}
          />
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

// The stored record behind one pending request: when training
// started, how far the steps got (with the stored score and attempt
// count on each step), every graded exam attempt, and any earlier
// review decisions on this same enrollment. Everything shown is a
// stored value from the migration-021 tables; nothing is recomputed
// except counts of stored rows, and nothing here writes anything.
function ReviewRecord({ enrollment, steps, attempts, decisions }) {
  const sortedSteps = sortStepProgress(steps);
  const summary = stepProgressSummary(sortedSteps);
  const sortedAttempts = sortExamAttempts(attempts);
  const prior = sortPriorDecisions(decisions);
  const written = latestFinishedAttempt(sortedAttempts, "written");
  const scenario = latestFinishedAttempt(sortedAttempts, "scenario");
  return (
    <div style={{ margin: "10px 0", fontSize: "0.92rem" }}>
      <p style={{ margin: "0 0 6px" }}>
        <strong>Training record</strong>{" "}
        <span style={{ color: "var(--muted)" }}>
          (from the stored training record)
        </span>
      </p>
      <p style={{ margin: "4px 0", color: "var(--muted)" }}>
        Started {new Date(enrollment.started_at).toLocaleDateString()}
        {summary.total > 0 && (
          <>
            {" "}• {summary.completed} of {summary.total} steps completed ({summary.percent}%)
          </>
        )}
      </p>
      {(written || scenario) && (
        <p style={{ margin: "4px 0", color: "var(--muted)" }}>
          Latest finished exams:{" "}
          {[written, scenario]
            .filter(Boolean)
            .map(
              (a) =>
                `${EXAM_KIND_LABELS[a.kind] || a.kind} ${a.score}% — ${
                  a.passed ? "Passed" : "Did not pass"
                }`
            )
            .join(" • ")}
        </p>
      )}
      {sortedSteps.length > 0 && (
        <div style={{ margin: "6px 0" }}>
          {sortedSteps.map((s) => (
            <p key={s.id || `${s.training_steps?.step_number}-${s.training_steps?.step_key}`} style={{ margin: "3px 0", color: "var(--muted)" }}>
              Step {s.training_steps?.step_number}: {s.training_steps?.title || s.training_steps?.step_key || "Step"}{" "}
              — {STEP_STATUS_LABELS[s.status] || s.status}
              {s.score != null && <> • Score {s.score}%</>}
              {s.attempts > 1 && <> • {s.attempts} attempts</>}
              {s.status === "completed" && s.completed_at && (
                <> • {new Date(s.completed_at).toLocaleDateString()}</>
              )}
            </p>
          ))}
        </div>
      )}
      {sortedAttempts.length > 0 && (
        <div style={{ margin: "6px 0" }}>
          <p style={{ margin: "4px 0" }}>
            <strong>Exam attempts</strong>{" "}
            <span style={{ color: "var(--muted)" }}>
              ({sortedAttempts.length} recorded)
            </span>
          </p>
          {sortedAttempts.map((a) => (
            <p key={a.id} style={{ margin: "3px 0", color: "var(--muted)" }}>
              {EXAM_KIND_LABELS[a.kind] || a.kind}
              {a.variant && <> • Variant {a.variant}</>}
              {a.completed_at ? (
                <>
                  {" "}• {a.score}% • {a.passed ? "Passed" : "Did not pass"} •{" "}
                  {new Date(a.completed_at).toLocaleDateString()}
                </>
              ) : (
                <> • Started {new Date(a.started_at).toLocaleDateString()} — not finished</>
              )}
            </p>
          ))}
        </div>
      )}
      {prior.length > 0 && (
        <div style={{ margin: "6px 0" }}>
          <p style={{ margin: "4px 0" }}>
            <strong>Earlier reviews of this training</strong>
          </p>
          {prior.map((d) => (
            <p key={d.id} style={{ margin: "3px 0", color: "var(--muted)" }}>
              {d.decision === "approved" ? "Approved" : "Sent back"}
              {d.decided_at && <> • {new Date(d.decided_at).toLocaleDateString()}</>}
              {d.notes && <> — {d.notes}</>}
            </p>
          ))}
        </div>
      )}
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
