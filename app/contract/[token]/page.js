"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// Finger/mouse signature pad.
function SignaturePad({ onChange, wrapRef }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // Fixed internal resolution; CSS scales it.
    canvas.width = 600;
    canvas.height = 220;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a2b4a";
  }, []);

  function pos(e) {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return {
      x: ((t.clientX - r.left) / r.width) * canvas.width,
      y: ((t.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const p = pos(e);
    canvasRef.current.getContext("2d").beginPath();
    canvasRef.current.getContext("2d").moveTo(p.x, p.y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
    onChange(true);
  }

  function stop() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(false);
  }

  return (
    <div ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 160,
          border: "2px dashed var(--line)",
          borderRadius: 12,
          background: "#fff",
          touchAction: "none",
          cursor: "crosshair",
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <button
        type="button"
        onClick={clear}
        style={{ marginTop: 8, padding: "8px 18px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer" }}
      >
        Clear
      </button>
    </div>
  );
}

export default function ContractSignPage() {
  const { token } = useParams();
  const [contract, setContract] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("draw"); // "draw" | "type"
  const [drawn, setDrawn] = useState(false);
  const padRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/contracts/public?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setContract(j.contract);
      })
      .catch(() => setError("Could not load the contract."));
  }, [token]);

  async function sign(e) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please type your full legal name to sign.");
      return;
    }
    let signatureImage = null;
    if (mode === "draw") {
      if (!drawn) {
        alert("Please sign with your finger (or mouse) in the box, or switch to Type instead.");
        return;
      }
      const canvas = padRef.current?.querySelector("canvas");
      if (canvas) signatureImage = canvas.toDataURL("image/png");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), signatureImage }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Signing failed");
      setDone(true);
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  }

  return (
    <main className="site-shell" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <p className="eyebrow">SERVICE CONTRACT</p>
      {error && <p style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>}
      {!error && !contract && <p>Loading contract…</p>}
      {contract && (
        <>
          <h2 style={{ fontSize: "1.6rem" }}>
            {contract.companies?.name} — Cleaning Service Agreement
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Prepared for {contract.client_name}
            {contract.start_date ? ` • Effective ${contract.start_date}` : ""}
          </p>
          <section className="panel" style={{ padding: 24, margin: "18px 0" }}>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", margin: 0 }}>{contract.terms_text}</pre>
          </section>
          {contract.status === "signed" || done ? (
            <section className="panel" style={{ padding: 24, borderColor: "#9fd8b4" }}>
              <p style={{ color: "#1e8e4d", fontWeight: 800, fontSize: "1.1rem", margin: 0 }}>
                ✅ Signed{contract.signed_name ? ` by ${contract.signed_name}` : ""}
                {contract.signed_at ? ` on ${new Date(contract.signed_at).toLocaleDateString()}` : ""}.
              </p>
              <p style={{ color: "var(--muted)" }}>A copy has been saved. Thank you!</p>
            </section>
          ) : (
            <section className="panel" style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0 }}>Sign this agreement</h3>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                Sign with your finger (or mouse) in the box, or type your name instead. Your printed
                name, the date and time, and a record of this signature are saved as your electronic signature.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setMode("draw")}
                  style={{ padding: "10px 22px", borderRadius: 999, border: "none", background: mode === "draw" ? "var(--brand-deep)" : "#e8e2d5", color: mode === "draw" ? "#fff" : "var(--brand-deep)", fontWeight: 800, cursor: "pointer" }}
                >
                  ✍️ Draw
                </button>
                <button
                  type="button"
                  onClick={() => setMode("type")}
                  style={{ padding: "10px 22px", borderRadius: 999, border: "none", background: mode === "type" ? "var(--brand-deep)" : "#e8e2d5", color: mode === "type" ? "#fff" : "var(--brand-deep)", fontWeight: 800, cursor: "pointer" }}
                >
                  ⌨️ Type
                </button>
              </div>
              <form onSubmit={sign} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
                {mode === "draw" ? (
                  <SignaturePad wrapRef={padRef} onChange={setDrawn} />
                ) : (
                  <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
                    Your typed full legal name below counts as your signature.
                  </p>
                )}
                <input
                  placeholder="Full legal name (printed)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1.05rem" }}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: "14px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", cursor: "pointer" }}
                >
                  {busy ? "Signing…" : "Sign agreement"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
