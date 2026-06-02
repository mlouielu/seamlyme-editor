/**
 * Orchestrates full body landmark resolution.
 */
import { R, resolveArcRatio } from './common';
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
  // We need shoulder tip positions from the torso for the arms.
  const shoulder = torso.outline.find(l => l.id === 'shoulder');
  const shoulderX = shoulder?.halfW ?? (totalHeight * 0.115);
  const shoulderY = shoulder?.y ?? (totalHeight * 0.831);

  const leftArm = resolveLeftArmLandmarks(R, -shoulderX, shoulderY, totalHeight);
  const rightArm = resolveRightArmLandmarks(R, shoulderX, shoulderY, totalHeight);

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
