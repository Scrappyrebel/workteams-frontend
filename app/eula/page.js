import Link from "next/link";

export const metadata = {
  title: "End User License Agreement — WorkTeams",
  description: "The license terms for the QuickBooks Online integration in WorkTeams.",
};

const section = { marginBottom: 22 };
const h = { fontSize: "1.15rem", margin: "0 0 8px" };
const p = { lineHeight: 1.7, color: "var(--ink-soft)" };

export default function EulaPage() {
  return (
    <main className="site-shell" style={{ maxWidth: 760 }}>
      <p className="eyebrow">LEGAL</p>
      <h1 style={{ fontSize: "2rem", margin: "6px 0 4px" }}>End User License Agreement</h1>
      <p style={{ color: "var(--muted)", marginBottom: 26 }}>Last updated: October 26, 2026</p>

      <div style={section}>
        <h2 style={h}>1. About this agreement</h2>
        <p style={p}>
          This End User License Agreement covers the QuickBooks Online integration
          offered inside WorkTeams. WorkTeams is provided by Ridgefront Tech LLC, a
          Missouri limited liability company. This agreement supplements our{" "}
          <Link href="/terms" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Terms of Service</Link>,
          which continue to apply. By connecting a QuickBooks Online account to
          WorkTeams, you accept this agreement on behalf of your company.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>2. What the integration does</h2>
        <p style={p}>
          The integration connects your company&apos;s WorkTeams account to your
          company&apos;s own QuickBooks Online account. When connected, WorkTeams can
          send invoices you issue in WorkTeams to your QuickBooks Online account, and
          can read accounting information from QuickBooks Online — such as your chart
          of accounts, items, customers, and invoice status — so it can be shown and
          matched inside WorkTeams. The integration is a data connection between the
          two services. It does not move money, process payments, or file taxes.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>3. Your QuickBooks account</h2>
        <p style={p}>
          QuickBooks Online is a product of Intuit Inc. Ridgefront Tech LLC is not
          Intuit, and this agreement does not change your separate agreement with
          Intuit. Your QuickBooks Online subscription, your Intuit login, and the
          accuracy of the records inside your QuickBooks account remain your
          responsibility. You are responsible for charges Intuit bills you and for
          keeping your Intuit credentials private.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>4. Authorization and access</h2>
        <p style={p}>
          Only a company owner or an authorized admin in WorkTeams can connect or
          disconnect the integration. When you connect, you authorize Ridgefront Tech
          LLC to access your QuickBooks Online account on your company&apos;s behalf
          using the connection Intuit provides, and to store the connection tokens
          securely on our servers so the integration keeps working without asking you
          to sign in each time. We use that access only to operate the integration
          you turned on. How we handle information is described in our{" "}
          <Link href="/privacy" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>Privacy Policy</Link>.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>5. Data sent to QuickBooks</h2>
        <p style={p}>
          WorkTeams sends an invoice to QuickBooks only when you choose to post it.
          Before anything is sent, your accounts and items must be matched between
          WorkTeams and QuickBooks using the mapping tools in the app. Anything that
          is not matched is held in a waiting list inside WorkTeams with the reason
          shown — it is never posted to QuickBooks automatically or guessed at. Once
          an invoice is posted, a record of the posting is kept in WorkTeams so the
          same invoice is not sent twice.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>6. Your responsibilities</h2>
        <p style={p}>
          You are responsible for reviewing what the integration sends and for the
          correctness of your books. WorkTeams is a business tool, not your
          accountant: check posted invoices inside QuickBooks Online, and consult
          your own tax or accounting professional about your records and filings.
          You agree to use the integration only with a QuickBooks Online account your
          company owns or is authorized to connect, and only for lawful business
          purposes.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>7. Availability and changes</h2>
        <p style={p}>
          The integration depends on Intuit&apos;s services and developer platform
          being available and on Intuit continuing to permit connections like ours.
          Intuit may change its platform, and we may update, limit, or retire parts
          of the integration in response. We will give account owners reasonable
          notice of changes that materially affect the integration.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>8. Disconnecting and termination</h2>
        <p style={p}>
          You may disconnect the integration at any time from the connections area of
          WorkTeams. Disconnecting stops all further syncing and revokes the stored
          connection tokens. Records already sent to your QuickBooks Online account
          stay in your QuickBooks account — disconnecting does not delete them. We
          may suspend or end the integration for a company that misuses it, connects
          an account it is not authorized to use, or threatens the security of the
          service. This agreement ends when the integration is disconnected or when
          your WorkTeams account is terminated.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>9. No warranty</h2>
        <p style={p}>
          The integration is provided &quot;as is&quot; without warranties of any kind,
          to the maximum extent permitted by law. We do not warrant that the
          integration will be uninterrupted, error-free, or that records will transfer
          without discrepancy. You are responsible for verifying transferred records
          in QuickBooks Online.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>10. Limitation of liability</h2>
        <p style={p}>
          To the maximum extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages arising from use of the integration,
          including lost profits or the cost of correcting accounting records. Our
          total liability for any claim arising from the integration is limited to the
          amounts you paid for WorkTeams in the 12 months before the claim.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>11. Changes to this agreement</h2>
        <p style={p}>
          We may update this agreement; the date above will change and, where
          appropriate, we will notify account owners. Continued use of the integration
          after changes take effect means you accept them.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>12. Contact</h2>
        <p style={p}>
          Ridgefront Tech LLC<br />
          29108 State Highway Y, Cabin A<br />
          Jonesburg, MO 63351<br />
          <a href="mailto:Ridgefronttech@gmail.com">Ridgefronttech@gmail.com</a>
        </p>
      </div>

      <div style={{ ...section, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <p style={{ ...p, fontSize: "0.9rem", fontStyle: "italic" }}>
          This agreement is pending review by a licensed Missouri business attorney. It
          will be updated following that review.
        </p>
      </div>

      <p style={{ marginTop: 30 }}>
        <Link href="/" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>← Back to WorkTeams</Link>
      </p>
    </main>
  );
}
