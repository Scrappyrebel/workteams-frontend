"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "../../../../../lib/company-context";
import {
  STEP_DEFS,
  getCourse,
  getEnrollment,
  enroll,
} from "../../../../../lib/training";

export default function CoursePage() {
  const params = useParams();
  const companyId = params.companyId;
  const slug = params.slug;
  const { company, member, loading } = useCompany();
  const [data, setData] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [progress, setProgress] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !member) return;
    (async () => {
      const d = await getCourse(slug);
      setData(d);
      if (d) {
        const e = await getEnrollment(companyId, member.id, d.course.id);
        setEnrollment(e);
        if (e) {
          const { supabase } = await import("../../../../../lib/supabase");
          const { data: p } = await supabase()
            .from("training_step_progress")
            .select("step_id, status, score, attempts")
            .eq("enrollment_id", e.id);
          const map = {};
          for (const row of p || []) map[row.step_id] = row;
          setProgress(map);
        }
      }
    })();
  }, [loading, member, slug, companyId]);

  async function start() {
    setBusy(true);
    try {
      const e = await enroll(companyId, member.id, data.course.id, data.steps);
      setEnrollment(e);
      const map = {};
      for (const s of data.steps) {
        map[s.id] = { status: s.step_number === 1 ? "available" : "locked", score: null, attempts: 0 };
      }
      setProgress(map);
    } catch (err) {
      alert("Could not enroll: " + err.message);
    }
    setBusy(false);
  }

  if (loading || !data) return <p>Loading…</p>;
  const { course, steps } = data;

  return (
    <div>
      <Link href={`/app/${companyId}/training`} className="card-link">← Training Center</Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>{course.department}</p>
      <h2 style={{ fontSize: "1.8rem" }}>{course.title}</h2>
      <p style={{ color: "var(--muted)" }}>{course.description}</p>
      <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
        ~{course.estimated_hours} hours • Recertification every {course.recert_months} months
      </p>

      {!enrollment ? (
        <button
          onClick={start}
          disabled={busy}
          style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none", marginTop: 12 }}
        >
          {busy ? "Enrolling…" : "Start this course"}
        </button>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {enrollment.status === "certified" && (
            <p style={{ color: "green", fontWeight: 700 }}>✓ Certified — nice work.</p>
          )}
          {enrollment.status === "pending_approval" && (
            <p style={{ color: "#b45309", fontWeight: 700 }}>Submitted — waiting on manager approval.</p>
          )}
          {steps.map((s) => {
            const p = progress[s.id] || { status: "locked" };
            const def = STEP_DEFS.find((d) => d.n === s.step_number) || {};
            const locked = p.status === "locked";
            const done = p.status === "completed";
            return (
              <div
                key={s.id}
                className="portal-card"
                style={{ minHeight: 0, opacity: locked ? 0.55 : 1 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: done ? "green" : locked ? "#e5e7eb" : "var(--brand)",
                      color: "#fff", fontWeight: 800, flexShrink: 0,
                    }}
                  >
                    {done ? "✓" : s.step_number}
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>{def.label || s.title}</strong>
                    <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "2px 0 0" }}>
                      {s.description || def.desc}
                      {p.score != null && ` • Score: ${p.score}%`}
                      {p.attempts > 1 && ` • Attempts: ${p.attempts}`}
                    </p>
                  </div>
                  {!locked && !done && (
                    <Link
                      href={`/app/${companyId}/training/${slug}/step/${s.step_number}`}
                      style={{ background: "var(--brand)", color: "#fff", fontWeight: 700, padding: "8px 18px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      {p.status === "in_progress" ? "Continue" : "Begin"}
                    </Link>
                  )}
                  {done && s.step_number <= 9 && (
                    <Link
                      href={`/app/${companyId}/training/${slug}/step/${s.step_number}`}
                      className="card-link"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      Review
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
