/**
 * Left arm renderer — arms akimbo pose (elbow out, wrist resting on hip).
 *
 * Anchor: the OUTER edge of the arm at the shoulder == shoulder tip.
 * The arm center is shifted inward by arm_upper_halfW along the inner normal
 * so the ribbon's outer edge lands exactly at the shoulder tip.
 *
 * Hand landmarks are appended to the same landmark array and rendered as a
 * continuous ribbon that flows from the wrist.
 *
 * Width candidates: L11–L15 circs (/ 2π) + canonical fallback.
 */

type R = Record<string, number>;

// ── Constants ─────────────────────────────────────────────────────────────────

const CIRC_TO_HALF_WIDTH = 1 / Math.PI; // circ → radius = circ / 2π

// Canonical akimbo angle: upper arm from vertical, tilting outward-down
const UPPER_ARM_ANGLE = 50 * Math.PI / 180;

// Inner-normal direction at shoulder for LEFT arm at UPPER_ARM_ANGLE:
// tangent = (−sinθ, −cosθ), CCW-normal = (cosθ, −sinθ)
// Shifting center by inner-normal * hw places outer edge exactly at shoulder tip.
const INNER_NX = Math.cos(UPPER_ARM_ANGLE); //  0.643
const INNER_NY = -Math.sin(UPPER_ARM_ANGLE); // −0.766

// ── Canonical halfW ratios (halfW / totalHeight) ──────────────────────────────

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

const CANONICAL_HAND_LENGTH = 0.108; // hand_length / totalHeight ≈ 7/65

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveCandidate {
  source: string;
  value: number;
  used: boolean;
}

export interface ArmLandmark {
  id: string;
  side: 'left' | 'right';
  section: 'arm' | 'hand';
  /** x offset from body center axis, measurement units (negative = left). */
  x: number;
  /** Height from floor, measurement units. */
  y: number;
  halfW: number;
  wSource: string;
  wCandidates: ResolveCandidate[];
  /** Position shown in detail panel (computed geometrically). */
  yCandidates: ResolveCandidate[];
  widthConfidence: 'circ' | 'canonical';
}

