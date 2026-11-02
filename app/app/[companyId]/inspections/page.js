"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../lib/use-clocked-in";
import { isSupervisorRole, isManagerRole } from "../../../../lib/roles";
import { canUseWithRole } from "../../../../lib/tiers";
import { chicagoToday } from "../../../../lib/dates";
import { validatePhotoFile } from "../../../../lib/inspection-photos";
import { INSPECTION_STARTERS, starterById } from "../../../../lib/inspection-starters";
import InspectionChecklistDetails from "../../../../components/InspectionChecklistDetails";
import { buildItemResultRows, saveItemResults } from "../../../../lib/inspection-item-results";
import { loadChecklistTemplates, saveChecklistTemplate, deleteChecklistTemplate, loadInspectionResultCounts } from "../../../../lib/inspection-checklist-templates";

const SCORE_LABELS = { 1: "1 — Poor", 2: "2 — Fair", 3: "3 — Good", 4: "4 — Very good", 5: "5 — Excellent" };
const CHECKLIST = [
  "Floors vacuumed / mopped — no debris or stains",
  "Dusting — desks, shelves, blinds, vents",
  "Trash emptied — liners replaced",
  "Glass & mirrors — streak-free",
  "Restroom fixtures — toilets, sinks, mirrors cleaned",
  "Restroom stocked — soap, paper towels, toilet paper",
  "Kitchen / break room — counters, sink, microwave wiped",
  "High-touch areas disinfected — handles, switches",
];
const emptySection = { name: "", score: "5", notes: "", photos: [], checks: [], itemDetails: {} };

