/**
 * Left/Right arm renderer — akimbo and straight poses.
 */
import {
  R, Landmark, PathOptions,
  buildLandmark, crPath,
  CIRC_TO_WIDTH
} from './common';

// ── Constants ─────────────────────────────────────────────────────────────────

const UPPER_ARM_ANGLE = 50 * Math.PI / 180;
const INNER_NX = Math.cos(UPPER_ARM_ANGLE);
const INNER_NY = -Math.sin(UPPER_ARM_ANGLE);

const CANONICAL_HW: Record<string, number> = {
  shoulder:      0.032,
  'upper-arm':   0.032,
  'above-elbow': 0.029,
  elbow:         0.029,
  'lower-arm':   0.024,
  wrist:         0.015,
  'hand-palm':   0.027,
  'hand-tip':    0.012,
};

const CANONICAL_HAND_LENGTH = 0.108;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArmLandmark extends Landmark {
  side: 'left' | 'right';
  section: 'arm' | 'hand';
  x: number;
}

export interface ArmResolved {
  landmarks: ArmLandmark[];
  elbowIdx: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function circ(val: number, label: string) {
  return { source: `${label} / π`, value: val > 0 ? val * CIRC_TO_WIDTH : 0, confidence: 'circ' as const, missing: !(val > 0) };
}

// ── Width candidate collectors ────────────────────────────────────────────────

const shoulderWC = (R: R) => [circ(R.arm_upper_circ, 'arm_upper_circ')];
const upperArmWC = (R: R) => [circ(R.arm_upper_circ, 'arm_upper_circ'), circ(R.arm_above_elbow_circ, 'arm_above_elbow_circ')];
const aboveElbowWC = (R: R) => [circ(R.arm_above_elbow_circ, 'arm_above_elbow_circ'), circ(R.arm_upper_circ, 'arm_upper_circ')];
const elbowWC = (R: R) => [circ(R.arm_elbow_circ_bent, 'arm_elbow_circ_bent'), circ(R.arm_elbow_circ, 'arm_elbow_circ'), circ(R.arm_above_elbow_circ, 'arm_above_elbow_circ')];
const lowerArmWC = (R: R) => [circ(R.arm_lower_circ, 'arm_lower_circ')];
const wristWC = (R: R) => [circ(R.arm_wrist_circ, 'arm_wrist_circ')];

const handPalmWC = (R: R) => [
  { source: 'hand_palm_width', value: R.hand_palm_width > 0 ? R.hand_palm_width : 0, confidence: 'direct' as const, missing: !(R.hand_palm_width > 0) },
  circ(R.hand_palm_circ, 'hand_palm_circ'),
  circ(R.hand_circ, 'hand_circ'),
];

const handTipWC = (R: R) => handPalmWC(R).map(c => ({ ...c, source: `${c.source} × 0.4`, value: c.value * 0.4 }));

// ── Main resolvers ────────────────────────────────────────────────────────────

export function resolveLeftArmLandmarks(R: R, shoulderTipX: number, shoulderTipY: number, totalHeight: number): ArmResolved {
  const armUpperW = R.arm_upper_circ > 0 ? R.arm_upper_circ * CIRC_TO_WIDTH : totalHeight * CANONICAL_HW['shoulder'] * 2;
  const armUpperHW = armUpperW / 2;
  const shoulderX = shoulderTipX + INNER_NX * armUpperHW;
  const shoulderY = shoulderTipY + INNER_NY * armUpperHW;

  const upperArmLen = R.arm_shoulder_tip_to_elbow_bent > 0 ? R.arm_shoulder_tip_to_elbow_bent : R.arm_shoulder_tip_to_wrist_bent > 0 ? R.arm_shoulder_tip_to_wrist_bent * 0.6 : totalHeight * 0.223;
  const forearmLen = R.arm_elbow_to_wrist_bent > 0 ? R.arm_elbow_to_wrist_bent : (R.arm_shoulder_tip_to_wrist_bent > 0 && R.arm_shoulder_tip_to_elbow_bent > 0) ? R.arm_shoulder_tip_to_wrist_bent - R.arm_shoulder_tip_to_elbow_bent : totalHeight * 0.146;

  const elbowX = shoulderX - upperArmLen * Math.sin(UPPER_ARM_ANGLE);
  const elbowY = shoulderY - upperArmLen * Math.cos(UPPER_ARM_ANGLE);

  const wristY = R.height_highhip > 0 ? R.height_highhip : R.height_waist_side > 0 ? R.height_waist_side : totalHeight * 0.554;
  const dropY = Math.min(Math.max(elbowY - wristY, 0), forearmLen * 0.99);
  const forearmAngle = Math.acos(dropY / forearmLen);
  const wristX = elbowX + forearmLen * Math.sin(forearmAngle);

  const forearmDX = wristX - elbowX, forearmDY = wristY - elbowY, forearmL = Math.sqrt(forearmDX ** 2 + forearmDY ** 2) || 1;
  const fDirX = forearmDX / forearmL, fDirY = forearmDY / forearmL;
  const handLen = R.hand_length > 0 ? R.hand_length : R.hand_palm_length > 0 ? R.hand_palm_length * 1.5 : totalHeight * CANONICAL_HAND_LENGTH;

  function lm(id: string, section: 'arm' | 'hand', x: number, y: number, wCands: any[]): ArmLandmark {
    const base = buildLandmark(id, totalHeight, [{ source: `x=${x.toFixed(2)} y=${y.toFixed(2)} (computed)`, value: y }], wCands, { yRatio: 0, halfWRatio: CANONICAL_HW[id] ?? 0.02 });
    return { ...base, side: 'left', section, x };
  }

  const [umX, umY] = [shoulderX + (elbowX - shoulderX) * 0.45, shoulderY + (elbowY - shoulderY) * 0.45];
  const [aeX, aeY] = [shoulderX + (elbowX - shoulderX) * 0.78, shoulderY + (elbowY - shoulderY) * 0.78];
  const [laX, laY] = [elbowX + (wristX - elbowX) * 0.5, elbowY + (wristY - elbowY) * 0.5];
  const [palmX, palmY] = [wristX + fDirX * handLen * 0.45, wristY + fDirY * handLen * 0.45];
  const [tipX, tipY] = [wristX + fDirX * handLen, wristY + fDirY * handLen];

  return {
    landmarks: [
      lm('shoulder', 'arm', shoulderX, shoulderY, shoulderWC(R)),
      lm('upper-arm', 'arm', umX, umY, upperArmWC(R)),
      lm('above-elbow', 'arm', aeX, aeY, aboveElbowWC(R)),
      lm('elbow', 'arm', elbowX, elbowY, elbowWC(R)),
      lm('lower-arm', 'arm', laX, laY, lowerArmWC(R)),
      lm('wrist', 'arm', wristX, wristY, wristWC(R)),
      lm('hand-palm', 'hand', palmX, palmY, handPalmWC(R)),
      lm('hand-tip', 'hand', tipX, tipY, handTipWC(R)),
    ],
    elbowIdx: 3
  };
}

export function resolveRightArmLandmarks(R: R, shoulderTipX: number, shoulderTipY: number, totalHeight: number): ArmResolved {
  const armUpperW = R.arm_upper_circ > 0 ? R.arm_upper_circ * CIRC_TO_WIDTH : totalHeight * CANONICAL_HW['shoulder'] * 2;
  const armUpperHW = armUpperW / 2;
  const armfoldW = R.armfold_to_armfold_f > 0 ? R.armfold_to_armfold_f : R.body_armfold_circ > 0 ? R.body_armfold_circ / Math.PI : R.body_bust_circ > 0 ? R.body_bust_circ / Math.PI * 0.9 : totalHeight * 0.096 * 2;
  const armfoldHW = armfoldW / 2;
  const armfoldCenterX = armfoldHW + armUpperHW;

  const armfoldY = R.height_armpit > 0 ? R.height_armpit : (R.shoulder_tip_to_armfold_f > 0 ? (() => {
    const dx = Math.abs(armfoldCenterX - shoulderTipX);
    const dy = Math.sqrt(Math.max(0, R.shoulder_tip_to_armfold_f ** 2 - dx ** 2));
    return shoulderTipY - dy;
  })() : totalHeight * 0.754);

  const dX = armfoldCenterX - shoulderTipX, dY = armfoldY - shoulderTipY, dLen = Math.sqrt(dX * dX + dY * dY) || 1;
  const tanX = dX / dLen, tanY = dY / dLen;
  const outerNX = -tanY, outerNY = tanX;
  const shoulderX = shoulderTipX - outerNX * armUpperHW, shoulderY = shoulderTipY - outerNY * armUpperHW;

  const upperArmLen = R.arm_shoulder_tip_to_elbow > 0 ? R.arm_shoulder_tip_to_elbow : R.arm_shoulder_tip_to_elbow_bent > 0 ? R.arm_shoulder_tip_to_elbow_bent : totalHeight * 0.208;
  const forearmLen = R.arm_elbow_to_wrist > 0 ? R.arm_elbow_to_wrist : R.arm_elbow_to_wrist_bent > 0 ? R.arm_elbow_to_wrist_bent : totalHeight * 0.146;

  const at = (dist: number): [number, number] => [shoulderX + tanX * dist, shoulderY + tanY * dist];
  const [elbowX, elbowY] = at(upperArmLen);
  const [wristX, wristY] = at(upperArmLen + forearmLen);

  const armfoldLen = R.shoulder_tip_to_armfold_f > 0 ? R.shoulder_tip_to_armfold_f : (R.arm_shoulder_tip_to_armfold_line > 0 ? R.arm_shoulder_tip_to_armfold_line : dLen);
  const handLen = R.hand_length > 0 ? R.hand_length : R.hand_palm_length > 0 ? R.hand_palm_length * 1.5 : totalHeight * CANONICAL_HAND_LENGTH;

  const [palmX, palmY] = at(upperArmLen + forearmLen + handLen * 0.45);
  const [tipX, tipY] = at(upperArmLen + forearmLen + handLen);

  function lm(id: string, section: 'arm' | 'hand', x: number, y: number, wCands: any[]): ArmLandmark {
    const base = buildLandmark(id, totalHeight, [{ source: `x=${x.toFixed(2)} y=${y.toFixed(2)} (computed)`, value: y }], wCands, { yRatio: 0, halfWRatio: CANONICAL_HW[id] ?? 0.02 });
    return { ...base, side: 'right', section, x };
  }

  const [umX, umY] = at(armfoldLen * 0.5);
  const [aeX, aeY] = at(armfoldLen);
  const [laX, laY] = at(upperArmLen + forearmLen * 0.5);

  return {
    landmarks: [
      lm('shoulder', 'arm', shoulderX, shoulderY, shoulderWC(R)),
      lm('upper-arm', 'arm', umX, umY, upperArmWC(R)),
      lm('above-elbow', 'arm', aeX, aeY, aboveElbowWC(R)),
      lm('elbow', 'arm', elbowX, elbowY, elbowWC(R)),
      lm('lower-arm', 'arm', laX, laY, lowerArmWC(R)),
      lm('wrist', 'arm', wristX, wristY, wristWC(R)),
      lm('hand-palm', 'hand', palmX, palmY, handPalmWC(R)),
      lm('hand-tip', 'hand', tipX, tipY, handTipWC(R)),
    ],
    elbowIdx: 3
  };
}

// ── Path builder ──────────────────────────────────────────────────────────────

export interface ArmPathOptions extends PathOptions {
  flipNormals?: boolean;
  capSweep?: 0 | 1;
}

function computeNormals(pts: [number, number][]): [number, number][] {
  return pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0], dy = next[1] - prev[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [-dy / len, dx / len];
  });
}

