import { supabase } from "./supabase";

// The 11-step teaching sequence every substantial course follows.
export const STEP_DEFS = [
  { n: 1, key: "reading", label: "Reading", desc: "Full textbook-style lesson: terms, purpose, procedures, risks." },
  { n: 2, key: "visual", label: "Visual reinforcement", desc: "Diagrams and labeled illustrations that reinforce the reading." },
  { n: 3, key: "worked_example", label: "Worked example", desc: "A complete example worked start to finish." },
  { n: 4, key: "guided_practice", label: "Guided practice", desc: "Practice with coaching and checkpoints." },
  { n: 5, key: "simulator", label: "Simulator", desc: "Safe hands-on simulation before the real thing." },
  { n: 6, key: "written_exam", label: "Written exam", desc: "Randomized questions, 80% to pass." },
  { n: 7, key: "scenario_exam", label: "Scenario exam", desc: "What would you do? Graded scenarios, 80% to pass." },
  { n: 8, key: "practical_final", label: "Practical final", desc: "Demonstrate the work against a checklist." },
  { n: 9, key: "evidence", label: "Evidence submission", desc: "Upload photos/proof of the practical." },
  { n: 10, key: "approval", label: "Manager approval", desc: "A manager reviews and approves." },
  { n: 11, key: "recertification", label: "Recertification", desc: "Stay current — renew before expiry." },
];

export async function getCourse(slug) {
  const sb = supabase();
  const { data: course } = await sb
    .from("training_courses")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!course) return null;
  const { data: steps } = await sb
    .from("training_steps")
    .select("*")
    .eq("course_id", course.id)
    .order("step_number");
  return { course, steps: steps || [] };
}

export async function getEnrollment(companyId, memberId, courseId) {
  const sb = supabase();
  const { data } = await sb
    .from("training_enrollments")
    .select("*")
    .eq("company_id", companyId)
    .eq("member_id", memberId)
    .eq("course_id", courseId)
    .maybeSingle();
  return data || null;
}

export async function enroll(companyId, memberId, courseId, steps) {
  const sb = supabase();
  const { data: enrollment, error } = await sb
    .from("training_enrollments")
    .insert({ company_id: companyId, member_id: memberId, course_id: courseId })
    .select()
    .single();
  if (error) throw error;
  // Step 1 available, rest locked.
  for (const s of steps) {
    await sb.from("training_step_progress").insert({
      enrollment_id: enrollment.id,
      step_id: s.id,
      status: s.step_number === 1 ? "available" : "locked",
    });
  }
  return enrollment;
}

export async function completeStep(enrollmentId, stepId, score = null) {
  const sb = supabase();
  const { data: cur } = await sb
    .from("training_step_progress")
    .select("attempts")
    .eq("enrollment_id", enrollmentId)
    .eq("step_id", stepId)
    .single();
  await sb
    .from("training_step_progress")
    .update({
      status: "completed",
      score,
      completed_at: new Date().toISOString(),
      attempts: (cur?.attempts || 0) + 1,
    })
    .eq("enrollment_id", enrollmentId)
    .eq("step_id", stepId);
}

export async function unlockNext(enrollmentId, completedStepNumber) {
  const sb = supabase();
  const { data: rows } = await sb
    .from("training_step_progress")
    .select("id, training_steps!inner(step_number)")
    .eq("enrollment_id", enrollmentId);
  const target = (rows || []).find((r) => r.training_steps.step_number === completedStepNumber + 1);
  if (target) {
    await sb.from("training_step_progress").update({ status: "available" }).eq("id", target.id);
  }
  await sb
    .from("training_enrollments")
    .update({ current_step: Math.min(completedStepNumber + 1, 11) })
    .eq("id", enrollmentId);
}
