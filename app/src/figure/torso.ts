/**
 * Torso outline renderer — shoulder to waist.
 */
import {
  R, Landmark, PathOptions,
  buildLandmark, crPath,
  measuredY, measuredW, offsetUpY, offsetDownY, lerpY, arcWidth, circWidth,
  resolveArcRatio
} from './common';

// ── Canonical proportions ─────────────────────────────────────────────────────

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

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface TorsoResolved {
  outline: Landmark[];
  neckline: { side: Landmark; front: Landmark } | null;
  neckBack: Landmark | null;
  interior: Landmark[];
}

export function resolveTorsoLandmarks(R: R, totalHeight: number): TorsoResolved {
  const arcRatio = resolveArcRatio(R);

  const b = (id: string, yC: any[], wC: any[]) => buildLandmark(id, totalHeight, yC, wC, CANONICAL[id]);

  const shoulderY = [
    ...measuredY(R, 'height_shoulder_tip'),
    ...(R.height_neck_front > 0 && R.neck_front_to_shoulder_tip_f > 0 && R.neck_width > 0 ? (() => {
      const dx = Math.max(0, R.neck_width * 0.5 + R.neck_front_to_shoulder_tip_f - R.neck_width * 0.5);
      const dy = Math.sqrt(Math.max(0, R.neck_front_to_shoulder_tip_f ** 2 - dx ** 2));
      return dy > 0 ? [{ source: 'height_neck_front - Δy(neck_front_to_shoulder_tip_f)', value: R.height_neck_front - dy }] : [];
    })() : [])
  ];

  const neckW = [
    ...measuredW(R, 'neck_width', 'direct'),
    ...arcWidth(R, 'neck_arc_f', arcRatio)
  ];

  const outline = [
    b('neck-side', [
        ...measuredY(R, 'height_neck_side'),
        ...(R.height_neck_back > 0 && R.head_chin_to_neck_back > 0 ? [{ source: 'height_neck_back - head_chin_to_neck_back × 0.3', value: R.height_neck_back - R.head_chin_to_neck_back * 0.3 }] : []),
        ...measuredY(R, 'height_neck_back'),
        ...measuredY(R, 'height_neck_front')
      ], neckW),
    b('shoulder', shoulderY, [
        ...measuredW(R, 'shoulder_tip_to_shoulder_tip_f', 'direct'),
        ...measuredW(R, 'width_shoulder', 'direct')
      ]),
    b('highbust', [
        ...offsetDownY(R, 'height_neck_front', 'neck_front_to_highbust_f'),
        ...lerpY(R, 'height_armpit', 'height_bustpoint', 0.5)
      ], [
        ...arcWidth(R, 'highbust_arc_f', arcRatio),
        ...circWidth(R, 'highbust_circ')
      ]),
    b('bust', [
        ...measuredY(R, 'height_bustpoint'),
        ...offsetDownY(R, 'height_neck_front', 'neck_front_to_bust_f')
      ], [
        ...arcWidth(R, 'bust_arc_f', arcRatio),
        ...circWidth(R, 'bust_circ'),
        ...measuredW(R, 'width_bust', 'direct')
      ]),
    b('lowbust', [
        ...offsetUpY(R, 'height_waist_front', 'lowbust_to_waist_f'),
        ...offsetUpY(R, 'height_waist_side', 'lowbust_to_waist_f'),
        ...lerpY(R, 'height_bustpoint', 'height_waist_side', 0.35)
      ], [
        ...arcWidth(R, 'lowbust_arc_f', arcRatio),
        ...circWidth(R, 'lowbust_circ')
      ]),
    b('rib', [
        ...lerpY(R, 'height_bustpoint', 'height_waist_side', 0.65)
      ], [
        ...arcWidth(R, 'rib_arc_f', arcRatio),
        ...circWidth(R, 'rib_circ')
      ]),
    b('waist', [
        ...measuredY(R, 'height_waist_side'),
        ...measuredY(R, 'height_waist_front'),
        ...offsetDownY(R, 'height_bustpoint', 'bust_to_waist_f')
      ], [
        ...measuredW(R, 'width_waist', 'direct'),
        ...arcWidth(R, 'waist_arc_f', arcRatio),
        ...circWidth(R, 'waist_circ')
      ]),
  ].filter(l => l.y !== null);

  const neckSide  = b('neck-side', [
      ...measuredY(R, 'height_neck_side'),
      ...(R.height_neck_back > 0 && R.head_chin_to_neck_back > 0 ? [{ source: 'height_neck_back - head_chin_to_neck_back × 0.3', value: R.height_neck_back - R.head_chin_to_neck_back * 0.3 }] : []),
      ...measuredY(R, 'height_neck_back'),
      ...measuredY(R, 'height_neck_front')
    ], neckW);
  const neckFront = b('neck-front', [
      ...measuredY(R, 'height_neck_front'),
      ...offsetDownY(R, 'height_neck_back', 'head_chin_to_neck_back')
    ], neckW);
  const neckBack  = b('neck-back', [
      ...measuredY(R, 'height_neck_back'),
      ...(R.height_neck_front > 0 && R.head_chin_to_neck_back > 0 ? [{ source: 'height_neck_front + head_chin_to_neck_back', value: R.height_neck_front + R.head_chin_to_neck_back }] : []),
      ...measuredY(R, 'height_neck_side')
    ], neckW);

  const neckline = (neckSide.y !== null && neckFront.y !== null)
    ? { side: neckSide, front: neckFront }
    : null;

  const interior = [
    b('bustpoint', [
        ...measuredY(R, 'height_bustpoint'),
        ...offsetDownY(R, 'height_neck_front', 'neck_front_to_bust_f')
      ], [
        ...(R.bustpoint_to_bustpoint_half > 0 ? [{ source: 'bustpoint_to_bustpoint_half × 2', value: R.bustpoint_to_bustpoint_half * 2, confidence: 'direct' as const }] : []),
        ...measuredW(R, 'bustpoint_to_bustpoint', 'direct')
      ]),
  ].filter(l => l.y !== null);

  return { outline, neckline, neckBack: neckBack.y !== null ? neckBack : null, interior };
}

