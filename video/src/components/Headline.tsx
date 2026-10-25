import React from "react";
import { interpolate } from "remotion";
import { useClock } from "../clock";
import type { Tone, Word } from "../content";
import { useLayout } from "../layout";
import { theme } from "../theme";

const { colors, type } = theme;

export const toneColor = (tone: Tone = "ink") =>
  tone === "rose" ? colors.rose : tone === "dim" ? colors.dim : colors.ink;

/**
 * The landing page's text reveal (web/components/landing/reveal.tsx): words rise
 * out of an 8px blur one by one. Sized for display type, staggered 0.06s.
 * `exitAt` blurs the whole line up and away, faster than it came in.
 */
export const Headline: React.FC<{
  words: readonly Word[];
  at: number;
  exitAt?: number;
  size?: number;
  align?: "center" | "left";
  stagger?: number;
  style?: React.CSSProperties;
  /** override the colour of word i (for lighting lines up) */
  colorOf?: (i: number, w: Word) => string;
}> = ({ words, at, exitAt, size, align = "center", stagger = 0.06, style, colorOf }) => {
  const { springAt, ramp } = useClock();
  const L = useLayout();
  const fontSize = size ?? L.headlineSize;
  const out = exitAt === undefined ? 0 : ramp(exitAt - 0.25, exitAt, theme.ease.in);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: fontSize * 0.24,
        rowGap: fontSize * 0.04,
        fontFamily: type.family,
        fontSize,
        fontWeight: type.display.weight,
        letterSpacing: type.display.tracking,
        lineHeight: type.display.leading,
        opacity: 1 - out,
        transform: `translateY(${-out * 40}px)`,
        filter: out > 0 ? `blur(${out * 10}px)` : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const p = springAt(at + i * stagger, theme.spring.snappy);
        const blur = interpolate(p, [0, 1], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: colorOf ? colorOf(i, w) : toneColor(w.tone),
              opacity: Math.min(1, p * 1.4),
              transform: `translateY(${(1 - p) * fontSize * 0.45}px) scale(${0.96 + p * 0.04})`,
              filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              paddingBottom: fontSize * 0.08,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
