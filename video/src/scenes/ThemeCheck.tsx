import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Finish } from "../components/Backdrop";
import { Lockup } from "../components/Logo";
import { theme } from "../theme";

const { colors, type, ease } = theme;

const swatches = [
  ["ground", colors.ground],
  ["pink", colors.pink],
  ["pink-soft", colors.pinkSoft],
  ["rose", colors.rose],
  ["carbs", colors.carbs],
  ["fat", colors.fat],
  ["ink", colors.ink],
  ["muted", colors.muted],
] as const;

/**
 * Brand sanity card — not a deliverable. Renders the theme (type, palette,
 * backdrop, lockup) so a theme change can be eyeballed in one still.
 */
export const ThemeCheck: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = (delay: number) =>
    interpolate(frame, [delay * fps, (delay + 0.7) * fps], [0, 1], {
      easing: ease.out,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill style={{ fontFamily: type.family, color: colors.ink }}>
      <Backdrop />
      <AbsoluteFill style={{ padding: 120, gap: 36 }}>
        <div style={{ opacity: p(0), transform: `translateY(${(1 - p(0)) * 30}px)` }}>
          <Lockup width={520} />
        </div>
        <div
          style={{
            fontSize: 120,
            fontWeight: type.display.weight,
            letterSpacing: type.display.tracking,
            lineHeight: type.display.leading,
            opacity: p(0.2),
            transform: `translateY(${(1 - p(0.2)) * 30}px)`,
          }}
        >
          Eat. Lift. <span style={{ color: colors.rose }}>Together.</span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 500, color: colors.muted, opacity: p(0.35) }}>
          Schibsted Grotesk · 400 → 900 · <span style={{ fontWeight: 900, color: colors.ink }}>black 900</span>
        </div>
        <div style={{ display: "flex", gap: 20, opacity: p(0.5) }}>
          {swatches.map(([name, hex]) => (
            <div key={name} style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <div style={{ width: 140, height: 140, borderRadius: 18, background: hex, boxShadow: theme.shadow.card }} />
              <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 18, color: colors.muted }}>{hex}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <Finish />
    </AbsoluteFill>
  );
};
