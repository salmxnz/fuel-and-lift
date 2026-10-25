// Drawn illustrations ported from web/components/landing/art.tsx (same shapes and
// palette as the landing page and emails), minus Tailwind. Plus the cloud helpers
// from web/lib/clouds.ts.
import React, { useId } from "react";
import { theme } from "../theme";

type ArtProps = { style?: React.CSSProperties };
const { colors } = theme;
const PINK = colors.pink;
const ROSE = colors.rose;
const CARBS = colors.carbs;
const FAT = colors.fat;
const INK = colors.ink;

export const SYMBOL =
  "M123.85 38.1A28 28 0 0 1 86.13 63.93A28 28 0 0 1 48.07 89.23A88 88 0 0 0 168 204.38L168 212L216 212L216 40L168 40L168 47.62A88 88 0 0 0 123.85 38.1ZM167.95 127.96A40 40 0 1 1 88.05 124.04A40 40 0 1 1 167.95 127.96Z";

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A scalloped cloud bank: half-circles on a baseline, filled to the bottom. */
export function bankPath({
  width,
  height,
  baseline,
  rMin,
  rMax,
  seed,
  overhang = 200,
}: {
  width: number;
  height: number;
  baseline: number;
  rMin: number;
  rMax: number;
  seed: number;
  overhang?: number;
}) {
  const rand = seeded(seed);
  let x = -overhang;
  let d = `M${x} ${height} L${x} ${baseline}`;
  while (x < width + overhang) {
    const r = rMin + rand() * (rMax - rMin);
    const ny = baseline + (rand() - 0.5) * rMin * 0.5;
    d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(x + r * 2).toFixed(1)} ${ny.toFixed(1)}`;
    x += r * 2;
  }
  d += ` L${x} ${height} Z`;
  return d;
}

export const Symbol: React.FC<ArtProps & { fill?: string }> = ({ style, fill = PINK }) => (
  <svg viewBox="40 30 184 190" style={style}>
    <path fill={fill} fillRule="evenodd" d={SYMBOL} />
  </svg>
);

export const Sparkle: React.FC<ArtProps & { fill?: string }> = ({ style, fill = "#fff" }) => (
  <svg viewBox="0 0 24 24" style={style}>
    <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill={fill} />
  </svg>
);

/** A puffy cloud: big round head on one side, a wispy tail on the other. */
export const CloudPuff: React.FC<ArtProps & { seed?: number; flip?: boolean }> = ({ style, seed = 3, flip }) => {
  const rand = seeded(seed);
  const puffs: { x: number; y: number; r: number }[] = [];
  let x = 90;
  let r = 78;
  while (r > 14) {
    puffs.push({ x: r2(x), y: r2(120 - r * 0.55 + rand() * 10), r: r2(r) });
    x += r * (0.95 + rand() * 0.35);
    r *= 0.72 + rand() * 0.1;
  }
  puffs.push({ x: 40, y: 128, r: 46 });
  puffs.push({ x: 150, y: 70, r: 60 });
  return (
    <svg viewBox="-20 -20 520 200" style={{ ...style, transform: `${style?.transform ?? ""} ${flip ? "scaleX(-1)" : ""}` }}>
      <g fill={colors.cloudShadow}>
        {puffs.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y + 9} r={p.r} />
        ))}
      </g>
      <g fill={colors.cloudFace}>
        {puffs.map((p, i) => (
          <circle key={`c${i}`} cx={p.x} cy={p.y} r={p.r} />
        ))}
      </g>
      <g fill="#fff" opacity="0.85">
        <ellipse cx="120" cy="58" rx="46" ry="18" />
        <ellipse cx="62" cy="96" rx="22" ry="10" />
      </g>
    </svg>
  );
};

export const Egg: React.FC<ArtProps> = ({ style }) => (
  <svg viewBox="0 0 120 110" style={style}>
    <path
      d="M60 6c16 0 22 10 34 13 14 3 23 15 19 29 7 12 3 28-11 34-6 14-22 22-38 18-14 6-32 0-38-14C10 81 2 66 10 52 4 38 12 22 28 18 35 10 46 6 60 6z"
      fill="#fff"
    />
    <circle cx="62" cy="54" r="21" fill={FAT} />
    <circle cx="62" cy="54" r="15" fill="#F0A274" />
    <ellipse cx="55" cy="47" rx="6" ry="4.5" fill="#FADCC4" transform="rotate(-30 55 47)" />
  </svg>
);

export const Strawberry: React.FC<ArtProps & { face?: boolean; blink?: number }> = ({ style, face, blink = 0 }) => {
  const seeds = [
    [34, 52], [50, 48], [66, 52], [28, 68], [44, 66], [60, 66], [74, 68], [38, 84], [54, 84], [68, 82], [48, 100],
  ];
  return (
    <svg viewBox="0 0 100 124" style={style}>
      <path d="M50 30c24 0 44 8 44 31 0 27-24 53-44 59C30 114 6 88 6 61 6 38 26 30 50 30z" fill={CARBS} />
      <path d="M78 40c12 6 16 14 16 21 0 27-24 53-44 59 18-12 34-36 34-58 0-9-2-16-6-22z" fill="#E77AA0" />
      {face ? (
        <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d={`M30 66q6 ${6 - blink * 6} 12 0`} />
          <path d={`M58 66q6 ${6 - blink * 6} 12 0`} />
          <path d="M42 80q8 8 16 0" />
        </g>
      ) : (
        seeds.map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="2.4" ry="3.6" fill="#FFE6EE" />)
      )}
      {face ? (
        <>
          <ellipse cx="26" cy="78" rx="7" ry="4.5" fill="#F7A8C2" />
          <ellipse cx="74" cy="78" rx="7" ry="4.5" fill="#F7A8C2" />
        </>
      ) : null}
      <path
        d="M50 34c-6-9-18-14-30-10 9 3 15 7 17 13-11-2-20 2-24 9 13-2 24-1 32-5 9 4 20 5 34 3-4-7-13-11-24-9 2-6 8-10 17-13-12-4-25 1-30 10z"
        fill={ROSE}
      />
      <rect x="47" y="14" width="6" height="16" rx="3" fill={ROSE} />
    </svg>
  );
};

export const Donut: React.FC<ArtProps> = ({ style }) => {
  const id = useId().replace(/:/g, "");
  const rand = seeded(11);
  const sprinkles = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const rr = 22 + rand() * 10;
    return { x: r2(50 + Math.cos(a) * rr), y: r2(50 + Math.sin(a) * rr), rot: r2(rand() * 180), c: [INK, "#fff", ROSE, FAT][i % 4] };
  });
  return (
    <svg viewBox="0 0 100 100" style={style}>
      <defs>
        <mask id={`${id}hole`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="50" cy="50" r="12" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${id}hole)`}>
        <circle cx="50" cy="52" r="46" fill="#E9A47C" />
        <circle cx="50" cy="50" r="46" fill={FAT} />
        <g fill="#F7A8C2">
          <circle cx="50" cy="50" r="36" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={r2(50 + Math.cos(a) * 36)} cy={r2(50 + Math.sin(a) * 36 + 2)} r="6.5" />;
          })}
        </g>
        {sprinkles.map((s, i) => (
          <rect key={i} x={r2(s.x - 1.6)} y={r2(s.y - 4.5)} width="3.2" height="9" rx="1.6" fill={s.c} transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
        ))}
      </g>
    </svg>
  );
};

