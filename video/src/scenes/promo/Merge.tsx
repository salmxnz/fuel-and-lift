import React from "react";
import { AbsoluteFill } from "remotion";
import { mix, useClock } from "../../clock";
import { AppIcon, useAppSlots } from "../../components/AppIcons";
import { Headline } from "../../components/Headline";
import { AppTile, Wordmark } from "../../components/Logo";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const M = T.merge;
const { colors } = theme;

/**
 * 3.1–6.1s. On the drop the five icons blur, orbit and pull into one pink bloom;
 * the adebite app tile springs out of it, then the lockup lands underneath.
 */
export const Merge: React.FC = () => {
  const { sec, ramp, springAt, exit, breathe } = useClock();
  const L = useLayout();
  const { size, slots, center } = useAppSlots();
  const hit = 1 - springAt(M.drop, theme.spring.bouncy); // drop pulse, 1 → 0
  const q = ramp(M.pull, M.gone, theme.ease.inOut);
  const fadeIcons = 1 - ramp(M.gone - 0.35, M.gone, theme.ease.in);

  const bloom = ramp(M.pull + 0.3, M.tile + 0.1, theme.ease.out) * (1 - ramp(M.lockup, M.end, theme.ease.inOut) * 0.4);
  const tile = springAt(M.tile, theme.spring.bouncy);
  const lift = springAt(M.lockup, theme.spring.smooth);
  const lock = springAt(M.lockup + 0.08, theme.spring.snappy);
  const out = 1 - exit(M.end, 0.22);

  const tileSize = L.vertical ? 300 : 250;
  const lockW = L.vertical ? 520 : 440;
  const tileY = center.y - lift * (L.vertical ? 150 : 110);

  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 + out * 0.06})`, filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>
      <div style={{ position: "absolute", top: L.vertical ? 420 : 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: L.headlineWidth }}>
          <Headline words={copy.merge} at={M.headline} />
        </div>
      </div>

      {/* the pink bloom the icons fall into */}
      <div
        style={{
          position: "absolute",
          left: center.x - 500,
          top: center.y - 500,
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.pink} 0%, ${colors.pinkSoft}aa 35%, transparent 68%)`,
          opacity: bloom,
          transform: `scale(${mix(bloom, 0.2, 1) * (1 + breathe(2.4, 0.03))})`,
          filter: "blur(10px)",
        }}
      />

      {fadeIcons > 0 &&
        slots.map((s, i) => {
          const dx = s.x - center.x;
          const dy = s.y - center.y;
          const r = Math.hypot(dx, dy) * (1 - q);
          const a = Math.atan2(dy, dx) + q * Math.PI * 1.6;
          return (
            <AppIcon
              key={s.src}
              {...s}
              size={size}
              x={center.x + Math.cos(a) * r}
              y={center.y + Math.sin(a) * r * (L.vertical ? 1 : 0.8)}
              scale={(1 + hit * 0.1) * mix(q, 1, 0.45)}
              blur={q * 16}
              opacity={fadeIcons}
              rotate={q * 140 * (i % 2 ? 1 : -1)}
              glowBoost={1 + hit * 0.5 + q * 0.6}
            />
          );
        })}

      {/* adebite tile + dotted sun ring */}
      <div
        style={{
          position: "absolute",
          left: center.x - tileSize / 2,
          top: tileY - tileSize / 2,
          width: tileSize,
          height: tileSize,
          opacity: Math.min(1, tile * 1.4),
          transform: `scale(${mix(tile, 0.3, 1) * (1 + breathe(3, 0.012))}) rotate(${(1 - tile) * -18}deg)`,
        }}
      >
        <svg
          viewBox="0 0 200 200"
          style={{ position: "absolute", inset: -tileSize * 0.32, width: tileSize * 1.64, height: tileSize * 1.64, transform: `rotate(${sec * 14}deg)` }}
        >
          <circle cx="100" cy="100" r="96" fill="none" stroke="#fff" strokeWidth="2.4" strokeDasharray="0.5 7" strokeLinecap="round" />
        </svg>
        <AppTile size={tileSize} style={{ filter: `drop-shadow(0 30px 40px rgba(168,47,97,0.35))` }} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: center.y + (L.vertical ? 140 : 110),
          display: "flex",
          justifyContent: "center",
          opacity: lock,
          transform: `translateY(${(1 - lock) * 40}px)`,
          filter: lock < 0.98 ? `blur(${(1 - lock) * 8}px)` : undefined,
        }}
      >
        <Wordmark width={lockW} />
      </div>
    </AbsoluteFill>
  );
};
