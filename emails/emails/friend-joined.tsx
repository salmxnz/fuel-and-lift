import { type BaseProps, Eyebrow, Layout, Para, PrimaryButton, ReferralProgress, Title } from "./components/layout";

// Sent to the inviter when someone who joined through their link finishes
// onboarding and counts towards Pro. Props map 1:1 onto FriendJoined in
// api/internal/email/data.go.
export interface FriendJoinedProps extends BaseProps {
  firstName: string;
  friendName: string;
  referrals: string;
  needed: string;
  remaining: string;
}

export default function FriendJoined({ appUrl, assetsUrl, firstName, friendName, referrals, needed, remaining }: FriendJoinedProps) {
  return (
    <Layout
      appUrl={appUrl}
      assetsUrl={assetsUrl}
      preview={`${friendName} joined through your link. That's ${referrals} of ${needed} towards Pro.`}
      hero={{ src: "hero-friend.png", alt: "A smiling peach and a smiling strawberry side by side under a heart" }}
      reason="You're getting this because someone joined adebite through your friend link."
    >
      <Eyebrow>A friend joined</Eyebrow>
      <Title>{friendName} is on adebite now.</Title>
      <Para>
        Good news, {firstName}. {friendName} signed up through your link and finished setting up, so you're friends and
        it counts towards Pro.
      </Para>

      <ReferralProgress assetsUrl={assetsUrl} referrals={referrals} needed={needed} heading="Invite friends, get Pro forever">
        {remaining} more and Pro is yours for good: unlimited photo estimates, nothing to renew.
      </ReferralProgress>

      <PrimaryButton href={`${appUrl}/friends/add`}>Send another link</PrimaryButton>
      <Para className="text-center text-[14px] leading-[21px] text-muted">
        Links work once and last 14 days.
      </Para>
    </Layout>
  );
}

FriendJoined.PreviewProps = {
  appUrl: "https://adebite.com",
  assetsUrl: "/static",
  firstName: "Amara",
  friendName: "Jonah",
  referrals: "3",
  needed: "8",
  remaining: "5",
} satisfies FriendJoinedProps;
