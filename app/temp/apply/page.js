"use client";

import { useEffect, useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TempApply() {
  const [available, setAvailable] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [agencyLanes, setAgencyLanes] = useState(["cleaning"]);
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
    city: "",
    zip: "",
    staffingTypes: ["cleaning"],
    experience: "",
    yearsExperience: "",
    availabilityDays: [],
    earliestStart: "",
    latestEnd: "",
    maxHours: "",
    transportation: "",
    emergencyName: "",
    emergencyRelation: "",
    emergencyPhone: "",
    i9Completed: "",
    everifyStatus: "",
    ref1Name: "",
    ref1Phone: "",
    ref2Name: "",
    ref2Phone: "",
    drugPolicyAck: false,
    bgConsent: false,
    extraAnswers: {},
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/temp/config");
        const j = await r.json();
        setAvailable(!!j.available);
        if (j.available) {
          if (j.staffingCatalog?.length) setCatalog(j.staffingCatalog);
          if (j.staffingTypes?.length) {
            setAgencyLanes(j.staffingTypes);
            setForm((f) => ({ ...f, staffingTypes: j.staffingTypes }));
          }
        }
      } catch {
        setAvailable(false);
      }
    })();
    setDisclosureShownAt(new Date().toISOString());
  }, []);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function toggleLane(key) {
    setForm((f) => {
      const cur = f.staffingTypes.includes(key)
        ? f.staffingTypes.filter((k) => k !== key)
        : [...f.staffingTypes, key];
      return { ...f, staffingTypes: cur.length ? cur : ["cleaning"] };
    });
  }

  function toggleDay(d) {
    setForm((f) => ({
      ...f,
      availabilityDays: f.availabilityDays.includes(d)
        ? f.availabilityDays.filter((x) => x !== d)
        : [...f.availabilityDays, d],
    }));
  }

  function setExtra(key, value) {
    setForm((f) => ({ ...f, extraAnswers: { ...f.extraAnswers, [key]: value } }));
  }

  function laneLabel(key) {
    const found = catalog.find((c) => c.key === key);
    return found ? found.label : key;
  }

  function fieldsForLane(key) {
    const found = catalog.find((c) => c.key === key);
    return found?.onboarding_fields || [];
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.bgConsent) {
      setError("You must authorize the background check to apply.");
      return;
    }
    if (!form.drugPolicyAck) {
      setError("Please acknowledge the drug-testing policy.");
      return;
    }
    if (form.staffingTypes.length === 0) {
      setError("Pick at least one kind of temp work.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/temp/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          availability: form.availabilityDays.length
            ? `Days: ${form.availabilityDays.join(", ")}${form.earliestStart ? `, ${form.earliestStart}–${form.latestEnd || "?"}` : ""}`
            : "",
          transportation: form.transportation === "yes",
          i9Completed: form.i9Completed === "yes" ? true : form.i9Completed === "no" ? false : null,
          bgDisclosureShownAt: disclosureShownAt,
        }),
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
  const laneFields = form.staffingTypes.flatMap((k) =>
    fieldsForLane(k).map((f) => ({ ...f, lane: k }))
  );

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 30, maxWidth: 680, margin: "0 auto" }}>
        <p className="kicker">Work as a temp</p>
        <h1 style={{ marginTop: 4 }}>Apply</h1>
        <p style={{ color: "var(--muted)" }}>
          Pick up temp work on your schedule. Tell us what kind of work you want
          and when you're available — we'll match you to shifts that fit.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <div>
            <strong>What kind of temp work do you want?</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {agencyLanes.map((key) => (
                <label key={key} style={{
                  display: "flex", gap: 6, alignItems: "center", fontSize: 14,
                  border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: "8px 12px",
                  cursor: "pointer",
                  background: form.staffingTypes.includes(key) ? "var(--panel-2, #f6f7fb)" : "transparent",
                }}>
                  <input type="checkbox" checked={form.staffingTypes.includes(key)} onChange={() => toggleLane(key)} />
                  {laneLabel(key)}
                </label>
              ))}
            </div>
          </div>

          <label>
            Full legal name
            <input value={form.fullName} onChange={set("fullName")} style={input} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Email
              <input type="email" value={form.email} onChange={set("email")} style={input} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={set("phone")} style={input} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Date of birth
              <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} style={input} required />
            </label>
            <label>
              Street address
              <input value={form.address} onChange={set("address")} style={input} placeholder="Street" />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              City
              <input value={form.city} onChange={set("city")} style={input} required />
            </label>
            <label>
              ZIP
              <input value={form.zip} onChange={set("zip")} style={input} required />
            </label>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <strong>Emergency contact</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
              <label style={{ fontSize: 14 }}>Name
                <input value={form.emergencyName} onChange={set("emergencyName")} style={input} required />
              </label>
              <label style={{ fontSize: 14 }}>Relationship
                <input value={form.emergencyRelation} onChange={set("emergencyRelation")} style={input} />
              </label>
            </div>
            <label style={{ fontSize: 14, marginTop: 10, display: "block" }}>Phone
              <input value={form.emergencyPhone} onChange={set("emergencyPhone")} style={input} required />
            </label>
          </div>

          <div>
            <strong>Availability</strong>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {DAYS.map((d) => (
                <label key={d} style={{
                  display: "flex", gap: 6, alignItems: "center", fontSize: 14,
                  border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                  background: form.availabilityDays.includes(d) ? "var(--panel-2, #f6f7fb)" : "transparent",
                }}>
                  <input type="checkbox" checked={form.availabilityDays.includes(d)} onChange={() => toggleDay(d)} />
                  {d}
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 10 }}>
              <label style={{ fontSize: 14 }}>Earliest start
                <input type="time" value={form.earliestStart} onChange={set("earliestStart")} style={input} />
              </label>
              <label style={{ fontSize: 14 }}>Latest end
                <input type="time" value={form.latestEnd} onChange={set("latestEnd")} style={input} />
              </label>
              <label style={{ fontSize: 14 }}>Max hours / week
                <input type="number" min="1" max="80" value={form.maxHours} onChange={set("maxHours")} style={input} />
              </label>
            </div>
            <label style={{ fontSize: 14, marginTop: 10, display: "block" }}>
              Do you have reliable transportation to job sites?
              <select value={form.transportation} onChange={set("transportation")} style={input} required>
                <option value="">Choose…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Years of experience
              <input type="number" min="0" max="60" value={form.yearsExperience} onChange={set("yearsExperience")} style={input} />
            </label>
            <label>
              I-9 completed?
              <select value={form.i9Completed} onChange={set("i9Completed")} style={input} required>
                <option value="">Choose…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <label>
            E-Verify status
            <select value={form.everifyStatus} onChange={set("everifyStatus")} style={input}>
              <option value="">Choose…</option>
              <option value="yes">Run / verified</option>
              <option value="no">Not run</option>
              <option value="not_required">Not required</option>
            </select>
          </label>
          <label>
            Tell us about your experience (optional)
            <textarea value={form.experience} onChange={set("experience")} rows={3} style={input}
              placeholder="Past jobs, skills, anything we should know" />
          </label>

          {laneFields.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <strong>About your {form.staffingTypes.map(laneLabel).join(" / ")} work</strong>
              <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                {laneFields.map((f) => (
                  <div key={`${f.lane}:${f.key}`}>
                    <label style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</label>
                    {f.type === "yesno" && (
                      <select value={form.extraAnswers[f.key] || ""} onChange={(e) => setExtra(f.key, e.target.value)} style={input}>
                        <option value="">Choose…</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    )}
                    {f.type === "number" && (
                      <input type="number" min="0" value={form.extraAnswers[f.key] || ""}
                        onChange={(e) => setExtra(f.key, e.target.value)} style={input} />
                    )}
                    {f.type === "text" && (
                      <input value={form.extraAnswers[f.key] || ""}
                        onChange={(e) => setExtra(f.key, e.target.value)} style={input} />
                    )}
                    {f.type === "select" && (
                      <select value={form.extraAnswers[f.key] || ""} onChange={(e) => setExtra(f.key, e.target.value)} style={input}>
                        <option value="">Choose…</option>
                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {f.type === "multiselect" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {(f.options || []).map((o) => {
                          const cur = form.extraAnswers[f.key] || [];
                          const on = cur.includes(o);
                          return (
                            <label key={o} style={{
                              fontSize: 13, border: "1px solid var(--border, #e5e7eb)", borderRadius: 8,
                              padding: "6px 10px", cursor: "pointer",
                              background: on ? "var(--panel-2, #f6f7fb)" : "transparent",
                            }}>
                              <input type="checkbox" checked={on} onChange={() => {
                                setExtra(f.key, on ? cur.filter((x) => x !== o) : [...cur, o]);
                              }} /> {o}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 16 }}>
            <strong>References (2)</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
              <label style={{ fontSize: 14 }}>Reference 1 — name
                <input value={form.ref1Name} onChange={set("ref1Name")} style={input} required />
              </label>
              <label style={{ fontSize: 14 }}>Reference 1 — phone
                <input value={form.ref1Phone} onChange={set("ref1Phone")} style={input} required />
              </label>
              <label style={{ fontSize: 14 }}>Reference 2 — name
                <input value={form.ref2Name} onChange={set("ref2Name")} style={input} required />
              </label>
              <label style={{ fontSize: 14 }}>Reference 2 — phone
                <input value={form.ref2Phone} onChange={set("ref2Phone")} style={input} required />
              </label>
            </div>
          </div>

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
              <input type="checkbox" checked={form.bgConsent} onChange={set("bgConsent")} style={{ marginTop: 4 }} />
              <span>
                I have read this disclosure and I authorize the company to
                obtain background check reports about me for employment
                purposes. I understand I will be notified before any adverse
                action is taken based on the results.
              </span>
            </label>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Drug-testing policy</h3>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              This agency maintains a drug-free workplace. You may be required
              to complete a drug screening before your first assignment, and
              the agency's full drug-testing policy will be provided to you
              separately for review and signature.
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
              <input type="checkbox" checked={form.drugPolicyAck} onChange={set("drugPolicyAck")} style={{ marginTop: 4 }} />
              <span>I have read this notice and understand the drug-testing policy applies to temp assignments.</span>
            </label>
          </div>

          {error && <p style={{ color: "var(--danger, #c00)" }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting} style={{ padding: 14 }}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            We never ask for your Social Security number, banking info, or tax
            forms in this application — those are handled separately and securely.
          </p>
        </form>
      </section>
    </main>
  );
}
