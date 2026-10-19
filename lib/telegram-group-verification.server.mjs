import { createHmac } from "node:crypto";

// This initial WorkTeams evidence rollout has TWO confirmed company records.
// Never discover or disclose groups for unrelated WorkTeams tenants.
const KNOWN_GROUPS = new Map([
  ["Lilly B’s Janitorial", "WorkTeams Message App"],
  ["Lilly B's Temp Cleaning Staffing", "WorkTeams Temp Agency"],
]);
const COMPANY_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const BOT_USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const BOT_TOKEN = /^\d{5,15}:[a-zA-Z0-9_-]{30,100}$/;

export function expectedGroupTitle(companyName) {
  return KNOWN_GROUPS.get(companyName) || null;
}

export function verificationCommand({
  botToken, botUsername, companyId, dateUTC = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!BOT_TOKEN.test(String(botToken || "")) ||
      !BOT_USERNAME.test(String(botUsername || "")) ||
      !COMPANY_ID.test(String(companyId || "")) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateUTC)) return null;
  // Day-bound, tenant-bound challenge, not a static company identifier.
  // Only a signed-in company OWNER is permitted to request this command.
  const digest = createHmac("sha256", botToken)
    .update("workteams-private-evidence-group-v1:" + companyId.toLowerCase() + ":" + dateUTC)
    .digest("hex").slice(0, 18);
  return "/wtverify_" + digest + "@" + botUsername;
}

export function discoverVerifiedGroup({
  updates, command, expectedTitle,
} = {}) {
  if (!Array.isArray(updates) || updates.length > 100 ||
      typeof expectedTitle !== "string" || !expectedTitle ||
      typeof command !== "string" || !/^\/wtverify_[a-f0-9]{18}@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(command))
    return { status: "invalid_discovery" };
  const candidates = new Set();
  for (const update of updates) {
    const message = update?.message;
    const chat = message?.chat;
    if (message?.text !== command ||
        chat?.title !== expectedTitle ||
        !["group", "supergroup"].includes(chat?.type) ||
        !Number.isSafeInteger(chat.id) || chat.id >= 0) continue;
    candidates.add(String(chat.id));
  }
  if (candidates.size === 0) return { status: "command_not_found" };
  // A duplicate title / copied command in another group must not auto-bind.
  if (candidates.size !== 1) return { status: "ambiguous_group" };
  return { status: "verified_candidate", chatId: [...candidates][0],
    title: expectedTitle };
}
