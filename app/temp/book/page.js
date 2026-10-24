"use client";

import { useEffect, useState } from "react";

export default function TempBook() {
  const [cfg, setCfg] = useState(null);
  const [agencyId, setAgencyId] = useState(null);
  const [agencyError, setAgencyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    staffingType: "cleaning",
    serviceType: "commercial",
    cleanersNeeded: 2,
    hoursRequested: 8,
    jobDate: "",
    shiftStart: "",
    shiftEnd: "",
    recurringDays: [],
    recurringUntil: "",
    engagementType: "temp",
    onSiteName: "",
    onSitePhone: "",
    scheduleNotes: "",
    siteAddress: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    jobDetails: "",
  });

  useEffect(() => {
    (async () => {
      try {
        // The agency link names its company (?agency=<company_id>); the
        // config response echoes the resolved id back as agencyId and the
        // submit below pins the booking to it, so the agency whose rates
        // were shown is the agency that gets the booking.
        const linked = new URLSearchParams(window.location.search).get("agency");
        const r = await fetch(linked ? `/api/temp/config?agency=${encodeURIComponent(linked)}` : "/api/temp/config");
        const j = await r.json();
        setCfg(j.available ? j : null);
        setAgencyId(j.available ? j.agencyId || linked : null);
        setAgencyError(j.available ? "" : j.agencyError || "");
      } catch {
        setCfg(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const LANE_LABELS = { cleaning: "Cleaning / Janitorial", office: "Office / Administrative", manufacturing: "Manufacturing / Industrial", hospitality: "Hospitality / Events", general_labor: "General Labor" };
  const lanes = cfg?.staffingTypes?.length ? cfg.staffingTypes : ["cleaning"];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function toggleDay(d) {
    setForm((f) => ({
      ...f,
      recurringDays: f.recurringDays.includes(d) ? f.recurringDays.filter((x) => x !== d) : [...f.recurringDays, d],
    }));
  }
  const rate = Number(cfg?.serviceRates?.[form.serviceType] ?? cfg?.baseHourlyRate ?? 0);
  const estimate =
    Math.max(1, parseInt(form.cleanersNeeded, 10) || 0) *
    Math.max(1, parseFloat(form.hoursRequested) || 0) *
    rate;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/temp/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, companyId: agencyId || undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Booking failed.");
        setSubmitting(false);
        return;
      }
      window.location.href = j.url;
    } catch {
      setError("Booking failed. Try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="site-shell wt2-t-site">
        <section className="panel" style={{ padding: 30 }}>
          Loading…
        </section>
      </main>
    );
  }
  if (!cfg) {
    return (
      <main className="site-shell wt2-t-site">
        <section className="panel" style={{ padding: 30 }}>
          <h2>{agencyError ? "We can't open that booking link" : "Temp staffing isn't available right now"}</h2>
          <p style={{ color: "var(--muted)" }}>{agencyError || "Please check back soon."}</p>
        </section>
      </main>
    );
  }

  const input = { width: "100%", padding: 10, marginTop: 4 };
  return (
    <main className="site-shell wt2-t-site">
      <section className="panel wt2-t-book-panel" style={{ padding: 30, maxWidth: 640, margin: "0 auto" }}>
        <p className="kicker">Book temp staff</p>
        <h1 style={{ marginTop: 4 }}>Request your crew</h1>
        <p style={{ color: "var(--muted)" }}>
          {cfg.agencyName} · ${rate.toFixed(2)} per cleaner, per hour. No flat
          rates — you pay for exactly what you book.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label>
            What kind of temp work?
            <select value={form.staffingType} onChange={set("staffingType")} style={input}>
              {lanes.map((l) => (
                <option key={l} value={l}>{LANE_LABELS[l] || l}</option>
              ))}
            </select>
          </label>
          {form.staffingType === "cleaning" && (
            <label>
              Cleaning service type
              <select value={form.serviceType} onChange={set("serviceType")} style={input}>
                {cfg.serviceTypes.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Engagement
            <select value={form.engagementType} onChange={set("engagementType")} style={input}>
              <option value="temp">Temp — fill a shift</option>
              <option value="temp_to_hire">Temp-to-hire — try before you hire</option>
              <option value="direct_hire">Direct hire — recruit for us</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              How many temps?
              <input
                type="number"
                min="1"
                max="50"
                value={form.cleanersNeeded}
                onChange={set("cleanersNeeded")}
                style={input}
                required
              />
            </label>
            <label>
              How many hours?
              <input
                type="number"
                min="1"
                max="500"
                step="0.5"
                value={form.hoursRequested}
                onChange={set("hoursRequested")}
                style={input}
                required
              />
            </label>
          </div>
          <label>
            Job date
            <input type="date" value={form.jobDate} onChange={set("jobDate")} style={input} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Shift start
              <input type="time" value={form.shiftStart} onChange={set("shiftStart")} style={input} />
            </label>
            <label>
              Shift end
              <input type="time" value={form.shiftEnd} onChange={set("shiftEnd")} style={input} />
            </label>
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Recurring? (optional)</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {DAYS.map((d) => (
                <label key={d} style={{
                  fontSize: 13, border: "1px solid var(--border, #e5e7eb)", borderRadius: 8,
                  padding: "6px 10px", cursor: "pointer",
                  background: form.recurringDays.includes(d) ? "var(--panel-2, #f6f7fb)" : "transparent",
                }}>
                  <input type="checkbox" checked={form.recurringDays.includes(d)} onChange={() => toggleDay(d)} /> {d}
                </label>
              ))}
            </div>
            {form.recurringDays.length > 0 && (
              <label style={{ fontSize: 14, marginTop: 8, display: "block" }}>
                Repeat until
                <input type="date" value={form.recurringUntil} onChange={set("recurringUntil")} style={input} />
              </label>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              On-site contact name
              <input value={form.onSiteName} onChange={set("onSiteName")} style={input} placeholder="Who the temp asks for" />
            </label>
            <label>
              On-site contact phone
              <input value={form.onSitePhone} onChange={set("onSitePhone")} style={input} />
            </label>
          </div>
          <label>
            Schedule notes (optional — e.g. "weekdays 8am–4pm, long-term")
            <textarea
              value={form.scheduleNotes}
              onChange={set("scheduleNotes")}
              rows={2}
              style={input}
              placeholder="For ongoing day janitorial, describe the recurring schedule"
            />
          </label>
          <label>
            Site address
            <input
              value={form.siteAddress}
              onChange={set("siteAddress")}
              style={input}
              required
              placeholder="Street, city, state, ZIP"
            />
          </label>
          <label>
            What needs doing? (optional)
            <textarea
              value={form.jobDetails}
              onChange={set("jobDetails")}
              rows={3}
              style={input}
              placeholder="Scope of work, access notes, supplies on site…"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Your name
              <input value={form.customerName} onChange={set("customerName")} style={input} required />
            </label>
            <label>
              Phone (optional)
              <input value={form.customerPhone} onChange={set("customerPhone")} style={input} />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={form.customerEmail}
              onChange={set("customerEmail")}
              style={input}
              required
            />
          </label>

          <div
            className="card"
            style={{ padding: 16, background: "var(--panel-2, #f6f7fb)" }}
          >
            <strong>Estimate:</strong> {form.cleanersNeeded} temp(s) ×{" "}
            {form.hoursRequested} hour(s) × ${rate.toFixed(2)}/hr ={" "}
            <strong>${estimate.toFixed(2)}</strong>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Final total confirmed at checkout. Temp-to-hire available after{" "}
              {cfg.hireTrackOptions.join(" or ")} days.
            </div>
          </div>

          {error && <p style={{ color: "var(--danger, #c00)" }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting} style={{ padding: 14 }}>
            {submitting ? "Creating checkout…" : `Continue to payment — $${estimate.toFixed(2)}`}
          </button>
        </form>
      </section>
    </main>
  );
}

