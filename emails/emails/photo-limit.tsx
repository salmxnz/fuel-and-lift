import { Link, Text } from "react-email";
import { type BaseProps, Eyebrow, Layout, Para, PrimaryButton, ReferralProgress, Title } from "./components/layout";

// Sent once a month, when a free user uses their last photo estimate. Props
// map 1:1 onto PhotoLimit in api/internal/email/data.go.
export interface PhotoLimitProps extends BaseProps {
  firstName: string;
  limit: string;
  month: string;
  resetsOn: string;
  referrals: string;
  needed: string;
}

export default function PhotoLimit({ appUrl, assetsUrl, firstName, limit, month, resetsOn, referrals, needed }: PhotoLimitProps) {
  return (
    <Layout
      appUrl={appUrl}
      assetsUrl={assetsUrl}
      preview={`You've used your ${limit} photo estimates for ${month}. They come back on ${resetsOn}.`}
      hero={{ src: "hero-limit.png", alt: "A camera between two photos of food: a fried egg and a donut" }}
      reason="You're getting this because you used your last free photo estimate this month."
    >
      <Eyebrow>Photo estimates</Eyebrow>
      <Title>That's {limit} photos this month.</Title>
      <Para>
        Nice going, {firstName}. You've used all {limit} free photo estimates for {month}. They come back on{" "}
        <strong>{resetsOn}</strong>.
      </Para>
      <Para>
        Until then you can still describe a meal, pick from a restaurant menu, scan a barcode or log a saved meal. None of
        those count.
      </Para>

      <ReferralProgress assetsUrl={assetsUrl} referrals={referrals} needed={needed} heading="Want unlimited photos?">
        Invite {needed} friends and Pro is yours forever. It only counts once they've set up.
      </ReferralProgress>

      <PrimaryButton href={`${appUrl}/friends/add`}>Invite a friend</PrimaryButton>
      <Text className="m-0 mt-[16px] text-center text-[14px] leading-[21px] text-muted">
        or{" "}
        <Link href={`${appUrl}/log/describe`} className="font-semibold text-rose underline">
          describe your next meal
        </Link>
      </Text>
    </Layout>
  );
}

PhotoLimit.PreviewProps = {
  appUrl: "https://adebite.app",
  assetsUrl: "/static",
  firstName: "Amara",
  limit: "10",
  month: "October",
  resetsOn: "1 November",
  referrals: "2",
  needed: "8",
} satisfies PhotoLimitProps;
