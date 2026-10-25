import type { Metadata } from "next"
import Link from "next/link"
import { LEGAL_EMAIL, LegalPage, Section } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The rules for using adebite.",
  robots: { index: true, follow: true },
}
export const dynamic = "force-static"

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="25 October 2026">
      <p>
        These terms cover your use of adebite: the web app, the website and the emails and notifications we send. By creating an
        account or using adebite, you agree to them. If you don&apos;t agree, please don&apos;t use adebite.
      </p>

      <Section title="Not medical advice">
        <p>
          adebite helps you track food, weight and training. It isn&apos;t a medical service. Calorie and protein targets are
          estimates based on standard formulas. Photo and text estimates come from AI and can be wrong, so check them. Talk to a
          doctor or dietitian before changing how you eat or train, especially if you&apos;re pregnant, have a medical condition
          or have a history of disordered eating. Stop and get help if something feels wrong.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>You need to be at least 16, and you sign in with a Google account.</li>
          <li>Give accurate details. Your targets depend on them.</li>
          <li>You&apos;re responsible for what happens on your account. Tell us if you think someone else is using it.</li>
          <li>One person, one account. Don&apos;t create accounts to collect referrals.</li>
        </ul>
      </Section>

      <Section title="Free and Pro">
        <ul>
          <li>
            The Free plan includes a monthly number of photo estimates and keeps a limited number of meal photos. The current
            limits are shown in the app.
          </li>
          <li>
            Pro removes those limits. You get Pro when enough friends join through your links and finish setting up their
            account, through a subscription if we offer one, or from us. Referral rewards only go to the person whose link was
            used.
          </li>
          <li>
            We may change plan limits and features. We&apos;ll tell you before a change that takes something away from a plan
            you already have. If we offer paid subscriptions, their price and terms will be shown before you pay.
          </li>
        </ul>
      </Section>

      <Section title="Your content">
        <ul>
          <li>
            What you log, upload or write stays yours. You give us permission to store, process and show it as needed to run
            adebite, including sending photos and descriptions to AI providers for estimates. See our{" "}
            <Link href="/privacy">privacy policy</Link>.
          </li>
          <li>
            Friends see what your Sharing settings allow. If you publish a routine, workout or meal to the Shop, anyone on adebite
            can see it and add a copy, and their copy stays with them even if you delete yours.
          </li>
          <li>Only upload content you have the right to share, like your own photos.</li>
        </ul>
      </Section>

      <Section title="Be decent">
        <p>Don&apos;t use adebite to:</p>
        <ul>
          <li>Harass, shame or threaten anyone, including about their body, weight or food.</li>
          <li>Post content that&apos;s illegal, hateful, sexual or spam, or that promotes dangerous eating or training.</li>
          <li>Impersonate someone, or use another person&apos;s account.</li>
          <li>Break, overload, scrape or reverse-engineer the service, or get around plan limits.</li>
        </ul>
        <p>
          You can report Shop items. We may hide content and suspend or close accounts that break these terms. Where we can, we
          tell you why.
        </p>
      </Section>

      <Section title="The service">
        <ul>
          <li>
            We work to keep adebite running and your data safe, but it&apos;s provided &quot;as is&quot;. It may sometimes be
            unavailable, change, or lose features.
          </li>
          <li>Keep your own records of anything important to you.</li>
          <li>The adebite name, logo, design and app are ours. These terms don&apos;t give you rights to them.</li>
        </ul>
      </Section>

      <Section title="Liability">
        <p>
          To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for decisions you make
          based on estimates or targets in the app. Our total liability to you is limited to what you paid us in the 12 months
          before the claim, or nothing if you use adebite for free. Nothing in these terms limits liability that can&apos;t be
          limited by law, or your rights as a consumer.
        </p>
      </Section>

      <Section title="Ending your account">
        <p>
          You can stop using adebite at any time. To delete your account and data, email{" "}
          <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. We may suspend or close an account that breaks these terms or puts
          others at risk.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. We&apos;ll update the date above, and tell you in the app or by email before any change that
          matters. If you keep using adebite after a change takes effect, you accept the new terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  )
}
