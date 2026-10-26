"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUseWithRole } from "../../../../../lib/tiers";
import { STANDARD_TASKS } from "../../../../../lib/walkthrough-tasks";
import {
  AREA_SECTIONS,
  BUILDING_SECTIONS,
  FLOOR_TYPES,
  INTAKE_FIELDS,
  LEAVE_CHECKLIST,
  LEAVE_TEXT_FIELDS,
  PHONE_QUESTIONS,
  answeredPairs,
  isMissingSchemaError,
  pruneAnswers,
  sectionFields,
} from "../../../../../lib/walkthrough-questions";
import {
  storagePathFromUrl,
  validatePhotoFile,
  withSignedUrls,
} from "../../../../../lib/walkthrough-photos";

const emptyArea = { area_name: "", length_ft: "", width_ft: "", square_footage: "", notes: "", custom_task: "", floor_type: "", toilets_count: "", urinals_count: "", sinks_count: "" };

function dims(a) {
  return a.length_ft && a.width_ft ? `${a.length_ft} × ${a.width_ft} ft` : "measured";
}

function fixturesLine(a) {
  const parts = [];
  if (a.toilets_count) parts.push(`${a.toilets_count} toilet${Number(a.toilets_count) === 1 ? "" : "s"}`);
  if (a.urinals_count) parts.push(`${a.urinals_count} urinal${Number(a.urinals_count) === 1 ? "" : "s"}`);
  if (a.sinks_count) parts.push(`${a.sinks_count} sink${Number(a.sinks_count) === 1 ? "" : "s"}`);
  return parts.length ? `Fixtures: ${parts.join(" · ")}` : "";
}

