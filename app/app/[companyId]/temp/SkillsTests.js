"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import {
  TEST_LIBRARY,
  testRecordsFromSkills,
  testRecordsFromTableRows,
  mergeTestRecords,
  laneGateStatus,
  forkliftStatus,
  FORKLIFT_STATUS_LABELS,
  clientTestSummary,
} from "../../../../lib/temp-tests";

const LANE_LABELS = {
  cleaning: "Cleaning / Janitorial",
  office: "Office / Administrative",
  manufacturing: "Manufacturing / Industrial",
  hospitality: "Hospitality / Events",
  general_labor: "General Labor",
};

// Skills Tests panel for one temp: the per-department test library,
// the factory safety gate, the two-state forklift record, and the
// client-visible summary. Results are written to the
// temp_test_records table (migration 096) — the system of record.
// Results recorded before the table landed ride temp_member_skills
// in the encoded tag form lib/temp-tests.js documents; both sources
// are merged for display, latest record wins, so older results never
// vanish. Scores are shown to clients, item-level answers never
// exist here at all.
export default function SkillsTests({ companyId, memberId, lanes, skills, testRows, setTestRows, recordedBy, onMsg }) {
  const [scores, setScores] = useState({});
  const [busy, setBusy] = useState("");
  const records = mergeTestRecords(
    testRecordsFromSkills((skills || []).filter((s) => s.member_id === memberId)),
    testRecordsFromTableRows((testRows || []).filter((r) => r.member_id === memberId))
  );
  const workerLanes = lanes && lanes.length ? lanes : ["cleaning"];
  const laneKeys = [...new Set([...workerLanes, ...TEST_LIBRARY.map((t) => t.lane)])]
    .filter((l) => TEST_LIBRARY.some((t) => t.lane === l));
  const fk = forkliftStatus(records);

  async function refreshTestRows() {
    const { data } = await supabase()
      .from("temp_test_records")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1000);
    setTestRows(data || []);
  }

  async function record(test, passed) {
    setBusy(test.key);
    const raw = (scores[test.key] || "").trim();
    let score = null;
    if (raw !== "" && test.scoreKind) {
      const val = parseFloat(raw);
      if (Number.isFinite(val)) score = val;
    }
    const { error } = await supabase()
      .from("temp_test_records")
      .insert({
        company_id: companyId,
        member_id: memberId,
        test_key: test.key,
        lane: test.lane,
        passed,
        score,
        score_kind: test.scoreKind || null,
        recorded_by: recordedBy || null,
      });
    setBusy("");
    if (error) {
      onMsg && onMsg("Record failed: " + error.message);
      return;
    }
    onMsg && onMsg(`Recorded ${test.label}: ${passed ? "PASS" : "FAIL"}.`);
    refreshTestRows();
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Skills tests — test to place</div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
        A temp is assignable to a line only when its required tests are passed.
        Failing a test means no placement in that line — results are recorded,
        not trained around.
      </p>

      {laneKeys.map((lane) => {
        const tests = TEST_LIBRARY.filter((t) => t.lane === lane);
        const gate = laneGateStatus(records, lane);
        const required = tests.filter((t) => (t.requiredIn || []).includes(lane));
        return (
          <div key={lane} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {LANE_LABELS[lane] || lane}{" "}
              {required.length > 0 && (
                <span className="badge" style={gate.assignable ? {} : { color: "#b3261e" }}>
                  {gate.assignable
                    ? "✓ assignable"
                    : `not assignable — missing ${gate.missing.map((t) => t.label).join(", ")}`}
                </span>
              )}
            </div>
            {lane === "manufacturing" && (
              <p style={{ fontSize: 12, margin: "4px 0", color: fk === "certified" ? "inherit" : "#8a6d00" }}>
                Forklift: <strong>{FORKLIFT_STATUS_LABELS[fk]}</strong>
              </p>
            )}
            {tests.map((t) => {
              const r = records[t.key];
              return (
                <div
                  key={t.key}
                  style={{
                    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    padding: "6px 0", borderBottom: "1px solid var(--border, #eef1f4)", fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 200 }}>
                    {t.label}
                    {(t.requiredIn || []).includes(lane) && <strong> · required</strong>}
                    {t.safetyGate && <strong> · safety gate</strong>}
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{t.note}</span>
                  </span>
                  {r ? (
                    <span className="badge">
                      {r.passed ? "PASS" : "FAIL"}
                      {r.score != null ? ` · ${r.score}${t.scoreKind === "wpm" ? " wpm" : "%"}` : ""}
                      {r.date ? ` · ${r.date}` : ""}
                    </span>
                  ) : (
                    <span className="badge">not taken</span>
                  )}
                  {t.scoreKind && (
                    <input
                      type="number" min="0" max={t.scoreKind === "percent" ? 100 : undefined}
                      placeholder={t.scoreKind === "wpm" ? "wpm" : "score %"}
                      value={scores[t.key] || ""}
                      onChange={(e) => setScores({ ...scores, [t.key]: e.target.value })}
                      style={{ padding: 6, width: 84 }}
                    />
                  )}
                  <button className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}
                    disabled={busy === t.key} onClick={() => record(t, true)}>
                    Pass
                  </button>
                  <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
                    disabled={busy === t.key} onClick={() => record(t, false)}>
                    Fail
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      <div style={{ background: "var(--panel-2, #f6f7fb)", borderRadius: 8, padding: 10, marginTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>What the client sees</div>
        {clientTestSummary(records).length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>No test results yet.</div>
        )}
        {clientTestSummary(records).map((row, i) => (
          <div key={i} style={{ fontSize: 12 }}>
            • {row.label} — {row.passed ? "Passed" : "Not passed"}
            {row.score != null ? ` · score ${row.score}${row.scoreKind === "wpm" ? " wpm" : "%"}` : ""}
            {row.date ? ` · ${row.date}` : ""}
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Clients see results and scores only — never test questions or item-level answers.
        </div>
      </div>
    </div>
  );
}