export default function InspectionsPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [inspections, setInspections] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [inspDate, setInspDate] = useState(chicagoToday());
  // Recompute the default once the company's timezone is known.
  useEffect(() => {
    if (company?.timezone) setInspDate(chicagoToday(company.timezone));
  }, [company?.timezone]);
  const [activeId, setActiveId] = useState(null);
  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState(emptySection);
  const [saving, setSaving] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");
  // Section plan: a starter template or the structure of a previous
  // inspection. It pre-fills section names one at a time (with the focus
  // checklist items and a look-for note for starters). Scores, checklist
  // passes, notes, and photos are always entered live by the inspector.
  const [startFrom, setStartFrom] = useState("blank");
  const [plan, setPlan] = useState(null);
  const [planPos, setPlanPos] = useState(0);
  // Checklist templates (migration 084): a company-owned template can
  // give an inspection its own checklist items instead of the standard
  // 8. Fail-soft — until 084 runs there are no templates, the panel
  // shows an honest note, and every inspection uses the standard
  // checklist exactly as it always has.
  const [templates, setTemplates] = useState([]);
  const [templatesAvailable, setTemplatesAvailable] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [tplName, setTplName] = useState("");
  const [tplSiteType, setTplSiteType] = useState("");
  const [tplLocationId, setTplLocationId] = useState("");
  const [tplItemsText, setTplItemsText] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState("");
  // Stored per-item results (migration 076), counted per inspection
  // for the list: { [inspectionId]: { resulted, issues } }.
  const [resultCounts, setResultCounts] = useState({});
  // List depth: search + location/score filters over the rows the
  // page already loads. Nothing here changes what is loaded or the
  // order it arrives in.
  const [listSearch, setListSearch] = useState("");
  const [listLocation, setListLocation] = useState("all");
  const [listScore, setListScore] = useState("all");

  const canInspect = isSupervisorRole(member?.role);
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "inspections", member?.role);

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("inspections")
      .select("id, location_id, inspection_date, score, notes, inspector_id, locations(name)")
      .eq("company_id", company.id)
      .order("inspection_date", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((r) => r.inspector_id).filter(Boolean))];
    let names = {};
    if (ids.length > 0) {
      const { data: members } = await sb.from("team_directory").select("id, display_name").in("id", ids);
      for (const m of members || []) names[m.id] = m.display_name;
    }
    // Count sections per inspection.
    const { data: items } = await sb.from("inspection_items").select("inspection_id");
    const counts = {};
    for (const it of items || []) counts[it.inspection_id] = (counts[it.inspection_id] || 0) + 1;
    setInspections(rows.map((r) => ({
      ...r,
      inspector_name: names[r.inspector_id] || "Unknown inspector",
      section_count: counts[r.id] || 0,
    })));
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    // Additive loads, both fail-soft: checklist templates (084) and
    // the stored per-item result counts (076). Either failing leaves
    // the page behaving exactly as it did before.
    const tpl = await loadChecklistTemplates(sb, company.id);
    setTemplates(tpl.templates);
    setTemplatesAvailable(tpl.available);
    setResultCounts(await loadInspectionResultCounts(sb, rows.map((r) => r.id)));
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  async function startInspection() {
    if (!requireClockedIn(clockedIn, "start an inspection")) return;
    if (!locationId) { alert("Pick a location first."); return; }
    setSaving(true);
    const sb = supabase();
    const { data, error } = await sb.from("inspections").insert({
      company_id: company.id,
      location_id: locationId,
      inspector_id: member.id,
      inspection_date: inspDate,
      notes: overallNotes.trim() || null,
    }).select("id").single();
    if (error) { setSaving(false); alert("Could not start inspection: " + error.message); return; }
    // Build the section plan, if one was chosen. A starter contributes its
    // sections with focus items and look-for notes; a copied inspection
    // contributes only its section names and order — never its scores,
    // checklist passes, notes, or photos.
    let nextPlan = null;
    if (startFrom.startsWith("starter:")) {
      const starter = starterById(startFrom.slice("starter:".length));
      if (starter) {
        nextPlan = {
          label: starter.name,
          sections: starter.sections.map((s) => ({ name: s.name, focus: s.focus || [], lookFor: s.lookFor || "" })),
        };
      }
    } else if (startFrom.startsWith("copy:")) {
      const { data: srcItems } = await sb
        .from("inspection_items")
        .select("section_name, sort_order")
        .eq("inspection_id", startFrom.slice("copy:".length))
        .order("sort_order");
      if (srcItems && srcItems.length > 0) {
        nextPlan = {
          label: "Copied inspection",
          sections: srcItems.map((s) => ({ name: s.section_name, focus: [], lookFor: "" })),
        };
      }
    }
    // A picked checklist template applies to this inspection only:
    // its sections use the template's items instead of the standard
    // checklist. No pick (or a template that has gone away) keeps the
    // standard checklist, exactly as before.
    const chosenTemplate = templates.find((t) => t.id === templateId) || null;
    setActiveTemplate(chosenTemplate && chosenTemplate.items.length > 0 ? chosenTemplate : null);
    setSaving(false);
    setActiveId(data.id);
    setSections([]);
    setPlan(nextPlan);
    setPlanPos(0);
    setNewSection(nextPlan && nextPlan.sections.length > 0 ? { ...emptySection, name: nextPlan.sections[0].name } : emptySection);
  }

  // Move the plan to the section after `pos` and pre-fill its name.
  function advancePlan(pos) {
    if (!plan) return;
    const next = pos + 1;
    setPlanPos(next);
    setNewSection(next < plan.sections.length ? { ...emptySection, name: plan.sections[next].name } : emptySection);
  }

  function dropPlan() {
    setPlan(null);
    setPlanPos(0);
    setNewSection(emptySection);
  }

  async function addTemplate(e) {
    e.preventDefault();
    setTplError("");
    setTplSaving(true);
    const result = await saveChecklistTemplate(supabase(), {
      companyId: company.id,
      name: tplName,
      siteType: tplSiteType,
      locationId: tplLocationId,
      itemsText: tplItemsText,
      createdBy: member?.id || null,
    });
    setTplSaving(false);
    if (result.error) { setTplError(result.error); return; }
    setTemplates([...templates, result.template]);
    setTplName("");
    setTplSiteType("");
    setTplLocationId("");
    setTplItemsText("");
  }

  async function removeTemplate(t) {
    if (!confirm(`Delete the “${t.name}” checklist template? Inspections already recorded with it keep their checklists.`)) return;
    const result = await deleteChecklistTemplate(supabase(), t.id);
    if (result.error) { alert(result.error); return; }
    setTemplates(templates.filter((x) => x.id !== t.id));
    if (templateId === t.id) setTemplateId("");
  }

  async function addSection(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "add an inspection section")) return;
    if (!newSection.name.trim()) { alert("Name the section (e.g. Lobby, Restrooms)."); return; }
    setSaving(true);
    const sb = supabase();
    const { data: item, error } = await sb.from("inspection_items").insert({
      inspection_id: activeId,
      section_name: newSection.name.trim(),
      score: parseInt(newSection.score, 10),
      notes: newSection.notes.trim() || null,
      checklist: newSection.checks,
      sort_order: sections.length,
    }).select("id").single();
    if (error) { setSaving(false); alert("Could not add section: " + error.message); return; }
    // Upload this section's photos.
    for (const file of newSection.photos) {
      const prob = validatePhotoFile(file);
      if (prob) { alert(prob); continue; }
      const path = `${company.id}/${activeId}/${item.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) { alert("Photo upload failed: " + upErr.message); continue; }
      await sb.from("inspection_photos").insert({ inspection_id: activeId, inspection_item_id: item.id, photo_url: path });
    }
    // Per-item structured results (migration 076) ride along with the
    // section — best-effort, so a pre-076 database saves the section
    // exactly as it always has.
    await saveItemResults(sb, buildItemResultRows(activeId, item.id, orderedChecklist, newSection.itemDetails));
    setSaving(false);
    setSections([...sections, { ...newSection, id: item.id, photoCount: newSection.photos.length }]);
    if (plan && planPos < plan.sections.length) advancePlan(planPos);
    else setNewSection(emptySection);
  }

  async function finishInspection() {
    // Compute overall score as the average of section scores.
    if (sections.length > 0) {
      const avg = Math.round(sections.reduce((s, x) => s + parseInt(x.score, 10), 0) / sections.length);
      await supabase().from("inspections").update({ score: avg }).eq("id", activeId);
    }
    setActiveId(null);
    setSections([]);
    setLocationId("");
    setOverallNotes("");
    setStartFrom("blank");
    setPlan(null);
    setPlanPos(0);
    setTemplateId("");
    setActiveTemplate(null);
    load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">INSPECTIONS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Inspections</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Quality checks with photos are a <strong>Plus</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>See plans →</Link>
        </section>
      </div>
    );
  }

  const activeLocation = locations.find((l) => l.id === locationId);
  const planSection = plan && planPos < plan.sections.length ? plan.sections[planPos] : null;
  const planFocus = new Set(planSection?.focus || []);
  // The checklist a section is scored against: the picked template's
  // items while a template inspection is running, otherwise the
  // standard checklist — byte-identical behaviour on the standard path.
  const baseChecklist = activeTemplate && activeTemplate.items.length > 0 ? activeTemplate.items : CHECKLIST;
  const orderedChecklist = planSection
    ? [...baseChecklist.filter((c) => planFocus.has(c)), ...baseChecklist.filter((c) => !planFocus.has(c))]
    : baseChecklist;

  // List depth derivations — all from rows and stored results the
  // page already loads; averages are arithmetic over recorded scores
  // only, and unscored inspections never count as zero.
  const chosenTemplate = templates.find((t) => t.id === templateId) || null;
  const listQuery = listSearch.trim().toLowerCase();
  const visibleInspections = inspections.filter((i) => {
    if (listLocation !== "all" && i.location_id !== listLocation) return false;
    if (listScore === "5" && i.score !== 5) return false;
    if (listScore === "4" && i.score !== 4) return false;
    if (listScore === "low" && !(i.score && i.score <= 3)) return false;
    if (listScore === "unscored" && i.score) return false;
    if (!listQuery) return true;
    return (
      (i.locations?.name || "").toLowerCase().includes(listQuery) ||
      (i.inspector_name || "").toLowerCase().includes(listQuery) ||
      (i.notes || "").toLowerCase().includes(listQuery)
    );
  });
  const filtersActive = listQuery !== "" || listLocation !== "all" || listScore !== "all";
  const scoredInspections = inspections.filter((i) => i.score);
  const averageScore = scoredInspections.length > 0
    ? Math.round((scoredInspections.reduce((s, i) => s + i.score, 0) / scoredInspections.length) * 10) / 10
    : null;
  const inspectionsWithIssues = inspections.filter((i) => (resultCounts[i.id]?.issues || 0) > 0).length;
  const siteHistory = [];
  {
    const bySite = new Map();
    for (const i of inspections) {
      const key = i.location_id || "none";
      if (!bySite.has(key)) bySite.set(key, { key, name: i.locations?.name || "No location", count: 0, scored: 0, scoreSum: 0, lastDate: "" });
      const row = bySite.get(key);
      row.count += 1;
      if (i.score) { row.scored += 1; row.scoreSum += i.score; }
      if (i.inspection_date > row.lastDate) row.lastDate = i.inspection_date;
    }
    siteHistory.push(...bySite.values());
    siteHistory.sort((a, b) => a.name.localeCompare(b.name));
  }
  const isManager = isManagerRole(member?.role);

  return (
    <div>
      <p className="eyebrow">INSPECTIONS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Quality inspections</h2>

      {canInspect && !activeId && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>New inspection</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            One inspection per visit — you'll add room-by-room sections inside it.
          </p>
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={input} required>
              <option value="">Choose a location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Date
              <input type="date" value={inspDate} onChange={(e) => setInspDate(e.target.value)} style={{ ...input, marginTop: 6 }} required />
            </label>
            <textarea value={overallNotes} onChange={(e) => setOverallNotes(e.target.value)}
              placeholder="Overall notes (optional)…" rows={2} style={{ ...input, resize: "vertical" }} />
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Start from
              <select value={startFrom}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartFrom(v);
                  if (v.startsWith("copy:")) {
                    const src = inspections.find((i) => i.id === v.slice("copy:".length));
                    if (src?.location_id) setLocationId(src.location_id);
                  }
                }}
                style={{ ...input, marginTop: 6 }}>
                <option value="blank">Blank — I'll build the sections as I go</option>
                <optgroup label="Starter templates">
                  {INSPECTION_STARTERS.map((s) => (
                    <option key={s.id} value={`starter:${s.id}`}>{s.name} ({s.sections.length} sections)</option>
                  ))}
                </optgroup>
                {inspections.length > 0 && (
                  <optgroup label="Copy a previous inspection's sections">
                    {inspections.map((i) => (
                      <option key={i.id} value={`copy:${i.id}`}>
                        {i.inspection_date} — {i.locations?.name || "No location"} ({i.section_count} section{i.section_count === 1 ? "" : "s"})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {startFrom.startsWith("starter:") && starterById(startFrom.slice("starter:".length)) && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                {starterById(startFrom.slice("starter:".length)).blurb} The sections pre-fill one at a
                time — you still score, check, and photograph each one as you walk it.
              </p>
            )}
            {startFrom.startsWith("copy:") && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                Only the section names and order are copied — never scores, checklist
                results, notes, or photos.
              </p>
            )}
            {templatesAvailable ? (
              <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Checklist template
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ ...input, marginTop: 6 }}>
                  <option value="">Standard checklist — the usual 8 items</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.site_type ? ` — ${t.site_type}` : ""} ({t.items.length} item{t.items.length === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                Checklist templates turn on with the latest WorkTeams update — until then, every inspection uses the standard checklist.
              </p>
            )}
            {chosenTemplate && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                This inspection's sections will use the “{chosenTemplate.name}” checklist
                ({chosenTemplate.items.length} items) instead of the standard one. Sections,
                scores, notes and photos work the same.
              </p>
            )}
            <button onClick={startInspection} disabled={saving} style={button}>
              {saving ? "Starting…" : "Start inspection →"}
            </button>
          </div>
        </section>
      )}

      {canInspect && !activeId && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Checklist templates</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            A template gives a kind of site — or one specific site — its own checklist items
            instead of the standard 8. Pick one when you start an inspection; inspections
            recorded without one keep the standard checklist, and inspections already
            recorded never change.
          </p>
          {!templatesAvailable ? (
            <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Checklist templates turn on with the latest WorkTeams update — until then, every inspection uses the standard checklist.
            </p>
          ) : (
            <>
              {templates.length === 0 && (
                <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>No templates yet. Add the first one below.</p>
              )}
              {templates.map((t) => (
                <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <p style={{ fontWeight: 800, margin: "0 0 4px" }}>
                    {t.name}
                    <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}>
                      {t.site_type ? ` • ${t.site_type}` : ""}
                      {t.location_id ? ` • ${locations.find((l) => l.id === t.location_id)?.name || "Location"}` : ""}
                      {` • ${t.items.length} item${t.items.length === 1 ? "" : "s"}`}
                    </span>
                  </p>
                  <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>{t.items.join(" · ")}</p>
                  {isManager && (
                    <button type="button" onClick={() => removeTemplate(t)} style={{ ...smallGhost, marginTop: 8 }}>Delete template</button>
                  )}
                </div>
              ))}
              <form onSubmit={addTemplate} style={{ display: "grid", gap: 10, marginTop: 14, padding: 14, background: "var(--bg-soft)", borderRadius: 12 }}>
                <h4 style={{ margin: 0 }}>Add a checklist template</h4>
                <input value={tplName} onChange={(e) => setTplName(e.target.value)}
                  placeholder="Template name — e.g. Medical office" style={input} required />
                <input value={tplSiteType} onChange={(e) => setTplSiteType(e.target.value)}
                  placeholder="Kind of site (optional) — e.g. Medical, Bank, Warehouse…" style={input} />
                <select value={tplLocationId} onChange={(e) => setTplLocationId(e.target.value)} style={input}>
                  <option value="">For any location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>For {l.name} only</option>)}
                </select>
                <textarea value={tplItemsText} onChange={(e) => setTplItemsText(e.target.value)}
                  placeholder={"Checklist items — one per line, e.g.\nExam rooms — surfaces disinfected\nWaiting room — chairs and tables wiped"} rows={5} style={{ ...input, resize: "vertical" }} required />
                {tplError && <p style={{ fontSize: "0.88rem", color: "#b3261e", margin: 0 }}>{tplError}</p>}
                <button type="submit" disabled={tplSaving} style={secondaryBtn}>
                  {tplSaving ? "Saving…" : "Save template"}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {canInspect && activeId && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>📋 {activeLocation?.name} — {inspDate}</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Add each room or area as its own section. Score it, note issues, snap photos as you go.
          </p>
          {activeTemplate && (
            <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Checklist: <strong>{activeTemplate.name}</strong> template ({activeTemplate.items.length} items) — this inspection only.
            </p>
          )}

          {plan && planSection && (
            <div style={{ border: "1px dashed var(--brand)", borderRadius: 12, padding: 12, marginBottom: 12, background: "var(--bg-soft)" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.9rem" }}>
                📋 Section plan — {plan.label}: section {planPos + 1} of {plan.sections.length}
              </p>
              {planSection.lookFor && (
                <p style={{ margin: "0 0 4px", fontSize: "0.88rem", color: "var(--muted)" }}>
                  Look for: {planSection.lookFor}
                </p>
              )}
              {planPos + 1 < plan.sections.length && (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  Still to come: {plan.sections.slice(planPos + 1).map((s) => s.name).join(", ")}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => advancePlan(planPos)} style={smallGhost}>Skip this section</button>
                <button type="button" onClick={dropPlan} style={smallGhost}>Drop the plan</button>
              </div>
            </div>
          )}
          {plan && !planSection && (
            <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: "0 0 12px" }}>
              ✅ Section plan complete — add any extra sections below, or finish the inspection.
            </p>
          )}

          {sections.map((s, i) => (
            <div key={s.id || i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <p style={{ fontWeight: 800, margin: "0 0 4px" }}>
                {"★".repeat(parseInt(s.score, 10))} {s.name}
                {s.photoCount > 0 && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.85rem" }}> • {s.photoCount} photo(s)</span>}
              </p>
              {s.notes && <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: 0 }}>{s.notes}</p>}
            </div>
          ))}

          <form onSubmit={addSection} style={{ display: "grid", gap: 10, marginTop: 14, padding: 14, background: "var(--bg-soft)", borderRadius: 12 }}>
            <h4 style={{ margin: 0 }}>Add a section</h4>
            <input value={newSection.name} onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
              placeholder="Section name — e.g. Lobby, Restrooms, Break room…" style={input} required />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Score
                <select value={newSection.score} onChange={(e) => setNewSection({ ...newSection, score: e.target.value })} style={{ ...input, marginTop: 6 }}>
                  {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                </select>
              </label>
              <label style={{ flex: 2, fontSize: "0.9rem", color: "var(--muted)" }}>
                Photos
                <input type="file" accept="image/*" multiple capture="environment"
                  onChange={(e) => setNewSection({ ...newSection, photos: Array.from(e.target.files || []) })}
                  style={{ ...input, marginTop: 6 }} />
              </label>
            </div>
            <textarea value={newSection.notes} onChange={(e) => setNewSection({ ...newSection, notes: e.target.value })}
              placeholder="Notes for this section — what needs attention…" rows={2} style={{ ...input, resize: "vertical" }} />
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, margin: "4px 0 2px" }}>Checklist — tick what passed</p>
              <InspectionChecklistDetails
                items={orderedChecklist}
                focus={planFocus}
                checks={newSection.checks}
                details={newSection.itemDetails}
                onChange={({ checks, details }) => setNewSection({ ...newSection, checks, itemDetails: details })}
              />
            </div>
            {newSection.photos.length > 0 && <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>{newSection.photos.length} photo(s) selected</p>}
            <button type="submit" disabled={saving} style={secondaryBtn}>
              {saving ? "Adding…" : "+ Add this section"}
            </button>
          </form>

          <button onClick={finishInspection} style={{ ...button, marginTop: 14 }}>
            ✅ Done — save inspection ({sections.length} section{sections.length === 1 ? "" : "s"})
          </button>
        </section>
      )}

      {inspections.length > 0 && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Inspection history by site</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: 0 }}>
            {inspections.length} inspection{inspections.length === 1 ? "" : "s"} recorded
            {averageScore !== null && <> • Average recorded score {averageScore} / 5 across {scoredInspections.length} scored inspection{scoredInspections.length === 1 ? "" : "s"}</>}
            {inspectionsWithIssues > 0 && <> • {inspectionsWithIssues} inspection{inspectionsWithIssues === 1 ? "" : "s"} with items marked Issue</>}
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {siteHistory.map((s) => (
              <p key={s.key} style={{ margin: 0, fontSize: "0.92rem" }}>
                <strong>{s.name}</strong>
                <span style={{ color: "var(--muted)" }}>
                  {` — ${s.count} inspection${s.count === 1 ? "" : "s"}`}
                  {s.scored > 0 ? ` • average score ${Math.round((s.scoreSum / s.scored) * 10) / 10} / 5` : " • no scores recorded"}
                  {s.lastDate ? ` • last inspected ${s.lastDate}` : ""}
                </span>
              </p>
            ))}
          </div>
        </section>
      )}

      {inspections.length > 0 && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Search inspections
              <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} type="search"
                placeholder="Location, inspector, or notes…" style={{ ...input, marginTop: 6 }} />
            </label>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Location
              <select value={listLocation} onChange={(e) => setListLocation(e.target.value)} style={{ ...input, marginTop: 6 }}>
                <option value="all">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Score
              <select value={listScore} onChange={(e) => setListScore(e.target.value)} style={{ ...input, marginTop: 6 }}>
                <option value="all">All scores</option>
                <option value="5">5 — Excellent only</option>
                <option value="4">4 — Very good only</option>
                <option value="low">3 or below</option>
                <option value="unscored">Not scored yet</option>
              </select>
            </label>
            {filtersActive && (
              <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
                Showing {visibleInspections.length} of {inspections.length} inspections.
              </p>
            )}
          </div>
        </section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {inspections.length === 0 && <p style={{ color: "var(--muted)" }}>No inspections yet.</p>}
        {inspections.length > 0 && visibleInspections.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No inspections match your search or filters.</p>
        )}
        {visibleInspections.map((i) => (
          <Link key={i.id} href={`/app/${company.id}/inspections/${i.id}`}
            className="portal-card" style={{ minHeight: 0, padding: "16px 20px", textDecoration: "none", color: "inherit" }}>
            <span className="card-kicker">
              {i.inspection_date} • {i.locations?.name || "No location"} • {"★".repeat(i.score || 0)}
              {i.section_count > 0 && ` • ${i.section_count} section${i.section_count === 1 ? "" : "s"}`}
            </span>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              {i.inspector_name}
              {i.notes ? ` — ${i.notes.slice(0, 80)}${i.notes.length > 80 ? "…" : ""}` : ""}
            </p>
            {(resultCounts[i.id]?.issues || 0) > 0 && (
              <p style={{ margin: "6px 0 0", color: "#b3261e", fontSize: "0.9rem", fontWeight: 700 }}>
                ⚠ {resultCounts[i.id].issues} checklist item{resultCounts[i.id].issues === 1 ? "" : "s"} marked Issue
              </p>
            )}
            <span className="card-link">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const input = { padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", width: "100%" };
const button = { padding: "12px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondaryBtn = { padding: "10px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer" };
const smallGhost = { padding: "6px 14px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" };
