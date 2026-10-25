import { useVideoConfig } from "remotion";

/**
 * One set of scenes, two formats. 16:9 lays the visual out in a row under the
 * headline; 9:16 stacks it and keeps the bottom 300px clear for platform UI.
 * `u` scales sizes designed at 1080 short-side so both formats feel the same.
 */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return {
    width,
    height,
    vertical,
    u: Math.min(width, height) / 1080,
    // headline baseline area
    headlineTop: vertical ? 300 : 96,
    headlineSize: vertical ? 104 : 108,
    headlineWidth: vertical ? 960 : 1760,
    safeBottom: vertical ? 300 : 0,
  };
};
