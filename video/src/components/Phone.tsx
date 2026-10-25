import React from "react";
import { theme } from "../theme";

const { colors, radius, shadow } = theme;

/** Draws children at a fixed logical width and scales them to `width` px. */
export const Scaled: React.FC<{
  logical: number;
  width: number;
  height?: number; // logical height; defaults to auto
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ logical, width, height, children, style }) => {
  const k = width / logical;
  return (
    <div style={{ width, height: height ? height * k : undefined, position: "relative", ...style }}>
      <div
        style={{
          width: logical,
          height,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
          position: height ? "absolute" : "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const SCREEN_W = 390;
export const SCREEN_H = 844;

/** A plum-bezel phone. The screen content is laid out at 390×844 logical px. */
export const Phone: React.FC<{ width: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  width,
  children,
  style,
}) => {
  const pad = width * 0.032;
  const inner = width - pad * 2;
  const k = inner / SCREEN_W;
  return (
    <div
      style={{
        width,
        height: SCREEN_H * k + pad * 2,
        padding: pad,
        borderRadius: radius.phone * (width / 460),
        background: colors.ink,
        boxShadow: `${shadow.phone}, inset 0 0 0 ${width * 0.006}px #553646`,
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          width: inner,
          height: SCREEN_H * k,
          borderRadius: (radius.phone - 12) * (width / 460),
          overflow: "hidden",
          position: "relative",
          background: colors.ground,
        }}
      >
        <Scaled logical={SCREEN_W} width={inner} height={SCREEN_H}>
          {children}
        </Scaled>
        {/* dynamic island */}
        <div
          style={{
            position: "absolute",
            top: 11 * k,
            left: "50%",
            width: 112 * k,
            height: 32 * k,
            marginLeft: -56 * k,
            borderRadius: 999,
            background: "#120A0E",
          }}
        />
      </div>
    </div>
  );
};

/** iOS status bar, ink on light screens. */
export const StatusBar: React.FC = () => (
  <div
    style={{
      height: 50,
      padding: "17px 30px 0 34px",
      display: "flex",
      justifyContent: "space-between",
      fontSize: 16,
      fontWeight: 700,
      color: colors.ink,
      letterSpacing: "-0.01em",
    }}
  >
    <span>9:41</span>
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {[5, 7, 9, 11].map((h) => (
          <span key={h} style={{ width: 3, height: h, borderRadius: 1, background: colors.ink }} />
        ))}
      </span>
      <span
        style={{
          width: 24,
          height: 11,
          borderRadius: 3,
          border: `1.5px solid ${colors.ink}`,
          padding: 1.5,
          display: "flex",
        }}
      >
        <span style={{ flex: 1, background: colors.ink, borderRadius: 1.5 }} />
      </span>
    </span>
  </div>
);
