import React from "react";
import { AbsoluteFill } from "remotion";
import { mix, useClock } from "../../clock";
import { Heart, Peach, Strawberry } from "../../components/art";
import { ExitOut } from "../../components/Exit";
import { Headline } from "../../components/Headline";
import { NotificationList } from "../../components/NotificationList";
import { Scaled } from "../../components/Phone";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const F = T.friends;
const N = copy.notifications;

/** 13.3–17.3s. "Friends, cheering every rep." Notifications scroll like synced lyrics; the friends bounce and send hearts. */
export const Friends: React.FC = () => {
  const { sec, springAt, breathe } = useClock();
  const L = useLayout();
  const listW = L.vertical ? 980 : 1020;
  const listX = L.vertical ? (L.width - listW) / 2 : 720;
  const listY = L.vertical ? 980 : 610;
  const enter = springAt(F.list, theme.spring.smooth);
  const pals = springAt(F.list + 0.15, theme.spring.bouncy);

  // which friend is "speaking": the one on the current line bounces
  const hop = (who: string) =>
    F.lines.reduce((acc, t, i) => (N[i].who === who && sec >= t ? acc + Math.max(0, 1 - springAt(t, theme.spring.bouncy)) : acc), 0);

  const pal = L.vertical
    ? { x: L.width / 2, y: 1500, size: 210 }
    : { x: 380, y: 640, size: 250 };

  const hearts = F.lines.flatMap((t, i) =>
    [0, 1, 2].map((j) => ({ t: t + j * 0.08, side: N[i].who === "peach" ? -1 : 1, j })),
  );

  return (
    <ExitOut end={F.end}>
      <AbsoluteFill>
        <div style={{ position: "absolute", top: L.headlineTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ width: L.headlineWidth }}>
            <Headline words={copy.friends} at={F.headline} />
          </div>
        </div>

        {/* the lyric sheet, masked top and bottom */}
        <div
          style={{
            position: "absolute",
            left: listX - 40,
            top: listY - (L.vertical ? 400 : 360),
            width: listW + 80,
            height: L.vertical ? 800 : 720,
            WebkitMaskImage: "linear-gradient(transparent 0%, #000 22%, #000 78%, transparent 100%)",
            maskImage: "linear-gradient(transparent 0%, #000 22%, #000 78%, transparent 100%)",
            opacity: enter,
            transform: `translateY(${(1 - enter) * 120}px)`,
          }}
        >
          <div style={{ position: "absolute", left: 40, top: L.vertical ? 400 : 360 }}>
            <Scaled logical={760} width={listW}>
              <NotificationList />
            </Scaled>
          </div>
        </div>

        {/* peach + strawberry, the friends from the emails */}
        <div
          style={{
            position: "absolute",
            left: pal.x - pal.size * 1.1,
            top: pal.y - pal.size / 2,
            width: pal.size * 2.2,
            height: pal.size,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: pal.size * 0.06,
            opacity: Math.min(1, pals * 1.4),
            transform: `scale(${mix(pals, 0.5, 1)})`,
          }}
        >
          <Peach
            blink={Math.max(0, Math.sin(sec * 2.3) > 0.97 ? 1 : 0)}
            style={{ width: pal.size, transform: `translateY(${-hop("peach") * 50 + breathe(2.2, 4)}px) rotate(${breathe(3, 4)}deg)` }}
          />
          <Strawberry
            face
            style={{ width: pal.size * 0.86, transform: `translateY(${-hop("strawberry") * 50 + breathe(2.5, 4)}px) rotate(${-breathe(3.3, 4)}deg)` }}
          />
        </div>
        {hearts.map((h, i) => {
          const t = sec - h.t;
          if (t < 0 || t > 1.3) return null;
          const p = t / 1.3;
          return (
            <Heart
              key={i}
              style={{
                position: "absolute",
                width: 34 + h.j * 8,
                left: pal.x + h.side * pal.size * 0.5 + (h.j - 1) * 46 + Math.sin(t * 6 + h.j) * 14,
                top: pal.y - pal.size * 0.6 - p * 260,
                opacity: Math.min(1, t * 8) * (1 - p),
                transform: `scale(${mix(Math.min(1, t * 5), 0.4, 1)})`,
              }}
            />
          );
        })}
      </AbsoluteFill>
    </ExitOut>
  );
};
