/**
 * Head renderer — front-view ellipse.
 *
 * Crown = total height (floor baseline).
 * Chin  = crown − head_length.
 * Width = head_width / 2 at the widest mid-section (temples).
 *
 * head_crown_to_neck_back and head_chin_to_neck_back are used as secondary
 * Y candidates to cross-check positioning against neck landmarks.
 */

type R = Record<string, number>;

const CIRC_TO_HALF_WIDTH = 1 / Math.PI;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveCandidate {
  source: string;
  value: number;
  used: boolean;
}

export interface HeadLandmark {
  id: string;
  /** Height from floor (measurement units). */
  y: number;
  /** Half-width at this level. */
  halfW: number;
  wCandidates: ResolveCandidate[];
  yCandidates: ResolveCandidate[];
  widthConfidence: 'direct' | 'circ' | 'canonical';
}

export interface HeadResolved {
  /** [crown, head-mid, chin] — for guide lines and sidebar. */
  landmarks: HeadLandmark[];
  /** Half-width at widest point (temples). */
  halfW: number;
  /** Half-height (head_length / 2). */
  halfH: number;
  /** Center Y (= crown − halfH). */
  cy: number;
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveHeadLandmarks(R: R, totalHeight: number): HeadResolved {
  // ── Head height ────────────────────────────────────────────────────────────
  const canonH = totalHeight * 0.138; // 9 / 65
  const headLen = R.head_length > 0 ? R.head_length : canonH;
  const halfH   = headLen / 2;
  const crown   = totalHeight;
  const chin    = crown - headLen;
  const cy      = crown - halfH;

  // ── Head width ─────────────────────────────────────────────────────────────
  const directHW = R.head_width > 0 ? R.head_width / 2 : 0;
  const circHW   = R.head_circ  > 0 ? R.head_circ * CIRC_TO_HALF_WIDTH * 0.5 : 0;
  const canonHW  = totalHeight * 0.046; // 6 / 65 / 2

  const halfW  = directHW || circHW || canonHW;
  const wConf: 'direct' | 'circ' | 'canonical' =
    directHW ? 'direct' : circHW ? 'circ' : 'canonical';

  const wCandidates: ResolveCandidate[] = [
    ...(R.head_width > 0 ? [{ source: 'head_width / 2', value: directHW, used: wConf === 'direct' }] : []),
    ...(R.head_circ  > 0 ? [{ source: 'head_circ / (2π)', value: circHW, used: wConf === 'circ' }] : []),
    { source: `canonical ratio 0.046`, value: canonHW, used: wConf === 'canonical' },
  ];

  // ── Y candidates ──────────────────────────────────────────────────────────
  const crownYC: ResolveCandidate[] = [
    { source: 'height (total)', value: totalHeight, used: true },
    ...(R.height_neck_back > 0 && R.head_crown_to_neck_back > 0
      ? [{ source: 'height_neck_back + head_crown_to_neck_back', value: R.height_neck_back + R.head_crown_to_neck_back, used: false }]
      : []),
  ];

  const chinYC: ResolveCandidate[] = [
    { source: 'height − head_length', value: chin, used: true },
    ...(R.height_neck_back > 0 && R.head_chin_to_neck_back > 0
      ? [{ source: 'height_neck_back − head_chin_to_neck_back', value: R.height_neck_back - R.head_chin_to_neck_back, used: false }]
      : []),
  ];

  // Ellipse width at crown/chin ≈ 0; use a small sliver so guide line is visible.
  const crownW = halfW * 0.15;
  const chinW  = halfW * 0.35;

  const landmarks: HeadLandmark[] = [
    {
      id: 'crown',
      y: crown, halfW: crownW,
      wCandidates: wCandidates.map(c => ({ ...c, used: false })),
      yCandidates: crownYC,
      widthConfidence: wConf,
    },
    {
      id: 'head-mid',
      y: cy, halfW,
      wCandidates,
      yCandidates: [{ source: 'height − head_length / 2', value: cy, used: true }],
      widthConfidence: wConf,
    },
    {
      id: 'chin',
      y: chin, halfW: chinW,
      wCandidates: wCandidates.map(c => ({ ...c, used: false })),
      yCandidates: chinYC,
      widthConfidence: wConf,
    },
  ];

  return { landmarks, halfW, halfH, cy };
}

// ── Path builder ──────────────────────────────────────────────────────────────

export interface HeadPathOptions {
  axisX: number;
  toY: (h: number) => number;
  scale: number;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export function buildHeadPath(resolved: HeadResolved, opts: HeadPathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.18;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.6;

  const cx = axisX.toFixed(1);
  const cy = toY(resolved.cy).toFixed(1);
  const rx = (resolved.halfW * scale).toFixed(1);
  const ry = (resolved.halfH * scale).toFixed(1);

  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
}
