import React from "react";
import { Composition } from "remotion";
import { FPS } from "./theme";
import { T } from "./timeline";
import { Promo } from "./scenes/Promo";
import { ThemeCheck } from "./scenes/ThemeCheck";

const frames = Math.round(T.total * FPS);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="AdebitePromo" component={Promo} durationInFrames={frames} fps={FPS} width={1920} height={1080} />
    <Composition id="AdebitePromoVertical" component={Promo} durationInFrames={frames} fps={FPS} width={1080} height={1920} />
    <Composition id="ThemeCheck" component={ThemeCheck} durationInFrames={3 * FPS} fps={FPS} width={1920} height={1080} />
  </>
);