export function buildArmPath(resolved: ArmResolved, opts: ArmPathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity = opts.fillOpacity ?? 0.22, strokeWidth = opts.strokeWidth ?? 1.5, strokeOpacity = opts.strokeOpacity ?? 0.55;

  const center: [number, number][] = resolved.landmarks.map(l => [axisX + l.x * scale, toY(l.y!)]);
  const hws = resolved.landmarks.map(l => (l.halfW ?? 0) * scale), ns = computeNormals(center);

  const dir = opts.flipNormals ? -1 : 1;
  const outer: [number, number][] = center.map((p, i) => [p[0] + dir * ns[i][0] * hws[i], p[1] + dir * ns[i][1] * hws[i]] as [number, number]);
  const inner: [number, number][] = center.map((p, i) => [p[0] - dir * ns[i][0] * hws[i], p[1] - dir * ns[i][1] * hws[i]] as [number, number]).reverse();

  const sw = opts.capSweep ?? 1, capR = hws[0].toFixed(1);
  const cap = `A ${capR} ${capR} 0 0 ${sw} ${outer[0][0].toFixed(1)} ${outer[0][1].toFixed(1)}`;

  const d = crPath(outer) + ` A ${hws[hws.length - 1].toFixed(1)} ${hws[hws.length - 1].toFixed(1)} 0 0 ${sw} ${inner[0][0].toFixed(1)} ${inner[0][1].toFixed(1)}` + crPath(inner, false) + ` ${cap}`;

  return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}
