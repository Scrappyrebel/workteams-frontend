"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../../../lib/supabase";
import { useCompany } from "../../../../../../../lib/company-context";
import { getCourse, getEnrollment, completeStep, unlockNext } from "../../../../../../../lib/training";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function StepPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId;
  const slug = params.slug;
  const stepNum = parseInt(params.n, 10);
  const { member, loading } = useCompany();
  const [data, setData] = useState(null);
  const [enrollment, setEnrollment] = useState(null);

  useEffect(() => {
    if (loading || !member) return;
    (async () => {
      const d = await getCourse(slug);
      if (!d) return;
      setData(d);
      const e = await getEnrollment(companyId, member.id, d.course.id);
      setEnrollment(e);
    })();
  }, [loading, member, slug, companyId]);

  if (loading || !data || !enrollment) return <p>Loading…</p>;
  const step = data.steps.find((s) => s.step_number === stepNum);
  if (!step) return <p>Step not found.</p>;

  const back = `/app/${companyId}/training/${slug}`;

  return (
    <div>
      <Link href={back} className="card-link">← {data.course.title}</Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>STEP {stepNum} OF 11</p>
      <h2 style={{ fontSize: "1.6rem" }}>{step.title}</h2>
      {stepNum <= 5 && (
        <LessonStep course={data.course} step={step} enrollment={enrollment} back={back} />
      )}
      {(stepNum === 6 || stepNum === 7) && (
        <ExamStep
          course={data.course}
          step={step}
          enrollment={enrollment}
          kind={stepNum === 6 ? "written" : "scenario"}
          back={back}
        />
      )}
      {stepNum === 8 && (
        <PracticalStep course={data.course} step={step} enrollment={enrollment} back={back} />
      )}
      {stepNum === 9 && (
        <EvidenceStep course={data.course} step={step} enrollment={enrollment} back={back} />
      )}
      {stepNum === 10 && (
        <ApprovalStatusStep enrollment={enrollment} back={back} />
      )}
      {stepNum === 11 && (
        <RecertStep course={data.course} enrollment={enrollment} back={back} companyId={companyId} memberId={member.id} />
      )}
    </div>
  );
}

/* ---------- Steps 1–5: lessons ---------- */

function LessonStep({ course, step, enrollment, back }) {
  const [lessons, setLessons] = useState([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from("training_lessons")
        .select("*")
        .eq("step_id", step.id)
        .order("sort_order");
      setLessons(data || []);
    })();
  }, [step.id]);

  async function done() {
    setBusy(true);
    await completeStep(enrollment.id, step.id);
    await unlockNext(enrollment.id, step.step_number);
    router.replace(back);
  }

  return (
    <div>
      {lessons.map((l) => (
        <article key={l.id} className="portal-card" style={{ marginBottom: 14 }}>
          <p className="card-kicker">{l.kind.replace(/_/g, " ").toUpperCase()}</p>
          <h3>{l.title}</h3>
          {l.media_svg && (
            <div
              style={{ margin: "12px 0", border: "1px solid var(--line)", borderRadius: 12, padding: 12, overflowX: "auto" }}
              dangerouslySetInnerHTML={{ __html: l.media_svg }}
            />
          )}
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{l.body}</div>
        </article>
      ))}
      {lessons.length === 0 && <p style={{ color: "var(--muted)" }}>Content coming soon.</p>}
      <button
        onClick={done}
        disabled={busy}
        style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none", marginTop: 8 }}
      >
        {busy ? "Saving…" : "Mark complete & continue"}
      </button>
    </div>
  );
}

/* ---------- Steps 6–7: exams ---------- */

