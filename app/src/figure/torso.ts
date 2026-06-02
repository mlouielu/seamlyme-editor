/**
 * Torso outline renderer — shoulder to waist.
 *
 * Each landmark collects ALL possible resolve candidates in priority order,
 * then picks the first valid one. The full candidate list is kept so the UI
 * can show what was available and what was actually used.
 */

type R = Record<string, number>;

// ── Constants ─────────────────────────────────────────────────────────────────

const ARC_TO_HALF_WIDTH = 0.5;
const CIRC_TO_HALF_WIDTH = 1 / Math.PI;

// ── Canonical proportions (last-resort fallback when no measurements exist) ──
// Y: landmark height as fraction of total height
// halfW: half-width as fraction of total height
// Derived from a typical 165cm female body.

const CANONICAL: Record<string, { yRatio: number; halfWRatio: number }> = {
  'neck-back':  { yRatio: 0.885, halfWRatio: 0.038 },
  'neck-side':  { yRatio: 0.877, halfWRatio: 0.038 },
  'neck-front': { yRatio: 0.854, halfWRatio: 0.038 },
  'shoulder':   { yRatio: 0.831, halfWRatio: 0.115 },
  'highbust':  { yRatio: 0.738, halfWRatio: 0.132 },
  'bust':      { yRatio: 0.692, halfWRatio: 0.138 },
  'bustpoint': { yRatio: 0.692, halfWRatio: 0.090 },
  'lowbust':   { yRatio: 0.660, halfWRatio: 0.130 },
  'rib':       { yRatio: 0.640, halfWRatio: 0.122 },
  'waist':     { yRatio: 0.615, halfWRatio: 0.104 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveCandidate {
  source: string;   // human-readable formula, e.g. 'height_bustpoint' or 'height_neck_front - neck_front_to_bust_f'
  value: number;    // resolved measurement value in measurement units
  used: boolean;    // true for the candidate that was actually selected
  missing?: boolean; // true when the underlying measurement is absent from R
}

export interface TorsoLandmark {
  id: string;
  y: number | null;
  ySource: string | null;
  yCandidates: ResolveCandidate[];
  halfW: number | null;
  wSource: string | null;
  wCandidates: ResolveCandidate[];
  widthConfidence: 'direct' | 'arc' | 'circ' | 'canonical';
}

// ── Internal candidate types ───────────────────────────────────────────────────

interface YCandidate { source: string; value: number }
interface WCandidate { source: string; value: number; confidence: TorsoLandmark['widthConfidence']; missing?: boolean }

function pickY(candidates: YCandidate[]): { y: number; source: string; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const used = candidates[0];
  return {
    y: used.value,
    source: used.source,
    all: candidates.map((c, i) => ({ source: c.source, value: c.value, used: i === 0 })),
  };
}

function pickW(candidates: WCandidate[]): { halfW: number; source: string; confidence: TorsoLandmark['widthConfidence']; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const idx = candidates.findIndex(c => !c.missing);
  const used = candidates[idx >= 0 ? idx : candidates.length - 1];
  return {
    halfW: used.value,
    source: used.source,
    confidence: used.confidence,
    all: candidates.map((c, i) => ({ source: c.source, value: c.value, used: i === (idx >= 0 ? idx : candidates.length - 1), missing: c.missing })),
  };
}

// ── Height candidate collectors ───────────────────────────────────────────────

function shoulderYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_shoulder_tip > 0)
    out.push({ source: 'height_shoulder_tip', value: R.height_shoulder_tip });
  if (R.height_neck_front > 0 && R.neck_front_to_shoulder_tip_f > 0 && R.neck_width > 0) {
    const dx = Math.max(0, R.neck_width * 0.5 + R.neck_front_to_shoulder_tip_f - R.neck_width * 0.5);
    const dy = Math.sqrt(Math.max(0, R.neck_front_to_shoulder_tip_f ** 2 - dx ** 2));
    if (dy > 0) out.push({ source: 'height_neck_front - Δy(neck_front_to_shoulder_tip_f)', value: R.height_neck_front - dy });
  }
  return out;
}

function neckWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: 'neck_width / 2',                       value: R.neck_width  > 0 ? R.neck_width * 0.5                    : 0, confidence: 'direct', missing: !(R.neck_width  > 0) },
    { source: `neck_arc_f × ${arcRatio.toFixed(3)}`,  value: R.neck_arc_f  > 0 ? R.neck_arc_f * arcRatio               : 0, confidence: 'arc',    missing: !(R.neck_arc_f  > 0) },
  ];
}

function neckBackYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_neck_back > 0)
    out.push({ source: 'height_neck_back', value: R.height_neck_back });
  if (R.height_neck_front > 0 && R.head_chin_to_neck_back > 0) {
    const v = R.height_neck_front + R.head_chin_to_neck_back;
    if (v > R.height_neck_front)
      out.push({ source: 'height_neck_front + head_chin_to_neck_back', value: v });
  }
  if (R.height_neck_side > 0)
    out.push({ source: 'height_neck_side', value: R.height_neck_side });
  return out;
}

function neckSideYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_neck_side > 0)
    out.push({ source: 'height_neck_side', value: R.height_neck_side });
  if (R.height_neck_back > 0 && R.head_chin_to_neck_back > 0) {
    const v = R.height_neck_back - R.head_chin_to_neck_back * 0.3;
    if (v > 0 && v < R.height_neck_back)
      out.push({ source: 'height_neck_back - head_chin_to_neck_back × 0.3', value: v });
  }
  if (R.height_neck_back > 0)
    out.push({ source: 'height_neck_back', value: R.height_neck_back });
  if (R.height_neck_front > 0)
    out.push({ source: 'height_neck_front', value: R.height_neck_front });
  return out;
}

function neckFrontYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_neck_front > 0)
    out.push({ source: 'height_neck_front', value: R.height_neck_front });
  if (R.height_neck_back > 0 && R.head_chin_to_neck_back > 0) {
    const v = R.height_neck_back - R.head_chin_to_neck_back;
    if (v > 0 && v < R.height_neck_back)
      out.push({ source: 'height_neck_back - head_chin_to_neck_back', value: v });
  }
  return out;
}

function armholeYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_armpit > 0) out.push({ source: 'height_armpit', value: R.height_armpit });
  return out;
}

function highbustYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_neck_front > 0 && R.neck_front_to_highbust_f > 0)
    out.push({ source: 'height_neck_front - neck_front_to_highbust_f', value: R.height_neck_front - R.neck_front_to_highbust_f });
  if (R.height_armpit > 0 && R.height_bustpoint > 0)
    out.push({ source: 'lerp(height_armpit, height_bustpoint, 0.5)', value: (R.height_armpit + R.height_bustpoint) / 2 });
  return out;
}

function bustYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_bustpoint > 0)
    out.push({ source: 'height_bustpoint', value: R.height_bustpoint });
  if (R.height_neck_front > 0 && R.neck_front_to_bust_f > 0)
    out.push({ source: 'height_neck_front - neck_front_to_bust_f', value: R.height_neck_front - R.neck_front_to_bust_f });
  return out;
}

function bustpointYCandidates(R: R): YCandidate[] {
  // bustpoint sits at the same height as bust
  return bustYCandidates(R);
}

function lowbustYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_waist_front > 0 && R.lowbust_to_waist_f > 0)
    out.push({ source: 'height_waist_front + lowbust_to_waist_f', value: R.height_waist_front + R.lowbust_to_waist_f });
  if (R.height_waist_side > 0 && R.lowbust_to_waist_f > 0)
    out.push({ source: 'height_waist_side + lowbust_to_waist_f', value: R.height_waist_side + R.lowbust_to_waist_f });
  if (R.height_bustpoint > 0 && R.height_waist_side > 0)
    out.push({ source: 'lerp(height_bustpoint, height_waist_side, 0.35)', value: R.height_bustpoint + (R.height_waist_side - R.height_bustpoint) * 0.35 });
  return out;
}

function ribYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_bustpoint > 0 && R.height_waist_side > 0)
    out.push({ source: 'lerp(height_bustpoint, height_waist_side, 0.65)', value: R.height_bustpoint + (R.height_waist_side - R.height_bustpoint) * 0.65 });
  return out;
}

function waistYCandidates(R: R): YCandidate[] {
  const out: YCandidate[] = [];
  if (R.height_waist_side > 0)  out.push({ source: 'height_waist_side',  value: R.height_waist_side });
  if (R.height_waist_front > 0) out.push({ source: 'height_waist_front', value: R.height_waist_front });
  if (R.height_bustpoint > 0 && R.bust_to_waist_f > 0)
    out.push({ source: 'height_bustpoint - bust_to_waist_f', value: R.height_bustpoint - R.bust_to_waist_f });
  return out;
}

