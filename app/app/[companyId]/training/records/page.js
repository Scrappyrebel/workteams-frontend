"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";

// Stored enrollment status -> the words this page shows for it. The
// status itself is the stored value from training_enrollments (021);
// only the label is presentation.
const STATUS_LABELS = {
  in_progress: "In progress",
  pending_approval: "Waiting for approval",
  rejected: "Sent back",
  expired: "Expired",
  certified: "Certified",
};

function csvCell(v) {
  return '"' + String(v ?? "").replace(/"/g, '""') + '"';
}

export default function TrainingRecordsPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member, loading } = useCompany();
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [progress, setProgress] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [stepCounts, setStepCounts] = useState({});
  const [query, setQuery] = useState("");

  const isManager = member && (member.role === "owner" || member.role === "admin");

  useEffect(() => {
    if (loading || !member) return;
    (async () => {
      const sb = supabase();
      // Certification expiry alerts (migration 075): refresh-on-open,
      // deduped in the database. Fail-soft on purpose — until 075 is
      // run, the function and table do not exist, both calls error
      // quietly, and this page renders exactly as it did before.
      await sb.rpc("refresh_training_certification_alerts", {
        p_company_id: companyId,
      });
      let q = sb
        .from("training_certifications")
        .select(`
          id, issued_at, expires_at,
          training_courses!inner(title, slug),
          company_members!training_certifications_member_id_fkey(id, display_name)
        `)
        .eq("company_id", companyId)
        .order("issued_at", { ascending: false });
      if (!isManager) q = q.eq("member_id", member.id);
      const { data } = await q;
      const certs = data || [];
      setRows(certs);
      const { data: alertRows, error: alertError } = await sb
        .from("training_certification_alerts")
        .select("id, certification_id, member_id, level, expires_at")
        .eq("company_id", companyId)
        .is("resolved_at", null)
        .order("expires_at", { ascending: true });
      if (!alertError) {
        const certById = {};
        for (const c of certs) certById[c.id] = c;
        setAlerts(
          (alertRows || []).filter((a) => certById[a.certification_id])
        );
      }
      // Course progress + exam attempts (migration 021 tables, stored
      // since the academy launched — this page simply never read them).
      // Same scope as the certifications above: managers see the
      // company's rows, everyone else only their own; the 021 RLS
      // policies enforce the same split in the database. Fail-soft on
      // purpose: if any of these reads error, the certifications and
      // alerts above still render exactly as they did before.
      let eq = sb
        .from("training_enrollments")
        .select(`
          id, status, current_step, started_at, completed_at,
          training_courses!inner(title, slug),
          company_members!training_enrollments_member_id_fkey(id, display_name)
        `)
        .eq("company_id", companyId)
        .order("started_at", { ascending: false });
      if (!isManager) eq = eq.eq("member_id", member.id);
      const { data: enrRows, error: enrError } = await eq;
      if (!enrError) {
        const enrollments = enrRows || [];
        setProgress(enrollments);
        const ids = enrollments.map((e) => e.id);
        if (ids.length > 0) {
          const { data: attRows, error: attError } = await sb
            .from("training_exam_attempts")
            .select("id, enrollment_id, kind, variant, score, passed, started_at, completed_at")
            .in("enrollment_id", ids)
            .order("started_at", { ascending: false });
          if (!attError) setAttempts(attRows || []);
          const { data: stepRows, error: stepError } = await sb
            .from("training_step_progress")
            .select("enrollment_id, status")
            .in("enrollment_id", ids);
          if (!stepError) {
            const counts = {};
            for (const s of stepRows || []) {
              const c = (counts[s.enrollment_id] = counts[s.enrollment_id] || { done: 0, total: 0 });
              c.total += 1;
              if (s.status === "completed") c.done += 1;
            }
            setStepCounts(counts);
          }
        }
      }
    })();
  }, [loading, member, companyId, isManager]);

  if (loading) return <p>Loading…</p>;

  const q = query.trim().toLowerCase();
  const matches = (name, title) =>
    !q ||
    (name || "").toLowerCase().includes(q) ||
    (title || "").toLowerCase().includes(q);

  const visibleCerts = rows.filter((r) =>
    matches(r.company_members?.display_name, r.training_courses?.title)
  );
  // Certified enrollments are represented by their certification above;
  // this section is every enrollment that has not reached that point.
  const visibleProgress = progress.filter(
    (e) =>
      e.status !== "certified" &&
      matches(e.company_members?.display_name, e.training_courses?.title)
  );
  const enrollmentById = {};
  for (const e of progress) enrollmentById[e.id] = e;
  const visibleAttempts = attempts.filter((a) => {
    const e = enrollmentById[a.enrollment_id];
    return e && matches(e.company_members?.display_name, e.training_courses?.title);
  });

  // The Hour report's export pattern: a CSV copy of the rows on screen,
  // stored values only — nothing is recomputed or restated here.
  function exportCsv() {
    const lines = [
      ["employee", "course", "record", "status", "detail", "score", "result", "date", "expires"].join(","),
    ];
    for (const r of visibleCerts) {
      const expired = new Date(r.expires_at) < new Date();
      const soon =
        !expired &&
        new Date(r.expires_at) < new Date(Date.now() + 30 * 24 * 3600 * 1000);
      lines.push(
        [
          csvCell(r.company_members?.display_name || "Employee"),
          csvCell(r.training_courses?.title || ""),
          "Certification",
          expired ? "Expired" : soon ? "Expiring soon" : "Certified",
          "",
          "",
          "",
          csvCell(r.issued_at || ""),
          csvCell(r.expires_at || ""),
        ].join(",")
      );
    }
    for (const e of visibleProgress) {
      const c = stepCounts[e.id];
      lines.push(
        [
          csvCell(e.company_members?.display_name || "Employee"),
          csvCell(e.training_courses?.title || ""),
          "Course progress",
          STATUS_LABELS[e.status] || e.status,
          csvCell(
            `Step ${e.current_step} of 11` +
              (c ? ` — ${c.done} of ${c.total} steps completed` : "")
          ),
          "",
          "",
          csvCell(e.started_at || ""),
          "",
        ].join(",")
      );
    }
    for (const a of visibleAttempts) {
      const e = enrollmentById[a.enrollment_id];
      lines.push(
        [
          csvCell(e?.company_members?.display_name || "Employee"),
          csvCell(e?.training_courses?.title || ""),
          a.kind === "written" ? "Written exam attempt" : "Scenario exam attempt",
          a.completed_at ? "Completed" : "Not finished",
          csvCell(a.variant ? `Variant ${a.variant}` : ""),
          a.score == null ? "" : a.score,
          a.completed_at ? (a.passed ? "Passed" : "Did not pass") : "",
          csvCell(a.completed_at || a.started_at || ""),
          "",
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training_records_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link href={`/app/${companyId}/training`} className="card-link">← Training Center</Link>
      <h2 style={{ fontSize: "1.8rem", marginTop: 12 }}>
        {isManager ? "Training records" : "My training records"}
      </h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0 4px" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isManager ? "Search by employee or course…" : "Search by course…"}
          style={searchInput}
        />
        <button onClick={exportCsv} style={button}>Export CSV</button>
      </div>
      {alerts.length > 0 && (
        <div style={{ margin: "14px 0 18px" }}>
          <h3 style={{ margin: "0 0 8px" }}>Certification alerts</h3>
          {alerts.map((a) => {
            const cert = rows.find((r) => r.id === a.certification_id);
            const expired = a.level === "expired";
            return (
              <div key={a.id} className="portal-card" style={{ marginBottom: 10, minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 34, height: 34, borderRadius: "50%",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: expired ? "#b91c1c" : "#b45309",
                      color: "#fff", fontWeight: 800,
                    }}
                  >
                    !
                  </span>
                  <div>
                    <strong>{cert?.training_courses?.title || "Certification"}</strong>
                    {isManager && (
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
                        {cert?.company_members?.display_name || "Employee"}
                      </p>
                    )}
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                      {expired ? "Expired " : "Expires "}
                      {new Date(a.expires_at).toLocaleDateString()}
                      {expired && <strong style={{ color: "#b91c1c" }}> — expired, recertify</strong>}
                      {!expired && <strong style={{ color: "#b45309" }}> — expiring soon</strong>}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <h3 style={{ margin: "18px 0 8px" }}>Certifications</h3>
      {visibleCerts.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          {q ? "No certifications match your search." : "No certifications yet."}
        </p>
      )}
      {visibleCerts.map((r) => {
        const expired = new Date(r.expires_at) < new Date();
        const soon =
          !expired &&
          new Date(r.expires_at) < new Date(Date.now() + 30 * 24 * 3600 * 1000);
        return (
          <div key={r.id} className="portal-card" style={{ marginBottom: 10, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: expired ? "#b91c1c" : soon ? "#b45309" : "green",
                  color: "#fff", fontWeight: 800,
                }}
              >
                {expired ? "!" : "✓"}
              </span>
              <div>
                <strong>{r.training_courses.title}</strong>
                {isManager && (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
                    {r.company_members?.display_name || "Employee"}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  Certified {new Date(r.issued_at).toLocaleDateString()} •
                  Expires {new Date(r.expires_at).toLocaleDateString()}
                  {expired && <strong style={{ color: "#b91c1c" }}> — expired, recertify</strong>}
                  {soon && <strong style={{ color: "#b45309" }}> — expiring soon</strong>}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <h3 style={{ margin: "22px 0 8px" }}>Training in progress</h3>
      {visibleProgress.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          {q
            ? "No courses in progress match your search."
            : isManager
              ? "Nobody is part-way through a course right now."
              : "You are not part-way through a course right now."}
        </p>
      )}
      {visibleProgress.map((e) => {
        const c = stepCounts[e.id];
        return (
          <div key={e.id} className="portal-card" style={{ marginBottom: 10, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "#2563eb",
                  color: "#fff", fontWeight: 800,
                }}
              >
                {e.current_step}
              </span>
              <div>
                <strong>{e.training_courses.title}</strong>
                {isManager && (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
                    {e.company_members?.display_name || "Employee"}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  {STATUS_LABELS[e.status] || e.status} • Step {e.current_step} of 11
                  {c && <> • {c.done} of {c.total} steps completed</>}
                  {" "}• Started {new Date(e.started_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <h3 style={{ margin: "22px 0 8px" }}>Exam attempts</h3>
      {visibleAttempts.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          {q ? "No exam attempts match your search." : "No exam attempts yet."}
        </p>
      )}
      {visibleAttempts.map((a) => {
        const e = enrollmentById[a.enrollment_id];
        return (
          <div key={a.id} className="portal-card" style={{ marginBottom: 10, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: !a.completed_at ? "#6b7280" : a.passed ? "green" : "#b91c1c",
                  color: "#fff", fontWeight: 800,
                }}
              >
                {!a.completed_at ? "…" : a.passed ? "✓" : "!"}
              </span>
              <div>
                <strong>{e?.training_courses?.title || "Course"}</strong>
                {isManager && (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>
                    {e?.company_members?.display_name || "Employee"}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  {a.kind === "written" ? "Written exam" : "Scenario exam"}
                  {a.variant && <> • Variant {a.variant}</>}
                  {a.completed_at ? (
                    <>
                      {" "}• {a.score}% •{" "}
                      {a.passed ? (
                        <strong style={{ color: "green" }}>Passed</strong>
                      ) : (
                        <strong style={{ color: "#b91c1c" }}>Did not pass</strong>
                      )}
                      {" "}• {new Date(a.completed_at).toLocaleDateString()}
                    </>
                  ) : (
                    <> • Started {new Date(a.started_at).toLocaleDateString()} — not finished</>
                  )}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The Hour report's input/button shapes, reused so this page's new
// controls look like the rest of the app.
const searchInput = {
  padding: "11px 14px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  flex: "1 1 240px",
};

const button = {
  padding: "11px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
