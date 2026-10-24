import { Column, Img, Row, Section, Text } from "react-email";
import { type BaseProps, Eyebrow, Feature, Layout, Para, PrimaryButton, Title, brand } from "./components/layout";

// Sent once, when someone finishes onboarding. Props map 1:1 onto Welcome in
// api/internal/email/data.go; the export script fills them with Go tokens.
export interface WelcomeProps extends BaseProps {
  firstName: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  referralsForPro: string;
}

function Macro({ label, grams, dot }: { label: string; grams: string; dot: string }) {
  return (
    <Column className="w-1/3 align-top">
      <Text className="m-0 text-[13px] leading-[18px] text-muted">
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, backgroundColor: dot, marginRight: 6 }} />
        {label}
      </Text>
      <Text className="m-0 mt-[2px] text-[18px] font-extrabold leading-[24px] text-ink">{grams} g</Text>
    </Column>
  );
}

export default function Welcome({ appUrl, assetsUrl, firstName, calories, protein, carbs, fat, referralsForPro }: WelcomeProps) {
  return (
    <Layout
      appUrl={appUrl}
      assetsUrl={assetsUrl}
      preview={`Your plan is ready: ${calories} kcal a day. Here's how to start.`}
      hero={{ src: "hero-welcome.png", alt: "The adebite logo rising over pink clouds, with an egg, a strawberry, a donut and a dumbbell" }}
      reason="You're getting this because you just set up adebite."
    >
      <Eyebrow>Welcome to adebite</Eyebrow>
      <Title>Hi {firstName}, your plan is ready.</Title>
      <Para>
        Every bite and every set you log adds up here. This is the daily target we worked out from what you told us. You
        can change it any time from Me.
      </Para>

      <Section className="mt-[24px] rounded-[18px] bg-field px-[20px] py-[20px]">
        <Text className="m-0 text-[12px] font-bold uppercase leading-[16px] tracking-[1.2px] text-muted">Your daily target</Text>
        <Text className="m-0 mt-[6px] text-[40px] font-extrabold leading-[44px] tracking-[-1.2px] text-ink">
          {calories}
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0, color: brand.muted }}> kcal</span>
        </Text>
        <Row className="mt-[16px]">
          <Macro label="Protein" grams={protein} dot={brand.rose} />
          <Macro label="Carbs" grams={carbs} dot={brand.carbs} />
          <Macro label="Fat" grams={fat} dot={brand.fat} />
        </Row>
      </Section>

      <Text className="m-0 mt-[32px] text-[18px] font-extrabold leading-[24px] tracking-[-0.3px] text-ink">
        Three things to try this week
      </Text>
      <Feature assetsUrl={assetsUrl} icon="camera" title="Snap your next meal">
        Take a photo and get an estimate in seconds. Fix anything that looks off before you save it.
      </Feature>
      <Feature assetsUrl={assetsUrl} icon="dumbbell" title="Start your first workout">
        Your plan is waiting in Gym. Weights fill in from your first session.
      </Feature>
      <Feature assetsUrl={assetsUrl} icon="friends" title="Bring a friend">
        Send a friend link and cheer each other on. Invite {referralsForPro} and you get Pro forever.
      </Feature>

      <PrimaryButton href={`${appUrl}/today`}>Open adebite</PrimaryButton>

      <Section className="mt-[24px] rounded-[16px] bg-ground px-[16px] py-[14px]">
        <Row>
          <Column className="w-[52px] align-middle">
            <Img src={`${assetsUrl}/email/app-icon.png`} alt="" width="40" height="40" className="block rounded-[10px]" />
          </Column>
          <Column className="align-middle">
            <Text className="m-0 text-[14px] leading-[20px] text-ink-soft">
              <strong className="text-ink">Tip:</strong> add adebite to your home screen. It opens like an app and works
              offline.
            </Text>
          </Column>
        </Row>
      </Section>
    </Layout>
  );
}

Welcome.PreviewProps = {
  appUrl: "https://adebite.app",
  assetsUrl: "/static",
  firstName: "Amara",
  calories: "2,150",
  protein: "160",
  carbs: "215",
  fat: "70",
  referralsForPro: "8",
} satisfies WelcomeProps;
