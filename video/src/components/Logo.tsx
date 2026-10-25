import React from "react";
import { Img, staticFile } from "remotion";
import { theme } from "../theme";

/** The lockup, always from the SVG master (the wordmark is drawn, never typed). */
export const Lockup: React.FC<{ width: number; white?: boolean; style?: React.CSSProperties }> = ({
  width,
  white,
  style,
}) => (
  <Img
    src={staticFile(white ? theme.assets.lockupWhite : theme.assets.lockup)}
    style={{ width, height: (width * 256) / 806, display: "block", ...style }}
  />
);

/** The app icon: white symbol on a pink rounded tile. */
export const AppTile: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img src={staticFile(theme.assets.icon)} style={{ width: size, height: size, display: "block", ...style }} />
);

/** The wordmark alone (plum), for under the app tile. */
export const Wordmark: React.FC<{ width: number; style?: React.CSSProperties }> = ({ width, style }) => (
  <Img
    src={staticFile(theme.assets.wordmark)}
    style={{ width, height: (width * 210) / 854, display: "block", ...style }}
  />
);
