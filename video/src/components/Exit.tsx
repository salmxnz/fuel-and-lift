import React from "react";
import { AbsoluteFill } from "remotion";
import { useClock } from "../clock";

/** Scene wrapper: at `end` the whole scene pushes forward, blurs and fades (fast, ~0.22s). */
export const ExitOut: React.FC<{ end: number; children: React.ReactNode; dur?: number }> = ({ end, children, dur = 0.22 }) => {
  const { exit } = useClock();
  const out = 1 - exit(end, dur);
  return (
    <AbsoluteFill
      style={{
        opacity: 1 - out,
        transform: `scale(${1 + out * 0.06})`,
        filter: out > 0.01 ? `blur(${out * 8}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
