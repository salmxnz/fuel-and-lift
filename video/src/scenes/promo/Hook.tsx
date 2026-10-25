import React from "react";
import { AbsoluteFill } from "remotion";
import { useClock } from "../../clock";
import { AppIcon, useAppSlots } from "../../components/AppIcons";
import { Headline } from "../../components/Headline";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const H = T.hook;

/** 0–3.1s. "Why do you have 5 fitness apps?" One app lands on each kick and the number counts up. */
export const Hook: React.FC = () => {
  const { sec, springAt, breathe } = useClock();
  const L = useLayout();
  const { size, slots } = useAppSlots();
  const landed = H.icons.filter((t) => sec >= t).length;
  const bump = landed > 0 ? 1 - springAt(H.icons[landed - 1], theme.spring.bouncy) : 0;
  const words = [...copy.hook.before, { text: "5", tone: "rose" as const }, ...copy.hook.after];

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: L.vertical ? 560 : 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: L.vertical ? L.headlineWidth : 1760 }}>
          <Headline
            words={words}
            at={H.headline}
            exitAt={T.merge.drop + 0.06}
          />
        </div>
      </div>
      {sec < T.merge.drop &&
        slots.map((s, i) => {
          const p = springAt(H.icons[i], theme.spring.bouncy);
          if (p <= 0.001) return null;
          return (
            <AppIcon
              key={s.src}
              {...s}
              size={size}
              y={s.y + (1 - p) * 70 + breathe(2.6 + i * 0.3, 6)}
              scale={0.4 + p * 0.6 + (i === landed - 1 ? bump * 0.06 : 0)}
              opacity={Math.min(1, p * 1.5)}
              rotate={(1 - p) * (i % 2 ? 10 : -10)}
            />
          );
        })}
    </AbsoluteFill>
  );
};