function ExamStep({ course, step, enrollment, kind, back }) {
  const router = useRouter();
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase().rpc("start_training_exam", {
        p_enrollment_id: enrollment.id,
        p_kind: kind,
      });
      if (error) {
        alert("Could not start exam: " + error.message);
        return;
      }
      // Shuffle answer choices per question; remember the mapping for grading.
      const qs = (data.questions || []).map((q) => {
        const order = shuffle(q.choices.map((_, i) => i));
        return { ...q, order, shuffled: order.map((i) => q.choices[i]) };
      });
      setExam({ ...data, questions: qs });
    })();
  }, [enrollment.id, kind]);

  async function submit() {
    if (Object.keys(answers).length < (exam.questions || []).length) {
      if (!confirm("You haven't answered every question. Submit anyway?")) return;
    }
    setBusy(true);
    const payload = { answers: {}, choice_map: {} };
    for (const q of exam.questions) {
      payload.choice_map[q.id] = q.order;
      if (answers[q.id] !== undefined) payload.answers[q.id] = answers[q.id];
    }
    const { data, error } = await supabase().rpc("submit_training_exam", {
      p_attempt_id: exam.attempt_id,
      p_answers: payload,
    });
    setBusy(false);
    if (error) {
      alert("Grading failed: " + error.message);
      return;
    }
    setResult(data);
    if (data.passed) {
      await completeStep(enrollment.id, step.id, data.score);
      await unlockNext(enrollment.id, step.step_number);
    }
  }

  if (!exam) return <p>Preparing your exam…</p>;

  if (result) {
    return (
      <div className="portal-card" style={{ textAlign: "center", padding: 30 }}>
        <h3 style={{ fontSize: "2rem" }}>{result.score}%</h3>
        <p style={{ fontWeight: 700, color: result.passed ? "green" : "#b91c1c" }}>
          {result.passed ? "Passed ✓" : "Not quite — 80% is required to pass."}
        </p>
        <p style={{ color: "var(--muted)" }}>
          You got {result.correct} of {result.total} correct.
          {!result.passed && " A fresh variant will be generated when you retry."}
        </p>
        {result.passed ? (
          <button
            onClick={() => router.replace(back)}
            style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none", marginTop: 10 }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={() => window.location.reload()}
            style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none", marginTop: 10 }}
          >
            Retry with a new variant
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "var(--muted)" }}>
        {exam.questions.length} questions • 80% to pass • Questions and answer order are randomized.
      </p>
      {exam.questions.map((q, qi) => (
        <div key={q.id} className="portal-card" style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 700 }}>{qi + 1}. {q.question}</p>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {q.shuffled.map((choice, ci) => (
              <label
                key={ci}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  border: answers[q.id] === ci ? "2px solid var(--brand)" : "1px solid var(--line)",
                  borderRadius: 10, padding: 10, cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === ci}
                  onChange={() => setAnswers({ ...answers, [q.id]: ci })}
                  style={{ marginTop: 4 }}
                />
                <span>{choice}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={submit}
        disabled={busy}
        style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none" }}
      >
        {busy ? "Grading…" : "Submit exam"}
      </button>
    </div>
  );
}

/* ---------- Step 8: practical final ---------- */

function PracticalStep({ course, step, enrollment, back }) {
  const router = useRouter();
  const [practical, setPractical] = useState(null);
  const [checks, setChecks] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from("training_practicals")
        .select("*")
        .eq("course_id", course.id)
        .limit(1)
        .maybeSingle();
      setPractical(data || null);
    })();
  }, [course.id]);

  async function done() {
    setBusy(true);
    await completeStep(enrollment.id, step.id);
    await unlockNext(enrollment.id, step.step_number);
    router.replace(back);
  }

  if (!practical) return <p>Loading practical…</p>;
  const items = practical.checklist || [];
  const allChecked = items.length > 0 && items.every((_, i) => checks[i]);

  return (
    <div>
      <div className="portal-card" style={{ marginBottom: 14 }}>
        <h3>{practical.title}</h3>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{practical.instructions}</p>
      </div>
      <h3>Checklist — confirm each item</h3>
      {items.map((item, i) => (
        <label
          key={i}
          className="portal-card"
          style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8, cursor: "pointer", minHeight: 0 }}
        >
          <input
            type="checkbox"
            checked={!!checks[i]}
            onChange={() => setChecks({ ...checks, [i]: !checks[i] })}
            style={{ marginTop: 4, width: 20, height: 20 }}
          />
          <span>{item}</span>
        </label>
      ))}
      <button
        onClick={done}
        disabled={busy || !allChecked}
        style={{
          background: allChecked ? "var(--brand)" : "#9ca3af",
          color: "#fff", fontWeight: 800, padding: "12px 26px",
          borderRadius: 999, border: "none", marginTop: 8,
        }}
      >
        {busy ? "Saving…" : "Complete practical"}
      </button>
      {!allChecked && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Check every item to finish.</p>
      )}
    </div>
  );
}

