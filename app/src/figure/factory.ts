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

// Walk the torso outline right-side polyline from the shoulder tip by `distance`,
// returning the point in measurement-space (halfW, y) coordinates.
export function traceOutlineFromShoulder(
  outline: Landmark[],
  shoulderX: number,
  shoulderY: number,
  distance: number,
): [number, number] {
  const sidx = outline.findIndex(l => l.id === 'shoulder');
  const pts: [number, number][] = [[shoulderX, shoulderY]];
  for (let i = sidx + 1; i < outline.length; i++) {
    const l = outline[i];
    if (l.y !== null && l.halfW !== null) pts.push([l.halfW, l.y]);
  }

  let rem = distance;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const seg = Math.sqrt(dx * dx + dy * dy);
    if (rem <= seg) {
      const t = rem / seg;
      return [pts[i][0] + t * dx, pts[i][1] + t * dy];
    }
    rem -= seg;
  }

  // Extrapolate past the last segment if distance exceeds the outline
  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const dx = last[0] - prev[0], dy = last[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [last[0] + rem * dx / len, last[1] + rem * dy / len];
  }

  return [shoulderX, shoulderY - distance];
}

export function resolveFullBody(R: R, totalHeightParam?: number): FullBodyResolved {
  // 1. Determine total height
  const totalHeight = totalHeightParam ?? R.height ?? 165;

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
  const armfoldPt = traceOutlineFromShoulder(torso.outline, shoulderX, shoulderY, L_A);

  const leftArm = resolveLeftArmLandmarks(R, -shoulderX, shoulderY, totalHeight);
  const rightArm = resolveRightArmLandmarks(R, shoulderX, shoulderY, armfoldPt, totalHeight);

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
