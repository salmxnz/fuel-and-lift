import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { mix, useClock } from "../../clock";
import { Donut, Egg, Strawberry } from "../../components/art";
import { ExitOut } from "../../components/Exit";
import { Headline } from "../../components/Headline";
import { Phone } from "../../components/Phone";
import { TodayScreen } from "../../components/TodayScreen";
import { copy } from "../../content";
import { useLayout } from "../../layout";
import { T } from "../../timeline";
import { theme } from "../../theme";

const C = T.calories;
const { colors } = theme;

/**
 * 6.1–9.5s. "Calories, from one photo." A meal polaroid snaps in with a flash and
 * an estimate chip; the phone rises with the Today tab, the meal lands, the sun
 * fills and the macro bars grow.
 */
export const Calories: React.FC = () => {
  const { sec, springAt, breathe } = useClock();
  const L = useLayout();
  const phoneW = L.vertical ? 560 : 430;
  const phoneTop = L.vertical ? 600 : 215;
  const phoneX = L.vertical ? 440 : (L.width - phoneW) / 2;
  const rise = springAt(C.phone, theme.spring.smooth);

  const snap = springAt(C.snap, theme.spring.bouncy);
  const flash = interpolate(sec, [C.snap, C.snap + 0.05, C.snap + 0.3], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chip = springAt(C.estimate, theme.spring.bouncy);
  const polaroidW = L.vertical ? 330 : 300;
  const pol = L.vertical
    ? { x: 60, y: 820, rot: -8 }
    : { x: L.width / 2 - phoneW / 2 - polaroidW - 90, y: 400, rot: -8 };

  return (
    <ExitOut end={C.end}>
      <AbsoluteFill>
        <div style={{ position: "absolute", top: L.headlineTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ width: L.headlineWidth }}>
            <Headline words={copy.calories} at={C.headline} />
          </div>
        </div>

        {/* floating food, right of the phone */}
        <Donut
          style={{
            position: "absolute",
            width: L.vertical ? 170 : 170,
            left: L.vertical ? 150 : L.width / 2 + phoneW / 2 + 120,
            top: (L.vertical ? 1340 : 380) + breathe(3.1, 10),
            opacity: springAt(C.phone + 0.25, theme.spring.smooth),
            transform: `rotate(${sec * 12}deg) scale(${mix(springAt(C.phone + 0.25, theme.spring.bouncy), 0.4, 1)})`,
            filter: "drop-shadow(0 14px 22px rgba(168,47,97,0.25))",
          }}
        />
        {!L.vertical && (
          <Strawberry
            style={{
              position: "absolute",
              width: 120,
              left: L.width / 2 + phoneW / 2 + 300,
              top: 640 + breathe(2.7, 8),
              opacity: springAt(C.phone + 0.4, theme.spring.smooth),
              transform: `rotate(${12 + breathe(4, 6)}deg) scale(${mix(springAt(C.phone + 0.4, theme.spring.bouncy), 0.4, 1)})`,
              filter: "drop-shadow(0 14px 22px rgba(168,47,97,0.25))",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            left: phoneX,
            top: phoneTop,
            transform: `translateY(${(1 - rise) * 500}px) rotate(${(1 - rise) * 4}deg)`,
          }}
        >
          <Phone width={phoneW}>
            <TodayScreen />
          </Phone>
        </div>

        {/* the photo */}
        <div
          style={{
            position: "absolute",
            left: pol.x,
            top: pol.y + breathe(3.4, 6),
            width: polaroidW,
            opacity: Math.min(1, snap * 1.5),
            transform: `translateY(${(1 - snap) * -120}px) rotate(${pol.rot + (1 - snap) * -16}deg) scale(${mix(snap, 1.25, 1)})`,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: polaroidW * 0.07,
              paddingBottom: polaroidW * 0.2,
              boxShadow: "0 30px 50px -18px rgba(168,47,97,0.45)",
              position: "relative",
            }}
          >
            <div
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                background: colors.pinkSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Egg style={{ width: "72%", transform: `scale(${1 + (sec - C.snap) * 0.02})` }} />
            </div>
            <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: "#fff", opacity: flash }} />
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: -26,
              transform: `translateX(-50%) translateY(${(1 - chip) * 24}px) scale(${mix(chip, 0.6, 1)})`,
              opacity: Math.min(1, chip * 1.5),
              background: colors.ink,
              color: "#fff",
              borderRadius: 999,
              padding: "14px 24px",
              whiteSpace: "nowrap",
              fontSize: L.vertical ? 26 : 24,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              boxShadow: "0 14px 30px -12px rgba(46,26,36,0.5)",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span style={{ color: colors.pink }}>●</span>
            {copy.today.estimate} · {copy.today.meal.kcal} kcal
          </div>
        </div>
      </AbsoluteFill>
    </ExitOut>
  );
};
