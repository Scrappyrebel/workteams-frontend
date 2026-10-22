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
      !(expectedTitle === null || (typeof expectedTitle === "string" && !!expectedTitle)) ||
      typeof command !== "string" || !/^\/wtverify_[a-f0-9]{18}@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(command))
    return { status: "invalid_discovery" };
  const candidates = new Map();
  for (const update of updates) {
    const message = update?.message;
    const chat = message?.chat;
    if (message?.text !== command ||
        typeof chat?.title !== "string" || !chat.title.trim() ||
        (expectedTitle !== null && chat.title !== expectedTitle) ||
        // A Telegram supergroup with a public @username is NOT private.
        // Never bind a public group even when its title and command match.
        (typeof chat?.username === "string" && chat.username.length > 0) ||
        !["group", "supergroup"].includes(chat?.type) ||
        !Number.isSafeInteger(chat.id) || chat.id >= 0) continue;
    candidates.set(String(chat.id), chat.title.trim().slice(0,160));
  }
  if (candidates.size === 0) return { status: "command_not_found" };
  // A duplicate title / copied command in another group must not auto-bind.
  if (candidates.size !== 1) return { status: "ambiguous_group" };
  const [[chatId, title]] = [...candidates.entries()];
  return { status: "verified_candidate", chatId, title };
}


export function bindingDecision({ existingChatId = null, candidateChatId } = {}) {
  if (typeof candidateChatId !== "string" || !/^-\d{6,20}$/.test(candidateChatId))
    return "invalid_candidate";
  if (existingChatId === null) return "insert";
  if (existingChatId === candidateChatId) return "already_verified";
  return "conflicting_existing_group";
}


export function checkLivePrivateWorkTeamsGroup(match, chat, expectedTitle = null) {
  if (match?.status !== "verified_candidate" ||
      !/^-\d{6,20}$/.test(match?.chatId || "") ||
      !Number.isSafeInteger(chat?.id) || chat.id >= 0 ||
      String(chat.id) !== match.chatId ||
      !["group", "supergroup"].includes(chat?.type) ||
      (typeof chat?.username === "string" && chat.username.length > 0) ||
      typeof chat?.title !== "string" || !chat.title.trim() ||
      (expectedTitle !== null && chat.title !== expectedTitle))
    return { status: "invalid_live_group" };
  return { status: "verified_current_private_group",
    chatId: match.chatId, title: chat.title.trim().slice(0,160) };
}