// ── Width candidate collectors ────────────────────────────────────────────────

function shoulderWCandidates(R: R): WCandidate[] {
  return [
    { source: 'shoulder_tip_to_shoulder_tip_f / 2', value: R.shoulder_tip_to_shoulder_tip_f > 0 ? R.shoulder_tip_to_shoulder_tip_f * 0.5 : 0, confidence: 'direct', missing: !(R.shoulder_tip_to_shoulder_tip_f > 0) },
    { source: 'width_shoulder / 2',                 value: R.width_shoulder                 > 0 ? R.width_shoulder * 0.5                 : 0, confidence: 'direct', missing: !(R.width_shoulder                 > 0) },
  ];
}

function armholeWCandidates(R: R): WCandidate[] {
  const neckHW = R.neck_width > 0 ? R.neck_width * 0.5 : 0;
  return [
    { source: 'neck_width/2 + armscye_width/2', value: R.armscye_width  > 0 ? R.armscye_width * 0.5 + neckHW : 0, confidence: 'direct', missing: !(R.armscye_width  > 0) },
    { source: 'across_chest_f / 2',             value: R.across_chest_f > 0 ? R.across_chest_f * 0.5         : 0, confidence: 'direct', missing: !(R.across_chest_f > 0) },
  ];
}

function highbustWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: `highbust_arc_f × ${arcRatio.toFixed(3)}`, value: R.highbust_arc_f > 0 ? R.highbust_arc_f * arcRatio               : 0, confidence: 'arc',  missing: !(R.highbust_arc_f > 0) },
    { source: 'highbust_circ / (2π)',                     value: R.highbust_circ  > 0 ? R.highbust_circ  * CIRC_TO_HALF_WIDTH * 0.5 : 0, confidence: 'circ', missing: !(R.highbust_circ  > 0) },
  ];
}

function bustWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: `bust_arc_f × ${arcRatio.toFixed(3)}`, value: R.bust_arc_f > 0 ? R.bust_arc_f * arcRatio               : 0, confidence: 'arc',    missing: !(R.bust_arc_f > 0) },
    { source: 'bust_circ / (2π)',                     value: R.bust_circ  > 0 ? R.bust_circ  * CIRC_TO_HALF_WIDTH * 0.5 : 0, confidence: 'circ',   missing: !(R.bust_circ  > 0) },
    { source: 'width_bust / 2',                       value: R.width_bust > 0 ? R.width_bust * 0.5                     : 0, confidence: 'direct', missing: !(R.width_bust > 0) },
  ];
}

function bustpointWCandidates(R: R): WCandidate[] {
  return [
    { source: 'bustpoint_to_bustpoint_half', value: R.bustpoint_to_bustpoint_half > 0 ? R.bustpoint_to_bustpoint_half       : 0, confidence: 'direct', missing: !(R.bustpoint_to_bustpoint_half > 0) },
    { source: 'bustpoint_to_bustpoint / 2',  value: R.bustpoint_to_bustpoint      > 0 ? R.bustpoint_to_bustpoint * 0.5      : 0, confidence: 'direct', missing: !(R.bustpoint_to_bustpoint      > 0) },
  ];
}

function lowbustWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: `lowbust_arc_f × ${arcRatio.toFixed(3)}`, value: R.lowbust_arc_f > 0 ? R.lowbust_arc_f * arcRatio               : 0, confidence: 'arc',  missing: !(R.lowbust_arc_f > 0) },
    { source: 'lowbust_circ / (2π)',                     value: R.lowbust_circ  > 0 ? R.lowbust_circ  * CIRC_TO_HALF_WIDTH * 0.5 : 0, confidence: 'circ', missing: !(R.lowbust_circ  > 0) },
  ];
}

function ribWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: `rib_arc_f × ${arcRatio.toFixed(3)}`, value: R.rib_arc_f > 0 ? R.rib_arc_f * arcRatio               : 0, confidence: 'arc',  missing: !(R.rib_arc_f > 0) },
    { source: 'rib_circ / (2π)',                     value: R.rib_circ  > 0 ? R.rib_circ  * CIRC_TO_HALF_WIDTH * 0.5 : 0, confidence: 'circ', missing: !(R.rib_circ  > 0) },
  ];
}

