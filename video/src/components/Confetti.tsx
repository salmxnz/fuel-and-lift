import React from "react";
import { useClock } from "../clock";
import { theme } from "../theme";
import { seeded } from "./art";

const { colors } = theme;
const PIECES = (() => {
  const rand = seeded(21);
  return Array.from({ length: 34 }, () => ({
    a: rand() * Math.PI * 2,
    v: 0.55 + rand() * 0.6,
    spin: (rand() - 0.5) * 900,
    c: [colors.rose, colors.pink, colors.fat, colors.carbs, "#fff"][Math.floor(rand() * 5)],
    w: 8 + rand() * 8,
  }));
})();

/** A one-shot confetti burst from (x, y), like the emails' sprinkles. */
export const Confetti: React.FC<{ at: number; x: number; y: number; spread?: number }> = ({ at, x, y, spread = 420 }) => {
  const { sec } = useClock();
  const t = sec - at;
  if (t < 0 || t > 1.6) return null;
  return (
    <>
      {PIECES.map((p, i) => {
        const d = (1 - Math.exp(-t * 4)) * spread * p.v;
        const px = x + Math.cos(p.a) * d;
        const py = y + Math.sin(p.a) * d * 0.8 + t * t * 260;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: p.w,
              height: p.w * 0.42,
              borderRadius: 4,
              background: p.c,
              opacity: Math.max(0, 1 - t / 1.6),
              transform: `rotate(${p.spin * t}deg)`,
            }}
          />
        );
      })}
    </>
  );
};
