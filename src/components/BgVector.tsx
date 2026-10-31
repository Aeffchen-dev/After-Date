import React, { useMemo } from "react";

/**
 * Page background graphic: two strands of extruded slabs winding around each
 * other like a double helix, tied by rungs. Projected with a tilted orthographic
 * camera and painter-sorted per face, in the deck's pink / blue / orange slab style.
 */
const W = 1021;
const H = 1920;

const DARK = "#201C1D";
const PINK = "#F39FFF";
const BLUE = "#4E6BEE";
const ORANGE = "#FF4A0C";

// --- 3D helpers -------------------------------------------------------------
type V3 = [number, number, number];

const STEPS = 22; // slabs per strand
const RADIUS = 260; // distance of each strand from the helix axis
const TWIST = 0.42; // turn between neighbouring steps (radians)
const SPAN_Y = 3800; // height the helix covers
const SLAB: V3 = [150, 26, 95]; // half length (along the strand), height, depth
const RUNG_EVERY = 2; // a rung joins the strands on every second step
const RUNG_H = 12; // half height of a rung
const RUNG_D = 34; // half depth of a rung

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

type Face = { pts: string; fill: string; depth: number };

/** Six faces of a box centred on `c`, turned by `yaw` around the vertical axis. */
function boxFaces(c: V3, half: V3, yaw: number, top: string): Face[] {
  const [hx, hy, hz] = half;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const p = (lx: number, ly: number, lz: number): V3 => [
    c[0] + lx * cos + lz * sin,
    c[1] + ly,
    c[2] - lx * sin + lz * cos,
  ];
  const v: V3[] = [
    p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz),
    p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(-hx, hy, hz),
  ];
  const quads: { idx: number[]; color: string }[] = [
    { idx: [0, 1, 2, 3], color: top }, // top
    { idx: [4, 5, 6, 7], color: top }, // bottom
    { idx: [3, 2, 6, 7], color: ORANGE }, // front side
    { idx: [1, 0, 4, 5], color: ORANGE }, // back side
    { idx: [0, 3, 7, 4], color: ORANGE }, // left cap
    { idx: [2, 1, 5, 6], color: ORANGE }, // right cap
  ];
  return quads.map((q) => {
    const proj = q.idx.map((k) => project(v[k]));
    return {
      pts: proj.map((pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" "),
      fill: q.color,
      depth: proj.reduce((sum, pt) => sum + pt[2], 0) / proj.length,
    };
  });
}

function buildFaces(phase: number): Face[] {
  const faces: Face[] = [];
  for (let i = 0; i < STEPS; i++) {
    const y = -SPAN_Y / 2 + (i / (STEPS - 1)) * SPAN_Y;
    const a = i * TWIST + phase;
    // One strand pink, the other blue, half a turn apart.
    const ends: V3[] = [0, 1].map((s) => {
      const ang = a + s * Math.PI;
      return [Math.cos(ang) * RADIUS, y, Math.sin(ang) * RADIUS] as V3;
    });
    // Each slab lies along its strand's path: tangent to the circle it travels.
    faces.push(...boxFaces(ends[0], SLAB, -a - Math.PI / 2, PINK));
    faces.push(...boxFaces(ends[1], SLAB, -a - Math.PI / 2, BLUE));
    if (i % RUNG_EVERY === 0) {
      faces.push(...boxFaces([0, y, 0], [RADIUS - SLAB[2], RUNG_H, RUNG_D], -a, ORANGE));
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
