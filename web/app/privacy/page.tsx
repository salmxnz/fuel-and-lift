import type { Metadata } from "next"
import Link from "next/link"
import { LEGAL_EMAIL, LegalPage, Section } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What adebite collects, why, who can see it and how to get it deleted.",
  robots: { index: true, follow: true },
}
export const dynamic = "force-static"

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="25 October 2026">
      <p>
        adebite is a calorie and gym tracker you use with a few friends. This page explains what we collect, why, who can see
        it and how to have it deleted. The short version: we use your data to run the app, friends only see what your Sharing
        settings allow, and we don&apos;t sell your data or show ads.
      </p>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Your Google account details.</strong> When you sign in with Google we get your name, email address, profile
            picture and Google account ID. We never see your Google password.
          </li>
          <li>
            <strong>Your profile and goal.</strong> Display name, sex, date of birth, height, weight, activity level, goal,
            units and time zone. We use these to work out your calorie and protein targets.
          </li>
          <li>
            <strong>What you log.</strong> Meals and foods, calories and macros, meal photos, weigh-ins, workouts, sets,
            personal records and streaks.
          </li>
          <li>
            <strong>Profile photo.</strong> If you upload one, we store it and show it in place of your Google picture.
          </li>
          <li>
            <strong>Friends and community.</strong> Who you&apos;re friends with, the invite links you create and who joined
            through them, cheers, things you share with friends, items you publish in the Shop and reports you send.
          </li>
          <li>
            <strong>Notifications.</strong> If you turn on notifications, the push address your browser gives us, the type of
            device, and your notification settings, reminder times and quiet hours.
          </li>
          <li>
            <strong>Technical data.</strong> Our servers log requests, including IP address and device type, so we can keep the
            service secure, stop abuse and fix problems. We also count photo estimates to apply plan limits.
          </li>
        </ul>
        <p>
          Your weight, food and exercise can say something about your health. You choose what to log, and we only use it to
          run adebite for you.
        </p>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To run the app: your daily totals, plans, progress, streaks and weekly summaries.</li>
          <li>To estimate a meal from a photo or description when you ask for it.</li>
          <li>To show friends what your Sharing settings allow, and to run the Shop.</li>
          <li>
            To send the notifications you turn on, and service emails such as a welcome, a friend joining through your link,
            Pro being unlocked or reaching your monthly photo limit.
          </li>
          <li>To apply the Free and Pro plans, including counting referrals.</li>
          <li>To keep adebite safe: preventing abuse, moderating reported content and fixing bugs.</li>
        </ul>
        <p>We don&apos;t sell your data, use it for advertising, or use third-party analytics or ad trackers.</p>
      </Section>

      <Section title="Who can see your data">
        <ul>
          <li>
            <strong>Friends</strong> see your name and picture, plus only what you allow in Sharing: workouts, workout details,
            personal records, weight trend (never the number), streak milestones and your weekly summary (days on target and
            streak, never calories). They also see anything you send them or set to Friends.
          </li>
          <li>
            <strong>Other adebite users</strong> can see your name, picture and the routines, workouts and meals you set to
            Public in the Shop, and can add copies of them.
          </li>
          <li>
            <strong>Our team</strong> can access accounts to provide support, review reported content and apply suspensions.
          </li>
          <li>
            <strong>Service providers</strong> process data on our behalf, only as needed to run adebite:
            <ul>
              <li>Google, for sign-in.</li>
              <li>
                AI providers (OpenRouter, which routes requests to model providers such as Google, and Anthropic). They receive the
                photos and descriptions you submit for an estimate, but not your name or email.
              </li>
              <li>Cloudflare, which stores meal photos.</li>
              <li>Our hosting, database and email delivery providers.</li>
              <li>
                Browser push services (Apple, Google, Mozilla), which deliver notifications. Notification content is encrypted
                on its way to your device.
              </li>
              <li>Open Food Facts, which receives only the barcode number when you scan a product.</li>
            </ul>
          </li>
          <li>
            <strong>The authorities</strong>, if the law requires it.
          </li>
        </ul>
        <p>Some of these providers process data outside your country. Where that happens, we rely on their contractual safeguards.</p>
      </Section>

      <Section title="Cookies and storage on your device">
        <p>
          We use only the cookies needed to keep you signed in. They can&apos;t be read by scripts on the page. The app also
          stores a copy of your recent data on your device so it opens quickly. Signing out clears it. We don&apos;t use
          advertising or analytics cookies.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Your data is kept while you have an account.</li>
          <li>
            You can delete entries, weigh-ins, meals, workouts, meal photos and your profile photo at any time. Photos that were
            never attached to a logged meal are deleted after 24 hours. The Free plan keeps a limited number of meal photos.
          </li>
          <li>
            If you ask us to delete your account, we delete your data within 30 days, apart from anything we have to keep by law.
            Copies other people made of items you published in the Shop are theirs and stay with them.
          </li>
          <li>Server logs are kept for a short time, then deleted.</li>
        </ul>
      </Section>

      <Section title="Your choices and rights">
        <p>You can:</p>
        <ul>
          <li>Change what friends see in Sharing, and what you&apos;re notified about in Notifications.</li>
          <li>Edit your profile, goal and anything you&apos;ve logged.</li>
          <li>Ask for a copy of your data, ask us to correct it, or have your account and data deleted.</li>
          <li>Object to how we use your data, or complain to your local data protection authority.</li>
        </ul>
        <p>
          To use any of these rights, email <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> from the address you sign in
          with. We reply within 30 days.
        </p>
      </Section>

      <Section title="Age">
        <p>
          You need to be at least 16 to use adebite. If you think someone younger has an account, tell us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Connections to adebite are encrypted, sign-in goes through Google, and access to your data is limited to the people
          and providers listed above. No service is completely secure. If a breach affects you, we&apos;ll tell you.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy, we&apos;ll update the date above. We&apos;ll tell you in the app or by email before any change
          that matters. See also our <Link href="/terms">terms of service</Link>.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about your privacy: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  )
}
