import React from "react";
import { interpolate } from "remotion";
import { mix, useClock } from "../clock";
import { copy } from "../content";
import { T } from "../timeline";
import { theme } from "../theme";
import { Dumbbell } from "./art";

const { colors, type } = theme;
const W = copy.workout;
const LT = T.lifts;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Check: React.FC<{ p: number }> = ({ p }) => (
  <div
    style={{
      width: 34,
      height: 34,
      borderRadius: 11,
      background: p > 0 ? colors.pink : colors.field,
      border: `2px solid ${p > 0 ? colors.pink : colors.line}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transform: `scale(${1 + Math.sin(Math.min(1, p) * Math.PI) * 0.25})`,
    }}
  >
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - Math.min(1, p)}
      />
    </svg>
  </div>
);

/** A workout in progress, drawn at 460 px wide: sets tick off on the beat, then a PR. */
export const WorkoutCard: React.FC = () => {
  const { sec, ramp, springAt } = useClock();
  const done = LT.sets.filter((t) => sec >= t).length;
  const pr = springAt(LT.pr, theme.spring.bouncy);
  const elapsed = 18 * 60 + 42 + Math.max(0, sec - LT.card);
  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);

  return (
    <div
      style={{
        width: 460,
        background: "#fff",
        borderRadius: 26,
        boxShadow: theme.shadow.card,
        fontFamily: type.family,
        color: colors.ink,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "22px 22px 16px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: colors.pinkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Dumbbell style={{ width: 38 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 1 }}>{W.title}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.muted, marginTop: 4 }}>{W.sub}</div>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 999, background: colors.chip, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {mm}:{String(ss).padStart(2, "0")}
        </div>
      </div>
      <div style={{ height: 1, background: colors.lineSoft }} />
      <div style={{ padding: "16px 22px 6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{W.exercise}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.muted }}>4 sets · 2 min rest</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr 70px 60px 40px",
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: colors.muted,
            padding: "14px 10px 6px",
          }}
        >
          <span>SET</span>
          <span>PREVIOUS</span>
          <span>KG</span>
          <span>REPS</span>
          <span />
        </div>
        {W.sets.map((s, i) => {
          const p = ramp(LT.sets[i], LT.sets[i] + 0.3, theme.ease.out);
          const next = i === done;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 70px 60px 40px",
                alignItems: "center",
                height: 54,
                padding: "0 10px",
                borderRadius: 14,
                marginBottom: 4,
                background: p > 0 ? `rgba(253,232,239,${p})` : "transparent",
                boxShadow: next ? `inset 0 0 0 2px ${colors.pinkSoft}` : undefined,
                fontSize: 17,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: colors.chip,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: colors.muted, fontWeight: 600, fontSize: 15 }}>
                {i === 3 ? "67.5" : s.kg - 2.5} × {s.reps}
              </span>
              <span>{s.kg}</span>
              <span>{s.reps}</span>
              <Check p={p} />
            </div>
          );
        })}
      </div>
      <div style={{ height: 64, position: "relative", margin: "4px 22px 0" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 999,
            background: colors.rose,
            color: "#fff",
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            opacity: Math.min(1, pr * 1.5),
            transform: `translateY(${(1 - pr) * 16}px) scale(${mix(pr, 0.5, 1)})`,
            transformOrigin: "left center",
            boxShadow: `0 12px 26px -10px ${colors.rose}`,
          }}
        >
          <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.22)", fontSize: 13 }}>PR</span>
          {W.pr} · 70 kg × 6
        </div>
      </div>
      <div
        style={{
          margin: "0 12px 12px",
          padding: "14px 12px",
          borderRadius: 16,
          background: colors.sheet,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 15,
          fontWeight: 700,
          color: colors.muted,
          opacity: interpolate(sec, [LT.pr + 0.2, LT.pr + 0.6], [0.5, 1], clamp),
        }}
      >
        <span>
          Next · <span style={{ color: colors.ink }}>{W.next}</span>
        </span>
        <span>›</span>
      </div>
    </div>
  );
};
