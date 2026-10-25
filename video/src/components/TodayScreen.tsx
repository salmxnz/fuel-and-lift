import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { mix, useClock } from "../clock";
import { copy } from "../content";
import { T } from "../timeline";
import { theme } from "../theme";
import { bankPath, seeded, Sparkle } from "./art";
import { StatusBar } from "./Phone";

const { colors, type } = theme;
const C = T.calories;
const D = copy.today;

const ARC = "M40 194A140 140 0 0 1 320 194";
const BACK = bankPath({ width: 400, height: 56, baseline: 22, rMin: 14, rMax: 26, seed: 5 });
const FRONT = bankPath({ width: 400, height: 56, baseline: 34, rMin: 12, rMax: 22, seed: 4 });
const SPARKS = (() => {
  const rand = seeded(9);
  return Array.from({ length: 5 }, () => ({ left: rand() * 90 + 4, top: rand() * 55 + 20, size: 7 + rand() * 7, ph: rand() * 6 }));
})();

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * The Today tab (web/components/today/today-screen.tsx), redrawn at 390 px:
 * the pink sky header with the calorie sun, the macro card and the meals list.
 * Timed on T.calories: the photo meal lands, the sun's arc fills and the number
 * counts down, then the macro bars grow.
 */
export const TodayScreen: React.FC = () => {
  const { ramp, springAt, sec } = useClock();
  const fill = ramp(C.fill, C.fillEnd, theme.ease.inOut);
  const eaten = mix(fill, 0, D.eaten);
  const left = D.target - eaten;
  const share = eaten / D.target;

  return (
    <div style={{ width: 390, height: 844, background: colors.ground, fontFamily: type.family, color: colors.ink }}>
      {/* sky header */}
      <div style={{ position: "relative", height: 372, background: "linear-gradient(#fff 0%, #fdf0f4 36%, #f9d6e2 80%, #f6c6d6 100%)" }}>
        {SPARKS.map((s, i) => (
          <Sparkle
            key={i}
            style={{
              position: "absolute",
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              opacity: 0.5 + 0.5 * Math.sin(sec * 2.4 + s.ph),
            }}
          />
        ))}
        <StatusBar />
        <div style={{ padding: "6px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.muted }}>{D.date}</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 1.05 }}>{D.title}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.85)",
                  background: "rgba(255,255,255,0.65)",
                  boxShadow: "inset 0 1px 0 #fff, 0 4px 14px rgba(168,47,97,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i === 0 ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="2" strokeLinecap="round">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
                    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.4 3.6 5.2" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="2" strokeLinecap="round">
                    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
                    <path d="M10 20a2 2 0 0 0 4 0" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* calorie sun */}
        <div style={{ position: "absolute", left: 15, right: 15, bottom: 18, height: 200 }}>
          <svg viewBox="0 0 360 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <radialGradient id="sun-glow" cx="50%" cy="97%" r="55%">
                <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                <stop offset="0.7" stopColor="#fff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="180" cy="194" r="180" fill="url(#sun-glow)" />
            <circle
              cx="180"
              cy="194"
              r="164"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeDasharray="1 11"
              strokeLinecap="round"
              transform={`rotate(${sec * 6} 180 194)`}
            />
            <path d={ARC} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="20" strokeLinecap="round" />
            <path
              d={ARC}
              fill="none"
              stroke={colors.sunArc}
              strokeWidth="20"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={eaten > 1 ? 100 - share * 100 : 100}
            />
            <circle cx="180" cy="194" r="120" fill="#fff" />
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: "18%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 50, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}>
              {fmt(left)}
            </span>
            <span style={{ marginTop: 3, fontSize: 13.5, fontWeight: 700, color: colors.inkSoft }}>kcal to go</span>
            <span style={{ fontSize: 12, color: colors.muted }}>
              {fmt(eaten)} eaten of {fmt(D.target)}
            </span>
          </div>
        </div>

        <svg viewBox="0 0 400 56" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: -1, width: "100%", height: 44 }}>
          <path d={BACK} fill="#F6C9D8" transform={`translate(${Math.sin(sec / 2) * 8} 0)`} />
          <path d={FRONT} fill={colors.ground} />
        </svg>
      </div>

      {/* macros */}
      <div style={{ padding: "4px 16px 0" }}>
        <div style={{ borderRadius: 18, background: "#fff", padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {D.macros.map((m, i) => {
            const p = ramp(C.macros + i * 0.12, C.macros + 0.9 + i * 0.12, theme.ease.inOut);
            const value = m.value * p;
            const c = colors[m.color];
            return (
              <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: colors.muted }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />
                  {m.label}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(value)}
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: colors.muted }}> / {m.target} g</span>
                </span>
                <div style={{ height: 8, borderRadius: 99, background: colors.lineSoft, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "100%", borderRadius: 99, background: c, transform: `scaleX(${(value / m.target)})`, transformOrigin: "left" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.muted, fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(m.target - value)} g left
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* meals */}
      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 10 }}>Meals</div>
        {[
          { ...D.meal, img: "assets/food/fried_egg.png", fresh: true },
          { ...D.lunch, img: "assets/food/rice_bowl.png", fresh: false },
          { name: "Snack", item: "Banana and yoghurt", kcal: 450, img: "assets/food/banana.png", fresh: false },
        ].map((m, i) => {
          const p = springAt(C.meal + i * 0.1, theme.spring.snappy);
          const glow = m.fresh ? interpolate(sec, [C.meal + 0.2, C.meal + 0.6, C.fillEnd + 0.4], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          return (
            <div
              key={m.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#fff",
                borderRadius: 18,
                padding: "12px 14px",
                marginBottom: 8,
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px) scale(${0.97 + p * 0.03})`,
                boxShadow: `0 0 0 ${2 * glow}px ${colors.pink}, 0 10px 24px -12px rgba(168,47,97,${0.35 * glow})`,
              }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 14, background: colors.pinkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Img src={staticFile(m.img)} style={{ width: 30, height: 30, imageRendering: "pixelated" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.muted }}>{m.name}</div>
                <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.02em" }}>{m.item}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{m.kcal}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.muted }}>kcal</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
