import React from "react";
import { useClock } from "../clock";
import { copy } from "../content";
import { T } from "../timeline";
import { theme } from "../theme";
import { Peach, Strawberry } from "./art";
import { AppTile } from "./Logo";

const { colors, type } = theme;
const F = T.friends;
const N = copy.notifications;

export const PITCH = 150; // logical px between cards

/** Continuous list position: card 0 is lit on entry, then one step per beat (0, 1, 2…). */
export const useListPos = () => {
  const { ramp } = useClock();
  return F.lines.slice(1).reduce((acc, t) => acc + ramp(t - 0.05, t + 0.32, theme.ease.inOut), 0);
};

const Avatar: React.FC<{ who: string }> = ({ who }) =>
  who === "me" ? (
    <AppTile size={72} />
  ) : (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 999,
        background: who === "peach" ? "#FDEBDD" : colors.pinkSoft,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {who === "peach" ? <Peach style={{ width: 56, marginTop: 6 }} /> : <Strawberry face style={{ width: 46, marginTop: 4 }} />}
    </div>
  );

/**
 * Friend notifications as a lyric sheet (the "synced syllable by syllable"
 * reference): the list scrolls one line per beat, the current card is bright and
 * full size, the rest sit back, dimmed. Drawn at 760 px wide, centred on y = 0.
 */
export const NotificationList: React.FC = () => {
  const pos = useListPos();
  return (
    <div style={{ position: "relative", width: 760, height: 0, fontFamily: type.family }}>
      {N.map((n, i) => {
        const d = i - pos;
        const active = Math.max(0, 1 - Math.abs(d));
        const fade = Math.max(0, 1 - Math.max(0, Math.abs(d) - 1.6) / 0.9);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              width: 760,
              top: d * PITCH - 62,
              opacity: (0.34 + 0.66 * active) * fade,
              transform: `scale(${0.9 + 0.1 * active})`,
              transformOrigin: "left center",
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 24px",
              borderRadius: 30,
              background: `rgba(255,255,255,${0.45 + 0.5 * active})`,
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: active > 0.05 ? `0 24px 50px -24px rgba(168,47,97,${0.45 * active})` : undefined,
            }}
          >
            <Avatar who={n.who} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.muted, display: "flex", justifyContent: "space-between" }}>
                <span>adebite</span>
                <span>now</span>
              </div>
              <div
                style={{
                  fontSize: 29,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: active > 0.5 ? colors.ink : colors.inkSoft,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {n.title}
              </div>
              <div style={{ fontSize: 21, fontWeight: 500, color: colors.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
