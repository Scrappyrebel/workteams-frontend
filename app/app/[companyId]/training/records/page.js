"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";

export default function TrainingRecordsPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member, loading } = useCompany();
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);

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
    })();
  }, [loading, member, companyId, isManager]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <Link href={`/app/${companyId}/training`} className="card-link">← Training Center</Link>
      <h2 style={{ fontSize: "1.8rem", marginTop: 12 }}>
        {isManager ? "Training records" : "My training records"}
      </h2>
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
      {rows.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No certifications yet.</p>
      )}
      {rows.map((r) => {
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
    </div>
  );
}
