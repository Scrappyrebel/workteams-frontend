"use client";

import { useEffect, useState } from "react";

export default function TempApply() {
  const [available, setAvailable] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [disclosureShownAt, setDisclosureShownAt] = useState(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    experience: "",
    availability: "",
    bgConsent: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/temp/config");
        const j = await r.json();
        setAvailable(!!j.available);
      } catch {
        setAvailable(false);
      }
    })();
    setDisclosureShownAt(new Date().toISOString());
  }, []);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.bgConsent) {
      setError("You must authorize the background check to apply.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/temp/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, bgDisclosureShownAt: disclosureShownAt }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Application failed.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Application failed. Try again.");
      setSubmitting(false);
    }
  }

  if (available === null) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>Loading…</section>
      </main>
    );
  }
  if (!available) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          <h2>Applications aren't open right now</h2>
          <p style={{ color: "var(--muted)" }}>Please check back soon.</p>
        </section>
      </main>
    );
  }
  if (done) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30, textAlign: "center" }}>
          <h2>Application received</h2>
          <p style={{ color: "var(--muted)" }}>
            Thanks — we'll review your application and background check and be
            in touch by email.
          </p>
        </section>
      </main>
    );
  }

  const input = { width: "100%", padding: 10, marginTop: 4 };
  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 30, maxWidth: 640, margin: "0 auto" }}>
        <p className="kicker">Work as a temp cleaner</p>
        <h1 style={{ marginTop: 4 }}>Apply</h1>
        <p style={{ color: "var(--muted)" }}>
          Pick up cleaning jobs on your schedule — commercial, residential,
          move-outs, construction cleanup, and long-term day janitorial.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label>
            Full name
            <input value={form.fullName} onChange={set("fullName")} style={input} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Email
              <input type="email" value={form.email} onChange={set("email")} style={input} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={set("phone")} style={input} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Date of birth
              <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} style={input} />
            </label>
            <label>
              Address
              <input value={form.address} onChange={set("address")} style={input} placeholder="City, state" />
            </label>
          </div>
          <label>
            Cleaning experience (optional)
            <textarea value={form.experience} onChange={set("experience")} rows={3} style={input} />
          </label>
          <label>
            Availability (optional)
            <textarea
              value={form.availability}
              onChange={set("availability")}
              rows={2}
              style={input}
              placeholder="e.g. Weekdays 8am–5pm, weekends"
            />
          </label>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Background check disclosure</h3>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              We run background checks on all temp applicants through a
              third-party screening provider. The check may include criminal
              history, identity verification, and other public records. A
              record does not automatically disqualify you — each result is
              reviewed individually.
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.bgConsent}
                onChange={set("bgConsent")}
                style={{ marginTop: 4 }}
              />
              <span>
                I have read this disclosure and I authorize the company to
                obtain background check reports about me for employment
                purposes. I understand I will be notified before any adverse
                action is taken based on the results.
              </span>
            </label>
          </div>

          {error && <p style={{ color: "var(--danger, #c00)" }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting} style={{ padding: 14 }}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </form>
      </section>
    </main>
  );
}
