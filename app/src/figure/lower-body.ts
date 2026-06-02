/**
 * Lower-body outline renderer — waist to ankle.
 */
import {
  R, Landmark, PathOptions,
  buildLandmark, crPath,
  measuredY, measuredW, offsetUpY, offsetDownY, lerpY, arcWidth, circWidth,
  resolveArcRatio, CIRC_TO_WIDTH
} from './common';

// ── Canonical proportions ─────────────────────────────────────────────────────

const CANONICAL_HIP: Record<string, { yRatio: number; halfWRatio: number }> = {
  waist:   { yRatio: 0.615, halfWRatio: 0.104 },
  highhip: { yRatio: 0.554, halfWRatio: 0.131 },
  hip:     { yRatio: 0.485, halfWRatio: 0.154 },
  crotch:  { yRatio: 0.462, halfWRatio: 0.138 },
};

const CANONICAL_LEG: Record<string, { yRatio: number; halfWRatio: number }> = {
  'thigh-upper': { yRatio: 0.400, halfWRatio: 0.054 },
  'thigh-mid':   { yRatio: 0.338, halfWRatio: 0.048 },
  knee:          { yRatio: 0.269, halfWRatio: 0.037 },
  'knee-small':  { yRatio: 0.254, halfWRatio: 0.032 },
  calf:          { yRatio: 0.169, halfWRatio: 0.034 },
  'ankle-high':  { yRatio: 0.062, halfWRatio: 0.024 },
  ankle:         { yRatio: 0.038, halfWRatio: 0.022 },
};

const CANONICAL_LEG_OFFSET_RATIO = 0.088;

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface FootResolved extends Landmark {
  footLength: number;
  instepWidth: number;
  ballWidth: number;
}

export interface LowerBodyResolved {
  hip: Landmark[];
  leg: Landmark[];
  legOffset: number;
  foot: FootResolved | null;
}

