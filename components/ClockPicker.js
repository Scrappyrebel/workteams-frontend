"use client";

import { useState } from "react";

// A tap-the-clock time picker: pick hour on a clock face, then minute,
// then AM/PM. Calls onChange("HH:MM") on confirm, onClose() on cancel.
// value: "HH:MM" (24h) or "".
export default function ClockPicker({ value, onChange, onClose }) {
  const init = parseValue(value);
  const [hour12, setHour12] = useState(init.hour12);
  const [minute, setMinute] = useState(init.minute);
  const [ap, setAp] = useState(init.ap);
  const [step, setStep] = useState("hour"); // "hour" | "minute"

  function parseValue(v) {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { hour12: 12, minute: 0, ap: "AM" };
    const h = Number(m[1]);
    return {
      hour12: h % 12 === 0 ? 12 : h % 12,
      minute: Math.round(Number(m[2]) / 5) * 5 % 60,
      ap: h >= 12 ? "PM" : "AM",
    };
  }

  function confirm() {
    let h = hour12 % 12;
    if (ap === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    onClose();
  }

  // Numbers 1-12 (hours) or 00-55 step 5 (minutes) around a circle.
  const options = step === "hour"
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const selected = step === "hour" ? hour12 : minute;
  const size = 240;
  const radius = 92;
  const center = size / 2;

  function pick(n) {
    if (step === "hour") {
      setHour12(n);
      setStep("minute");
    } else {
      setMinute(n);
    }
  }

  const displayHour = hour12;
  const displayMin = String(minute).padStart(2, "0");

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
          <span style={{ fontSize: "1.6rem", fontWeight: 800 }}>
            {displayHour}:{displayMin}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {(["AM", "PM"]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setAp(x)}
                style={ap === x ? apOn : apOff}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
          <button type="button" onClick={() => setStep("hour")} style={step === "hour" ? apOn : apOff}>Hour</button>
          <button type="button" onClick={() => setStep("minute")} style={step === "minute" ? apOn : apOff}>Minute</button>
        </div>
        <div style={{ position: "relative", width: size, height: size, margin: "0 auto", borderRadius: "50%", background: "#f1f5f9" }}>
          {options.map((n, i) => {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            const label = step === "hour" ? String(n) : String(n).padStart(2, "0");
            const isSel = n === selected;
            return (
              <button
                key={n}
                type="button"
                onClick={() => pick(n)}
                style={{
                  position: "absolute",
                  left: x - 22,
                  top: y - 22,
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: isSel ? "none" : "1px solid var(--line)",
                  background: isSel ? "var(--brand)" : "#fff",
                  color: isSel ? "#fff" : "inherit",
                  fontWeight: 800,
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
          <div style={{
            position: "absolute", left: center - 4, top: center - 4,
            width: 8, height: 8, borderRadius: "50%", background: "var(--brand)",
          }} />
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center", margin: "8px 0 0" }}>
          {step === "hour" ? "Tap the hour" : "Tap the minute (5-min steps — type exact minutes with ⌨️ Type)"}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={confirm} style={{ ...confirmBtn, flex: 1 }}>Set time</button>
          <button type="button" onClick={onClose} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const panel = {
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  maxWidth: 320,
  width: "100%",
  boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};

const apOn = {
  border: "2px solid var(--brand)",
  background: "#fff",
  color: "var(--brand-deep)",
  borderRadius: 999,
  padding: "4px 12px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const apOff = {
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--muted)",
  borderRadius: 999,
  padding: "4px 12px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const confirmBtn = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const cancelBtn = {
  padding: "12px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
