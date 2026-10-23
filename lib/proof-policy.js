// Shared end-of-shift proof policy (Wendy, 2026-10-23).
//
// Two independent switches per company and per proof kind:
//   feature toggle   companies.enable_shift_videos / enable_comm_book
//                    (migration 040, default ON)
//   requirement flag companies.require_walkthrough_video / require_book_photo
//                    (migration 039; column default TRUE from migration 052)
//
// TOLERANT READ RULE (spec: "absence = required, never a lockout or crash"):
// a missing value resolves to ON for BOTH switches — `!== false` — because
// the layout/settings queries deliberately tolerate columns the API cannot
// serve yet (see the 2026-10-09 / 2026-10-12 lockouts). A proof kind is
// REQUIRED only when its feature is enabled AND its requirement flag is on:
// feature-off companies see no proof step and need no override.
export const PROOF_KIND_WALKTHROUGH = "walkthrough";
export const PROOF_KIND_BOOK = "book";

const COLUMNS = {
  walkthrough: { enable: "enable_shift_videos", require: "require_walkthrough_video" },
  book: { enable: "enable_comm_book", require: "require_book_photo" },
};

export function proofFeatureEnabled(company, kind) {
  const cols = COLUMNS[kind];
  if (!cols) return false;
  return company?.[cols.enable] !== false;
}

export function proofRequirementOn(company, kind) {
  const cols = COLUMNS[kind];
  if (!cols) return false;
  return company?.[cols.require] !== false;
}

export function proofRequired(company, kind) {
  return proofFeatureEnabled(company, kind) && proofRequirementOn(company, kind);
}