export function resolveLowerBodyLandmarks(R: R, totalHeight: number): LowerBodyResolved {
  const arcRatio = resolveArcRatio(R);

  const bh = (id: string, yC: any[], wC: any[]) => buildLandmark(id, totalHeight, yC, wC, CANONICAL_HIP[id]);
  const bl = (id: string, yC: any[], wC: any[]) => buildLandmark(id, totalHeight, yC, wC, CANONICAL_LEG[id]);

  const hip = [
    bh('waist', [
        ...measuredY(R, 'height_waist_side'),
        ...measuredY(R, 'height_waist_front')
      ], [
        ...measuredW(R, 'width_waist', 'direct'),
        ...arcWidth(R, 'waist_arc_f', arcRatio),
        ...circWidth(R, 'waist_circ')
      ]),
    bh('highhip', [
        ...measuredY(R, 'height_highhip'),
        ...offsetDownY(R, 'height_waist_side', 'waist_to_highhip_side')
      ], [
        ...arcWidth(R, 'highhip_arc_f', arcRatio),
        ...circWidth(R, 'highhip_circ')
      ]),
    bh('hip', [
        ...measuredY(R, 'height_hip'),
        ...offsetDownY(R, 'height_waist_side', 'waist_to_hip_side')
      ], [
        ...measuredW(R, 'width_hip', 'direct'),
        ...arcWidth(R, 'hip_arc_f', arcRatio),
        ...circWidth(R, 'hip_circ')
      ]),
    bh('crotch', [
        ...measuredY(R, 'leg_crotch_to_floor'),
        ...(R.height_hip > 0 ? [{ source: 'height_hip × 0.93', value: R.height_hip * 0.93 }] : []),
        ...measuredY(R, 'height_gluteal_fold')
      ], [
        ...arcWidth(R, 'hip_arc_f', arcRatio).map(c => ({ ...c, value: c.value * 0.92, source: c.source + ' × 0.92' })),
        ...circWidth(R, 'hip_circ').map(c => ({ ...c, value: c.value * 0.92, source: c.source + ' × 0.92' }))
      ]),
  ].filter(l => l.y !== null);

  const leg = [
    bl('thigh-upper', [
        ...(R.height_gluteal_fold > 0 && R.height_knee > 0 ? [{ source: 'lerp(height_gluteal_fold, height_knee, 0.1)', value: R.height_gluteal_fold * 0.9 + R.height_knee * 0.1 }] : []),
        ...(R.leg_crotch_to_floor > 0 && R.height_knee > 0 ? [{ source: 'lerp(leg_crotch_to_floor, height_knee, 0.3)', value: R.leg_crotch_to_floor * 0.7 + R.height_knee * 0.3 }] : [])
      ], [
        ...circWidth(R, 'leg_thigh_upper_circ')
      ]),
    bl('thigh-mid', [
        ...(R.height_gluteal_fold > 0 && R.height_knee > 0 ? [{ source: 'lerp(height_gluteal_fold, height_knee, 0.55)', value: R.height_gluteal_fold * 0.45 + R.height_knee * 0.55 }] : []),
        ...(R.leg_crotch_to_floor > 0 && R.height_knee > 0 ? [{ source: 'lerp(leg_crotch_to_floor, height_knee, 0.55)', value: R.leg_crotch_to_floor * 0.45 + R.height_knee * 0.55 }] : [])
      ], [
        ...circWidth(R, 'leg_thigh_mid_circ')
      ]),
    bl('knee', [
        ...measuredY(R, 'height_knee'),
        ...offsetDownY(R, 'height_waist_side', 'height_waist_side_to_knee')
      ], [
        ...circWidth(R, 'leg_knee_circ')
      ]),
    bl('knee-small', [
        ...(R.height_knee > 0 ? [{ source: 'height_knee × 0.93', value: R.height_knee * 0.93 }] : [])
      ], [
        ...circWidth(R, 'leg_knee_small_circ'),
        ...circWidth(R, 'leg_knee_circ').map(c => ({ ...c, value: c.value * 0.87, source: c.source + ' × 0.87' }))
      ]),
    bl('calf', [
        ...measuredY(R, 'height_calf'),
        ...lerpY(R, 'height_knee', 'height_ankle_high', 0.5)
      ], [
        ...circWidth(R, 'leg_calf_circ')
      ]),
    bl('ankle-high', [
        ...measuredY(R, 'height_ankle_high')
      ], [
        ...circWidth(R, 'leg_ankle_high_circ')
      ]),
    bl('ankle', [
        ...measuredY(R, 'height_ankle'),
        ...(R.height_ankle_high > 0 ? [{ source: 'height_ankle_high × 0.6', value: R.height_ankle_high * 0.6 }] : [])
      ], [
        ...circWidth(R, 'leg_ankle_circ'),
        ...circWidth(R, 'leg_ankle_high_circ').map(c => ({ ...c, value: c.value * 0.9, source: c.source + ' × 0.9' }))
      ]),
  ].filter(l => l.y !== null);

  const thighLm = leg.find(l => l.id === 'thigh-upper');
  const legOffset = thighLm?.halfW ?? totalHeight * CANONICAL_LEG_OFFSET_RATIO;

  // Foot resolution
  const footWC = [
    ...(R.foot_length > 0 ? [{ source: 'foot_length', value: R.foot_length, confidence: 'derived' as const }] : []), // using length as a metric for list
  ];
  const footBase = buildLandmark('foot', totalHeight, [{ source: 'floor', value: 0 }], footWC, { yRatio: 0, halfWRatio: 0.032 });

  const footLength = R.foot_length > 0 ? R.foot_length : totalHeight * 0.146;
  const instepWidth = R.foot_instep_circ > 0 ? R.foot_instep_circ * CIRC_TO_WIDTH : totalHeight * 0.055;
  const ballWidth = R.foot_circ > 0 ? R.foot_circ * CIRC_TO_WIDTH : totalHeight * 0.045;


  const foot: FootResolved | null = footBase.y !== null ? {
    ...footBase,
    footLength,
    instepWidth,
    ballWidth,
  } : null;

  return { hip, leg, legOffset, foot };
}