export interface ArmResolved {
  /** Ordered landmarks: shoulder → … → wrist → hand-palm → hand-tip. */
  landmarks: ArmLandmark[];
  elbowIdx: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WCand { source: string; value: number; confidence: 'circ' | 'canonical' }

function pickW(cands: WCand[]): { halfW: number; source: string; confidence: 'circ' | 'canonical'; all: ResolveCandidate[] } | null {
  if (!cands.length) return null;
  const used = cands[0];
  return {
    halfW: used.value, source: used.source, confidence: used.confidence,
    all: cands.map((c, i) => ({ source: c.source, value: c.value, used: i === 0 })),
  };
}

function circ(val: number, label: string): WCand {
  return { source: `${label} / (2π)`, value: val * CIRC_TO_HALF_WIDTH * 0.5, confidence: 'circ' };
}

// ── Width candidate collectors ────────────────────────────────────────────────

function shoulderWC(R: R):     WCand[] { return R.arm_upper_circ > 0        ? [circ(R.arm_upper_circ,       'arm_upper_circ')]       : []; }
function upperArmWC(R: R):     WCand[] { return [
  ...(R.arm_upper_circ > 0       ? [circ(R.arm_upper_circ,      'arm_upper_circ')]      : []),
  ...(R.arm_above_elbow_circ > 0 ? [circ(R.arm_above_elbow_circ,'arm_above_elbow_circ')]: []),
]; }
function aboveElbowWC(R: R):   WCand[] { return [
  ...(R.arm_above_elbow_circ > 0 ? [circ(R.arm_above_elbow_circ,'arm_above_elbow_circ')]: []),
  ...(R.arm_upper_circ > 0       ? [circ(R.arm_upper_circ,      'arm_upper_circ')]      : []),
]; }
function elbowWC(R: R):        WCand[] { return [
  ...(R.arm_elbow_circ_bent > 0  ? [circ(R.arm_elbow_circ_bent, 'arm_elbow_circ_bent')] : []),
  ...(R.arm_elbow_circ > 0       ? [circ(R.arm_elbow_circ,      'arm_elbow_circ')]      : []),
  ...(R.arm_above_elbow_circ > 0 ? [circ(R.arm_above_elbow_circ,'arm_above_elbow_circ')]: []),
]; }
function lowerArmWC(R: R):     WCand[] { return R.arm_lower_circ > 0        ? [circ(R.arm_lower_circ,       'arm_lower_circ')]       : []; }
function wristWC(R: R):        WCand[] { return R.arm_wrist_circ > 0        ? [circ(R.arm_wrist_circ,       'arm_wrist_circ')]       : []; }

function handPalmWC(R: R): WCand[] { return [
  ...(R.hand_palm_width > 0  ? [{ source: 'hand_palm_width / 2', value: R.hand_palm_width * 0.5, confidence: 'circ' as const }] : []),
  ...(R.hand_palm_circ > 0   ? [circ(R.hand_palm_circ, 'hand_palm_circ')]  : []),
  ...(R.hand_circ > 0        ? [circ(R.hand_circ,      'hand_circ')]       : []),
]; }

function handTipWC(R: R): WCand[] {
  // Fingertip width tapers to roughly 40% of palm width
  const base = handPalmWC(R);
  return base.map(c => ({ ...c, source: `${c.source} × 0.4`, value: c.value * 0.4 }));
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveLeftArmLandmarks(
  R: R,
  /** x of left shoulder TIP from body axis (negative = left). Outer edge anchor. */
  shoulderTipX: number,
  /** Height of shoulder tip from floor. */
  shoulderTipY: number,
  totalHeight: number,
): ArmResolved {
  // ── Arm upper halfW (needed for anchor calculation) ───────────────────────
  const armUpperHW =
    R.arm_upper_circ > 0
      ? R.arm_upper_circ * CIRC_TO_HALF_WIDTH * 0.5
      : totalHeight * CANONICAL_HW['shoulder'];

  // ── Arm center at shoulder ────────────────────────────────────────────────
  // Shift center along inner-normal so outer ribbon edge = shoulder tip
  const shoulderX = shoulderTipX + INNER_NX * armUpperHW;
  const shoulderY = shoulderTipY + INNER_NY * armUpperHW; // slightly below tip

  // ── Arm lengths (L01–L03) ────────────────────────────────────────────────
  const upperArmLen =
    R.arm_shoulder_tip_to_elbow_bent > 0 ? R.arm_shoulder_tip_to_elbow_bent :
    R.arm_shoulder_tip_to_wrist_bent > 0 ? R.arm_shoulder_tip_to_wrist_bent * 0.6 :
    totalHeight * 0.223;

  const forearmLen =
    R.arm_elbow_to_wrist_bent > 0 ? R.arm_elbow_to_wrist_bent :
    (R.arm_shoulder_tip_to_wrist_bent > 0 && R.arm_shoulder_tip_to_elbow_bent > 0)
      ? R.arm_shoulder_tip_to_wrist_bent - R.arm_shoulder_tip_to_elbow_bent :
    totalHeight * 0.146;

  // ── Elbow position ────────────────────────────────────────────────────────
  const elbowX = shoulderX - upperArmLen * Math.sin(UPPER_ARM_ANGLE);
  const elbowY = shoulderY - upperArmLen * Math.cos(UPPER_ARM_ANGLE);

  // ── Wrist position ────────────────────────────────────────────────────────
  const wristY =
    R.height_highhip > 0    ? R.height_highhip :
    R.height_waist_side > 0 ? R.height_waist_side :
    totalHeight * 0.554;

  const dropY        = Math.min(Math.max(elbowY - wristY, 0), forearmLen * 0.99);
  const forearmAngle = Math.acos(dropY / forearmLen);
  const wristX       = elbowX + forearmLen * Math.sin(forearmAngle);

  // ── Forearm direction (for hand) ──────────────────────────────────────────
  const forearmDX = wristX - elbowX;
  const forearmDY = wristY - elbowY;
  const forearmL  = Math.sqrt(forearmDX ** 2 + forearmDY ** 2) || 1;
  const fDirX     = forearmDX / forearmL;
  const fDirY     = forearmDY / forearmL;

  // ── Hand length ───────────────────────────────────────────────────────────
  const handLen =
    R.hand_length > 0       ? R.hand_length :
    R.hand_palm_length > 0  ? R.hand_palm_length * 1.5 :
    totalHeight * CANONICAL_HAND_LENGTH;

  // ── Build landmark helper ─────────────────────────────────────────────────
  function lm(id: string, section: 'arm' | 'hand', x: number, y: number, wCands: WCand[]): ArmLandmark {
    const canon = CANONICAL_HW[id] ?? 0.02;
    const all: WCand[] = [...wCands, { source: `canonical ratio ${canon}`, value: totalHeight * canon, confidence: 'canonical' }];
    const wr = pickW(all)!;
    return {
      id, side: 'left', section, x, y,
      halfW: wr.halfW, wSource: wr.source, wCandidates: wr.all,
      yCandidates: [{ source: `x=${x.toFixed(2)} y=${y.toFixed(2)} (computed)`, value: y, used: true }],
      widthConfidence: wr.confidence,
    };
  }

  const upperMid = (t: number): [number, number] =>
    [shoulderX + (elbowX - shoulderX) * t, shoulderY + (elbowY - shoulderY) * t];
  const lowerMid = (t: number): [number, number] =>
    [elbowX + (wristX - elbowX) * t, elbowY + (wristY - elbowY) * t];

  const [umX, umY] = upperMid(0.45);
  const [aeX, aeY] = upperMid(0.78);
  const [laX, laY] = lowerMid(0.5);

  // Hand: palm center and fingertip, continuing along forearm direction
  const palmX = wristX + fDirX * handLen * 0.45;
  const palmY = wristY + fDirY * handLen * 0.45;
  const tipX  = wristX + fDirX * handLen;
  const tipY  = wristY + fDirY * handLen;

  const ELBOW_IDX = 3;

  const landmarks: ArmLandmark[] = [
    lm('shoulder',    'arm',  shoulderX, shoulderY, shoulderWC(R)),
    lm('upper-arm',   'arm',  umX,       umY,       upperArmWC(R)),
    lm('above-elbow', 'arm',  aeX,       aeY,       aboveElbowWC(R)),
    lm('elbow',       'arm',  elbowX,    elbowY,    elbowWC(R)),
    lm('lower-arm',   'arm',  laX,       laY,       lowerArmWC(R)),
    lm('wrist',       'arm',  wristX,    wristY,    wristWC(R)),
    lm('hand-palm',   'hand', palmX,     palmY,     handPalmWC(R)),
    lm('hand-tip',    'hand', tipX,      tipY,      handTipWC(R)),
  ];

  return { landmarks, elbowIdx: ELBOW_IDX };
}

// ── Right arm ─────────────────────────────────────────────────────────────────

export function resolveRightArmLandmarks(
  R: R,
  /** x of right shoulder TIP from body axis (positive = right). Outer edge anchor. */
  shoulderTipX: number,
  /** Height of shoulder tip from floor. */
  shoulderTipY: number,
  totalHeight: number,
): ArmResolved {
  const armUpperHW =
    R.arm_upper_circ > 0
      ? R.arm_upper_circ * CIRC_TO_HALF_WIDTH * 0.5
      : totalHeight * CANONICAL_HW['shoulder'];

  // ── Armfold anchor ────────────────────────────────────────────────────────
  // Where the arm's inner edge meets the body side. This pins the arm's
  // lateral position without affecting which direction the arm travels.
  const armfoldHW =
    R.armfold_to_armfold_f > 0 ? R.armfold_to_armfold_f * 0.5 :
    R.body_armfold_circ    > 0 ? R.body_armfold_circ / (2 * Math.PI) :
    R.body_bust_circ       > 0 ? R.body_bust_circ    / (2 * Math.PI) * 0.9 :
    totalHeight * 0.096; // canonical ≈ 6.25 / 65

  const armfoldY =
    R.height_armpit > 0 ? R.height_armpit :
    totalHeight * 0.754; // canonical ≈ 49 / 65

  // Arm center at armfold level: inner edge exactly at body boundary.
  const armfoldCenterX = armfoldHW + armUpperHW;

  // ── Arm direction ─────────────────────────────────────────────────────────
  // The arm travels in ONE straight direction from shoulder to wrist.
  // Direction is derived from shoulder tip → armfold center.
  // CCW⊥ of this tangent = outward normal; outer ribbon edge = shoulder tip.
  const dX = armfoldCenterX - shoulderTipX;
  const dY = armfoldY - shoulderTipY; // negative (downward)
  const dLen = Math.sqrt(dX * dX + dY * dY) || 1;
  const tanX = dX / dLen; // unit tangent along arm (≈ slightly rightward + downward)
  const tanY = dY / dLen;
  // CCW perpendicular = outward normal for right arm (points right)
  const outerNX = -tanY; // ≈ +1
  const outerNY =  tanX; // ≈ small
  // Shoulder CENTER: offset inward so outer ribbon edge = shoulder tip
  const shoulderX = shoulderTipX - outerNX * armUpperHW;
  const shoulderY = shoulderTipY - outerNY * armUpperHW;

  // ── Arm lengths ───────────────────────────────────────────────────────────
  // Prefer straight measurements (L05-L07); fall back to bent (L01-L03).
  const upperArmLen =
    R.arm_shoulder_tip_to_elbow > 0      ? R.arm_shoulder_tip_to_elbow :
    R.arm_shoulder_tip_to_elbow_bent > 0 ? R.arm_shoulder_tip_to_elbow_bent :
    totalHeight * 0.208;

  const forearmLen =
    R.arm_elbow_to_wrist > 0      ? R.arm_elbow_to_wrist :
    R.arm_elbow_to_wrist_bent > 0 ? R.arm_elbow_to_wrist_bent :
    totalHeight * 0.146;

  // ── Place landmarks along the single arm direction ───────────────────────
  // Elbow at arm_shoulder_tip_to_elbow from shoulder center.
  // Wrist at arm_shoulder_tip_to_elbow + arm_elbow_to_wrist from shoulder center.
  const at = (dist: number): [number, number] =>
    [shoulderX + tanX * dist, shoulderY + tanY * dist];

  const [elbowX, elbowY] = at(upperArmLen);
  const [wristX, wristY] = at(upperArmLen + forearmLen);

  // Armfold length for placing the above-elbow landmark
  const armfoldLen =
    R.arm_shoulder_tip_to_armfold_line > 0 ? R.arm_shoulder_tip_to_armfold_line :
    dLen; // fall back: geometric distance shoulder tip → armfold center

  // ── Hand ─────────────────────────────────────────────────────────────────
  const handLen =
    R.hand_length > 0      ? R.hand_length :
    R.hand_palm_length > 0 ? R.hand_palm_length * 1.5 :
    totalHeight * CANONICAL_HAND_LENGTH;

  const [palmX, palmY] = at(upperArmLen + forearmLen + handLen * 0.45);
  const [tipX,  tipY]  = at(upperArmLen + forearmLen + handLen);

  // ── Landmark builder ──────────────────────────────────────────────────────
  function lm(id: string, section: 'arm' | 'hand', x: number, y: number, wCands: WCand[]): ArmLandmark {
    const canon = CANONICAL_HW[id] ?? 0.02;
    const all: WCand[] = [...wCands, { source: `canonical ratio ${canon}`, value: totalHeight * canon, confidence: 'canonical' }];
    const wr = pickW(all)!;
    return {
      id, side: 'right', section, x, y,
      halfW: wr.halfW, wSource: wr.source, wCandidates: wr.all,
      yCandidates: [{ source: `x=${x.toFixed(2)} y=${y.toFixed(2)} (computed)`, value: y, used: true }],
      widthConfidence: wr.confidence,
    };
  }

  const [umX,  umY]  = at(armfoldLen * 0.5);   // upper-arm: midpoint shoulder→armfold
  const [aeX,  aeY]  = at(armfoldLen);          // above-elbow: at the armfold level
  const [laX,  laY]  = at(upperArmLen + forearmLen * 0.5); // lower-arm: elbow→wrist mid

  const ELBOW_IDX = 3;

  const landmarks: ArmLandmark[] = [
    lm('shoulder',    'arm',  shoulderX, shoulderY, shoulderWC(R)),
    lm('upper-arm',   'arm',  umX,       umY,       upperArmWC(R)),
    lm('above-elbow', 'arm',  aeX,       aeY,       aboveElbowWC(R)),
    lm('elbow',       'arm',  elbowX,    elbowY,    elbowWC(R)),
    lm('lower-arm',   'arm',  laX,       laY,       lowerArmWC(R)),
    lm('wrist',       'arm',  wristX,    wristY,    wristWC(R)),
    lm('hand-palm',   'hand', palmX,     palmY,     handPalmWC(R)),
    lm('hand-tip',    'hand', tipX,      tipY,      handTipWC(R)),
  ];

  return { landmarks, elbowIdx: ELBOW_IDX };
}

// ── Path builder ──────────────────────────────────────────────────────────────

export interface ArmPathOptions {
  axisX: number;
  toY: (h: number) => number;
  scale: number;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  /** Flip normal direction — use for right arm where normals point inward by default. */
  flipNormals?: boolean;
  /** Arc sweep flag for shoulder and fingertip caps (0=CCW, 1=CW). Default 1. */
  capSweep?: 0 | 1;
}

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

function computeNormals(pts: [number, number][]): [number, number][] {
  return pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [-dy / len, dx / len] as [number, number];
  });
}

