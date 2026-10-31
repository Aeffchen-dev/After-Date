import React, { useMemo } from "react";

/**
 * Real 3D vector recreation of the page background graphic:
 * a helix of extruded slabs, projected with a perspective camera and
 * painter-sorted per face, with light-direction shading.
 */
const W = 1021;
const H = 1920;

const DARK = "#201C1D";
const PINK = "#F39FFF";
const BLUE = "#4E6BEE";
const ORANGE = "#FF4A0C";

// --- 3D helpers -------------------------------------------------------------
type V3 = [number, number, number];

const SLAB_COUNT = 24;
const LEN = 380; // half length along local X
const THICK = 150; // half thickness along local Z
const HEIGHT = 30; // half height along Y

const SCALE = 1.0; // orthographic scale
const PITCH = 0.46; // camera tilt (radians) so slab tops stay visible
const CX = 700; // screen center x
const CY = H / 2;

const CP = Math.cos(PITCH);
const SP = Math.sin(PITCH);

// Orthographic camera with a fixed downward tilt (matches the reference art).
function project([x, y, z]: V3): [number, number, number] {
  const ys = y * CP - z * SP;
  const depth = y * SP + z * CP;
  return [CX + x * SCALE, CY + ys * SCALE, depth];
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(Math.min(255, ((n >> 16) & 255) * k));
  const g = Math.round(Math.min(255, ((n >> 8) & 255) * k));
  const b = Math.round(Math.min(255, (n & 255) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type Face = { pts: string; fill: string; depth: number };

function buildFaces(phase: number): Face[] {
  const faces: Face[] = [];
  const spanY = 3800;

  for (let i = 0; i < SLAB_COUNT; i++) {
    const t = i / (SLAB_COUNT - 1);
    const a = -0.28 + i * 0.30 + phase;
    const cy = -spanY / 2 + t * spanY;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    // local -> world (rotate around Y axis, translate on Y)
    const p = (lx: number, ly: number, lz: number): V3 => [
      lx * cos + lz * sin,
      cy + ly,
      -lx * sin + lz * cos,
    ];

    const v: V3[] = [
      p(-LEN, -HEIGHT, -THICK), // 0
      p(LEN, -HEIGHT, -THICK), // 1
      p(LEN, -HEIGHT, THICK), // 2
      p(-LEN, -HEIGHT, THICK), // 3
      p(-LEN, HEIGHT, -THICK), // 4
      p(LEN, HEIGHT, -THICK), // 5
      p(LEN, HEIGHT, THICK), // 6
      p(-LEN, HEIGHT, THICK), // 7
    ];

    const base = t < 0.5 ? PINK : BLUE;

    const quads: { idx: number[]; color: string; lit: number }[] = [
      { idx: [0, 1, 2, 3], color: base, lit: 1.0 }, // top
      { idx: [4, 5, 6, 7], color: base, lit: 0.45 }, // bottom
      { idx: [3, 2, 6, 7], color: ORANGE, lit: 0.95 }, // front side
      { idx: [1, 0, 4, 5], color: ORANGE, lit: 0.6 }, // back side
      { idx: [0, 3, 7, 4], color: ORANGE, lit: 0.75 }, // left cap
      { idx: [2, 1, 5, 6], color: ORANGE, lit: 0.85 }, // right cap
    ];

    for (const q of quads) {
      const proj = q.idx.map((k) => project(v[k]));
      const depth = proj.reduce((s, pt) => s + pt[2], 0) / proj.length;
      // subtle directional light based on face normal orientation
      const light = 1;
      faces.push({
        pts: proj.map((pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" "),
        fill: shade(q.color, light),
        depth,
      });
    }
  }

  return faces.sort((a, b) => b.depth - a.depth);
}

export default function BgVector({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [phase, setPhase] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setPhase((p) => (p + dt * 0.00012) % (Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const faces = useMemo(() => buildFaces(phase), [phase]);

  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={W} height={H} fill={DARK} />
      {faces.map((f, i) => (
        <polygon key={i} points={f.pts} fill={f.fill} shapeRendering="geometricPrecision" />
      ))}
    </svg>
  );
}