// ── Path builders ─────────────────────────────────────────────────────────────

export function buildHipPath(hip: Landmark[], opts: PathOptions): string {
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
  leg: Landmark[],
  legOffset: number,
  crotch: Landmark | null,
  opts: PathOptions,
): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;
  const ox = legOffset * scale;

  function oneLeg(cx: number): string {
    const thighHalfW = (leg[0]?.halfW ?? 0) * scale;
    const right: [number, number][] = leg.map(l => [cx + (l.halfW ?? 0) * scale, toY(l.y!)]);
    if (crotch?.y != null) right.unshift([cx + thighHalfW, toY(crotch.y)]);
    const left: [number, number][] = [...right].reverse().map(([x, y]) => [2 * cx - x, y]);
    const d = crPath(right) + ` L ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}` + crPath(left, false) + ' Z';
    return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
  }

  return oneLeg(axisX + ox) + oneLeg(axisX - ox);
}

export function buildFootPaths(
  ankleLm: Landmark,
  foot: FootResolved,
  legOffset: number,
  opts: PathOptions,
): string {
  if (ankleLm.y === null || ankleLm.halfW === null) return '';
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;

  const ox        = legOffset * scale;
  const ankleY    = toY(ankleLm.y);
  const floorY    = toY(0);

  const ankleHW  = ankleLm.halfW * scale;
  const footL    = foot.footLength * scale;
  const instepH  = foot.instepWidth * scale;
  const ballH    = foot.ballWidth * scale;

  function oneFoot(cx: number, sign: number): string {
    // 1. Horizontal Coordinates (respecting direction via 'sign')
    const xHeel       = cx - sign * ankleHW;
    const xFrontAnkle = cx + sign * ankleHW;
    const xToe        = xHeel + sign * footL; // Total length maps exactly from heel line

    // Proportionally place anatomical landmarks along the foot profile
    const xInstep     = xHeel + sign * (footL * 0.35); // Instep sits around 35% forward
    const xBall       = xHeel + sign * (footL * 0.75); // Ball sits around 75% forward

    // 2. Vertical Coordinates (SVG Y-axis goes downwards)
    const yAnkle      = ankleY;
    const yInstep     = floorY - instepH;
    const yBall       = floorY - ballH;
    const yToeTop     = floorY - (ballH * 0.25); // Slightly tapered toe box
    const yFloor      = floorY;

    // 3. Constructing the Path
    const d =
      `M ${xHeel.toFixed(1)} ${yAnkle.toFixed(1)}` +                             // Start at back ankle line
      ` L ${xFrontAnkle.toFixed(1)} ${yAnkle.toFixed(1)}` +                       // Line to front ankle bridge
      ` C ${xFrontAnkle.toFixed(1)} ${yInstep.toFixed(1)}, ` +
        `${xInstep.toFixed(1)} ${yInstep.toFixed(1)}, ` +
        `${xBall.toFixed(1)} ${yBall.toFixed(1)}` +                              // Smooth curve through instep down to ball height
      ` Q ${((xBall + xToe) / 2).toFixed(1)} ${yBall.toFixed(1)}, ` +
        `${xToe.toFixed(1)} ${yToeTop.toFixed(1)}` +                             // Smooth transition over the toe box
      ` L ${xToe.toFixed(1)} ${yFloor.toFixed(1)}` +                             // Drop to toe tip floor
      ` L ${xHeel.toFixed(1)} ${yFloor.toFixed(1)}` +                            // Run flat along the ground to heel
      ` Z`;                                                                      // Close back up the Achilles heel line

    return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
  }

  return oneFoot(axisX + ox, +1) + oneFoot(axisX - ox, -1);
}