function waistWCandidates(R: R, arcRatio: number): WCandidate[] {
  return [
    { source: 'width_waist / 2',                      value: R.width_waist  > 0 ? R.width_waist * 0.5                     : 0, confidence: 'direct', missing: !(R.width_waist  > 0) },
    { source: `waist_arc_f × ${arcRatio.toFixed(3)}`, value: R.waist_arc_f  > 0 ? R.waist_arc_f * arcRatio                : 0, confidence: 'arc',    missing: !(R.waist_arc_f  > 0) },
    { source: 'waist_circ / (2π)',                     value: R.waist_circ   > 0 ? R.waist_circ  * CIRC_TO_HALF_WIDTH * 0.5 : 0, confidence: 'circ',   missing: !(R.waist_circ   > 0) },
  ];
}

// ── Arc-to-width projection ratio ─────────────────────────────────────────────

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

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface TorsoResolved {
  /** Landmarks that form the outline path, top to bottom. neck-side is the topmost point. */
  outline: TorsoLandmark[];
  /**
   * Neck data for the neckline curve: arc from neck-side L → neck-front (center dip) → neck-side R.
   * neck_width = straight horizontal distance between the two neck-side points.
   * neck_arc_f = arc length of this curve.
   */
  neckline: { side: TorsoLandmark; front: TorsoLandmark } | null;
  /** neck-back: reference height mark only, not part of outline or neckline curve. */
  neckBack: TorsoLandmark | null;
  /** Landmarks rendered as interior marks (e.g. bustpoint dots + line). */
  interior: TorsoLandmark[];
}

export function resolveTorsoLandmarks(R: R, totalHeight: number): TorsoResolved {
  const arcRatio = resolveArcRatio(R);

  function build(
    id: string,
    yCandidates: YCandidate[],
    wCandidates: WCandidate[],
  ): TorsoLandmark {
    const canon = CANONICAL[id];
    const allY: YCandidate[] = [...yCandidates];
    if (canon) allY.push({ source: `canonical ratio ${canon.yRatio}`, value: totalHeight * canon.yRatio });
    const allW: WCandidate[] = [...wCandidates];
    if (canon) allW.push({ source: `canonical ratio ${canon.halfWRatio}`, value: totalHeight * canon.halfWRatio, confidence: 'canonical' });
    const yr = pickY(allY);
    const wr = pickW(allW);
    return {
      id,
      y: yr?.y ?? null,
      ySource: yr?.source ?? null,
      yCandidates: yr?.all ?? [],
      halfW: wr?.halfW ?? null,
      wSource: wr?.source ?? null,
      wCandidates: wr?.all ?? [],
      widthConfidence: wr?.confidence ?? 'canonical',
    };
  }

  const outline = [
    build('neck-side',  neckSideYCandidates(R),  neckWCandidates(R, arcRatio)),
    build('shoulder',   shoulderYCandidates(R),  shoulderWCandidates(R)),
    build('highbust',   highbustYCandidates(R),  highbustWCandidates(R, arcRatio)),
    build('bust',       bustYCandidates(R),      bustWCandidates(R, arcRatio)),
    build('lowbust',    lowbustYCandidates(R),   lowbustWCandidates(R, arcRatio)),
    build('rib',        ribYCandidates(R),       ribWCandidates(R, arcRatio)),
    build('waist',      waistYCandidates(R),     waistWCandidates(R, arcRatio)),
  ].filter(l => l.y !== null) as TorsoLandmark[];

  const neckSide  = build('neck-side',  neckSideYCandidates(R),  neckWCandidates(R, arcRatio));
  const neckFront = build('neck-front', neckFrontYCandidates(R), neckWCandidates(R, arcRatio));
  const neckBack  = build('neck-back',  neckBackYCandidates(R),  neckWCandidates(R, arcRatio));

  const neckline = (neckSide.y !== null && neckFront.y !== null)
    ? { side: neckSide, front: neckFront }
    : null;

  const interior = [
    build('bustpoint', bustpointYCandidates(R), bustpointWCandidates(R)),
  ].filter(l => l.y !== null) as TorsoLandmark[];

  return {
    outline,
    neckline,
    neckBack: neckBack.y !== null ? neckBack : null,
    interior,
  };
}

