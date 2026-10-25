import React, { createContext, useContext } from "react";
import {
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";

// Scenes are timed in GLOBAL seconds (the VO timeline), so beats can be written
// straight from the transcript. <Scene> wraps a Sequence and tells its children
// where it starts; useClock() turns the local frame back into global seconds.
const Offset = createContext(0);

export const Scene: React.FC<{
  start: number;
  end: number;
  children: React.ReactNode;
}> = ({ start, end, children }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence
      from={Math.round(start * fps)}
      durationInFrames={Math.round((end - start) * fps)}
    >
      <Offset.Provider value={start}>{children}</Offset.Provider>
    </Sequence>
  );
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const useClock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const offset = useContext(Offset);
  const sec = frame / fps + offset;

  /** 0→1 over [a, b] seconds with the entrance ease (or a custom one). */
  const ramp = (a: number, b: number, easing = theme.ease.out) =>
    interpolate(sec, [a, b], [0, 1], { easing, ...clamp });

  /** spring that starts at `at` seconds. */
  const springAt = (
    at: number,
    config: { damping: number; stiffness: number; mass: number } = theme.spring
      .smooth,
  ) => spring({ frame: (sec - at) * fps, fps, config });

  /** 1 → 0 over a short exit window ending at `end`. */
  const exit = (end: number, dur = 0.33) =>
    1 - interpolate(sec, [end - dur, end], [0, 1], { easing: theme.ease.in, ...clamp });

  /** idle micro-motion */
  const breathe = (period = 3.2, amp = 1) => Math.sin((sec / period) * Math.PI * 2) * amp;

  return { sec, frame, fps, ramp, springAt, exit, breathe };
};

export const mix = (p: number, from: number, to: number) => from + (to - from) * p;
