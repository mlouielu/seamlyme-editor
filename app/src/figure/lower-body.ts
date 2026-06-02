/**
 * Lower-body outline renderer — waist to ankle.
 *
 * Two separate shapes:
 *   hip  — symmetric silhouette from waist → highhip → hip → crotch
 *   leg  — two mirrored leg paths from thigh-upper → ankle
 *          halfW = radius of one leg (leg_circ / 2π)
 *          each leg is centered at ±legOffset from the body axis
 *
 * Same candidate/pick/canonical pattern as torso.ts.
 */

type R = Record<string, number>;

// ── Constants ─────────────────────────────────────────────────────────────────

const ARC_TO_HALF_WIDTH  = 0.5;
const CIRC_TO_HALF_WIDTH = 1 / Math.PI;  // circ → radius = circ / 2π

// ── Canonical proportions ─────────────────────────────────────────────────────
// Derived from a typical 165cm female (65 in sample data).

const CANONICAL_HIP: Record<string, { yRatio: number; halfWRatio: number }> = {
  waist:   { yRatio: 0.615, halfWRatio: 0.104 },
  highhip: { yRatio: 0.554, halfWRatio: 0.131 },
  hip:     { yRatio: 0.485, halfWRatio: 0.154 },
  crotch:  { yRatio: 0.462, halfWRatio: 0.138 },
};

// halfW = radius of one leg (leg_circ / 2π)
const CANONICAL_LEG: Record<string, { yRatio: number; halfWRatio: number }> = {
  'thigh-upper': { yRatio: 0.400, halfWRatio: 0.054 },
  'thigh-mid':   { yRatio: 0.338, halfWRatio: 0.048 },
  knee:          { yRatio: 0.269, halfWRatio: 0.037 },
  'knee-small':  { yRatio: 0.254, halfWRatio: 0.032 },
  calf:          { yRatio: 0.169, halfWRatio: 0.034 },
  'ankle-high':  { yRatio: 0.062, halfWRatio: 0.024 },
  ankle:         { yRatio: 0.038, halfWRatio: 0.022 },
};

// legOffset canonical: center of each leg from body axis as fraction of totalHeight
const CANONICAL_LEG_OFFSET_RATIO = 0.088;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveCandidate {
  source: string;
  value: number;
  used: boolean;
}

export interface LowerBodyLandmark {
  id: string;
  y: number | null;
  ySource: string | null;
  yCandidates: ResolveCandidate[];
  halfW: number | null;
  wSource: string | null;
  wCandidates: ResolveCandidate[];
  widthConfidence: 'direct' | 'arc' | 'circ' | 'canonical';
}

interface YCandidate { source: string; value: number }
interface WCandidate { source: string; value: number; confidence: LowerBodyLandmark['widthConfidence'] }

function pickY(candidates: YCandidate[]): { y: number; source: string; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const used = candidates[0];
  return {
    y: used.value,
    source: used.source,
    all: candidates.map((c, i) => ({ source: c.source, value: c.value, used: i === 0 })),
  };
}

function pickW(candidates: WCandidate[]): { halfW: number; source: string; confidence: LowerBodyLandmark['widthConfidence']; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const used = candidates[0];
  return {
    halfW: used.value,
    source: used.source,
    confidence: used.confidence,
    all: candidates.map((c, i) => ({ source: c.source, value: c.value, used: i === 0 })),
  };
}

// ── Arc-to-width ratio ────────────────────────────────────────────────────────

export function resolveArcRatio(R: R): number {
  const pairs = [
    { arc: R.bust_arc_f,  width: R.width_bust  },
    { arc: R.waist_arc_f, width: R.width_waist },
    { arc: R.hip_arc_f,   width: R.width_hip   },
  ];
  const ratios = pairs
    .filter(p => p.arc > 0 && p.width > 0)
    .map(p => (p.width / 2) / p.arc);
  if (!ratios.length) return ARC_TO_HALF_WIDTH;
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  return Math.min(Math.max(avg, 0.35), 0.65);
}

// ── Hip section: Y candidates ─────────────────────────────────────────────────

function waistYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_waist_side > 0)  out.push({ source: 'height_waist_side',  value: R.height_waist_side });
  if (R.height_waist_front > 0) out.push({ source: 'height_waist_front', value: R.height_waist_front });
  return out;
}

function highhipYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_highhip > 0)
    out.push({ source: 'height_highhip', value: R.height_highhip });
  if (R.height_waist_side > 0 && R.waist_to_highhip_side > 0)
    out.push({ source: 'height_waist_side - waist_to_highhip_side', value: R.height_waist_side - R.waist_to_highhip_side });
  return out;
}

function hipYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_hip > 0)
    out.push({ source: 'height_hip', value: R.height_hip });
  if (R.height_waist_side > 0 && R.waist_to_hip_side > 0)
    out.push({ source: 'height_waist_side - waist_to_hip_side', value: R.height_waist_side - R.waist_to_hip_side });
  return out;
}

function crotchYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.leg_crotch_to_floor > 0)
    out.push({ source: 'leg_crotch_to_floor', value: R.leg_crotch_to_floor });
  if (R.height_hip > 0)
    out.push({ source: 'height_hip × 0.93', value: R.height_hip * 0.93 });
  if (R.height_gluteal_fold > 0)
    out.push({ source: 'height_gluteal_fold', value: R.height_gluteal_fold });

  return out;
}

// ── Hip section: W candidates ─────────────────────────────────────────────────

function waistWCandidates(R: R, arcRatio: number): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.width_waist > 0)
    out.push({ source: 'width_waist / 2', value: R.width_waist * 0.5, confidence: 'direct' });
  if (R.waist_arc_f > 0)
    out.push({ source: `waist_arc_f × ${arcRatio.toFixed(3)}`, value: R.waist_arc_f * arcRatio, confidence: 'arc' });
  if (R.waist_circ > 0)
    out.push({ source: 'waist_circ / (2π)', value: R.waist_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function highhipWCandidates(R: R, arcRatio: number): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.highhip_arc_f > 0)
    out.push({ source: `highhip_arc_f × ${arcRatio.toFixed(3)}`, value: R.highhip_arc_f * arcRatio, confidence: 'arc' });
  if (R.highhip_circ > 0)
    out.push({ source: 'highhip_circ / (2π)', value: R.highhip_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function hipWCandidates(R: R, arcRatio: number): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.width_hip > 0)
    out.push({ source: 'width_hip / 2', value: R.width_hip * 0.5, confidence: 'direct' });
  if (R.hip_arc_f > 0)
    out.push({ source: `hip_arc_f × ${arcRatio.toFixed(3)}`, value: R.hip_arc_f * arcRatio, confidence: 'arc' });
  if (R.hip_circ > 0)
    out.push({ source: 'hip_circ / (2π)', value: R.hip_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function crotchWCandidates(R: R, arcRatio: number): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.hip_arc_f > 0)
    out.push({ source: `hip_arc_f × ${arcRatio.toFixed(3)} × 0.92`, value: R.hip_arc_f * arcRatio * 0.92, confidence: 'arc' });
  if (R.hip_circ > 0)
    out.push({ source: 'hip_circ / (2π) × 0.92', value: R.hip_circ * CIRC_TO_HALF_WIDTH * 0.5 * 0.92, confidence: 'circ' });
  return out;
}

// ── Leg section: Y candidates ─────────────────────────────────────────────────

function thighUpperYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_gluteal_fold > 0 && R.height_knee > 0)
    out.push({ source: 'lerp(height_gluteal_fold, height_knee, 0.3)', value: R.height_gluteal_fold * 0.7 + R.height_knee * 0.3 });
  if (R.leg_crotch_to_floor > 0 && R.height_knee > 0)
    out.push({ source: 'lerp(leg_crotch_to_floor, height_knee, 0.3)', value: R.leg_crotch_to_floor * 0.7 + R.height_knee * 0.3 });
  return out;
}

function thighMidYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_gluteal_fold > 0 && R.height_knee > 0)
    out.push({ source: 'lerp(height_gluteal_fold, height_knee, 0.55)', value: R.height_gluteal_fold * 0.45 + R.height_knee * 0.55 });
  if (R.leg_crotch_to_floor > 0 && R.height_knee > 0)
    out.push({ source: 'lerp(leg_crotch_to_floor, height_knee, 0.55)', value: R.leg_crotch_to_floor * 0.45 + R.height_knee * 0.55 });
  return out;
}

function kneeYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_knee > 0)
    out.push({ source: 'height_knee', value: R.height_knee });
  if (R.height_waist_side > 0 && R.height_waist_side_to_knee > 0)
    out.push({ source: 'height_waist_side - height_waist_side_to_knee', value: R.height_waist_side - R.height_waist_side_to_knee });
  return out;
}

function kneeSmallYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_knee > 0)
    out.push({ source: 'height_knee × 0.93', value: R.height_knee * 0.93 });
  return out;
}

function calfYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_calf > 0)
    out.push({ source: 'height_calf', value: R.height_calf });
  if (R.height_knee > 0 && R.height_ankle_high > 0)
    out.push({ source: 'lerp(height_knee, height_ankle_high, 0.5)', value: (R.height_knee + R.height_ankle_high) / 2 });
  return out;
}

function ankleHighYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_ankle_high > 0)
    out.push({ source: 'height_ankle_high', value: R.height_ankle_high });
  return out;
}

function ankleYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_ankle > 0)
    out.push({ source: 'height_ankle', value: R.height_ankle });
  if (R.height_ankle_high > 0)
    out.push({ source: 'height_ankle_high × 0.6', value: R.height_ankle_high * 0.6 });
  return out;
}

// ── Leg section: W candidates (halfW = radius of one leg = circ / 2π) ─────────

function thighUpperWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_thigh_upper_circ > 0)
    out.push({ source: 'leg_thigh_upper_circ / (2π)', value: R.leg_thigh_upper_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function thighMidWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_thigh_mid_circ > 0)
    out.push({ source: 'leg_thigh_mid_circ / (2π)', value: R.leg_thigh_mid_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function kneeWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_knee_circ > 0)
    out.push({ source: 'leg_knee_circ / (2π)', value: R.leg_knee_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function kneeSmallWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_knee_small_circ > 0)
    out.push({ source: 'leg_knee_small_circ / (2π)', value: R.leg_knee_small_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  if (R.leg_knee_circ > 0)
    out.push({ source: 'leg_knee_circ / (2π) × 0.87', value: R.leg_knee_circ * CIRC_TO_HALF_WIDTH * 0.5 * 0.87, confidence: 'circ' });
  return out;
}

function calfWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_calf_circ > 0)
    out.push({ source: 'leg_calf_circ / (2π)', value: R.leg_calf_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function ankleHighWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_ankle_high_circ > 0)
    out.push({ source: 'leg_ankle_high_circ / (2π)', value: R.leg_ankle_high_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

function ankleWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.leg_ankle_circ > 0)
    out.push({ source: 'leg_ankle_circ / (2π)', value: R.leg_ankle_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  if (R.leg_ankle_high_circ > 0)
    out.push({ source: 'leg_ankle_high_circ / (2π) × 0.9', value: R.leg_ankle_high_circ * CIRC_TO_HALF_WIDTH * 0.5 * 0.9, confidence: 'circ' });
  return out;
}

// ── Foot section ──────────────────────────────────────────────────────────────

// Canonical foot: halfW = foot_length (toe spread from leg center); y = 0 (floor)
const CANONICAL_FOOT = { halfWRatio: 0.146 }; // foot_length / totalHeight ≈ 9.5/65

function footWCandidates(R: R): WCandidate[] {
  const out: WCandidate[] = [];
  if (R.foot_length > 0)
    out.push({ source: 'foot_length', value: R.foot_length, confidence: 'direct' });
  if (R.foot_circ > 0)
    out.push({ source: 'foot_circ / (2π)', value: R.foot_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  if (R.foot_instep_circ > 0)
    out.push({ source: 'foot_instep_circ / (2π)', value: R.foot_instep_circ * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' });
  return out;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface LowerBodyResolved {
  /** Single symmetric hip block: waist → highhip → hip → crotch. */
  hip: LowerBodyLandmark[];
  /** Per-leg landmarks. halfW = radius of one leg (leg_circ / 2π). */
  leg: LowerBodyLandmark[];
  /**
   * Distance from body axis to center of each leg, in measurement units.
   * Inner edges of both legs meet at the center axis: legOffset = thigh radius.
   */
  legOffset: number;
  /** Foot shape data. halfW = foot_length (toe spread from leg center outward). */
  foot: LowerBodyLandmark | null;
}

export function resolveLowerBodyLandmarks(R: R, totalHeight: number): LowerBodyResolved {
  const arcRatio = resolveArcRatio(R);

  function build(
    canonical: Record<string, { yRatio: number; halfWRatio: number }>,
    id: string,
    yC: YCandidate[],
    wC: WCandidate[],
  ): LowerBodyLandmark {
    const canon = canonical[id];
    const allY = [...yC];
    if (canon) allY.push({ source: `canonical ratio ${canon.yRatio}`, value: totalHeight * canon.yRatio });
    const allW = [...wC];
    if (canon) allW.push({ source: `canonical ratio ${canon.halfWRatio}`, value: totalHeight * canon.halfWRatio, confidence: 'canonical' as const });
    const yr = pickY(allY);
    const wr = pickW(allW);
    return {
      id, y: yr?.y ?? null, ySource: yr?.source ?? null, yCandidates: yr?.all ?? [],
      halfW: wr?.halfW ?? null, wSource: wr?.source ?? null, wCandidates: wr?.all ?? [],
      widthConfidence: wr?.confidence ?? 'canonical',
    };
  }

  const bh = (id: string, yC: YCandidate[], wC: WCandidate[]) => build(CANONICAL_HIP, id, yC, wC);
  const bl = (id: string, yC: YCandidate[], wC: WCandidate[]) => build(CANONICAL_LEG, id, yC, wC);

  const hip = [
    bh('waist',   waistYCandidates(R),   waistWCandidates(R, arcRatio)),
    bh('highhip', highhipYCandidates(R), highhipWCandidates(R, arcRatio)),
    bh('hip',     hipYCandidates(R),     hipWCandidates(R, arcRatio)),
    bh('crotch',  crotchYCandidates(R),  crotchWCandidates(R, arcRatio)),
  ].filter(l => l.y !== null) as LowerBodyLandmark[];

  const leg = [
    bl('thigh-upper', thighUpperYCandidates(R), thighUpperWCandidates(R)),
    bl('thigh-mid',   thighMidYCandidates(R),   thighMidWCandidates(R)),
    bl('knee',        kneeYCandidates(R),        kneeWCandidates(R)),
    bl('knee-small',  kneeSmallYCandidates(R),   kneeSmallWCandidates(R)),
    bl('calf',        calfYCandidates(R),        calfWCandidates(R)),
    bl('ankle-high',  ankleHighYCandidates(R),   ankleHighWCandidates(R)),
    bl('ankle',       ankleYCandidates(R),       ankleWCandidates(R)),
  ].filter(l => l.y !== null) as LowerBodyLandmark[];

  const thighLm = leg.find(l => l.id === 'thigh-upper');
  // Inner edges of both legs meet at the center axis: legOffset = thigh radius
  const legOffset = thighLm?.halfW ?? totalHeight * CANONICAL_LEG_OFFSET_RATIO;

  // Foot: y=0 (floor), halfW = foot_length (lateral toe spread from leg center)
  const footWC = footWCandidates(R);
  footWC.push({ source: `canonical ratio ${CANONICAL_FOOT.halfWRatio}`, value: totalHeight * CANONICAL_FOOT.halfWRatio, confidence: 'canonical' });
  const footWR = pickW(footWC);
  const foot: LowerBodyLandmark | null = footWR ? {
    id: 'foot', y: 0, ySource: 'floor', yCandidates: [{ source: 'floor', value: 0, used: true }],
    halfW: footWR.halfW, wSource: footWR.source, wCandidates: footWR.all,
    widthConfidence: footWR.confidence,
  } : null;

  return { hip, leg, legOffset, foot };
}

// ── Path builders ─────────────────────────────────────────────────────────────

function crPath(pts: [number, number][], startWithM = true): string {
  if (pts.length < 2) return '';
  let d = startWithM ? `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d +=
      ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}` +
      ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}` +
      ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export interface LowerBodyPathOptions {
  axisX: number;
  toY: (h: number) => number;
  scale: number;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export function buildHipPath(hip: LowerBodyLandmark[], opts: LowerBodyPathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;

  const right: [number, number][] = hip.map(l => [axisX + (l.halfW ?? 0) * scale, toY(l.y!)]);
  const left:  [number, number][] = [...right].reverse().map(([x, y]) => [2 * axisX - x, y]);
  const pathD = crPath(right) + ` L ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}` + crPath(left, false) + ' Z';
  return `<path d="${pathD}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}

export function buildLegPaths(
  leg: LowerBodyLandmark[],
  legOffset: number,
  crotch: LowerBodyLandmark | null,
  opts: LowerBodyPathOptions,
): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;
  const ox = legOffset * scale;

  function oneLeg(cx: number): string {
    const thighHalfW = (leg[0]?.halfW ?? 0) * scale;
    const right: [number, number][] = leg.map(l => [cx + (l.halfW ?? 0) * scale, toY(l.y!)]);
    // Prepend crotch Y at thigh-upper width so the leg connects to the hip block
    if (crotch?.y != null) right.unshift([cx + thighHalfW, toY(crotch.y)]);
    const left: [number, number][] = [...right].reverse().map(([x, y]) => [2 * cx - x, y]);
    const d = crPath(right) + ` L ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}` + crPath(left, false) + ' Z';
    return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
  }

  return oneLeg(axisX + ox) + oneLeg(axisX - ox);
}

export function buildFootPaths(
  ankleLm: LowerBodyLandmark,
  foot: LowerBodyLandmark,
  legOffset: number,
  opts: LowerBodyPathOptions,
): string {
  if (ankleLm.y === null || ankleLm.halfW === null || foot.halfW === null) return '';
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;

  const ox       = legOffset * scale;
  const ankleY   = toY(ankleLm.y);
  const floorY   = toY(0);
  const ankleHW  = ankleLm.halfW * scale;
  const footHW   = foot.halfW * scale;

  // One foot: cx = leg center, sign = +1 for right foot (toes point right), -1 for left
  function oneFoot(cx: number, sign: number): string {
    // Four key points, clockwise:
    // inner ankle → heel (inward at floor) → toe (outward at floor) → outer ankle
    const pts: [number, number][] = [
      [cx - sign * ankleHW, ankleY],          // inner ankle
      [cx - sign * ankleHW * 0.5, floorY],    // heel (slightly inward)
      [cx + sign * footHW,        floorY],     // toe tip (fans outward)
      [cx + sign * ankleHW,       ankleY],     // outer ankle
    ];
    const d =
      `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` +
      ` C ${pts[0][0].toFixed(1)} ${(ankleY + (floorY - ankleY) * 0.5).toFixed(1)}` +
        ` ${pts[1][0].toFixed(1)} ${floorY.toFixed(1)} ${pts[1][0].toFixed(1)} ${floorY.toFixed(1)}` +
      ` C ${((pts[1][0] + pts[2][0]) / 2).toFixed(1)} ${floorY.toFixed(1)}` +
        ` ${((pts[1][0] + pts[2][0]) / 2).toFixed(1)} ${floorY.toFixed(1)} ${pts[2][0].toFixed(1)} ${floorY.toFixed(1)}` +
      ` C ${pts[2][0].toFixed(1)} ${floorY.toFixed(1)}` +
        ` ${pts[3][0].toFixed(1)} ${(ankleY + (floorY - ankleY) * 0.5).toFixed(1)} ${pts[3][0].toFixed(1)} ${ankleY.toFixed(1)}` +
      ' Z';
    return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
  }

  return oneFoot(axisX + ox, +1) + oneFoot(axisX - ox, -1);
}