// ── Path builder ──────────────────────────────────────────────────────────────

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

export interface TorsoPathOptions {
  axisX: number;
  toY: (h: number) => number;
  scale: number;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export function buildTorsoPath(outline: TorsoLandmark[], opts: TorsoPathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;

  const right: [number, number][] = outline.map(l => [axisX + (l.halfW ?? 0) * scale, toY(l.y!)]);
  const left:  [number, number][] = [...right].reverse().map(([x, y]) => [2 * axisX - x, y]);

  const pathD =
    crPath(right) +
    ` L ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}` +
    crPath(left, false) +
    ' Z';

  return (
    `<path d="${pathD}"` +
    ` fill="${fill}" fill-opacity="${fillOpacity}"` +
    ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"` +
    ` stroke-linejoin="round"/>`
  );
}

export function buildNeckBackLines(
  neckSide: TorsoLandmark,
  neckBack: TorsoLandmark,
  opts: TorsoPathOptions & { color?: string },
): string {
  if (neckSide.y === null || neckBack.y === null || neckSide.halfW === null) return '';
  const { axisX, toY, scale } = opts;
  const color = opts.color ?? '#71717a';

  const sy = toY(neckSide.y);
  const by = toY(neckBack.y);
  const hw = neckSide.halfW * scale;

  const lx = (axisX - hw).toFixed(1);
  const rx = (axisX + hw).toFixed(1);
  const syF = sy.toFixed(1);
  const byF = by.toFixed(1);

  return [
    // vertical lines from neck-side up to neck-back on each side
    `<line x1="${lx}" y1="${syF}" x2="${lx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3 2"/>`,
    `<line x1="${rx}" y1="${syF}" x2="${rx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3 2"/>`,
    // horizontal line at neck-back level
    `<line x1="${lx}" y1="${byF}" x2="${rx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="2 3"/>`,
  ].join('');
}

export function buildNecklineCurve(
  neckline: NonNullable<TorsoResolved['neckline']>,
  opts: TorsoPathOptions & { color?: string },
): string {
  const { axisX, toY, scale } = opts;
  const color = opts.color ?? '#a1a1aa';

  const sideY  = toY(neckline.side.y!);
  const frontY = toY(neckline.front.y!);
  const hw     = (neckline.side.halfW ?? 0) * scale;

  const lx = axisX - hw;
  const rx = axisX + hw;

  // Two cubic beziers: L-side → front-center → R-side
  // Control points pull horizontally toward center at neck-side height,
  // then drop vertically toward neck-front.
  const cpDrop = (frontY - sideY) * 0.55;
  const d =
    `M ${lx.toFixed(1)} ${sideY.toFixed(1)}` +
    ` C ${lx.toFixed(1)} ${(sideY + cpDrop).toFixed(1)} ${axisX.toFixed(1)} ${frontY.toFixed(1)} ${axisX.toFixed(1)} ${frontY.toFixed(1)}` +
    ` C ${axisX.toFixed(1)} ${frontY.toFixed(1)} ${rx.toFixed(1)} ${(sideY + cpDrop).toFixed(1)} ${rx.toFixed(1)} ${sideY.toFixed(1)}`;

  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-opacity="0.7" stroke-linecap="round"/>`;
}

export function buildBustpointMark(
  bustpoint: TorsoLandmark,
  opts: TorsoPathOptions & { color?: string },
): string {
  if (bustpoint.y === null || bustpoint.halfW === null) return '';
  const { axisX, toY, scale } = opts;
  const color = opts.color ?? '#fc8d62';
  const y  = toY(bustpoint.y).toFixed(1);
  const hw = (bustpoint.halfW * scale).toFixed(1);
  const lx = (axisX - +hw).toFixed(1);
  const rx = (axisX + +hw).toFixed(1);
  return [
    `<line x1="${lx}" y1="${y}" x2="${rx}" y2="${y}" stroke="${color}" stroke-width="1.2" stroke-opacity="0.75"/>`,
    `<circle cx="${lx}" cy="${y}" r="2.5" fill="${color}" fill-opacity="0.85"/>`,
    `<circle cx="${rx}" cy="${y}" r="2.5" fill="${color}" fill-opacity="0.85"/>`,
  ].join('');
}
