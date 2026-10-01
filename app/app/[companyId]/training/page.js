"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";

const CATEGORY_LABELS = { cleaning: "Cleaning courses", business: "Business & management" };

export default function TrainingCenterPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member } = useCompany();
  const [courses, setCourses] = useState([]);
  const [certs, setCerts] = useState([]);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb
        .from("training_courses")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");
      setCourses(data || []);
      if (member) {
        const { data: c } = await sb
          .from("training_certifications")
          .select("course_id, expires_at")
          .eq("company_id", companyId)
          .eq("member_id", member.id);
        setCerts(c || []);
      }
    })();
  }, [companyId, member]);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const certByCourse = {};
  for (const c of certs) certByCourse[c.course_id] = c;

  const groups = {};
  for (const c of courses) {
    (groups[c.category] = groups[c.category] || []).push(c);
  }

  return (
    <div>
      <p className="eyebrow">TRAINING CENTER</p>
      <h2 style={{ fontSize: "1.8rem" }}>Training Academy</h2>
      <p style={{ color: "var(--muted)" }}>
        Every course follows the full 11-step path: reading, visuals, worked examples,
        guided practice, simulator, exams, practical, evidence, and manager approval.
      </p>

      {isManager && (
        <div style={{ display: "flex", gap: 10, margin: "14px 0", flexWrap: "wrap" }}>
          <Link href={`/app/${companyId}/training/approvals`} className="card-link">
            Review approvals →
          </Link>
          <Link href={`/app/${companyId}/training/records`} className="card-link">
            Training records →
          </Link>
        </div>
      )}
      {!isManager && (
        <div style={{ margin: "14px 0" }}>
          <Link href={`/app/${companyId}/training/records`} className="card-link">
            My training records →
          </Link>
        </div>
      )}

      {Object.keys(CATEGORY_LABELS).map((cat) =>
        groups[cat] && groups[cat].length > 0 ? (
          <section key={cat} style={{ marginTop: 22 }}>
            <h3>{CATEGORY_LABELS[cat]}</h3>
            <div className="portal-grid">
              {groups[cat].map((c) => {
                const cert = certByCourse[c.id];
                const expired = cert && new Date(cert.expires_at) < new Date();
                return (
                  <Link
                    key={c.id}
                    href={`/app/${companyId}/training/${c.slug}`}
                    className="portal-card"
                    style={{ textDecoration: "none", color: "inherit", minHeight: 0 }}
                  >
                    <span className="card-kicker">{c.department}</span>
                    <h3 style={{ margin: "6px 0" }}>{c.title}</h3>
                    <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{c.description}</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 8 }}>
                      ~{c.estimated_hours} hrs • 11 steps
                      {cert && !expired && <span style={{ color: "green", fontWeight: 700 }}> • Certified</span>}
                      {cert && expired && <span style={{ color: "#b45309", fontWeight: 700 }}> • Recertify</span>}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null
      )}

      {courses.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: 20 }}>
          No courses yet — check back soon.
        </p>
      )}
    </div>
  );
}