// ISO timestamp -> value for an <input type="datetime-local">.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildScope(walkthrough, areas) {
  const total = areas.reduce((s, a) => s + Number(a.square_footage || 0), 0);
  const lines = [];
  lines.push(`SCOPE OF WORK — ${walkthrough?.locations?.name || walkthrough?.name || ""}`);
  lines.push(`Total: ${Math.round(total).toLocaleString()} sq ft across ${areas.length} area${areas.length === 1 ? "" : "s"}`);
  if (walkthrough?.scheduled_at) {
    lines.push(
      `Walkthrough appointment: ${new Date(walkthrough.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` +
        (walkthrough.meet_contact ? ` — meet ${walkthrough.meet_contact}` : "") +
        (walkthrough.entry_notes ? ` — ${walkthrough.entry_notes}` : "")
    );
  }
  lines.push("");
  areas.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.area_name} (${dims(a)} — ${Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft)`);
    if (a.floor_type) lines.push(`   Floor: ${a.floor_type}`);
    const fx = fixturesLine(a);
    if (fx) lines.push(`   ${fx}`);
    const tasks = Array.isArray(a.tasks) ? a.tasks : [];
    tasks.forEach((t) => lines.push(`   • ${t}`));
    answeredPairs(sectionFields(AREA_SECTIONS), a.details).forEach(([label, v]) => lines.push(`   ${label} ${v}`));
    if (a.notes) lines.push(`   Note: ${a.notes}`);
  });

  // The answers feed the scope (and from there the bid) so they are read,
  // not just stored.
  const intakePairs = answeredPairs([...INTAKE_FIELDS, ...PHONE_QUESTIONS], walkthrough?.intake);
  if (intakePairs.length) {
    lines.push("");
    lines.push("PHONE ANSWERS (Part 1)");
    intakePairs.forEach(([label, v]) => lines.push(`• ${label} ${v}`));
  }
  const wtPairs = answeredPairs(sectionFields(BUILDING_SECTIONS), walkthrough?.answers);
  if (wtPairs.length) {
    lines.push("");
    lines.push("WALKTHROUGH ANSWERS (Part 2)");
    wtPairs.forEach(([label, v]) => lines.push(`• ${label} ${v}`));
  }
  const answers = walkthrough?.answers && typeof walkthrough.answers === "object" ? walkthrough.answers : {};
  const checkedLeave = LEAVE_CHECKLIST.filter((c) => answers[c.key]);
  const leaveText = answeredPairs(LEAVE_TEXT_FIELDS, answers);
  if (answers.leave_proposal_date) leaveText.push(["Proposal date promised:", String(answers.leave_proposal_date)]);
  if (checkedLeave.length || leaveText.length) {
    lines.push("");
    lines.push("BEFORE YOU LEAVE — CHECKLIST");
    LEAVE_CHECKLIST.forEach((c) => lines.push(`${answers[c.key] ? "☑" : "☐"} ${c.label}`));
    leaveText.forEach(([label, v]) => lines.push(`• ${label} ${v}`));
  }
  return lines.join("\n");
}

// One labelled input per question definition (text / textarea / select).
function QuestionFields({ defs, values, onChange }) {
  return defs.map((d) => (
    <label key={d.key} style={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}>
      {d.label}
      {d.type === "textarea" ? (
        <textarea
          value={values[d.key] || ""}
          onChange={(e) => onChange(d.key, e.target.value)}
          rows={2}
          style={{ ...input, borderRadius: 14, marginTop: 6, fontWeight: 400 }}
        />
      ) : d.type === "select" ? (
        <select
          value={values[d.key] || ""}
          onChange={(e) => onChange(d.key, e.target.value)}
          style={{ ...input, marginTop: 6, fontWeight: 400 }}
        >
          <option value="">—</option>
          {d.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={d.type === "text" ? "text" : d.type}
          inputMode={d.inputMode || undefined}
          value={values[d.key] || ""}
          onChange={(e) => onChange(d.key, e.target.value)}
          style={{ ...input, marginTop: 6, fontWeight: 400 }}
        />
      )}
    </label>
  ));
}

export default function WalkthroughDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wid = params.id;
  const { company, member, loading } = useCompany();
  const [walkthrough, setWalkthrough] = useState(null);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(emptyArea);
  const [checked, setChecked] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [manualSqft, setManualSqft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingWt, setEditingWt] = useState(false);
  const [wtForm, setWtForm] = useState({ name: "", notes: "" });
  const [savingWt, setSavingWt] = useState(false);
  const [creatingWOs, setCreatingWOs] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Migration-066 question set. Each flag starts null (unknown) and is set
  // by a probe in load(); false means that piece of 066 has not been run
  // yet, so the matching section stays hidden and saves skip its columns.
  const [wtQReady, setWtQReady] = useState(null);
  const [areaQReady, setAreaQReady] = useState(null);
  const [photosReady, setPhotosReady] = useState(null);
  const [intakeForm, setIntakeForm] = useState({});
  const [apptForm, setApptForm] = useState({ scheduled_at: "", meet_contact: "", entry_notes: "" });
  const [savingIntake, setSavingIntake] = useState(false);
  const [answersForm, setAnswersForm] = useState({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [areaAnswers, setAreaAnswers] = useState({});
  const [photos, setPhotos] = useState([]);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "walkthroughs", member?.role);

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("walkthroughs")
      .select("*, locations(name)")
      .eq("id", wid)
      .eq("company_id", company.id)
      .single();
    if (!data) {
      setLoadError("Couldn't open this walkthrough. It may have been deleted.");
      return;
    }
    setWalkthrough(data);
    // Probe for the migration-066 pieces. select("*") above works either
    // way; a probe error (or the column simply absent from the row) means
    // that part of 066 has not been run yet.
    const wtReady = Object.prototype.hasOwnProperty.call(data, "intake");
    setWtQReady(wtReady);
    if (wtReady) {
      setIntakeForm(data.intake && typeof data.intake === "object" ? data.intake : {});
      setApptForm({
        scheduled_at: toLocalInput(data.scheduled_at),
        meet_contact: data.meet_contact || "",
        entry_notes: data.entry_notes || "",
      });
      setAnswersForm(data.answers && typeof data.answers === "object" ? data.answers : {});
    }
    const { error: areaProbeErr } = await sb.from("walkthrough_areas").select("floor_type").limit(1);
    setAreaQReady(!areaProbeErr);
    const { data: ph, error: photoProbeErr } = await sb
      .from("walkthrough_photos")
      .select("*")
      .eq("walkthrough_id", wid)
      .order("created_at", { ascending: true });
    if (photoProbeErr) {
      setPhotosReady(false);
      setPhotos([]);
    } else {
      setPhotosReady(true);
      setPhotos(await withSignedUrls(sb, ph || []));
    }
    const { data: ar } = await sb
      .from("walkthrough_areas")
      .select("*")
      .eq("walkthrough_id", wid)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setAreas(ar || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  const totalSqft = areas.reduce((s, a) => s + Number(a.square_footage || 0), 0);

  function toggleTask(t) {
    setChecked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustomTask() {
    const t = form.custom_task.trim();
    if (!t) return;
    if (!checked.includes(t)) setChecked((prev) => [...prev, t]);
    setForm({ ...form, custom_task: "" });
  }

  function startEdit(a) {
    setEditing(a.id);
    setForm({
      area_name: a.area_name,
      length_ft: a.length_ft != null ? String(a.length_ft) : "",
      width_ft: a.width_ft != null ? String(a.width_ft) : "",
      square_footage: String(a.square_footage ?? ""),
      notes: a.notes || "",
      custom_task: "",
      floor_type: a.floor_type || "",
      toilets_count: a.toilets_count != null ? String(a.toilets_count) : "",
      urinals_count: a.urinals_count != null ? String(a.urinals_count) : "",
      sinks_count: a.sinks_count != null ? String(a.sinks_count) : "",
    });
    setAreaAnswers(a.details && typeof a.details === "object" ? a.details : {});
    setManualSqft(!(a.length_ft && a.width_ft));
    setChecked(Array.isArray(a.tasks) ? [...a.tasks] : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyArea);
    setAreaAnswers({});
    setChecked([]);
    setManualSqft(false);
  }

  async function saveArea(e) {
    e.preventDefault();
    if (!form.area_name.trim()) {
      alert("Give the area a name (e.g. Lobby, Restroom 1).");
      return;
    }
    setSaving(true);
    const payload = {
      area_name: form.area_name.trim(),
      length_ft: parseFloat(form.length_ft) || null,
      width_ft: parseFloat(form.width_ft) || null,
      square_footage: parseFloat(form.square_footage) || 0,
      tasks: checked,
      notes: form.notes.trim() || null,
    };
    if (areaQReady) {
      payload.floor_type = form.floor_type || null;
      payload.toilets_count = parseInt(form.toilets_count, 10) || null;
      payload.urinals_count = parseInt(form.urinals_count, 10) || null;
      payload.sinks_count = parseInt(form.sinks_count, 10) || null;
      payload.details = pruneAnswers(areaAnswers);
    }
    let error;
    if (editing) {
      ({ error } = await supabase().from("walkthrough_areas").update(payload).eq("id", editing));
    } else {
      ({ error } = await supabase().from("walkthrough_areas").insert({
        walkthrough_id: wid,
        sort_order: areas.length,
        ...payload,
      }));
    }
    setSaving(false);
    if (error) alert("Could not save area: " + error.message);
    else {
      cancelEdit();
      load();
    }
  }

  async function removeArea(id) {
    if (!confirm("Delete this area?")) return;
    const { error } = await supabase().from("walkthrough_areas").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  async function saveIntake() {
    setSavingIntake(true);
    const patch = {
      intake: pruneAnswers(intakeForm),
      scheduled_at: apptForm.scheduled_at ? new Date(apptForm.scheduled_at).toISOString() : null,
      meet_contact: apptForm.meet_contact.trim() || null,
      entry_notes: apptForm.entry_notes.trim() || null,
    };
    const { error } = await supabase().from("walkthroughs").update(patch).eq("id", wid);
    setSavingIntake(false);
    if (error) {
      if (isMissingSchemaError(error)) setWtQReady(false);
      alert("Could not save phone answers: " + error.message);
    } else {
      setWalkthrough((w) => (w ? { ...w, ...patch } : w));
    }
  }

  async function saveAnswers() {
    setSavingAnswers(true);
    const patch = { answers: pruneAnswers(answersForm) };
    const { error } = await supabase().from("walkthroughs").update(patch).eq("id", wid);
    setSavingAnswers(false);
    if (error) {
      if (isMissingSchemaError(error)) setWtQReady(false);
      alert("Could not save walkthrough answers: " + error.message);
    } else {
      setWalkthrough((w) => (w ? { ...w, ...patch } : w));
    }
  }

  async function addPhotos(e) {
    e.preventDefault();
    if (photoFiles.length === 0) return;
    setUploadingPhotos(true);
    const sb = supabase();
    for (const file of photoFiles) {
      const prob = validatePhotoFile(file);
      if (prob) {
        alert(prob);
        continue;
      }
      const path = `${company.id}/${wid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("walkthrough-photos").upload(path, file);
      if (upErr) {
        alert("Photo upload failed: " + upErr.message);
        continue;
      }
      await sb.from("walkthrough_photos").insert({
        walkthrough_id: wid,
        photo_url: path,
        caption: photoCaption.trim() || null,
      });
    }
    setUploadingPhotos(false);
    setPhotoFiles([]);
    setPhotoCaption("");
    load();
  }

  async function removePhoto(id, url) {
    if (!confirm("Delete this photo?")) return;
    const sb = supabase();
    const path = storagePathFromUrl(url);
    if (path) {
      await sb.storage.from("walkthrough-photos").remove([path]);
    }
    await sb.from("walkthrough_photos").delete().eq("id", id);
    load();
  }

  async function copyScope() {
    const text = buildScope(walkthrough, areas);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        alert("Copy failed — select the text manually.");
      }
      document.body.removeChild(ta);
    }
  }

  async function useInBid() {
    const sb = supabase();
    if (walkthrough.bid_id) {
      // Link existing draft bid: fill its sqft total.
      const { error } = await sb
        .from("bids")
        .update({ pricing_mode: "sqft", square_footage: totalSqft })
        .eq("id", walkthrough.bid_id);
      if (error) alert("Could not update bid: " + error.message);
      else {
        alert("Bid updated with " + Math.round(totalSqft).toLocaleString() + " sq ft.");
        router.push(`/app/${company.id}/bids/${walkthrough.bid_id}`);
      }
      return;
    }
    // Create a new draft bid with sqft pricing pre-filled. The phone
    // answers carry over too: who the client is, where the proposal
    // goes, and how many nights a week they asked for.
    const intake = walkthrough.intake && typeof walkthrough.intake === "object" ? walkthrough.intake : {};
    const wtAnswers = walkthrough.answers && typeof walkthrough.answers === "object" ? walkthrough.answers : {};
    const frequency = intake.nights_per_week || wtAnswers.nights_best || null;
    const { data, error } = await sb
      .from("bids")
      .insert({
        company_id: company.id,
        location_id: walkthrough.location_id,
        client_name: intake.business_name || walkthrough.locations?.name || walkthrough.name,
        client_email: intake.proposal_email || intake.contact_email || null,
        title: `Cleaning bid — ${walkthrough.locations?.name || walkthrough.name}`,
        description: buildScope(walkthrough, areas),
        status: "draft",
        pricing_mode: "sqft",
        square_footage: totalSqft,
        ...(frequency ? { frequency } : {}),
      })
      .select("id")
      .single();
    if (error) {
      alert("Could not create bid: " + error.message);
      return;
    }
    await sb.from("walkthroughs").update({ bid_id: data.id }).eq("id", wid);
    router.push(`/app/${company.id}/bids/${data.id}`);
  }

  async function createWorkOrders() {
    if (areas.length === 0) {
      alert("Add at least one area first.");
      return;
    }
    if (!confirm(`Create ${areas.length} work order${areas.length === 1 ? "" : "s"} (one per area)?`)) return;
    setCreatingWOs(true);
    const rows = areas.map((a) => ({
      company_id: company.id,
      location_id: walkthrough.location_id,
      title: `${a.area_name} — ${walkthrough.name}`,
      description: [
        `${dims(a)} — ${Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft`,
        a.floor_type ? `Floor: ${a.floor_type}` : null,
        fixturesLine(a) || null,
        ...(Array.isArray(a.tasks) ? a.tasks : []).map((t) => `• ${t}`),
        ...answeredPairs(sectionFields(AREA_SECTIONS), a.details).map(([label, v]) => `${label} ${v}`),
        a.notes ? `Note: ${a.notes}` : null,
      ].filter(Boolean).join("\n"),
      priority: "normal",
      status: "open",
    }));
    const { error } = await supabase().from("work_orders").insert(rows);
    setCreatingWOs(false);
    if (error) alert("Could not create work orders: " + error.message);
    else {
      alert(`${rows.length} work order${rows.length === 1 ? "" : "s"} created.`);
      router.push(`/app/${company.id}/work-orders`);
    }
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">WALKTHROUGHS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Walkthroughs</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Room-by-room walkthroughs are a <strong>Pro</strong> feature for owners and managers.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <p className="eyebrow">WALKTHROUGHS</p>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>{loadError}</p>
          <Link href={`/app/${company.id}/walkthroughs`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            ← Back to walkthroughs
          </Link>
        </section>
      </div>
    );
  }
  if (!walkthrough) return <p>Loading…</p>;

  const scopeText = buildScope(walkthrough, areas);

  return (
    <div>
      <Link href={`/app/${company.id}/walkthroughs`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
        ← All walkthroughs
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>WALKTHROUGH</p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{walkthrough.name}</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
        {walkthrough.locations?.name || "No location"}
        {walkthrough.notes ? ` · ${walkthrough.notes}` : ""}
      </p>
      {!editingWt ? (
        <button
          onClick={() => { setWtForm({ name: walkthrough.name || "", notes: walkthrough.notes || "" }); setEditingWt(true); }}
          style={{ ...ghostBtnWide, marginBottom: 16 }}
        >
          Edit walkthrough details
        </button>
      ) : (
        <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={wtForm.name} onChange={(e) => setWtForm({ ...wtForm, name: e.target.value })} placeholder="Walkthrough name" style={input} />
            <input value={wtForm.notes} onChange={(e) => setWtForm({ ...wtForm, notes: e.target.value })} placeholder="Notes" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={savingWt}
                onClick={async () => {
                  if (!wtForm.name.trim()) { alert("Name is required."); return; }
                  setSavingWt(true);
                  const sb = supabase();
                  const { error } = await sb.from("walkthroughs").update({ name: wtForm.name.trim(), notes: wtForm.notes.trim() || null }).eq("id", wid);
                  setSavingWt(false);
                  if (error) alert("Could not save: " + error.message);
                  else { setWalkthrough({ ...walkthrough, name: wtForm.name.trim(), notes: wtForm.notes.trim() || null }); setEditingWt(false); }
                }}
                style={primaryBtn}
              >
                {savingWt ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingWt(false)} style={ghostBtnWide}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {wtQReady && (
        <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>Part 1 — Phone questions</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 12px" }}>
            Asked on the phone call, before agreeing to the walkthrough.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <QuestionFields
              defs={INTAKE_FIELDS}
              values={intakeForm}
              onChange={(k, v) => setIntakeForm((prev) => ({ ...prev, [k]: v }))}
            />
            <QuestionFields
              defs={PHONE_QUESTIONS}
              values={intakeForm}
              onChange={(k, v) => setIntakeForm((prev) => ({ ...prev, [k]: v }))}
            />
            <div style={{ fontWeight: 800, marginTop: 4 }}>SCHEDULE THE WALKTHROUGH</div>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}>
              Day / time
              <input
                type="datetime-local"
                value={apptForm.scheduled_at}
                onChange={(e) => setApptForm({ ...apptForm, scheduled_at: e.target.value })}
                style={{ ...input, marginTop: 6, fontWeight: 400 }}
              />
            </label>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}>
              Who will meet us
              <input
                value={apptForm.meet_contact}
                onChange={(e) => setApptForm({ ...apptForm, meet_contact: e.target.value })}
                style={{ ...input, marginTop: 6, fontWeight: 400 }}
              />
            </label>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}>
              Where to park and come in
              <input
                value={apptForm.entry_notes}
                onChange={(e) => setApptForm({ ...apptForm, entry_notes: e.target.value })}
                style={{ ...input, marginTop: 6, fontWeight: 400 }}
              />
            </label>
            <button onClick={saveIntake} disabled={savingIntake} style={primaryBtn}>
              {savingIntake ? "Saving…" : "Save phone answers"}
            </button>
          </div>
        </section>
      )}

      <div className="panel" style={{ padding: 18, marginBottom: 16, background: "var(--brand)", color: "#fff", border: "none" }}>
        <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>Total square footage</div>
        <div style={{ fontSize: "2rem", fontWeight: 800 }}>{Math.round(totalSqft).toLocaleString()} sq ft</div>
        <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
          {areas.length} area{areas.length === 1 ? "" : "s"} measured
        </div>
      </div>

      <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>{editing ? "Edit area" : "Add area"}</h3>
        <form onSubmit={saveArea} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={form.area_name}
            onChange={(e) => setForm({ ...form, area_name: e.target.value })}
            placeholder="Area name (e.g. Boss's office, Restroom 1)"
            maxLength={120}
            style={input}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Length (ft)
              <input
                value={form.length_ft}
                onChange={(e) => {
                  const v = e.target.value;
                  const l = parseFloat(v) || 0, w = parseFloat(form.width_ft) || 0;
                  setForm({ ...form, length_ft: v, square_footage: l && w ? String(Math.round(l * w * 100) / 100) : form.square_footage });
                  setManualSqft(false);
                }}
                placeholder="e.g. 20"
                inputMode="decimal"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <span style={{ fontSize: "1.2rem", fontWeight: 800, paddingBottom: 12 }}>×</span>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Width (ft)
              <input
                value={form.width_ft}
                onChange={(e) => {
                  const v = e.target.value;
                  const l = parseFloat(form.length_ft) || 0, w = parseFloat(v) || 0;
                  setForm({ ...form, width_ft: v, square_footage: l && w ? String(Math.round(l * w * 100) / 100) : form.square_footage });
                  setManualSqft(false);
                }}
                placeholder="e.g. 12.5"
                inputMode="decimal"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "#f7f5f0", fontWeight: 800 }}>
              = {form.square_footage ? Number(form.square_footage).toLocaleString() : "—"} sq ft
            </div>
          </div>
          {manualSqft ? (
            <input
              value={form.square_footage}
              onChange={(e) => setForm({ ...form, square_footage: e.target.value })}
              placeholder="Square footage"
              inputMode="decimal"
              style={input}
            />
          ) : (
            <button type="button" onClick={() => setManualSqft(true)} style={{ ...ghostBtn, alignSelf: "flex-start" }}>
              Enter sq ft directly (odd-shaped room)
            </button>
          )}
          {areaQReady && (
            <>
              <label style={{ display: "block", fontSize: "0.9rem", color: "var(--muted)" }}>
                Floor type
                <select
                  value={form.floor_type}
                  onChange={(e) => setForm({ ...form, floor_type: e.target.value })}
                  style={{ ...input, marginTop: 6 }}
                >
                  <option value="">—</option>
                  {FLOOR_TYPES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
              <div>
                <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: 6 }}>Restroom fixtures (restrooms only)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, fontSize: "0.85rem", color: "var(--muted)" }}>
                    Toilets
                    <input value={form.toilets_count} onChange={(e) => setForm({ ...form, toilets_count: e.target.value })} inputMode="numeric" style={{ ...input, marginTop: 4 }} />
                  </label>
                  <label style={{ flex: 1, fontSize: "0.85rem", color: "var(--muted)" }}>
                    Urinals
                    <input value={form.urinals_count} onChange={(e) => setForm({ ...form, urinals_count: e.target.value })} inputMode="numeric" style={{ ...input, marginTop: 4 }} />
                  </label>
                  <label style={{ flex: 1, fontSize: "0.85rem", color: "var(--muted)" }}>
                    Sinks
                    <input value={form.sinks_count} onChange={(e) => setForm({ ...form, sinks_count: e.target.value })} inputMode="numeric" style={{ ...input, marginTop: 4 }} />
                  </label>
                </div>
              </div>
            </>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 8 }}>What needs cleaning here?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STANDARD_TASKS.map((t) => {
                const on = checked.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTask(t)}
                    style={{
                      ...chip,
                      background: on ? "var(--brand)" : "#fff",
                      color: on ? "#fff" : "var(--ink)",
                      border: on ? "1px solid var(--brand)" : "1px solid var(--line)",
                    }}
                  >
                    {on ? "✓ " : ""}{t}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={form.custom_task}
                onChange={(e) => setForm({ ...form, custom_task: e.target.value })}
                placeholder="Custom task…"
                maxLength={80}
                style={{ ...input, flex: 1 }}
              />
              <button type="button" onClick={addCustomTask} style={ghostBtn}>Add</button>
            </div>
            {checked.filter((t) => !STANDARD_TASKS.includes(t)).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {checked.filter((t) => !STANDARD_TASKS.includes(t)).map((t) => (
                  <button key={t} type="button" onClick={() => toggleTask(t)} style={{ ...chip, background: "var(--brand)", color: "#fff", border: "1px solid var(--brand)" }}>
                    ✓ {t} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Area notes (optional)"
            rows={2}
            style={{ ...input, borderRadius: 14 }}
          />
          {areaQReady && (
            <details style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }}>
              <summary style={{ fontWeight: 800, cursor: "pointer", color: "var(--brand-deep)" }}>
                Room-by-room questions (Part 2)
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                {AREA_SECTIONS.map((s) => (
                  <div key={s.title}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{s.title}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <QuestionFields
                        defs={s.fields}
                        values={areaAnswers}
                        onChange={(k, v) => setAreaAnswers((prev) => ({ ...prev, [k]: v }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1 }}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add area"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>
            )}
          </div>
        </form>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {areas.map((a, i) => (
          <div key={a.id} className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>
                  {i + 1}. {a.area_name}
                  <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {dims(a)} · {Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft</span>
                </div>
                {(Array.isArray(a.tasks) ? a.tasks : []).length > 0 ? (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.9rem" }}>
                    {(Array.isArray(a.tasks) ? a.tasks : []).map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>No tasks checked</div>
                )}
                {a.floor_type && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>Floor: {a.floor_type}</div>
                )}
                {fixturesLine(a) && (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 2 }}>{fixturesLine(a)}</div>
                )}
                {answeredPairs(sectionFields(AREA_SECTIONS), a.details).map(([label, v]) => (
                  <div key={label} style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>{label}</span> {v}
                  </div>
                ))}
                {a.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>Note: {a.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => startEdit(a)} style={ghostBtn}>Edit</button>
                <button onClick={() => removeArea(a.id)} style={dangerGhost}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {wtQReady && (
        <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>Part 2 — Walkthrough questions</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 12px" }}>
            Asked on site. Room-by-room questions are on each area above; these are for the building as a whole.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {BUILDING_SECTIONS.map((s) => (
              <div key={s.title}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{s.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <QuestionFields
                    defs={s.fields}
                    values={answersForm}
                    onChange={(k, v) => setAnswersForm((prev) => ({ ...prev, [k]: v }))}
                  />
                </div>
              </div>
            ))}
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Before You Leave — Checklist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {LEAVE_CHECKLIST.map((c) => (
                  <div key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!answersForm[c.key]}
                        onChange={(e) => setAnswersForm((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                        style={{ width: 20, height: 20 }}
                      />
                      {c.label}
                    </label>
                    {c.textKey && (
                      <input
                        value={answersForm[c.textKey] || ""}
                        onChange={(e) => setAnswersForm((prev) => ({ ...prev, [c.textKey]: e.target.value }))}
                        placeholder={c.textPlaceholder}
                        style={{ ...input, flex: 1, minWidth: 140 }}
                      />
                    )}
                  </div>
                ))}
                <QuestionFields
                  defs={LEAVE_TEXT_FIELDS}
                  values={answersForm}
                  onChange={(k, v) => setAnswersForm((prev) => ({ ...prev, [k]: v }))}
                />
              </div>
            </div>
            <button onClick={saveAnswers} disabled={savingAnswers} style={primaryBtn}>
              {savingAnswers ? "Saving…" : "Save walkthrough answers"}
            </button>
          </div>
        </section>
      )}

      {photosReady && (
        <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "1.1rem" }}>Walkthrough photos</h3>
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
              {photos.map((p) => (
                <div key={p.id}>
                  {p.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.signed_url} alt={p.caption || "Walkthrough photo"} style={{ width: "100%", borderRadius: 12, display: "block" }} />
                  ) : (
                    <div style={{ padding: 12, fontSize: "0.8rem", color: "var(--muted)" }}>Photo unavailable</div>
                  )}
                  {p.caption && <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>{p.caption}</div>}
                  <button onClick={() => removePhoto(p.id, p.photo_url)} style={{ ...ghostBtn, padding: "6px 12px", marginTop: 6 }}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addPhotos} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
            />
            <input
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Caption for these photos (optional)"
              maxLength={200}
              style={input}
            />
            {photoFiles.length > 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>{photoFiles.length} photo(s) selected</p>
            )}
            <button type="submit" disabled={uploadingPhotos || photoFiles.length === 0} style={primaryBtn}>
              {uploadingPhotos ? "Uploading…" : "Upload photos"}
            </button>
          </form>
        </section>
      )}

      {areas.length > 0 && (
        <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "1.1rem" }}>Scope of work</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", background: "var(--surface-muted, #f6f7f9)", padding: 12, borderRadius: 10, margin: "0 0 12px" }}>
            {scopeText}
          </pre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={copyScope} style={primaryBtn}>{copied ? "Copied ✓" : "Copy scope of work"}</button>
            <button onClick={useInBid} style={ghostBtnWide}>
              {walkthrough.bid_id ? "Update linked bid with this total" : "Use in bid (sq ft pricing)"}
            </button>
            <button onClick={createWorkOrders} disabled={creatingWOs} style={ghostBtnWide}>
              {creatingWOs ? "Creating…" : `Create work orders (${areas.length})`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

const input = {
  padding: "12px 16px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const primaryBtn = {
  padding: "14px 24px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1rem",
  cursor: "pointer",
};

const ghostBtn = {
  padding: "12px 20px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const ghostBtnWide = {
  padding: "14px 24px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  width: "100%",
};

const chip = {
  padding: "12px 16px",
  borderRadius: 999,
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerGhost = {
  border: "1px solid #f3c1c1",
  background: "#fff",
  color: "#c0392b",
  borderRadius: 999,
  width: 36,
  height: 36,
  cursor: "pointer",
  flexShrink: 0,
};
