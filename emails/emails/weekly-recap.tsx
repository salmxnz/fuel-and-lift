import { Column, Img, Row, Section, Text } from "react-email";
import { type BaseProps, Eyebrow, Layout, Para, PrimaryButton, Title } from "./components/layout";

// A Monday summary of the week before. Props map 1:1 onto WeeklyRecap in
// api/internal/email/data.go. Not sent yet: it needs a scheduler and an opt-out.
export interface WeeklyRecapProps extends BaseProps {
  firstName: string;
  weekRange: string;
  daysLogged: string;
  avgCalories: string;
  targetCalories: string;
  workouts: string;
  weightChange: string;
}

function Stat({ assetsUrl, icon, label, value, note }: { assetsUrl: string; icon: string; label: string; value: string; note: string }) {
  return (
    <Column className="w-1/2 px-[6px] align-top">
      <Section className="rounded-[18px] bg-field px-[16px] py-[16px]">
        <Img src={`${assetsUrl}/email/icon-${icon}.png`} alt="" width="36" height="36" className="block" />
        <Text className="m-0 mt-[12px] text-[13px] leading-[18px] text-muted">{label}</Text>
        <Text className="m-0 mt-[2px] text-[26px] font-extrabold leading-[30px] tracking-[-0.6px] text-ink">{value}</Text>
        <Text className="m-0 mt-[2px] text-[13px] leading-[18px] text-muted">{note}</Text>
      </Section>
    </Column>
  );
}

export default function WeeklyRecap({
  appUrl,
  assetsUrl,
  firstName,
  weekRange,
  daysLogged,
  avgCalories,
  targetCalories,
  workouts,
  weightChange,
}: WeeklyRecapProps) {
  return (
    <Layout
      appUrl={appUrl}
      assetsUrl={assetsUrl}
      preview={`Your week: ${daysLogged} of 7 days logged and ${workouts} workouts.`}
      hero={{ src: "hero-recap.png", alt: "A week of pink bars with a rising line above them" }}
      reason="You get this every Monday. Turn it off in Notifications."
    >
      <Eyebrow>Your week · {weekRange}</Eyebrow>
      <Title>Here's how it added up, {firstName}.</Title>
      <Para>A quick look back before the new week starts.</Para>

      <Row className="mt-[20px]">
        <Stat assetsUrl={assetsUrl} icon="pen" label="Days logged" value={`${daysLogged} / 7`} note="Every day counts" />
        <Stat assetsUrl={assetsUrl} icon="flame" label="Average a day" value={avgCalories} note={`Target ${targetCalories} kcal`} />
      </Row>
      <Row className="mt-[12px]">
        <Stat assetsUrl={assetsUrl} icon="dumbbell" label="Workouts" value={workouts} note="Sessions finished" />
        <Stat assetsUrl={assetsUrl} icon="scale" label="Weight" value={weightChange} note="Since last week" />
      </Row>

      <PrimaryButton href={`${appUrl}/progress`}>See your progress</PrimaryButton>
    </Layout>
  );
}

WeeklyRecap.PreviewProps = {
  appUrl: "https://adebite.app",
  assetsUrl: "/static",
  firstName: "Amara",
  weekRange: "13–19 Oct",
  daysLogged: "6",
  avgCalories: "2,080",
  targetCalories: "2,150",
  workouts: "3",
  weightChange: "−0.4 kg",
} satisfies WeeklyRecapProps;
