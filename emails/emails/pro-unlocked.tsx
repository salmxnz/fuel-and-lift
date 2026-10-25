import { type BaseProps, Eyebrow, Feature, Layout, Para, PrimaryButton, Title } from "./components/layout";

// Sent when an inviter reaches the referral goal and gets Pro forever. Props
// map 1:1 onto ProUnlocked in api/internal/email/data.go.
export interface ProUnlockedProps extends BaseProps {
  firstName: string;
  needed: string;
}

export default function ProUnlocked({ appUrl, assetsUrl, firstName, needed }: ProUnlockedProps) {
  return (
    <Layout
      appUrl={appUrl}
      assetsUrl={assetsUrl}
      preview={`${needed} friends joined through your links. Pro is yours, with no end date.`}
      hero={{ src: "hero-pro.png", alt: "A pink adebite badge with ribbons, circled by eight friends" }}
      reason="You're getting this because your friends unlocked Pro for you."
    >
      <Eyebrow>Pro, for good</Eyebrow>
      <Title>You did it, {firstName}. Pro is yours.</Title>
      <Para>
        {needed} friends joined adebite through your links. That unlocks Pro forever: no subscription and no end date.
        Thanks for bringing them along.
      </Para>

      <Feature assetsUrl={assetsUrl} icon="camera" title="Unlimited photo estimates">
        Snap every meal. There's no monthly count any more.
      </Feature>
      <Feature assetsUrl={assetsUrl} icon="photos" title="Every meal photo, kept">
        No cap on how many photos you store.
      </Feature>
      <Feature assetsUrl={assetsUrl} icon="infinity" title="Yours for good">
        Nothing to renew, nothing to cancel.
      </Feature>

      <PrimaryButton href={`${appUrl}/log/photo`}>Snap a meal</PrimaryButton>
    </Layout>
  );
}

ProUnlocked.PreviewProps = {
  appUrl: "https://adebite.com",
  assetsUrl: "/static",
  firstName: "Amara",
  needed: "8",
} satisfies ProUnlockedProps;
