"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { STEP_DEFS } from "../../../../lib/training";
import {
  ENROLLMENT_STATUS_LABELS,
  certState,
  countStepsByEnrollment,
  enrollmentByCourse,
  groupCoursesByCategory,
  progressSummary,
  searchCourses,
  summarizeMyTraining,
} from "../../../../lib/training-index.mjs";

const CATEGORY_LABELS = { cleaning: "Cleaning courses", business: "Business & management" };

export default function TrainingCenterPage() {
  const params = useParams();
  const companyId = params.companyId;
  const { member } = useCompany();
  const [courses, setCourses] = useState([]);
  const [certs, setCerts] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [stepCounts, setStepCounts] = useState({});
  const [myLoaded, setMyLoaded] = useState(false);
  const [query, setQuery] = useState("");

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
          .select("course_id, issued_at, expires_at")
          .eq("company_id", companyId)
          .eq("member_id", member.id);
        setCerts(c || []);
        // Own course progress (migration 021 tables, stored since the
        // academy launched — this page simply never read them). Same
        // scope as the certifications above: the signed-in member's own
        // rows only; a manager's team view lives on the records page.
        // Fail-soft on purpose: if either read errors, myLoaded stays
        // false, the "Your training" panel never renders, and the page
        // is exactly as it was before.
        const { data: enr, error: enrError } = await sb
          .from("training_enrollments")
          .select("id, course_id, status, current_step, started_at, completed_at")
          .eq("company_id", companyId)
          .eq("member_id", member.id)
          .order("started_at", { ascending: false });
        if (!enrError) {
          const rows = enr || [];
          setEnrollments(rows);
          setMyLoaded(true);
          const ids = rows.map((r) => r.id);
          if (ids.length > 0) {
            const { data: sp, error: spError } = await sb
              .from("training_step_progress")
              .select("enrollment_id, status")
              .in("enrollment_id", ids);
            if (!spError) setStepCounts(countStepsByEnrollment(sp || []));
          }
        }
      }
    })();
  }, [companyId, member]);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const certByCourse = {};
  for (const c of certs) certByCourse[c.course_id] = c;
  const enrByCourse = enrollmentByCourse(enrollments);
  const courseById = {};
  for (const c of courses) courseById[c.id] = c;
  const summary = summarizeMyTraining(courses, enrollments, certs);
  const visibleCourses = searchCourses(courses, query, CATEGORY_LABELS);
  const visibleGroups = groupCoursesByCategory(visibleCourses, CATEGORY_LABELS);

  return (
    <div>
      <p className="eyebrow">TRAINING CENTER</p>
      <h2 style={{ fontSize: "1.8rem" }}>Training Academy</h2>
      <p style={{ color: "var(--muted)" }}>
        Every course follows the full 11-step path: reading, visuals, worked examples,
        practice exercises, scenario exercises, exams, practical, evidence, and manager approval.
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

      {myLoaded && (
        <section style={{ marginTop: 22 }}>
          <h3>Your training</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "4px 0 10px" }}>
            {summary.certified} certified • {summary.inProgress.length} in progress •{" "}
            {summary.notStarted} not started
            {summary.expiredCerts > 0 && (
              <strong style={{ color: "#b91c1c" }}>
                {" "}• {summary.expiredCerts}{" "}
                {summary.expiredCerts === 1 ? "certification" : "certifications"} expired
              </strong>
            )}
            {summary.expiringSoonCerts > 0 && (
              <strong style={{ color: "#b45309" }}>
                {" "}• {summary.expiringSoonCerts}{" "}
                {summary.expiringSoonCerts === 1 ? "certification" : "certifications"} expiring soon
              </strong>
            )}
          </p>
          {summary.inProgress.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              You are not part-way through a course right now.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {summary.inProgress.map((e) => {
                const course = courseById[e.course_id];
                if (!course) return null;
                const ps = progressSummary(e, stepCounts[e.id]);
                return (
                  <Link
                    key={e.id}
                    href={`/app/${companyId}/training/${course.slug}`}
                    className="portal-card"
                    style={{ textDecoration: "none", color: "inherit", minHeight: 0 }}
                  >
                    <strong>{course.title}</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                      {ENROLLMENT_STATUS_LABELS[e.status] || e.status} • Step {e.current_step} of{" "}
                      {STEP_DEFS.length}
                      {ps && (
                        <>
                          {" "}• {ps.done} of {ps.total} steps completed
                          {ps.pct != null && <> ({ps.pct}%)</>}
                        </>
                      )}
                      {" "}• Started {new Date(e.started_at).toLocaleDateString()}
                    </p>
                    {ps && ps.pct != null && (
                      <div style={{ background: "#e5e7eb", borderRadius: 999, height: 6, marginTop: 6 }}>
                        <div
                          style={{
                            background: "var(--brand)",
                            borderRadius: 999,
                            height: 6,
                            width: `${ps.pct}%`,
                          }}
                        />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {courses.length > 0 && (
        <div style={{ margin: "18px 0 4px" }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses…"
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid var(--border, #d1d5db)",
              fontSize: "0.95rem",
            }}
          />
        </div>
      )}

      {visibleGroups.map((g) => (
        <section key={g.key || "other"} style={{ marginTop: 22 }}>
          <h3>{g.label}</h3>
          <div className="portal-grid">
            {g.courses.map((c) => {
              const cert = certByCourse[c.id];
              const expired = cert && new Date(cert.expires_at) < new Date();
              const state = cert ? certState(cert) : { expired: false, soon: false };
              const enr = enrByCourse[c.id];
              const ps = enr ? progressSummary(enr, stepCounts[enr.id]) : null;
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
                    ~{c.estimated_hours} hrs • {STEP_DEFS.length} steps
                    {cert && !expired && <span style={{ color: "green", fontWeight: 700 }}> • Certified</span>}
                    {cert && expired && <span style={{ color: "#b45309", fontWeight: 700 }}> • Recertify</span>}
                  </p>
                  {enr && enr.status !== "certified" && (
                    <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                      {ENROLLMENT_STATUS_LABELS[enr.status] || enr.status} • Step {enr.current_step} of{" "}
                      {STEP_DEFS.length}
                      {ps && (
                        <>
                          {" "}• {ps.done} of {ps.total} steps completed
                          {ps.pct != null && <> ({ps.pct}%)</>}
                        </>
                      )}
                    </p>
                  )}
                  {enr && enr.status !== "certified" && ps && ps.pct != null && (
                    <div style={{ background: "#e5e7eb", borderRadius: 999, height: 6, marginTop: 6 }}>
                      <div
                        style={{
                          background: "var(--brand)",
                          borderRadius: 999,
                          height: 6,
                          width: `${ps.pct}%`,
                        }}
                      />
                    </div>
                  )}
                  {cert && (
                    <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                      Certified {new Date(cert.issued_at).toLocaleDateString()} • Expires{" "}
                      {new Date(cert.expires_at).toLocaleDateString()}
                      {state.expired && (
                        <strong style={{ color: "#b91c1c" }}> — expired, recertify</strong>
                      )}
                      {!state.expired && state.soon && (
                        <strong style={{ color: "#b45309" }}> — expiring soon</strong>
                      )}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {courses.length > 0 && query.trim() && visibleCourses.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: 20 }}>
          No courses match your search.
        </p>
      )}

      {courses.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: 20 }}>
          No courses yet — check back soon.
        </p>
      )}
    </div>
  );
}
