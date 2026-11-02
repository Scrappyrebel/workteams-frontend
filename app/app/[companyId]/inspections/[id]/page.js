"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../../lib/use-clocked-in";
import { canUseWithRole } from "../../../../../lib/tiers";
import { storagePathFromUrl, validatePhotoFile, withSignedUrls } from "../../../../../lib/inspection-photos";
import InspectionChecklistDetails from "../../../../../components/InspectionChecklistDetails";
import { buildItemResultRows, saveItemResults, loadItemResultsBySection, ITEM_OUTCOME_LABELS } from "../../../../../lib/inspection-item-results";

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

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [inspection, setInspection] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [publication, setPublication] = useState(null);
  const [publicationSummary, setPublicationSummary] = useState("");
  const [publicationError, setPublicationError] = useState("");
  const [publicationBusy, setPublicationBusy] = useState(false);
  // Depth additions (D-WT-21): site history, follow-up work orders
  // linked to this inspection, and the manager follow-up form state.
  const [siteHistory, setSiteHistory] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [woPriority, setWoPriority] = useState("normal");
  const [woAssignedTo, setWoAssignedTo] = useState("");
  const [woDueDate, setWoDueDate] = useState("");
  const [woBusy, setWoBusy] = useState(false);
  const [woError, setWoError] = useState("");
  const [woCreatedId, setWoCreatedId] = useState(null);
  const [woFormReady, setWoFormReady] = useState(false);

  const inspectionId = params.id;
  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "inspections", member?.role);
  const [sections, setSections] = useState([]);
  const [newSecName, setNewSecName] = useState("");
  const [newSecScore, setNewSecScore] = useState("5");
  const [newSecNotes, setNewSecNotes] = useState("");
  const [newSecPhotos, setNewSecPhotos] = useState([]);
  const [newSecChecks, setNewSecChecks] = useState([]);
  const [newSecItemDetails, setNewSecItemDetails] = useState({});
  const [secSaving, setSecSaving] = useState(false);
  const [editingSec, setEditingSec] = useState(null);

  async function load() {
    const sb = supabase();
    const { data: insp } = await sb
      .from("inspections")
      .select("*, locations(name)")
      .eq("id", inspectionId)
      .eq("company_id", company.id)
      .single();
    if (!insp) {
      router.replace(`/app/${company.id}/inspections`);
      return;
    }
    let inspectorName = "Unknown inspector";
    if (insp.inspector_id) {
      const { data: m } = await sb.from("team_directory").select("display_name").eq("id", insp.inspector_id).single();
      if (m) inspectorName = m.display_name;
    }
    setInspection({ ...insp, inspector_name: inspectorName });
    if(isManager){
      const result=await sb.rpc("get_client_portal_inspection_publication_for_manager",{p_inspection_id:inspectionId});
      if(result.error){
        setPublication(null);
        setPublicationError("Customer report publication is not available: "+result.error.message);
      }else{
        setPublication(result.data);
        setPublicationSummary(result.data?.customer_summary||"");
        setPublicationError("");
      }
    }
    // Load sections with their photos.
    const { data: items } = await sb.from("inspection_items")
      .select("*, inspection_photos(*)")
      .eq("inspection_id", inspectionId)
      .order("sort_order");
    // Per-item structured results (migration 076), grouped by section.
    // Fail-soft: until 076 runs there is no table, this returns {}, and
    // sections render exactly as they did before.
    const resultsBySection = await loadItemResultsBySection(sb, inspectionId);
    const withUrls = [];
    for (const it of items || []) {
      withUrls.push({
        ...it,
        photos: await withSignedUrls(sb, it.inspection_photos || []),
        itemResults: resultsBySection[it.id] || [],
      });
    }
    setSections(withUrls);
    // Legacy: photos attached directly to the inspection (no section).
    const { data: ph } = await sb.from("inspection_photos").select("*")
      .eq("inspection_id", inspectionId).is("inspection_item_id", null).order("created_at");
    setPhotos(await withSignedUrls(sb, ph || []));
    // Depth additions (D-WT-21): other inspections at this site, the
    // follow-up work orders already created from this inspection, and
    // the team list for the follow-up form. All fail-soft: any failure
    // leaves the lists empty and the page renders as it did before.
    try {
      if (insp.location_id) {
        const { data: hist } = await sb.from("inspections")
          .select("id, inspection_date, score, inspector_id")
          .eq("company_id", company.id)
          .eq("location_id", insp.location_id)
          .neq("id", inspectionId)
          .order("inspection_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6);
        const rows = hist || [];
        const hIds = [...new Set(rows.map((r) => r.inspector_id).filter(Boolean))];
        const hNames = {};
        if (hIds.length > 0) {
          const { data: ms } = await sb.from("team_directory").select("id, display_name").in("id", hIds);
          for (const m of ms || []) hNames[m.id] = m.display_name;
        }
        setSiteHistory(rows.map((r) => ({ ...r, inspector_name: hNames[r.inspector_id] || null })));
      } else {
        setSiteHistory([]);
      }
    } catch { setSiteHistory([]); }
    try {
      // Follow-ups created from this page carry source "inspection"
      // and this inspection's id inside their description text (the
      // work_orders table has no inspection link column — the label
      // in the record is the link, the same labelling approach the
      // portal uses with source "portal").
      const { data: wos } = await sb.from("work_orders")
        .select("id, title, status, priority, due_date, assigned_to, created_at")
        .eq("company_id", company.id)
        .eq("source", "inspection")
        .ilike("description", `%${inspectionId}%`)
        .order("created_at", { ascending: false });
      const rows = wos || [];
      const aIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))];
      const aNames = {};
      if (aIds.length > 0) {
        const { data: ms } = await sb.from("team_directory").select("id, display_name").in("id", aIds);
        for (const m of ms || []) aNames[m.id] = m.display_name;
      }
      setFollowUps(rows.map((r) => ({ ...r, assignee_name: aNames[r.assigned_to] || "Unassigned" })));
    } catch { setFollowUps([]); }
    if (isManager) {
      try {
        const { data: ms } = await sb.from("team_directory").select("id, display_name").eq("company_id", company.id).order("display_name");
        setTeamMembers(ms || []);
      } catch { setTeamMembers([]); }
    }
  }

  useEffect(() => {
    if (!loading && company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company]);

  // ---- Depth additions (D-WT-21): derived from stored results only ----
  // Nothing below writes anything on view. Every figure comes from
  // rows the page already loads (sections + their per-item results).
  const allItemResults = sections.flatMap((s) => (s.itemResults || []).map((r) => ({ ...r, section_name: s.section_name })));
  const itemCounts = {
    pass: allItemResults.filter((r) => r.outcome === "pass").length,
    issue: allItemResults.filter((r) => r.outcome === "issue").length,
    na: allItemResults.filter((r) => r.outcome === "na").length,
  };
  const itemScores = allItemResults.map((r) => r.score).filter((v) => v !== null && v !== undefined);
  const itemAverage = itemScores.length > 0 ? itemScores.reduce((a, b) => a + Number(b), 0) / itemScores.length : null;
  // What counts as needing follow-up, stated on screen with the list:
  // an item the inspector marked "Issue", or a whole section scored
  // 1 or 2 of 5 (this page's own labels for those scores are Poor and
  // Fair). Nothing else is listed, and items with no recorded result
  // are never counted as failures.
  const deficiencies = [];
  for (const s of sections) {
    for (const r of s.itemResults || []) {
      if (r.outcome === "issue") {
        deficiencies.push({ kind: "item", section: s.section_name, label: r.item_label, note: r.note || null, score: r.score });
      }
    }
    if (s.score !== null && s.score !== undefined && Number(s.score) <= 2) {
      deficiencies.push({ kind: "section", section: s.section_name, label: null, note: s.notes || null, score: s.score });
    }
  }
  const WO_STATUS_LABELS = { open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
  const WO_PRIORITY_LABELS = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

  // Prefill the follow-up form once, from the stored record. The
  // manager can edit every field before anything is created.
  useEffect(() => {
    if (!inspection || woFormReady || sections.length === 0) return;
    const lines = [
      `Follow-up from the inspection on ${inspection.inspection_date} at ${inspection.locations?.name || "this site"}.`,
      "Needs attention:",
      ...deficiencies.map((d) => d.kind === "item"
        ? `• ${d.section} — ${d.label}${d.score !== null && d.score !== undefined ? ` (item score ${d.score}/5)` : ""}${d.note ? ` — ${d.note}` : ""}`
        : `• ${d.section} — section scored ${d.score} of 5${d.note ? ` — ${d.note}` : ""}`),
      `Inspection record: ${inspectionId}`,
    ];
    setWoTitle(`Follow-up: ${inspection.locations?.name || "Site"} inspection ${inspection.inspection_date}`);
    setWoDescription(lines.join("\n"));
    setWoFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspection, sections, woFormReady]);

  // Manager-initiated corrective action: creates ONE normal work
  // order through the work orders module's own insert shape (the
  // same fields the Work Orders page writes), labelled with
  // source "inspection" and this inspection's id in the description
  // so the follow-up stays traceable back to this record. Viewing
  // this page never creates anything; only this submit does. The
  // work order is internal — customer publication stays the separate
  // manager step on the work order itself, exactly as today.
  async function createFollowUpWorkOrder(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "create a follow-up work order")) return;
    if (!woTitle.trim()) { setWoError("Give the follow-up work order a title."); return; }
    setWoBusy(true);
    setWoError("");
    const { data: created, error } = await supabase().from("work_orders").insert({
      company_id: company.id,
      location_id: inspection.location_id || null,
      title: woTitle.trim(),
      description: woDescription.trim() || null,
      priority: woPriority,
      assigned_to: woAssignedTo || null,
      due_date: woDueDate || null,
      source: "inspection",
      status: "open",
    }).select("id").single();
    setWoBusy(false);
    if (error) { setWoError("Could not create the follow-up work order: " + error.message); return; }
    // Notify the assignee (best effort — the same call the Work
    // Orders page makes after creating an assigned order).
    if (created?.id && woAssignedTo) {
      try {
        await fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: created.id, event: "assigned", actor_member_id: member.id }),
        });
      } catch {}
    }
    setWoCreatedId(created?.id || null);
    load();
  }

  async function updatePortalPublication(publish) {
    if(!isManager||!inspection||publicationBusy)return;
    const summary=publicationSummary.trim();
    if(publish&&(!inspection.score||summary.length<10||summary.length>600)){
      setPublicationError("Finish scoring the inspection, then write a customer-safe summary of 10–600 characters.");return;
    }
    if(!publish&&!window.confirm("Withdraw this customer quality report? The customer link will stop showing it."))return;
    setPublicationBusy(true);setPublicationError("");
    try{
      const result=await supabase().rpc("set_client_portal_inspection_publication",{
        p_inspection_id:inspectionId,p_publish:publish,p_customer_summary:publish?summary:null
      });
      if(result.error||!result.data)throw new Error(result.error?.message||"The publication change was not confirmed saved.");
      const check=await supabase().rpc("get_client_portal_inspection_publication_for_manager",{p_inspection_id:inspectionId});
      if(check.error||check.data?.published!==publish)
        throw new Error("The new publication state could not be verified. Check its status before retrying.");
      setPublication(check.data);
      setPublicationSummary(check.data?.customer_summary||"");
    }catch(error){
      setPublicationError(error instanceof Error?error.message:"The quality report status could not be confirmed.");
    }finally{setPublicationBusy(false)}
  }

  async function addPhotos(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "upload inspection photos")) return;
    if (files.length === 0) return;
    setUploading(true);
    const sb = supabase();
    for (const file of files) {
      const prob = validatePhotoFile(file);
      if (prob) {
        alert(prob);
        continue;
      }
      const path = `${company.id}/${inspectionId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) {
        alert("Photo upload failed: " + upErr.message);
        continue;
      }
      await sb.from("inspection_photos").insert({ inspection_id: inspectionId, photo_url: path });
    }
    setUploading(false);
    setFiles([]);
    load();
  }

  async function addSectionToExisting(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "add an inspection section")) return;
    if (!newSecName.trim()) { alert("Name the section first."); return; }
    setSecSaving(true);
    const sb = supabase();
    const { data: item, error } = await sb.from("inspection_items").insert({
      inspection_id: inspectionId,
      section_name: newSecName.trim(),
      score: parseInt(newSecScore, 10),
      notes: newSecNotes.trim() || null,
      checklist: newSecChecks,
      sort_order: sections.length,
    }).select("id").single();
    if (error) { setSecSaving(false); alert("Could not add section: " + error.message); return; }
    for (const file of newSecPhotos) {
      const prob = validatePhotoFile(file);
      if (prob) { alert(prob); continue; }
      const path = `${company.id}/${inspectionId}/${item.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from("inspection-photos").upload(path, file);
      if (upErr) { alert("Photo upload failed: " + upErr.message); continue; }
      await sb.from("inspection_photos").insert({ inspection_id: inspectionId, inspection_item_id: item.id, photo_url: path });
    }
    // Per-item structured results (migration 076) ride along with the
    // section — best-effort, so a pre-076 database saves the section
    // exactly as it always has.
    await saveItemResults(sb, buildItemResultRows(inspectionId, item.id, CHECKLIST, newSecItemDetails));
    setSecSaving(false);
    setNewSecName(""); setNewSecScore("5"); setNewSecNotes(""); setNewSecPhotos([]); setNewSecChecks([]); setNewSecItemDetails({});
    load();
  }

  async function saveSectionEdit(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "edit an inspection section")) return;
    if (!editingSec) return;
    const sb = supabase();
    const { error } = await sb.from("inspection_items").update({
      section_name: editingSec.section_name.trim(),
      score: parseInt(editingSec.score, 10),
      notes: editingSec.notes?.trim() || null,
      checklist: editingSec.checklist || [],
    }).eq("id", editingSec.id);
    if (error) { alert("Could not save: " + error.message); return; }
    setEditingSec(null);
    load();
  }

  async function deleteSection(id) {
    if (!requireClockedIn(clockedIn, "delete an inspection section")) return;
    if (!confirm("Delete this section and its photos?")) return;
    const { error } = await supabase().from("inspection_items").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  async function removePhoto(id, url) {
    if (!requireClockedIn(clockedIn, "delete a photo")) return;
    if (!confirm("Delete this photo?")) return;
    const sb = supabase();
    const path = storagePathFromUrl(url);
    if (path) {
      await sb.storage.from("inspection-photos").remove([path]);
    }
    await sb.from("inspection_photos").delete().eq("id", id);
    load();
  }

  async function removeInspection() {
    if (!confirm("Delete this inspection and all its photos?")) return;
    const { error } = await supabase().from("inspections").delete().eq("id", inspectionId);
    if (error) alert("Could not delete: " + error.message);
    else router.replace(`/app/${company.id}/inspections`);
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">INSPECTIONS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Inspections</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Quality checks with photos are a <strong>Plus</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }
  if (!inspection) return <p>Loading…</p>;

  return (
    <div>
      <Link href={`/app/${company.id}/inspections`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem" }}>
        ← All inspections
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>INSPECTION</p>
      <h2 style={{ fontSize: "1.8rem" }}>{inspection.locations?.name || "No location"}</h2>

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <p style={{ margin: "0 0 8px" }}>
          <strong>{inspection.inspection_date}</strong> • {SCORE_LABELS[inspection.score] || `Score ${inspection.score}`} • {inspection.inspector_name}
        </p>
        {inspection.notes && <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>{inspection.notes}</p>}
        {isManager && (
          <button onClick={removeInspection} style={dangerButton}>
            Delete inspection
          </button>
        )}
      </section>

      {sections.length > 0 && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Results at a glance</h3>
          <p style={{ margin: "0 0 8px" }}>
            Overall score as recorded: <strong>{inspection.score ? (SCORE_LABELS[inspection.score] || `Score ${inspection.score}`) : "Not scored"}</strong>
            <span style={{ color: "var(--muted)" }}> — recorded as the rounded average of the section scores below.</span>
          </p>
          {allItemResults.length > 0 ? (
            <p style={{ margin: "0 0 8px" }}>
              {allItemResults.length} item result{allItemResults.length === 1 ? "" : "s"} recorded:{" "}
              <strong>{itemCounts.pass} Pass</strong> · <strong>{itemCounts.issue} Issue</strong> · <strong>{itemCounts.na} N/A</strong>
              {itemAverage !== null && (
                <span> · Average of the {itemScores.length} recorded item score{itemScores.length === 1 ? "" : "s"}: <strong>{itemAverage.toFixed(1)}/5</strong></span>
              )}
              <span style={{ color: "var(--muted)" }}> Items with no recorded result are not counted.</span>
            </p>
          ) : (
            <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>No per-item results were recorded for this inspection — the section scores and ticked checklists below are the record.</p>
          )}
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.92rem" }}>
            {sections.map((s) => {
              const rs = s.itemResults || [];
              const p = rs.filter((r) => r.outcome === "pass").length;
              const i2 = rs.filter((r) => r.outcome === "issue").length;
              const n = rs.filter((r) => r.outcome === "na").length;
              return (
                <li key={s.id} style={{ marginBottom: 3 }}>
                  <strong>{s.section_name}</strong> — {s.score ? (SCORE_LABELS[s.score] || `Score ${s.score}`) : "Not scored"}
                  {rs.length > 0 && <span> · {p} Pass · {i2} Issue · {n} N/A</span>}
                  {Array.isArray(s.checklist) && s.checklist.length > 0 && <span> · {s.checklist.length} checklist item{s.checklist.length === 1 ? "" : "s"} ticked as passed</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(deficiencies.length > 0 || followUps.length > 0 || isManager) && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Follow-up</h3>
          {deficiencies.length > 0 ? (
            <>
              <p style={{ margin: "0 0 8px" }}>
                <strong>Needs attention ({deficiencies.length})</strong>
                <span style={{ color: "var(--muted)" }}> — from the stored results: an item marked Issue, or a section scored 1–2 of 5. Nothing was created automatically; a manager decides what becomes a work order below.</span>
              </p>
              <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: "0.92rem" }}>
                {deficiencies.map((d, di) => (
                  <li key={di} style={{ marginBottom: 3 }}>
                    {d.kind === "item" ? (
                      <><strong>{d.section}</strong> — {d.label}
                        {d.score !== null && d.score !== undefined && <span> · Score {d.score}/5</span>}
                        {d.note && <span style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}> — {d.note}</span>}</>
                    ) : (
                      <><strong>{d.section}</strong> — section scored {d.score} of 5
                        {d.note && <span style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}> — {d.note}</span>}</>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>No item is marked Issue and no section is scored 1–2 of 5 in the stored results.</p>
          )}
          {followUps.length > 0 && (
            <>
              <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Follow-up work orders from this inspection</p>
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                {followUps.map((w) => (
                  <Link key={w.id} href={`/app/${company.id}/work-orders/${w.id}`} className="portal-card" style={{ minHeight: 0, padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
                    <span className="card-kicker">{WO_STATUS_LABELS[w.status] || w.status} • {WO_PRIORITY_LABELS[w.priority] || w.priority} priority</span>
                    <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{w.title}</p>
                    <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.88rem" }}>
                      {w.assignee_name}{w.due_date ? ` • due ${w.due_date}` : " • no due date"} • created {String(w.created_at).slice(0, 10)}
                    </p>
                    <span className="card-link">Open →</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {woCreatedId && (
            <p style={{ color: "#1e8e4d", fontWeight: 700 }}>
              Follow-up work order created.{" "}
              <Link href={`/app/${company.id}/work-orders/${woCreatedId}`} style={{ color: "var(--brand-deep)" }}>Open it →</Link>
            </p>
          )}
          {isManager && (
            <form onSubmit={createFollowUpWorkOrder} style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 6 }}>
              <p style={{ fontWeight: 700, margin: 0 }}>Create a follow-up work order</p>
              {woError && <p role="alert" style={{ color: "#b3261e", margin: 0 }}>{woError}</p>}
              <input value={woTitle} onChange={(e) => setWoTitle(e.target.value)} placeholder="Title" required style={input} />
              <textarea value={woDescription} onChange={(e) => setWoDescription(e.target.value)} rows={5} style={{ ...input, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <select value={woPriority} onChange={(e) => setWoPriority(e.target.value)} style={{ ...input, flex: 1 }}>
                  {Object.keys(WO_PRIORITY_LABELS).map((p) => (
                    <option key={p} value={p}>{WO_PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
                <select value={woAssignedTo} onChange={(e) => setWoAssignedTo(e.target.value)} style={{ ...input, flex: 1 }}>
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
                <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                  Due date
                  <input type="date" value={woDueDate} onChange={(e) => setWoDueDate(e.target.value)} style={{ ...input, marginTop: 6 }} />
                </label>
              </div>
              <button type="submit" disabled={woBusy} style={button}>
                {woBusy ? "Creating…" : "Create follow-up work order"}
              </button>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                Creates a normal WorkTeams work order for this site, labelled as coming from this inspection so it stays traceable. It is not published to the customer portal — publishing a work order stays a separate step on the work order itself.
              </p>
            </form>
          )}
        </section>
      )}

      {siteHistory.length > 0 && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Other inspections at this site</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {siteHistory.map((h) => (
              <Link key={h.id} href={`/app/${company.id}/inspections/${h.id}`} className="portal-card" style={{ minHeight: 0, padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {h.inspection_date} • {h.score ? (SCORE_LABELS[h.score] || `Score ${h.score}`) : "Not scored"}
                  {h.inspector_name ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> • {h.inspector_name}</span> : ""}
                </p>
                <span className="card-link">Open →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isManager&&<section className="panel" style={{padding:22,margin:"18px 0"}}>
        <h3 style={{marginTop:0}}>Customer Portal — Published Quality Report</h3>
        <p style={{fontSize:"0.88rem",color:"var(--muted)"}}>Inspections stay private until an owner or administrator publishes an approved, customer-safe summary. Only the inspection date, score, and summary will appear in the location-specific Customer Portal link. Internal notes, checklists, inspector identities and photos stay private.</p>
        {publicationError&&<p role="alert" style={{color:"#b3261e"}}>{publicationError}</p>}
        <p><strong>Current visibility:</strong> {publication?.published?"Published to this location's customer link":"Not published"}</p>
        <label htmlFor="client-quality-summary">Customer-safe quality summary (10–600 characters)</label>
        <textarea id="client-quality-summary" rows={4} maxLength={600} value={publicationSummary}
          onChange={e=>setPublicationSummary(e.target.value)} disabled={publicationBusy}
          placeholder="Describe the completed inspection in customer-safe language. Do not include names, security details, or internal staff notes." style={{...input,resize:"vertical"}} />
        <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
          <button type="button" disabled={publicationBusy||!inspection.score||publicationSummary.trim().length<10}
            onClick={()=>void updatePortalPublication(true)} style={button}>
            {publicationBusy?"Saving…":publication?.published?"Update published summary":"Publish quality report"}
          </button>
          {publication?.published&&<button type="button" disabled={publicationBusy}
            onClick={()=>void updatePortalPublication(false)} style={secondaryBtn}>Withdraw report</button>}
        </div>
      </section>}

      {sections.length > 0 && (
        <>
          <h3>Sections ({sections.length})</h3>
          {sections.map((s) => (
            <section key={s.id} className="panel" style={{ padding: 18, margin: "12px 0" }}>
              {editingSec?.id === s.id ? (
                <form onSubmit={saveSectionEdit} style={{ display: "grid", gap: 10 }}>
                  <input value={editingSec.section_name}
                    onChange={(e) => setEditingSec({ ...editingSec, section_name: e.target.value })}
                    style={input} required />
                  <select value={editingSec.score}
                    onChange={(e) => setEditingSec({ ...editingSec, score: e.target.value })} style={input}>
                    {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                  </select>
                  <div style={{ display: "grid", gap: 6 }}>
                    {CHECKLIST.map((item) => (
                      <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={(editingSec.checklist || []).includes(item)}
                          onChange={(e) => setEditingSec({
                            ...editingSec,
                            checklist: e.target.checked
                              ? [...(editingSec.checklist || []), item]
                              : (editingSec.checklist || []).filter((c) => c !== item),
                          })}
                          style={{ width: 18, height: 18 }} />
                        {item}
                      </label>
                    ))}
                  </div>
                  <textarea value={editingSec.notes || ""}
                    onChange={(e) => setEditingSec({ ...editingSec, notes: e.target.value })}
                    rows={2} style={{ ...input, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={button}>Save</button>
                    <button type="button" onClick={() => setEditingSec(null)} style={secondaryBtn}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <p style={{ fontWeight: 800, margin: "0 0 6px", fontSize: "1.05rem" }}>
                    {"★".repeat(s.score || 0)}{"★".repeat(5 - (s.score || 0)).replace(/★/g, "☆")} {s.section_name}
                  </p>
                  {Array.isArray(s.checklist) && s.checklist.length > 0 && (
                    <ul style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: "0.9rem", color: "#1e8e4d" }}>
                      {s.checklist.map((c, ci) => <li key={ci}>✓ {c}</li>)}
                    </ul>
                  )}
                  {Array.isArray(s.itemResults) && s.itemResults.length > 0 && (
                    <div style={{ margin: "0 0 10px" }}>
                      <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 4px" }}>Item results</p>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem" }}>
                        {s.itemResults.map((r) => (
                          <li key={r.id} style={{ marginBottom: 3 }}>
                            {r.outcome && (
                              <span style={{ fontWeight: 700, color: r.outcome === "pass" ? "#1e8e4d" : r.outcome === "issue" ? "#b3261e" : "var(--muted)" }}>
                                {ITEM_OUTCOME_LABELS[r.outcome] || r.outcome}{" "}
                              </span>
                            )}
                            {r.item_label}
                            {r.score !== null && r.score !== undefined && <span> • Score {r.score}/5</span>}
                            {r.note && <span style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}> — {r.note}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.notes && <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{s.notes}</p>}
                  {s.photos.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 8 }}>
                      {s.photos.map((p) => (
                        <a key={p.id} href={p.signed_url || undefined} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.signed_url || undefined} alt={p.caption || s.section_name} style={{ width: "100%", borderRadius: 10, display: "block" }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {isManager && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setEditingSec({ ...s, score: String(s.score) })} style={smallBtn}>Edit</button>
                      <button onClick={() => deleteSection(s.id)} style={smallDanger}>Delete section</button>
                    </div>
                  )}
                </>
              )}
            </section>
          ))}
        </>
      )}

      {photos.length > 0 && <h3>General photos ({photos.length})</h3>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative" }}>
            <a href={p.signed_url || undefined} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signed_url || undefined} alt={p.caption || "Inspection photo"} style={{ width: "100%", borderRadius: 12, display: "block" }} />
            </a>
            {isManager && (
              <button
                onClick={() => removePhoto(p.id, p.photo_url)}
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  border: "none",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  borderRadius: 999,
                  width: 30,
                  height: 30,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {isManager && (
        <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Add a section</h3>
          <form onSubmit={addSectionToExisting} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input value={newSecName} onChange={(e) => setNewSecName(e.target.value)}
              placeholder="Section name — e.g. Restrooms, Break room…" style={input} required />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                Score
                <select value={newSecScore} onChange={(e) => setNewSecScore(e.target.value)} style={{ ...input, marginTop: 6 }}>
                  {Object.keys(SCORE_LABELS).map((sc) => <option key={sc} value={sc}>{SCORE_LABELS[sc]}</option>)}
                </select>
              </label>
              <label style={{ flex: 2, fontSize: "0.9rem", color: "var(--muted)" }}>
                Photos
                <input type="file" accept="image/*" multiple capture="environment"
                  onChange={(e) => setNewSecPhotos(Array.from(e.target.files || []))}
                  style={{ ...input, marginTop: 6 }} />
              </label>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, margin: "4px 0 2px" }}>Checklist — tick what passed</p>
              <InspectionChecklistDetails
                items={CHECKLIST}
                checks={newSecChecks}
                details={newSecItemDetails}
                onChange={({ checks, details }) => { setNewSecChecks(checks); setNewSecItemDetails(details); }}
              />
            </div>
            <textarea value={newSecNotes} onChange={(e) => setNewSecNotes(e.target.value)}
              placeholder="Notes for this section…" rows={2} style={{ ...input, resize: "vertical" }} />
            <button type="submit" disabled={secSaving} style={button}>
              {secSaving ? "Adding…" : "+ Add this section"}
            </button>
          </form>
        </section>
      )}

      {isManager && (
        <section className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginTop: 0 }}>Add photos</h3>
          <form onSubmit={addPhotos} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              style={input}
            />
            {files.length > 0 && <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{files.length} photo(s) selected</p>}
            <button type="submit" disabled={uploading || files.length === 0} style={button}>
              {uploading ? "Uploading…" : "Upload photos"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const button = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 10,
};

const secondaryBtn = {
  padding: "10px 20px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const smallBtn = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const smallDanger = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "6px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
