import React from "react";
import { AbsoluteFill, interpolateColors } from "remotion";
import { mix, useClock } from "../../clock";
import { Coin, Rosette } from "../../components/art";
import { Confetti } from "../../components/Confetti";
import { ExitOut } from "../../components/Exit";
import { Headline, toneColor } from "../../components/Headline";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const P = T.pro;
const { colors, type } = theme;

/**
 * 17.3–21.3s. Stacked lines light up one at a time ("Free. / No ads. / No
 * subscriptions." reference): the current line is ink, earlier ones fall back to
 * dim. Beside them the plum referral card fills 8 coins and the Pro rosette pops.
 */
export const Pro: React.FC = () => {
  const { sec, springAt, ramp, breathe } = useClock();
  const L = useLayout();
  const size = L.vertical ? 100 : 104;
  const linesX = L.vertical ? 80 : 140;
  const linesY = L.vertical ? 300 : 290;
  const linesW = L.vertical ? 920 : 1040;

  const cardW = L.vertical ? 880 : 600;
  const cardX = L.vertical ? (L.width - cardW) / 2 : 1200;
  const cardY = L.vertical ? 1190 : 440;
  const card = springAt(P.start + 0.1, theme.spring.smooth);

  const joined = Array.from({ length: 8 }, (_, i) => P.coins + i * P.coinStep).filter((t) => sec >= t).length;
  const ros = springAt(P.rosette, theme.spring.bouncy);
  const rosSize = L.vertical ? 360 : 300;
  const rosX = cardX + cardW / 2;
  const rosY = cardY + 40; // ribbons tuck behind the card's top edge
  const slots = L.vertical ? 8 : 4;
  const coin = L.vertical ? 84 : 92;

  return (
    <ExitOut end={P.end}>
      <AbsoluteFill>
        <div style={{ position: "absolute", left: linesX, top: linesY, width: linesW, display: "flex", flexDirection: "column", gap: size * 0.12 }}>
          {copy.pro.map((words, li) => {
            const next = P.lines[li + 1];
            const dimmed = next === undefined ? 0 : ramp(next - 0.05, next + 0.25, theme.ease.out);
            if (sec < P.lines[li] - 0.05) return <div key={li} style={{ height: size * 0.92 }} />;
            return (
              <Headline
                key={li}
                words={words}
                at={P.lines[li]}
                size={size}
                align="left"
                stagger={0.045}
                colorOf={(_, w) => interpolateColors(dimmed, [0, 1], [toneColor(w.tone), colors.dim])}
              />
            );
          })}
        </div>

        {/* the rosette */}
        <div
          style={{
            position: "absolute",
            left: rosX - rosSize / 2,
            top: rosY - rosSize * 1.167,
            width: rosSize,
            opacity: Math.min(1, ros * 1.6),
            transform: `scale(${mix(ros, 0.2, 1) * (1 + breathe(2.6, 0.02))}) rotate(${(1 - ros) * -40 + breathe(3.4, 3)}deg)`,
            filter: "drop-shadow(0 26px 30px rgba(168,47,97,0.35))",
          }}
        >
          <Rosette style={{ width: rosSize }} />
        </div>
        {/* plum referral card */}
        <div
          style={{
            position: "absolute",
            left: cardX,
            top: cardY,
            width: cardW,
            padding: L.vertical ? "48px 44px 40px" : "44px 40px 36px",
            borderRadius: 36,
            background: `linear-gradient(160deg, ${colors.night2} 0%, ${colors.night} 70%)`,
            boxShadow: "0 50px 90px -40px rgba(46,26,36,0.7)",
            fontFamily: type.family,
            color: "#fff",
            opacity: Math.min(1, card * 1.4),
            transform: `translateY(${(1 - card) * 140}px) scale(${mix(card, 0.94, 1)})`,
          }}
        >
          <div style={{ fontSize: L.vertical ? 34 : 30, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center" }}>
            8 friends join, Pro is yours forever
          </div>
          <div style={{ fontSize: L.vertical ? 22 : 19, color: colors.nightMuted, textAlign: "center", marginTop: 8 }}>
            A friend counts once they finish setting up.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${slots}, ${coin}px)`,
              justifyContent: "center",
              gap: L.vertical ? 18 : 22,
              marginTop: 30,
            }}
          >
            {Array.from({ length: 8 }, (_, i) => {
              const p = springAt(P.coins + i * P.coinStep, theme.spring.bouncy);
              return (
                <div
                  key={i}
                  style={{
                    width: coin,
                    height: coin,
                    borderRadius: 999,
                    border: `2.5px dashed ${colors.nightLine}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    color: colors.nightMuted,
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                  <Coin
                    style={{
                      position: "absolute",
                      inset: -3,
                      width: coin + 6,
                      opacity: Math.min(1, p * 2),
                      transform: `scale(${mix(p, 0.2, 1)}) rotate(${(1 - p) * -90}deg)`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, fontSize: L.vertical ? 28 : 24, fontWeight: 800 }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {joined} of 8 {copy.referral.label}
            </span>
            <span
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: colors.pink,
                color: colors.ink,
                fontSize: L.vertical ? 22 : 19,
                opacity: Math.min(1, ros * 1.5),
                transform: `scale(${mix(ros, 0.4, 1)})`,
              }}
            >
              {copy.referral.pro}
            </span>
          </div>
        </div>

        <Confetti at={P.rosette} x={rosX} y={rosY - rosSize * 0.6} spread={L.vertical ? 520 : 460} />
      </AbsoluteFill>
    </ExitOut>
  );
};