export const Dumbbell: React.FC<ArtProps> = ({ style }) => (
  <svg viewBox="0 0 150 64" style={style}>
    <rect x="22" y="28" width="106" height="8" rx="4" fill={ROSE} />
    <rect x="14" y="10" width="16" height="44" rx="6" fill={INK} />
    <rect x="31" y="15" width="11" height="34" rx="5" fill={INK} />
    <rect x="120" y="10" width="16" height="44" rx="6" fill={INK} />
    <rect x="108" y="15" width="11" height="34" rx="5" fill={INK} />
    <rect x="17" y="14" width="4" height="14" rx="2" fill="#fff" opacity="0.25" />
    <rect x="123" y="14" width="4" height="14" rx="2" fill="#fff" opacity="0.25" />
  </svg>
);

export const Peach: React.FC<ArtProps & { blink?: number }> = ({ style, blink = 0 }) => (
  <svg viewBox="0 0 120 124" style={style}>
    <circle cx="60" cy="70" r="50" fill={FAT} />
    <path d="M60 22c-4 18-2 40 6 60" stroke="#E79E74" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
    <ellipse cx="34" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
    <ellipse cx="86" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
    <g stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none">
      <path d={`M34 70q7 ${7 - blink * 7} 14 0`} />
      <path d={`M72 70q7 ${7 - blink * 7} 14 0`} />
      <path d="M52 84q8 8 16 0" />
    </g>
    <path d="M62 22c6-12 20-16 30-12-6 10-18 14-30 12z" fill={ROSE} />
  </svg>
);

export const Heart: React.FC<ArtProps & { fill?: string }> = ({ style, fill = colors.berry }) => (
  <svg viewBox="0 0 100 92" style={style}>
    <path d="M50 88C20 66 4 50 4 30 4 15 16 4 30 4c9 0 16 5 20 12 4-7 11-12 20-12 14 0 26 11 26 26 0 20-16 36-46 58z" fill={fill} />
    <ellipse cx="28" cy="24" rx="8" ry="5" fill="#fff" opacity="0.35" transform="rotate(-30 28 24)" />
  </svg>
);

/** The rosette from the "Pro is yours" email: scalloped seal, ribbons, the mark. */
export const Rosette: React.FC<ArtProps> = ({ style }) => {
  const bumps = 18;
  return (
    <svg viewBox="0 0 240 280" style={style}>
      <path d="M86 170l-22 96 26-16 18 24 16-90z" fill={colors.berry} />
      <path d="M154 170l22 96-26-16-18 24-16-90z" fill={ROSE} />
      <g fill={PINK}>
        <circle cx="120" cy="120" r="92" />
        {Array.from({ length: bumps }, (_, i) => {
          const a = (i / bumps) * Math.PI * 2;
          return <circle key={i} cx={r2(120 + Math.cos(a) * 92)} cy={r2(120 + Math.sin(a) * 92)} r="17" />;
        })}
      </g>
      <circle cx="120" cy="120" r="78" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" />
      <circle cx="120" cy="120" r="64" fill={colors.cloudFace} />
      <path fill="#fff" fillRule="evenodd" d={SYMBOL} transform="translate(58 61.3) scale(0.47)" />
    </svg>
  );
};

/** A friend coin: the white mark on a pink disc. */
export const Coin: React.FC<ArtProps> = ({ style }) => (
  <svg viewBox="0 0 48 48" style={style}>
    <circle cx="24" cy="24" r="24" fill={PINK} />
    <path fill="#fff" fillRule="evenodd" d={SYMBOL} transform="translate(1.56 2.75) scale(0.17)" />
  </svg>
);