/* ---------- Step 9: evidence ---------- */

function EvidenceStep({ course, step, enrollment, back }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      let url = null;
      if (file) {
        const path = `${enrollment.id}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase().storage
          .from("training-evidence")
          .upload(path, file);
        if (upErr) throw upErr;
        url = path;
      }
      const { error } = await supabase().from("training_evidence").insert({
        enrollment_id: enrollment.id,
        file_url: url,
        notes: notes || null,
      });
      if (error) throw error;
      await completeStep(enrollment.id, step.id);
      await unlockNext(enrollment.id, step.step_number);
      await supabase()
        .from("training_enrollments")
        .update({ status: "pending_approval" })
        .eq("id", enrollment.id);
      router.replace(back);
    } catch (err) {
      alert("Could not submit: " + err.message);
    }
    setBusy(false);
  }

  return (
    <div>
      <p style={{ color: "var(--muted)" }}>
        Submit proof of your practical work — a photo of the finished job works great.
        Your manager will review it in the next step.
      </p>
      <div className="portal-card" style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Photo evidence</span>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Notes (optional)</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you do? Anything the photo doesn't show?"
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}
          />
        </label>
        <button
          onClick={submit}
          disabled={busy}
          style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, padding: "12px 26px", borderRadius: 999, border: "none" }}
        >
          {busy ? "Submitting…" : "Submit for approval"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 10: approval status ---------- */

function ApprovalStatusStep({ enrollment, back }) {
  const [approval, setApproval] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from("training_approvals")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setApproval(data || null);
    })();
  }, [enrollment.id]);

  return (
    <div className="portal-card" style={{ textAlign: "center", padding: 30 }}>
      {enrollment.status === "pending_approval" && (
        <>
          <h3>Waiting on your manager</h3>
          <p style={{ color: "var(--muted)" }}>
            Your evidence was submitted. A manager will review it and approve or send it back.
          </p>
        </>
      )}
      {enrollment.status === "certified" && (
        <>
          <h3 style={{ color: "green" }}>Approved ✓</h3>
          <p style={{ color: "var(--muted)" }}>Your manager approved your work. You're certified.</p>
        </>
      )}
      {enrollment.status === "rejected" && (
        <>
          <h3 style={{ color: "#b91c1c" }}>Sent back</h3>
          <p style={{ color: "var(--muted)" }}>
            Your manager asked for changes{approval?.notes ? `: ${approval.notes}` : "."} Fix it up and resubmit your evidence.
          </p>
          <Link href={back} className="card-link">Back to course</Link>
        </>
      )}
    </div>
  );
}

/* ---------- Step 11: recertification ---------- */

function RecertStep({ course, enrollment, back, companyId, memberId }) {
  const [cert, setCert] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from("training_certifications")
        .select("*")
        .eq("company_id", companyId)
        .eq("member_id", memberId)
        .eq("course_id", course.id)
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setCert(data || null);
    })();
  }, [companyId, memberId, course.id]);

  return (
    <div className="portal-card" style={{ padding: 24 }}>
      <h3>Stay certified</h3>
      {cert ? (
        <p>
          Certified on {new Date(cert.issued_at).toLocaleDateString()}. Your certification
          expires on <strong>{new Date(cert.expires_at).toLocaleDateString()}</strong>.
          When procedures, chemicals, equipment, or safety rules change — or when your
          certification nears expiry — retake the exams to recertify.
        </p>
      ) : (
        <p style={{ color: "var(--muted)" }}>
          Once your manager approves your evidence, your certification will appear here
          with its expiry date. This course requires recertification every {course.recert_months} months.
        </p>
      )}
    </div>
  );
}