export function buildArmPath(resolved: ArmResolved, opts: ArmPathOptions): string {
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity   = opts.fillOpacity   ?? 0.22;
  const strokeWidth   = opts.strokeWidth   ?? 1.5;
  const strokeOpacity = opts.strokeOpacity ?? 0.55;

  const center: [number, number][] = resolved.landmarks.map(l => [axisX + l.x * scale, toY(l.y)]);
  const hws    = resolved.landmarks.map(l => l.halfW * scale);
  const ns     = computeNormals(center);

  // For left arm, normals (CCW perp of downward-left tangent) point outward naturally.
  // For right arm they point inward, so we flip.
  const dir = opts.flipNormals ? -1 : 1;
  const outer: [number, number][] = center.map((p, i) => [p[0] + dir * ns[i][0] * hws[i], p[1] + dir * ns[i][1] * hws[i]] as [number, number]);
  const inner: [number, number][] = center.map((p, i) => [p[0] - dir * ns[i][0] * hws[i], p[1] - dir * ns[i][1] * hws[i]] as [number, number]).reverse();

  // Arc caps at shoulder and fingertip. CW (1) for left arm, CCW (0) for right arm.
  const sw   = opts.capSweep ?? 1;
  const capR = hws[0].toFixed(1);
  const cap  = `A ${capR} ${capR} 0 0 ${sw} ${outer[0][0].toFixed(1)} ${outer[0][1].toFixed(1)}`;

  const d =
    crPath(outer) +
    ` A ${hws[hws.length - 1].toFixed(1)} ${hws[hws.length - 1].toFixed(1)} 0 0 ${sw} ${inner[0][0].toFixed(1)} ${inner[0][1].toFixed(1)}` +
    crPath(inner, false) +
    ` ${cap}`;

  return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}
