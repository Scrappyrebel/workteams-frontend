import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

// Schedule — requests roll-up (owner direction, 2026-11-13): across all
// three apps, lists of entries must not sprawl — done/completed and
// recurring lists live behind roll-up tabs, and each entry's own
// controls tuck behind its own tap-to-open tab so one entry never
// fills the screen. On the WorkTeams Schedule page most surfaces
// already follow that pattern (shift cards swap into their edit form
// in place; Repeats and History are their own pages, and the Repeats
// page rolls each series up behind "Show all dates"). The one panel
// that still rendered every entry's controls fully open was Schedule
// requests: each waiting request showed its note field, Approve/Deny
// buttons, and helper notes inline, all at once. Those controls now
// sit behind a per-request "Show decision" tab, closed by default —
// the request's own line (who, what, the reason, swap status) stays
// visible so the list still reads at a glance. The decision itself is
// unchanged: same note state, same decideRequest calls, same panel
// footer explaining that a decision never edits recorded time.

const PAGE = "app/app/[companyId]/schedule/page.js";
const page = read(PAGE);

test("schedule requests keep a per-request roll-up state", () => {
  assert.ok(
    page.includes("const [openRequestId, setOpenRequestId] = useState(null);"),
    "openRequestId state missing"
  );
});

test("each request card carries its own Show/Hide decision tab", () => {
  assert.ok(
    page.includes('aria-expanded={openRequestId === r.id}'),
    "decision tab must expose its expanded state"
  );
  assert.ok(
    page.includes('openRequestId === r.id ? "Hide decision" : "Show decision"'),
    "Show/Hide decision wording missing"
  );
  assert.ok(
    page.includes("setOpenRequestId(openRequestId === r.id ? null : r.id)"),
    "decision tab must toggle only its own request"
  );
});

test("the decision controls render only inside the roll-up", () => {
  const tabAt = page.indexOf('openRequestId === r.id ? "Hide decision" : "Show decision"');
  const gateAt = page.indexOf("{openRequestId === r.id && (", tabAt);
  const noteAt = page.indexOf("Note for the employee (optional)", gateAt);
  const approveAt = page.indexOf('decideRequest(r, "approved")', gateAt);
  const denyAt = page.indexOf('decideRequest(r, "denied")', gateAt);
  assert.ok(tabAt !== -1 && gateAt > tabAt, "roll-up gate must follow its tab");
  assert.ok(noteAt > gateAt, "decision note field must sit inside the roll-up");
  assert.ok(approveAt > gateAt, "Approve must sit inside the roll-up");
  assert.ok(denyAt > gateAt, "Deny must sit inside the roll-up");
});

test("the request summary line stays outside the roll-up", () => {
  const gateAt = page.indexOf("{openRequestId === r.id && (");
  const nameAt = page.indexOf("<strong>{r.name}</strong>");
  const reasonAt = page.indexOf("“{r.reason}”");
  assert.ok(nameAt !== -1 && nameAt < gateAt, "requester name must stay visible");
  assert.ok(reasonAt !== -1 && reasonAt < gateAt, "request reason must stay visible");
});
