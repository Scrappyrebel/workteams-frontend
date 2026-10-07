import Link from "next/link";

export const metadata = {
  title: "Terms of Service — WorkTeams",
  description: "The terms for using WorkTeams.",
};

const section = { marginBottom: 22 };
const h = { fontSize: "1.15rem", margin: "0 0 8px" };
const p = { lineHeight: 1.7, color: "var(--ink-soft)" };

export default function TermsPage() {
  return (
    <main className="site-shell" style={{ maxWidth: 760 }}>
      <p className="eyebrow">LEGAL</p>
      <h1 style={{ fontSize: "2rem", margin: "6px 0 4px" }}>Terms of Service</h1>
      <p style={{ color: "var(--muted)", marginBottom: 26 }}>Last updated: October 7, 2026</p>

      <div style={section}>
        <h2 style={h}>1. The service</h2>
        <p style={p}>
          WorkTeams is provided by That&apos;s A Wrap and More LLC, a Missouri limited
          liability company. WorkTeams provides workforce software for cleaning companies:
          scheduling, a GPS time clock, hour and payroll reports, inspections, crew messaging,
          bidding, work orders, supplies, a client portal, and training. Features
          vary by subscription tier (Starter, Plus, Pro). We may update or improve
          the service over time.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>2. Your account</h2>
        <p style={p}>
          You must provide accurate information when creating an account and keep
          your password private. You are responsible for activity under your
          account. Company owners and admins are responsible for managing who
          belongs to their company and what roles they hold.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>3. Free trial</h2>
        <p style={p}>
          New subscriptions include a 7-day free trial. No payment card is required to
          start the trial. When the 7 days end, the trial expires automatically — to keep
          using paid features, pick a tier and complete checkout before the trial ends.
          If you do not subscribe, your company returns to the default Starter access.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>4. Subscriptions and billing</h2>
        <p style={p}>
          Paid tiers are billed through Stripe on a recurring basis. Subscriptions
          automatically renew each billing period until you cancel. Your tier and
          subscription status control which features are available. If a payment
          fails or a subscription ends, the company returns to the Starter tier.
          You can manage or cancel your subscription from the Plans page at any
          time; cancellation takes effect at the end of the current billing period.
        </p>
        <p style={p}>
          <strong>All fees are non-refundable.</strong> We do not provide refunds or
          credits for partial billing periods, downgrades, or unused features.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>5. Acceptable use</h2>
        <p style={p}>
          You agree not to misuse the service: no breaking into other
          companies&apos; data, no uploading unlawful or harmful content, no
          interfering with the service&apos;s operation, and no using the service
          in violation of applicable law. Time-clock and location features are for
          legitimate workforce management; comply with your local laws on employee
          notice and consent.
        </p>
        <p style={p}>
          <strong>No sensitive regulated data.</strong> You agree not to upload protected
          health information (PHI), Social Security numbers, financial account numbers,
          or other sensitive regulated data to the service. WorkTeams is not HIPAA-compliant
          and is not intended for handling such data.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>6. Your data</h2>
        <p style={p}>
          You keep ownership of the company data you enter. You grant us the
          limited right to store and process it to provide the service. How we
          handle personal information is described in our{" "}
          <Link href="/privacy" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Privacy Policy</Link>.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>7. Payroll reports, not payroll processing</h2>
        <p style={p}>
          WorkTeams produces hour summaries and payroll-ready reports and exports.
          It does not process payroll, file taxes, or move money to employees.
          You are responsible for verifying hours and complying with wage laws.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>8. Termination</h2>
        <p style={p}>
          You may stop using WorkTeams at any time. We may suspend or terminate
          accounts that violate these terms or threaten the security of the
          service. On termination, access to paid features ends; you may request
          export or deletion of your company&apos;s data.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>9. Disclaimers and liability</h2>
        <p style={p}>
          The service is provided &quot;as is&quot; without warranties of any kind.
          To the maximum extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages. Our total liability for any claim
          is limited to the amounts you paid for the service in the 12 months
          before the claim.
        </p>
        <p style={p}>
          Any claim arising from these terms or the service must be filed within one
          (1) year after the claim arose, or it is permanently barred.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>10. Dispute resolution</h2>
        <p style={p}>
          Any dispute arising from these terms or the service will be resolved by binding
          arbitration on an individual basis, administered in Missouri under the rules
          of the American Arbitration Association. You and the Company waive any right
          to a jury trial and to participate in a class action or class-wide arbitration.
          Notwithstanding the above, either party may seek injunctive relief in court
          to protect intellectual property or confidential information.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>11. Changes to these terms</h2>
        <p style={p}>
          We may update these terms; the date above will change and, where
          appropriate, we will notify account owners. Continued use of the service
          after changes take effect means you accept them.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>12. Contact</h2>
        <p style={p}>
          That&apos;s A Wrap and More LLC<br />
          29108 State Highway Y, Cabin A<br />
          Jonesburg, MO 63351<br />
          <a href="mailto:lillybsjanitorial@gmail.com">lillybsjanitorial@gmail.com</a>
        </p>
      </div>

      <div style={{ ...section, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <p style={{ ...p, fontSize: "0.9rem", fontStyle: "italic" }}>
          These terms are pending review by a licensed Missouri business attorney. They
          will be updated following that review.
        </p>
      </div>

      <p style={{ marginTop: 30 }}>
        <Link href="/" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>← Back to WorkTeams</Link>
      </p>
    </main>
  );
}
