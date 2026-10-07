import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — WorkTeams",
  description: "How WorkTeams collects, uses, and protects your information.",
};

const section = { marginBottom: 22 };
const h = { fontSize: "1.15rem", margin: "0 0 8px" };
const p = { lineHeight: 1.7, color: "var(--ink-soft)" };
const li = { lineHeight: 1.7, color: "var(--ink-soft)", marginBottom: 6 };

export default function PrivacyPage() {
  return (
    <main className="site-shell" style={{ maxWidth: 760 }}>
      <p className="eyebrow">LEGAL</p>
      <h1 style={{ fontSize: "2rem", margin: "6px 0 4px" }}>Privacy Policy</h1>
      <p style={{ color: "var(--muted)", marginBottom: 26 }}>Last updated: October 7, 2026</p>

      <div style={section}>
        <h2 style={h}>1. Introduction</h2>
        <p style={p}>
          This Privacy Policy describes how That&apos;s A Wrap and More LLC, a Missouri
          limited liability company (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;), collects, uses, shares, and protects personal information when
          you use WorkTeams, our workforce-management application for cleaning and
          janitorial companies (the &quot;Service&quot;), at app.lillybsjanitorial.com.
        </p>
        <p style={p}>
          By using the Service, you agree to the collection and use of information as
          described in this policy. If you do not agree, do not use the Service.
        </p>
        <p style={p}>
          This policy should be read together with our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>2. Information we collect</h2>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.1. Account information</h3>
        <p style={p}>
          When you create an account, we collect your work email address and password
          (stored in encrypted form). If you create a business account, we may also
          collect your business name.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.2. Employee and team information</h3>
        <p style={p}>
          Business account holders may enter information about their employees and team
          members, such as names, phone numbers, email addresses, job roles, schedules,
          and pay rates. If you are an employee whose information was entered by your
          employer, your employer is responsible for informing you.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.3. Location data</h3>
        <p style={p}>
          The Service includes GPS time-clock and geofenced clock-in features. When these
          features are enabled by the business account holder:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}>
            We collect the device&apos;s location <strong>once at clock-in and once at
            clock-out</strong> to verify work location. We do not track your location
            continuously and do not collect location at any other time.
          </li>
          <li style={li}>
            Location data is visible to the business account holder (employer) and used
            for time verification, late/no-show alerts, and payroll reporting.
          </li>
          <li style={li}>
            Location collection stops when the employee clocks out. We do not track
            location outside of work shifts.
          </li>
        </ul>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.4. Content you provide</h3>
        <p style={p}>
          Photos uploaded during inspections, shift videos, messages sent through crew
          messaging, bids, proposals, walkthrough notes, work orders, supply records,
          communication-book entries, and training submissions.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.5. Payment information</h3>
        <p style={p}>
          Subscription payments are processed by our payment provider, Stripe. We do not
          store full credit card numbers on our servers. Stripe collects and processes
          payment details under its own privacy policy. We retain records of
          subscription status, plan tier, and transaction history.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.6. Automatically collected information</h3>
        <p style={p}>
          When you use the Service, we automatically collect: device type and operating
          system, browser type, IP address, app version, pages and features used, and
          timestamps of activity. We use this for security, troubleshooting, and
          improving the Service.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>2.7. Cookies and similar technologies</h3>
        <p style={p}>
          We use essential cookies and similar technologies to keep you logged in,
          remember your preferences, and secure your session.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>3. How we use your information</h2>
        <p style={p}>We use the information we collect to:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}>(a) provide, operate, and maintain the Service;</li>
          <li style={li}>(b) process subscriptions and payments;</li>
          <li style={li}>(c) verify work hours and locations for time-tracking features;</li>
          <li style={li}>(d) communicate with you about your account, billing, and Service updates;</li>
          <li style={li}>(e) provide customer support;</li>
          <li style={li}>(f) detect, prevent, and investigate fraud, abuse, and security incidents;</li>
          <li style={li}>(g) comply with legal obligations; and</li>
          <li style={li}>(h) improve the Service (using de-identified or aggregated data where possible).</li>
        </ul>
        <p style={p}>
          <strong>We do not sell your personal information.</strong>
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>4. How we share your information</h2>
        <p style={p}>We share information only as follows:</p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>4.1. Service providers</h3>
        <p style={p}>We share data with trusted vendors who help us operate the Service, including:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}>Stripe — payment processing</li>
          <li style={li}>Supabase — database hosting and authentication</li>
          <li style={li}>Vercel — application hosting</li>
          <li style={li}>Resend — transactional emails</li>
        </ul>
        <p style={p}>
          Each provider processes data under contractual obligations and only as needed
          to perform its function. Our current subprocessors are listed above. A data
          processing agreement (DPA) incorporating these subprocessors is available on
          request — contact us at{" "}
          <a href="mailto:lillybsjanitorial@gmail.com">lillybsjanitorial@gmail.com</a>.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>4.2. Business account holders</h3>
        <p style={p}>
          If you use the Service as an employee of a subscribing business, your employer
          (the business account holder) can see information you enter or generate in the
          course of work, including your schedule, clock-in/out times and locations,
          messages, and inspection photos.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>4.3. Legal requirements</h3>
        <p style={p}>
          We may disclose information if required by law, court order, or subpoena, or if
          we believe disclosure is necessary to protect our rights, your safety, or the
          safety of others.
        </p>

        <h3 style={{ ...h, fontSize: "1.05rem" }}>4.4. Business transfers</h3>
        <p style={p}>
          If the Company is acquired or merged, your information may be transferred as
          part of that transaction. We will notify you of any such change.
        </p>
        <p style={p}>
          We do not share personal information with advertisers or data brokers.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>5. Data retention</h2>
        <p style={p}>
          We retain personal information for as long as your account is active or as
          needed to provide the Service. After account cancellation or termination, we
          retain Customer Data for 90 days to allow reactivation or export, consistent
          with our Terms of Service, after which it may be permanently deleted. We may
          retain certain records longer where required by law (e.g., tax and transaction
          records).
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>6. Your privacy rights</h2>
        <p style={p}>
          Depending on your state of residence, you may have the right to: (a) know what
          personal information we collect and how we use it; (b) access a copy of your
          personal information; (c) correct inaccurate information; (d) delete your
          personal information, subject to legal retention requirements; (e) opt out of
          the sale or sharing of personal information (we do not sell personal
          information); and (f) non-discrimination for exercising these rights.
        </p>
        <p style={p}>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:lillybsjanitorial@gmail.com">lillybsjanitorial@gmail.com</a>.
          We will respond within the timeframes required by applicable law. If you are
          an employee of a subscribing business, some requests (such as deletion of work
          records) may need to be directed to your employer, who controls that data.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>7. Data security</h2>
        <p style={p}>
          We use commercially reasonable administrative, technical, and physical
          safeguards to protect your information, including encryption in transit and at
          rest, access controls, and authentication requirements. However, no method of
          transmission or storage is completely secure, and we cannot guarantee absolute
          security. See our Terms of Service for our service availability commitments.
        </p>
        <p style={p}>
          <strong>Breach notification.</strong> In the event of a data breach affecting
          your personal information, we will notify you without undue delay and in
          accordance with applicable law, describing the nature of the breach and the
          steps we are taking in response.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>8. Children&apos;s privacy</h2>
        <p style={p}>
          The Service is intended for businesses and their adult workforce. It is not
          directed to children under 13, and we do not knowingly collect personal
          information from children under 13. If we learn we have collected such
          information, we will delete it promptly. Contact{" "}
          <a href="mailto:lillybsjanitorial@gmail.com">lillybsjanitorial@gmail.com</a>{" "}
          if you believe a child has provided us information.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>9. Changes to this policy</h2>
        <p style={p}>
          We may update this Privacy Policy from time to time. We will notify you of
          material changes at least 30 days in advance by email and by posting the
          updated policy with a new &quot;Last Updated&quot; date. Continued use of the
          Service after changes take effect constitutes acceptance.
        </p>
      </div>

      <div style={section}>
        <h2 style={h}>10. Contact us</h2>
        <p style={p}>For privacy questions or requests:</p>
        <p style={p}>
          That&apos;s A Wrap and More LLC<br />
          29108 State Highway Y, Cabin A<br />
          Jonesburg, MO 63351<br />
          <a href="mailto:lillybsjanitorial@gmail.com">lillybsjanitorial@gmail.com</a>
        </p>
      </div>

      <div style={{ ...section, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <p style={{ ...p, fontSize: "0.9rem", fontStyle: "italic" }}>
          This policy is pending review by a licensed Missouri business attorney. It will
          be updated following that review.
        </p>
      </div>

      <p style={{ marginTop: 30 }}>
        <Link href="/" className="back-link">← Back to home</Link>
      </p>
    </main>
  );
}
