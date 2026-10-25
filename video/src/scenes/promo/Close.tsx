import React from "react";
import { AbsoluteFill } from "remotion";
import { mix, useClock } from "../../clock";
import { bankPath } from "../../components/art";
import { Headline } from "../../components/Headline";
import { Lockup } from "../../components/Logo";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const K = T.close;
const { colors, type } = theme;

/** 21.3–24.5s. A white sun rises behind the lockup, then "Eat. Lift. Together." and adebite.com. Holds to the end. */
export const Close: React.FC = () => {
  const { sec, springAt, ramp, breathe } = useClock();
  const L = useLayout();
  const cx = L.width / 2;
  const lockW = L.vertical ? 760 : 700;
  const lockY = L.vertical ? 600 : 190;
  const sunR = L.vertical ? 470 : 420;
  const sunY = lockY + (lockW * 256) / 806 / 2;

  const sun = ramp(K.sun, K.sun + 1.2, theme.ease.out);
  const lock = springAt(K.lockup, theme.spring.smooth);
  const url = springAt(K.url, theme.spring.bouncy);
  const clouds = ramp(K.start, K.start + 1.1, theme.ease.out);

  const bankH = L.vertical ? 480 : 300;
  const front = bankPath({ width: L.width, height: bankH, baseline: bankH * 0.35, rMin: 50, rMax: 96, seed: 12 });
  const back = bankPath({ width: L.width, height: bankH, baseline: bankH * 0.18, rMin: 60, rMax: 110, seed: 13 });

  return (
    <AbsoluteFill>
      {/* white sun with its dotted ring */}
      <div
        style={{
          position: "absolute",
          left: cx - sunR,
          top: sunY - sunR + (1 - sun) * 260,
          width: sunR * 2,
          height: sunR * 2,
          opacity: sun,
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, #fff 0%, rgba(255,255,255,0.85) 48%, rgba(255,255,255,0) 70%)" }} />
        <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: sunR * 0.12, width: sunR * 1.76, height: sunR * 1.76, transform: `rotate(${sec * 8}deg)` }}>
          <circle cx="100" cy="100" r="97" fill="none" stroke={colors.pink} strokeWidth="1.6" strokeDasharray="0.4 6" strokeLinecap="round" />
        </svg>
      </div>

      {/* clouds rise into the bottom of the frame */}
      <svg
        viewBox={`0 0 ${L.width} ${bankH}`}
        style={{ position: "absolute", left: 0, bottom: -2, width: L.width, height: bankH, transform: `translateY(${(1 - clouds) * bankH}px)` }}
      >
        <path d={back} fill={colors.cloudBack} transform={`translate(${Math.sin(sec / 2.4) * 30} ${bankH * 0.12})`} />
        <path d={front} fill="#fff" transform={`translate(${-Math.sin(sec / 2.8) * 22} ${bankH * 0.3})`} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: cx - lockW / 2,
          top: lockY,
          opacity: Math.min(1, lock * 1.4),
          transform: `translateY(${(1 - lock) * 60 + breathe(3.6, 4)}px) scale(${mix(lock, 0.9, 1)})`,
          filter: lock < 0.98 ? `blur(${(1 - lock) * 10}px)` : undefined,
        }}
      >
        <Lockup width={lockW} />
      </div>

      <div style={{ position: "absolute", top: lockY + (lockW * 256) / 806 + (L.vertical ? 90 : 70), left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Headline words={copy.close.tagline} at={K.tagline} size={L.vertical ? 112 : 104} stagger={0.12} />
      </div>

      <div
        style={{
          position: "absolute",
          top: lockY + (lockW * 256) / 806 + (L.vertical ? 300 : 230),
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: Math.min(1, url * 1.5),
          transform: `translateY(${(1 - url) * 30}px) scale(${mix(url, 0.7, 1)})`,
        }}
      >
        <div
          style={{
            padding: L.vertical ? "26px 52px" : "22px 46px",
            borderRadius: 999,
            background: colors.ink,
            color: "#fff",
            fontFamily: type.family,
            fontSize: L.vertical ? 46 : 40,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            boxShadow: "0 24px 40px -18px rgba(46,26,36,0.55)",
          }}
        >
          {copy.close.url}
        </div>
      </div>

    </AbsoluteFill>
  );
};
