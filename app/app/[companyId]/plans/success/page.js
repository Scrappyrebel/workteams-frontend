import Link from "next/link";

export default function PlanSuccess({ params }) {
  const { companyId } = params;
  return (
    <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
      <p className="eyebrow">PLANS</p>
      <h2 style={{ fontSize: "1.8rem" }}>You're subscribed!</h2>
      <p style={{ color: "var(--muted)" }}>
        Your payment went through. Your new tier activates in a moment —
        if it doesn't show right away, give it a few seconds and refresh.
      </p>
      <Link
        href={`/app/${companyId}/plans`}
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "12px 28px",
          borderRadius: 999,
          background: "var(--brand)",
          color: "#fff",
          fontWeight: 800,
          textDecoration: "none",
        }}
      >
        Back to Plans
      </Link>
    </div>
  );
}
