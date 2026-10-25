import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useVideoConfig } from "remotion";
import { Scene } from "../clock";
import { Backdrop, Finish } from "../components/Backdrop";
import { T } from "../timeline";
import { theme } from "../theme";
import { Hook } from "./promo/Hook";
import { Merge } from "./promo/Merge";
import { Calories } from "./promo/Calories";
import { Lifts } from "./promo/Lifts";
import { Friends } from "./promo/Friends";
import { Pro } from "./promo/Pro";
import { Close } from "./promo/Close";

/**
 * The adebite promo, cut to the song (24.53s). Same scenes in 16:9 and 9:16;
 * each scene reads useLayout() for its arrangement.
 */
export const Promo: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ fontFamily: theme.type.family }}>
      <Backdrop />
      <Scene start={T.hook.start} end={T.hook.end}>
        <Hook />
      </Scene>
      <Scene start={T.merge.start} end={T.merge.end}>
        <Merge />
      </Scene>
      <Scene start={T.calories.start} end={T.calories.end}>
        <Calories />
      </Scene>
      <Scene start={T.lifts.start} end={T.lifts.end}>
        <Lifts />
      </Scene>
      <Scene start={T.friends.start} end={T.friends.end}>
        <Friends />
      </Scene>
      <Scene start={T.pro.start} end={T.pro.end}>
        <Pro />
      </Scene>
      <Scene start={T.close.start} end={T.close.end}>
        <Close />
      </Scene>
      <Finish />
      <Audio
        src={staticFile(theme.assets.song)}
        volume={(f) =>
          interpolate(f / fps, [T.total - 0.6, T.total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        }
      />
    </AbsoluteFill>
  );
};
