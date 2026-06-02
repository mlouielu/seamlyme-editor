/**
 * Orchestrates full body landmark resolution.
 */
import { R, Landmark, resolveArcRatio } from './common';
import { resolveHeadLandmarks, HeadResolved } from './head';
import { resolveTorsoLandmarks, TorsoResolved } from './torso';
import { resolveLowerBodyLandmarks, LowerBodyResolved } from './lower-body';
import { resolveLeftArmLandmarks, resolveRightArmLandmarks, ArmResolved } from './arm';

export interface FullBodyResolved {
  head: HeadResolved;
  torso: TorsoResolved;
  lowerBody: LowerBodyResolved;
  leftArm: ArmResolved;
  rightArm: ArmResolved;
  totalHeight: number;
  arcRatio: number;
}

const RIGHT_ARM_ANGLE = 13;

// Walk the rendered torso curve from the shoulder tip by `distance`.
// Sampling keeps the arm attachment on the same curved outline used by the torso.
export function traceOutlinePathFromShoulder(
  outline: Landmark[],
  shoulderX: number,
  shoulderY: number,
  distance: number,
): [number, number][] {
  const sidx = outline.findIndex(l => l.id === 'shoulder');
  const pts = outline
    .filter(l => l.y !== null && l.halfW !== null)
    .map(l => [l.halfW!, l.y!] as [number, number]);
  const shoulderIdx = Math.max(0, sidx);
  pts[shoulderIdx] = [shoulderX, shoulderY];

  const sampleCurve = (index: number, t: number): [number, number] => {
    const p0 = pts[Math.max(0, index - 1)];
    const p1 = pts[index];
    const p2 = pts[index + 1];
    const p3 = pts[Math.min(pts.length - 1, index + 2)];
    const t2 = t * t, t3 = t2 * t;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    ];
  };

  const traced: [number, number][] = [[shoulderX, shoulderY]];
  let previous = traced[0];
  let remaining = distance;
  for (let i = shoulderIdx; i < pts.length - 1; i++) {
    for (let step = 1; step <= 12; step++) {
      const point = sampleCurve(i, step / 12);
      const dx = point[0] - previous[0], dy = point[1] - previous[1];
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= segmentLength) {
        const ratio = segmentLength > 0 ? remaining / segmentLength : 0;
        traced.push([previous[0] + dx * ratio, previous[1] + dy * ratio]);
        return traced;
      }
      traced.push(point);
      previous = point;
      remaining -= segmentLength;
    }
  }

  // Extrapolate past the last segment if distance exceeds the outline
  if (traced.length >= 2) {
    const last = traced[traced.length - 1];
    const prev = traced[traced.length - 2];
    const dx = last[0] - prev[0], dy = last[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    traced.push([last[0] + remaining * dx / len, last[1] + remaining * dy / len]);
  }

  return traced;
}

export function traceOutlineFromShoulder(
  outline: Landmark[],
  shoulderX: number,
  shoulderY: number,
  distance: number,
): [number, number] {
  const path = traceOutlinePathFromShoulder(outline, shoulderX, shoulderY, distance);
  return path[path.length - 1];
}

export function resolveFullBody(R: R, totalHeightParam?: number): FullBodyResolved {
  // 1. Determine total height
  const totalHeight = totalHeightParam && totalHeightParam > 0
    ? totalHeightParam
    : R.height > 0 ? R.height : 165;

  // 2. Resolve torso (this also gives us the arcRatio)
  const torso = resolveTorsoLandmarks(R, totalHeight);
  const arcRatio = resolveArcRatio(R);

  // 3. Resolve head
  const head = resolveHeadLandmarks(R, totalHeight);

  // 4. Resolve lower body
  const lowerBody = resolveLowerBodyLandmarks(R, totalHeight);

  // 5. Resolve arms
  const shoulder = torso.outline.find(l => l.id === 'shoulder');
  const shoulderX = shoulder?.halfW ?? (totalHeight * 0.115);
  const shoulderY = shoulder?.y ?? (totalHeight * 0.831);

  // Point A (armfold inner): trace down the actual torso outline from shoulder tip
  // by shoulder_tip_to_armfold_f so the arm attaches exactly on the torso edge.
  const L_A = R.shoulder_tip_to_armfold_f > 0 ? R.shoulder_tip_to_armfold_f : totalHeight * 0.032;
  const armfoldPath = traceOutlinePathFromShoulder(torso.outline, shoulderX, shoulderY, L_A);
  const armfoldPt = armfoldPath[armfoldPath.length - 1];

  const sideOutline = [...torso.outline, ...lowerBody.hip]
    .filter(l => l.y !== null && l.halfW !== null)
    .sort((a, b) => b.y! - a.y!);
  const leftBodySideXAtY = (y: number): number => {
    const upperIndex = sideOutline.findIndex(l => l.y! <= y);
    if (upperIndex === -1) return -(sideOutline[sideOutline.length - 1]?.halfW ?? shoulderX);
    if (upperIndex === 0) return -(sideOutline[0]?.halfW ?? shoulderX);
    const upper = sideOutline[upperIndex - 1];
    const lower = sideOutline[upperIndex];
    const span = upper.y! - lower.y!;
    const ratio = span > 0 ? (upper.y! - y) / span : 0;
    return -(upper.halfW! + (lower.halfW! - upper.halfW!) * ratio);
  };
  const hip = lowerBody.hip.find(l => l.id === 'hip');
  const leftHipSidePt: [number, number] | undefined = hip?.y != null && hip.halfW != null
    ? [-hip.halfW, hip.y]
    : undefined;

  const leftArmfoldPath = armfoldPath.map(([x, y]) => [-x, y] as [number, number]);
  const leftArm  = resolveLeftArmLandmarks(R, -shoulderX, shoulderY, armfoldPt, totalHeight, leftHipSidePt, leftBodySideXAtY, leftArmfoldPath);
  const rightArm = resolveRightArmLandmarks(R, shoulderX, shoulderY, armfoldPt, totalHeight, RIGHT_ARM_ANGLE, armfoldPath);

  return {
    head,
    torso,
    lowerBody,
    leftArm,
    rightArm,
    totalHeight,
    arcRatio,
  };
}
