import React from "react";
import { Img, staticFile } from "remotion";
import { useLayout } from "../layout";
import { theme } from "../theme";

/** Where the five competitor icons sit, shared by Hook and Merge so the cut is seamless. */
export const useAppSlots = () => {
  const L = useLayout();
  const size = L.vertical ? 150 : 190;
  const gap = L.vertical ? 34 : 72;
  const y = L.vertical ? 1080 : 640;
  const total = size * 5 + gap * 4;
  const x0 = (L.width - total) / 2 + size / 2;
  return {
    size,
    center: { x: L.width / 2, y },
    slots: theme.assets.apps.map((src, i) => ({ src, glow: theme.assets.appGlows[i], x: x0 + i * (size + gap), y })),
  };
};

/** One app icon with its own soft glow behind it, centred on (x, y). */
export const AppIcon: React.FC<{
  src: string;
  glow: string;
  x: number;
  y: number;
  size: number;
  scale?: number;
  opacity?: number;
  blur?: number;
  rotate?: number;
  glowBoost?: number;
}> = ({ src, glow, x, y, size, scale = 1, opacity = 1, blur = 0, rotate = 0, glowBoost = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      opacity,
      transform: `scale(${scale}) rotate(${rotate}deg)`,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: -size * 0.45,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${glow}66 0%, ${glow}22 45%, transparent 70%)`,
        filter: "blur(18px)",
        transform: `scale(${glowBoost})`,
      }}
    />
    <Img
      src={staticFile(src)}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: size * 0.225,
        boxShadow: `0 ${size * 0.12}px ${size * 0.28}px -${size * 0.1}px ${glow}88`,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    />
  </div>
);
