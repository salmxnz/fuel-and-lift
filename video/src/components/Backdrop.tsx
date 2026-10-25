import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { bankPath, CloudPuff, seeded, Sparkle } from "./art";

const { colors } = theme;

const SPARKS = (() => {
  const rand = seeded(9);
  return Array.from({ length: 14 }, () => ({
    x: rand(),
    y: rand() * 0.7,
    size: 14 + rand() * 18,
    phase: rand() * Math.PI * 2,
    period: 2.2 + rand() * 1.6,
  }));
})();

/**
 * Layer 1: the landing page's pink sky. White at the top, blush lower down, two
 * slow blush glows, twinkling sparkles, puffy clouds drifting at the sides and a
 * scalloped cloud bank along the bottom (the sky header from the app, full bleed).
 */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = frame / fps;
  const vertical = height > width;
  const d1 = Math.sin(s / 1.9) * 60;
  const d2 = Math.cos(s / 2.4) * 50;
  const bankH = vertical ? 260 : 200;
  const back = bankPath({ width, height: bankH, baseline: bankH * 0.42, rMin: 34, rMax: 64, seed: 5 });
  const front = bankPath({ width, height: bankH, baseline: bankH * 0.62, rMin: 28, rMax: 54, seed: 4 });

  return (
    <AbsoluteFill style={{ background: colors.sky, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          left: -520 + d1,
          top: -640,
          background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1300,
          height: 1300,
          borderRadius: "50%",
          right: -480 - d2,
          bottom: -520,
          background: `radial-gradient(circle, ${colors.pinkSoft} 0%, transparent 60%)`,
        }}
      />
      {SPARKS.map((p, i) => {
        const tw = 0.5 + 0.5 * Math.sin((s / p.period) * Math.PI * 2 + p.phase);
        return (
          <Sparkle
            key={i}
            style={{
              position: "absolute",
              left: p.x * width,
              top: p.y * height,
              width: p.size,
              opacity: 0.35 + tw * 0.6,
              transform: `scale(${0.7 + tw * 0.4}) rotate(${tw * 20}deg)`,
            }}
          />
        );
      })}
      <CloudPuff
        seed={3}
        style={{
          position: "absolute",
          width: vertical ? 520 : 560,
          left: vertical ? -220 + s * 6 : -160 + s * 7,
          top: vertical ? 160 : 120,
          opacity: 0.85,
        }}
      />
      <CloudPuff
        seed={8}
        flip
        style={{
          position: "absolute",
          width: vertical ? 460 : 520,
          right: vertical ? -200 + s * 5 : -150 + s * 6,
          top: vertical ? 1180 : 520,
          opacity: 0.8,
        }}
      />
      <svg
        viewBox={`0 0 ${width} ${bankH}`}
        style={{ position: "absolute", left: 0, bottom: -2, width, height: bankH }}
      >
        <path d={back} fill={colors.cloudBack} transform={`translate(${Math.sin(s / 3) * 24} 0)`} />
        <path d={front} fill={colors.ground} transform={`translate(${-Math.sin(s / 3.6) * 18} 0)`} />
      </svg>
    </AbsoluteFill>
  );
};

/** Layers 4–5: a whisper of pink grade, film grain and a soft rose vignette. */
export const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return (
    <>
      <AbsoluteFill
        style={{ pointerEvents: "none", backgroundColor: colors.pink, mixBlendMode: "soft-light", opacity: 0.1 }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          backgroundImage: noise,
          backgroundSize: "220px",
          backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`,
          opacity: 0.035,
          mixBlendMode: "multiply",
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 58%, rgba(168,47,97,0.12) 100%)",
        }}
      />
    </>
  );
};
