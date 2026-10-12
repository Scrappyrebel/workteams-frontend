"use client";

import { useEffect, useState } from "react";

export default function TempBook() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    serviceType: "commercial",
    cleanersNeeded: 2,
    hoursRequested: 8,
    jobDate: "",
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
        const r = await fetch("/api/temp/config");
        const j = await r.json();
        setCfg(j.available ? j : null);
      } catch {
        setCfg(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
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
        body: JSON.stringify(form),
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
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          Loading…
        </section>
      </main>
    );
  }
  if (!cfg) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          <h2>Temp staffing isn't available right now</h2>
          <p style={{ color: "var(--muted)" }}>Please check back soon.</p>
        </section>
      </main>
    );
  }

  const input = { width: "100%", padding: 10, marginTop: 4 };
  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 30, maxWidth: 640, margin: "0 auto" }}>
        <p className="kicker">Book temp cleaners</p>
        <h1 style={{ marginTop: 4 }}>Request your crew</h1>
        <p style={{ color: "var(--muted)" }}>
          {cfg.agencyName} · ${rate.toFixed(2)} per cleaner, per hour. No flat
          rates — you pay for exactly what you book.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label>
            Service type
            <select value={form.serviceType} onChange={set("serviceType")} style={input}>
              {cfg.serviceTypes.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              How many cleaners?
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
            Job date (optional)
            <input type="date" value={form.jobDate} onChange={set("jobDate")} style={input} />
          </label>
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
            <strong>Estimate:</strong> {form.cleanersNeeded} cleaner(s) ×{" "}
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
