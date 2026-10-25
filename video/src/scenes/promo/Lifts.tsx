import React from "react";
import { AbsoluteFill } from "remotion";
import { mix, useClock } from "../../clock";
import { Dumbbell, Egg } from "../../components/art";
import { Confetti } from "../../components/Confetti";
import { ExitOut } from "../../components/Exit";
import { Headline } from "../../components/Headline";
import { Scaled } from "../../components/Phone";
import { WorkoutCard } from "../../components/WorkoutCard";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const LT = T.lifts;

/** 9.5–13.3s. "Lifts, logged set by set." Each set ticks on a beat, then a PR pops. */
export const Lifts: React.FC = () => {
  const { sec, springAt, breathe } = useClock();
  const L = useLayout();
  const cardW = L.vertical ? 900 : 600;
  const k = cardW / 460;
  const cardTop = L.vertical ? 600 : 250;
  const enter = springAt(LT.card, theme.spring.smooth);
  // a small kick on every set
  const kick = LT.sets.reduce((acc, t) => acc + Math.max(0, 1 - springAt(t, theme.spring.bouncy)) * (sec >= t ? 1 : 0), 0);
  const db = springAt(LT.card + 0.2, theme.spring.bouncy);

  return (
    <ExitOut end={LT.end}>
      <AbsoluteFill>
        <div style={{ position: "absolute", top: L.headlineTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ width: L.headlineWidth }}>
            <Headline words={copy.lifts} at={LT.headline} />
          </div>
        </div>

        <Dumbbell
          style={{
            position: "absolute",
            width: L.vertical ? 300 : 360,
            left: L.vertical ? 700 : L.width / 2 + cardW / 2 + 40,
            top: (L.vertical ? 500 : 330) + breathe(2.8, 12),
            opacity: Math.min(1, db * 1.5),
            transform: `rotate(${-24 + breathe(3.6, 8) - kick * 10}deg) scale(${mix(db, 0.3, 1)})`,
            filter: "drop-shadow(0 20px 26px rgba(46,26,36,0.22))",
            zIndex: 2,
          }}
        />
        {!L.vertical && (
          <Egg
            style={{
              position: "absolute",
              width: 170,
              left: L.width / 2 - cardW / 2 - 260,
              top: 600 + breathe(3.2, 10),
              opacity: springAt(LT.card + 0.35, theme.spring.smooth),
              transform: `rotate(${-14 + breathe(4.4, 6)}deg)`,
              filter: "drop-shadow(0 16px 22px rgba(168,47,97,0.22))",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            left: (L.width - cardW) / 2,
            top: cardTop,
            opacity: Math.min(1, enter * 1.4),
            transform: `translateY(${(1 - enter) * 160}px) scale(${mix(enter, 0.92, 1) * (1 + kick * 0.012)})`,
          }}
        >
          <Scaled logical={460} width={cardW}>
            <WorkoutCard />
          </Scaled>
        </div>
        <Confetti at={LT.pr} x={(L.width - cardW) / 2 + 140 * k} y={cardTop + 430 * k} spread={L.vertical ? 380 : 340} />
      </AbsoluteFill>
    </ExitOut>
  );
};
