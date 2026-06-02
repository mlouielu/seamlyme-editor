/**
 * Head and neck renderer.
 */
import { R, Landmark, PathOptions, buildLandmark, circWidth } from './common';

export interface HeadResolved {
  /** [crown, head-mid, chin] — for guide lines and sidebar. */
  landmarks: Landmark[];
  head: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  };
  neck: Landmark;
}

const CANONICAL_NECK = { yRatio: 0.88, halfWRatio: 0.038 };

export function resolveHeadLandmarks(R: R, totalHeight: number): HeadResolved {
  const headH = R.head_length > 0 ? R.head_length : totalHeight * 0.138;
  const headRy = headH * 0.5;
  const headRx = R.head_width > 0 ? R.head_width * 0.5 : headRy * 0.72;
  const cy = totalHeight - headRy;

  const neckWC = [
    ...(R.neck_width > 0 ? [{ source: 'neck_width', value: R.neck_width, confidence: 'direct' as const }] : []),
    ...circWidth(R, 'neck_arc_f').map(c => ({ ...c, source: 'neck_arc_f × ratio × 2', value: c.value })) // simplified
  ];

  const neck = buildLandmark('neck', totalHeight, [
    ...(R.height_neck_back > 0 ? [{ source: 'height_neck_back', value: R.height_neck_back }] : []),
    ...(R.height_neck_front > 0 ? [{ source: 'height_neck_front', value: R.height_neck_front }] : []),
  ], neckWC, CANONICAL_NECK);

  const landmarks: Landmark[] = [
    buildLandmark('crown', totalHeight, [{ source: 'total height', value: totalHeight }], [], { yRatio: 1, halfWRatio: 0.01 }),
    buildLandmark('head-mid', totalHeight, [{ source: 'center', value: cy }], [
      ...(R.head_width > 0 ? [{ source: 'head_width', value: R.head_width, confidence: 'direct' as const }] : []),
      ...circWidth(R, 'head_circ'),
    ], { yRatio: cy/totalHeight, halfWRatio: headRx/totalHeight }),
    buildLandmark('chin', totalHeight, [{ source: 'crown - head_length', value: totalHeight - headH }], [], { yRatio: (totalHeight - headH)/totalHeight, halfWRatio: 0.02 }),
  ];

  return {
    landmarks,
    head: {
      cx: 0,
      cy,
      rx: headRx,
      ry: headRy,
    },
    neck,
  };
}

export function buildHeadPath(resolved: HeadResolved, opts: PathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.18;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.6;

  const cx = axisX.toFixed(1);
  const cy = toY(resolved.head.cy).toFixed(1);
  const rx = (resolved.head.rx * scale).toFixed(1);
  const ry = (resolved.head.ry * scale).toFixed(1);

  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
}

export function buildNeckPath(resolved: HeadResolved, neckSide: Landmark, opts: PathOptions): string {
  if (neckSide.y === null) return '';
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity = opts.fillOpacity ?? 0.18;
  const strokeWidth = opts.strokeWidth ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.6;
  const lowerHalfW = neckSide.halfW ?? resolved.neck.halfW ?? 0;
  const upperHalfW = Math.min(lowerHalfW, resolved.head.rx * 0.9);
  const ellipseRatio = resolved.head.rx > 0 ? upperHalfW / resolved.head.rx : 0;
  const upperY = resolved.head.cy - resolved.head.ry * Math.sqrt(Math.max(0, 1 - ellipseRatio ** 2));
  const lowerY = Math.min(neckSide.y, upperY);
  const upperScreenY = toY(upperY);
  const lowerScreenY = toY(lowerY);
  const midScreenY = (upperScreenY + lowerScreenY) / 2;
  const upperLeftX = axisX - upperHalfW * scale;
  const upperRightX = axisX + upperHalfW * scale;
  const lowerLeftX = axisX - lowerHalfW * scale;
  const lowerRightX = axisX + lowerHalfW * scale;
  const shape =
    `M ${upperLeftX.toFixed(1)} ${upperScreenY.toFixed(1)}` +
    ` C ${upperLeftX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerLeftX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerLeftX.toFixed(1)} ${lowerScreenY.toFixed(1)}` +
    ` L ${lowerRightX.toFixed(1)} ${lowerScreenY.toFixed(1)}` +
    ` C ${lowerRightX.toFixed(1)} ${midScreenY.toFixed(1)} ${upperRightX.toFixed(1)} ${midScreenY.toFixed(1)} ${upperRightX.toFixed(1)} ${upperScreenY.toFixed(1)}` +
    ' Z';
  const sides =
    `M ${upperLeftX.toFixed(1)} ${upperScreenY.toFixed(1)}` +
    ` C ${upperLeftX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerLeftX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerLeftX.toFixed(1)} ${lowerScreenY.toFixed(1)}` +
    ` M ${upperRightX.toFixed(1)} ${upperScreenY.toFixed(1)}` +
    ` C ${upperRightX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerRightX.toFixed(1)} ${midScreenY.toFixed(1)} ${lowerRightX.toFixed(1)} ${lowerScreenY.toFixed(1)}`;

  return (
    `<path d="${shape}" fill="${fill}" fill-opacity="${fillOpacity}"/>` +
    `<path d="${sides}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linecap="round"/>`
  );
}