// ── Path builders ──────────────────────────────────────────────────────────────

export function buildTorsoPath(outline: Landmark[], opts: PathOptions): string {
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
  neckSide: Landmark,
  neckBack: Landmark,
  opts: PathOptions & { color?: string },
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
    `<line x1="${lx}" y1="${syF}" x2="${lx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3 2"/>`,
    `<line x1="${rx}" y1="${syF}" x2="${rx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3 2"/>`,
    `<line x1="${lx}" y1="${byF}" x2="${rx}" y2="${byF}" stroke="${color}" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="2 3"/>`,
  ].join('');
}

export function buildNecklineCurve(
  neckline: NonNullable<TorsoResolved['neckline']>,
  opts: PathOptions & { color?: string },
): string {
  const { axisX, toY, scale } = opts;
  const color = opts.color ?? '#a1a1aa';

  const sideY  = toY(neckline.side.y!);
  const frontY = toY(neckline.front.y!);
  const hw     = (neckline.side.halfW ?? 0) * scale;

  const lx = axisX - hw;
  const rx = axisX + hw;

  const cpDrop = (frontY - sideY) * 0.55;
  const d =
    `M ${lx.toFixed(1)} ${sideY.toFixed(1)}` +
    ` C ${lx.toFixed(1)} ${(sideY + cpDrop).toFixed(1)} ${axisX.toFixed(1)} ${frontY.toFixed(1)} ${axisX.toFixed(1)} ${frontY.toFixed(1)}` +
    ` C ${axisX.toFixed(1)} ${frontY.toFixed(1)} ${rx.toFixed(1)} ${(sideY + cpDrop).toFixed(1)} ${rx.toFixed(1)} ${sideY.toFixed(1)}`;

  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-opacity="0.7" stroke-linecap="round"/>`;
}

export function buildBustpointMark(
  bustpoint: Landmark,
  opts: PathOptions & { color?: string },
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
