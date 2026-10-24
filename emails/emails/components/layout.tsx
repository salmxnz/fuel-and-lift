import type { ReactNode } from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

// adebite brand as hex, mirroring web/app/globals.css (docs/brand/BRAND.md):
// pastel pink and white, plum for text. Pink never carries text; rose does.
export const brand = {
  ground: "#FBEFF3",
  sheet: "#FFF8FA",
  field: "#FDF3F6",
  chip: "#F8E2EA",
  pink: "#F6B8CA",
  pinkSoft: "#FBDCE6",
  rose: "#A82F61",
  carbs: "#EE8FB0",
  fat: "#F2B48C",
  ink: "#2E1A24",
  inkSoft: "#4A3340",
  muted: "#765A67",
  line: "#ECD3DD",
  lineSoft: "#F7E8EE",
};

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        ground: brand.ground,
        sheet: brand.sheet,
        field: brand.field,
        chip: brand.chip,
        pink: brand.pink,
        "pink-soft": brand.pinkSoft,
        rose: brand.rose,
        ink: brand.ink,
        "ink-soft": brand.inkSoft,
        muted: brand.muted,
        line: brand.line,
        "line-soft": brand.lineSoft,
      },
      fontFamily: {
        sans: ["Schibsted Grotesk", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
};

// Every template gets these; the export script fills them with Go tokens.
export interface BaseProps {
  appUrl: string;
  assetsUrl: string;
}

interface LayoutProps extends BaseProps {
  preview: string;
  hero: { src: string; alt: string };
  /** Why this email arrived, shown small in the footer. */
  reason: ReactNode;
  children: ReactNode;
}

export function Layout({ appUrl, assetsUrl, preview, hero, reason, children }: LayoutProps) {
  return (
    <Html lang="en-GB">
      <Tailwind config={tailwindConfig}>
        <Head>
          <meta name="color-scheme" content="light only" />
          <meta name="supported-color-schemes" content="light" />
          {/* Apple Mail / iOS pick this up; everyone else gets Helvetica/Arial. */}
          <Font
            fontFamily="Schibsted Grotesk"
            fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
            webFont={{
              url: "https://fonts.gstatic.com/s/schibstedgrotesk/v7/Jqz55SSPQuCQF3t8uOwiUL-taUTtap9GayojdSFO.woff2",
              format: "woff2",
            }}
            fontWeight="400 900" // variable font: one file covers every weight
            fontStyle="normal"
          />
        </Head>
        <Body className="m-0 bg-ground p-0 font-sans">
          <Preview>{preview}</Preview>
          <Container className="mx-auto w-full max-w-[560px] px-[12px] pb-[40px] pt-[32px]">
            <Section className="pb-[24px] text-center" data-skip-in-text="true">
              <Link href={appUrl}>
                <Img src={`${assetsUrl}/email/logo.png`} alt="adebite" width="121" height="38" className="mx-auto block" />
              </Link>
            </Section>

            <Section className="overflow-hidden rounded-[24px] bg-white">
              {/* Heroes carry the card's top corners and fade into white. */}
              <Img src={`${assetsUrl}/email/${hero.src}`} alt={hero.alt} width="560" className="block h-auto w-full" />
              <Section className="px-[32px] pb-[40px] pt-[4px]">{children}</Section>
            </Section>

            <Section className="px-[24px] pt-[32px] text-center">
              <Img src={`${assetsUrl}/email/mark.png`} alt="" width="28" height="28" className="mx-auto block" />
              <Text className="m-0 mt-[10px] text-[14px] font-bold leading-[20px] text-ink">Eat, lift, and see it add up.</Text>
              <Text className="m-0 mt-[6px] text-[13px] leading-[20px] text-muted">
                <Link href={appUrl} className="font-semibold text-rose underline">
                  Open adebite
                </Link>
                {"  ·  "}
                <Link href={`${appUrl}/settings/notifications`} className="font-semibold text-rose underline">
                  Notifications
                </Link>
              </Text>
              <Text className="m-0 mt-[16px] text-[12px] leading-[18px] text-muted">{reason}</Text>
              <Text className="m-0 mt-[4px] text-[12px] leading-[18px] text-muted">© adebite</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

// --- pieces the templates share ----------------------------------------------

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text className="m-0 text-[14px] font-bold leading-[18px] tracking-[0.1px] text-rose">{children}</Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" className="m-0 mt-[10px] text-[30px] font-extrabold leading-[34px] tracking-[-0.8px] text-ink">
      {children}
    </Heading>
  );
}

export function Para({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Text className={`m-0 mt-[14px] text-[16px] leading-[25px] text-ink-soft ${className}`}>{children}</Text>;
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section className="mt-[28px]">
      <Button
        href={href}
        className="box-border block w-full rounded-[16px] bg-ink px-[24px] py-[17px] text-center text-[16px] font-bold leading-[20px] text-white no-underline"
      >
        {children}
      </Button>
    </Section>
  );
}

/** A row with a 56 px pink icon tile, a bold line and a quieter one. */
export function Feature({ icon, title, children, assetsUrl }: { icon: string; title: string; children: ReactNode; assetsUrl: string }) {
  return (
    <Row className="mt-[18px]">
      <Column className="w-[72px] align-top">
        <Img src={`${assetsUrl}/email/icon-${icon}.png`} alt="" width="56" height="56" className="block" />
      </Column>
      <Column className="align-top">
        <Text className="m-0 mt-[4px] text-[16px] font-bold leading-[22px] text-ink">{title}</Text>
        <Text className="m-0 mt-[2px] text-[14px] leading-[21px] text-muted">{children}</Text>
      </Column>
    </Row>
  );
}

/** The "n of 8" referral strip. One pre-drawn image per count (0–8). */
export function ReferralProgress({
  assetsUrl,
  referrals,
  needed,
  heading,
  children,
}: {
  assetsUrl: string;
  referrals: string;
  needed: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Section className="mt-[28px] rounded-[18px] border border-solid border-line-soft bg-sheet px-[20px] py-[20px]">
      <Row>
        <Column>
          <Text className="m-0 text-[15px] font-bold leading-[20px] text-ink">{heading}</Text>
        </Column>
        <Column className="w-[90px] text-right">
          <Text className="m-0 text-[14px] font-bold leading-[20px] text-rose">
            {referrals} of {needed}
          </Text>
        </Column>
      </Row>
      <Img
        src={`${assetsUrl}/email/referrals-${referrals}.png`}
        alt={`${referrals} of ${needed} friends joined`}
        width="456"
        className="mt-[14px] block h-auto w-full"
      />
      <Text className="m-0 mt-[12px] text-[14px] leading-[21px] text-muted">{children}</Text>
    </Section>
  );
}
