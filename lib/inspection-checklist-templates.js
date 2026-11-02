// Company-owned inspection checklist templates (migration 084).
//
// Inspections have always run on one standard checklist — the same
// 8 items for every company, location and kind of site — and the
// starter plans only re-order or focus those items. Migration 084
// adds storage for a company's own templates: a named, ordered list
// of checklist item labels, optionally labelled with a site type in
// the company's own words and optionally linked to one location.
//
// Everything here is fail-soft, the established pattern (068/073/
// 075/076): until migration 084 has run the table simply is not
// there, the calls below fail quietly, and inspections save and
// render exactly as they always have — the standard checklist is
// always the fallback, and a template is only ever used for an
// inspection whose inspector picked it at start. Existing sections
// and their stored labels are never rewritten by anything here:
// sections saved from a template store the template's labels as
// their checklist, in the same shape they have always stored them.

export const MAX_TEMPLATE_ITEMS = 40;
export const MAX_TEMPLATE_ITEM_LENGTH = 160;
export const MAX_TEMPLATE_NAME_LENGTH = 120;

// Clean a raw list of would-be item labels (an array of strings, or
// one-per-line text from the template form) into the stored shape:
// trimmed, non-empty, at most MAX_TEMPLATE_ITEM_LENGTH characters
// each, de-duplicated case-insensitively (first spelling wins), and
// capped at MAX_TEMPLATE_ITEMS entries, order preserved.
export function sanitizeTemplateItems(raw) {
  const lines = Array.isArray(raw) ? raw : String(raw || "").split("\n");
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    const label = String(line || "").trim().slice(0, MAX_TEMPLATE_ITEM_LENGTH);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(label);
    if (items.length >= MAX_TEMPLATE_ITEMS) break;
  }
  return items;
}

// Normalise one stored template row for the page: items always an
// array of clean label strings, whatever jsonb handed back.
export function normalizeChecklistTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: String(row.name || "").trim(),
    site_type: row.site_type ? String(row.site_type).trim() : "",
    location_id: row.location_id || null,
    items: sanitizeTemplateItems(Array.isArray(row.items) ? row.items : []),
    created_at: row.created_at || null,
  };
}

// Load the company's templates, oldest first. Any failure — above
// all the table not existing yet — returns { templates: [], available:
// false } and the caller renders the standard-checklist behaviour
// exactly as it did before migration 084.
export async function loadChecklistTemplates(sb, companyId) {
  try {
    const { data, error } = await sb
      .from("inspection_checklist_templates")
      .select("id, name, site_type, location_id, items, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (error || !data) return { templates: [], available: false };
    return {
      templates: data.map(normalizeChecklistTemplate).filter((t) => t && t.name),
      available: true,
    };
  } catch {
    return { templates: [], available: false };
  }
}

// Create one template from the manager form's values. Returns
// { template } on success or { error } with a plain message; a
// pre-084 database reports the honest not-available message instead
// of a raw backend error.
export async function saveChecklistTemplate(sb, { companyId, name, siteType, locationId, itemsText, createdBy }) {
  const cleanName = String(name || "").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH);
  if (!cleanName) return { error: "Name the template first." };
  const items = sanitizeTemplateItems(itemsText);
  if (items.length === 0) return { error: "Add at least one checklist item — one item per line." };
  try {
    const { data, error } = await sb
      .from("inspection_checklist_templates")
      .insert({
        company_id: companyId,
        name: cleanName,
        site_type: String(siteType || "").trim() || null,
        location_id: locationId || null,
        items,
        created_by: createdBy || null,
      })
      .select("id, name, site_type, location_id, items, created_at")
      .single();
    if (error || !data) {
      return { error: "Checklist templates turn on with the latest WorkTeams update. Until then, every inspection uses the standard checklist." };
    }
    return { template: normalizeChecklistTemplate(data) };
  } catch {
    return { error: "Checklist templates turn on with the latest WorkTeams update. Until then, every inspection uses the standard checklist." };
  }
}

// Delete one template (RLS allows owner / admin only). Deleting a
// template never touches inspections already recorded with it —
// their sections stored the labels themselves.
export async function deleteChecklistTemplate(sb, templateId) {
  try {
    const { error } = await sb.from("inspection_checklist_templates").delete().eq("id", templateId);
    if (error) return { error: "Could not delete that template: " + error.message };
    return {};
  } catch {
    return { error: "Could not delete that template." };
  }
}

// Count stored per-item results per inspection (migration 076) for
// the list: how many items were recorded with an outcome or score,
// and how many were marked Issue. Any failure — above all the 076
// table not existing yet — returns {} and the list renders exactly
// as it did before.
export async function loadInspectionResultCounts(sb, inspectionIds) {
  try {
    const ids = [...new Set((inspectionIds || []).filter(Boolean))];
    if (ids.length === 0) return {};
    const { data, error } = await sb
      .from("inspection_checklist_results")
      .select("inspection_id, outcome")
      .in("inspection_id", ids);
    if (error || !data) return {};
    const counts = {};
    for (const r of data) {
      if (!counts[r.inspection_id]) counts[r.inspection_id] = { resulted: 0, issues: 0 };
      counts[r.inspection_id].resulted += 1;
      if (r.outcome === "issue") counts[r.inspection_id].issues += 1;
    }
    return counts;
  } catch {
    return {};
  }
}
