/**
 * Left/Right arm renderer — akimbo and straight poses.
 */
import {
  R, Landmark, PathOptions, ResolveCandidate,
  buildLandmark, crPath,
  CIRC_TO_WIDTH
} from './common';

// ── Constants ─────────────────────────────────────────────────────────────────

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
const RIGHT_ELBOW_FLEX_ANGLE = 10 * Math.PI / 180;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArmLandmark extends Landmark {
  side: 'left' | 'right';
  section: 'arm' | 'hand';
  x: number;
  innerPt?: [number, number];
  outerPt?: [number, number];
  lengthCandidates?: ResolveCandidate[];
}

export interface ArmResolved {
  landmarks: ArmLandmark[];
  elbowIdx: number;
  shoulderTip?: [number, number];  // ST in measurement-space; used for shoulder cap Bezier
  torsoAttachment?: [number, number][]; // ST → A along the rendered torso outline
  armAngle?: number;               // degrees from vertical (0 = straight down)
  debugPts?: Record<string, [number, number]>;
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

const flatHandPalmWC = (R: R) => [circ(R.arm_wrist_circ, 'arm_wrist_circ')];
const flatHandTipWC = (R: R) => flatHandPalmWC(R).map(c => ({ ...c, source: `${c.source} × 0.4`, value: c.value * 0.4 }));

// ── Main resolvers ────────────────────────────────────────────────────────────

export function resolveLeftArmLandmarks(
  R: R,
  shoulderTipX: number,
  shoulderTipY: number,
  armfoldPt: [number, number],
  totalHeight: number,
  hipSidePt?: [number, number],
  bodySideXAtY?: (y: number) => number,
  torsoAttachment?: [number, number][],
): ArmResolved {
  const innerShoulderX = -armfoldPt[0];
  const innerShoulderY = armfoldPt[1];
  const outerShoulderX = shoulderTipX;
  const outerShoulderY = shoulderTipY;

  if (!(R.shoulder_tip_to_armfold_f > 0 && R.arm_upper_circ > 0)) {
    return { landmarks: [], elbowIdx: -1, shoulderTip: [shoulderTipX, shoulderTipY], torsoAttachment };
  }

  const upperArmLen = R.arm_shoulder_tip_to_elbow_bent > 0 ? R.arm_shoulder_tip_to_elbow_bent : R.arm_shoulder_tip_to_wrist_bent > 0 ? R.arm_shoulder_tip_to_wrist_bent * 0.6 : totalHeight * 0.223;
  const forearmLen = R.arm_elbow_to_wrist_bent > 0 ? R.arm_elbow_to_wrist_bent : (R.arm_shoulder_tip_to_wrist_bent > 0 && R.arm_shoulder_tip_to_elbow_bent > 0) ? R.arm_shoulder_tip_to_wrist_bent - R.arm_shoulder_tip_to_elbow_bent : totalHeight * 0.146;

  const widthFor = (id: string, wCands: any[]): number => {
    const landmark = buildLandmark(id, totalHeight, [], wCands, { yRatio: 0, halfWRatio: CANONICAL_HW[id] ?? 0.02 });
    return (landmark.halfW ?? 0) * 2;
  };
  const widths = {
    shoulder: widthFor('shoulder', shoulderWC(R)),
    upperArm: widthFor('upper-arm', upperArmWC(R)),
    aboveElbow: widthFor('above-elbow', aboveElbowWC(R)),
    elbow: widthFor('elbow', elbowWC(R)),
    lowerArm: widthFor('lower-arm', lowerArmWC(R)),
    wrist: widthFor('wrist', wristWC(R)),
    handPalm: widthFor('hand-palm', flatHandPalmWC(R)),
    handTip: widthFor('hand-tip', flatHandTipWC(R)),
  };
  const outerArmfold: [number, number] = [innerShoulderX - widths.shoulder, innerShoulderY];

  // Bent-arm lengths describe the outer edge. The wrist's inner edge stays
  // attached to the hip-side outline; widths generate the unmeasured inner edge.
  const innerWristY = hipSidePt?.[1] ?? (R.height_hip > 0 ? R.height_hip : totalHeight * 0.485);
  const innerWristX = hipSidePt?.[0] ?? bodySideXAtY?.(innerWristY) ?? innerShoulderX;
  const outerWristX = innerWristX - widths.wrist;
  const outerWristY = innerWristY;
  const wristDX = outerWristX - outerShoulderX;
  const wristDY = outerWristY - outerShoulderY;
  const wristDistance = Math.sqrt(wristDX ** 2 + wristDY ** 2) || 1;
  const reachableDistance = Math.min(Math.max(wristDistance, Math.abs(upperArmLen - forearmLen) + 1e-6), upperArmLen + forearmLen - 1e-6);
  const unitX = wristDX / wristDistance;
  const unitY = wristDY / wristDistance;
  const elbowAlong = (upperArmLen ** 2 - forearmLen ** 2 + reachableDistance ** 2) / (2 * reachableDistance);
  const elbowOut = Math.sqrt(Math.max(0, upperArmLen ** 2 - elbowAlong ** 2));
  const outerElbowX = outerShoulderX + unitX * elbowAlong + unitY * elbowOut;
  const outerElbowY = outerShoulderY + unitY * elbowAlong - unitX * elbowOut;
  const handLen = R.hand_length > 0 ? R.hand_length : R.hand_palm_length > 0 ? R.hand_palm_length * 1.5 : totalHeight * CANONICAL_HAND_LENGTH;

  const directLength = (source: string, value: number): ResolveCandidate => ({
    source,
    value: value > 0 ? value : 0,
    used: value > 0,
    missing: !(value > 0),
  });
  const armfoldLengths = [directLength('shoulder_tip_to_armfold_f', R.shoulder_tip_to_armfold_f)];
  const upperArmLengths = [
    directLength('arm_shoulder_tip_to_elbow_bent', R.arm_shoulder_tip_to_elbow_bent),
    directLength('arm_shoulder_tip_to_wrist_bent', R.arm_shoulder_tip_to_wrist_bent),
  ];
  const forearmLengths = [
    directLength('arm_elbow_to_wrist_bent', R.arm_elbow_to_wrist_bent),
    directLength('height_hip', R.height_hip),
  ];
  const handLengths = [
    directLength('hand_length', R.hand_length),
    directLength('hand_palm_length', R.hand_palm_length),
  ];

  function lm(id: string, section: 'arm' | 'hand', innerPt: [number, number], outerPt: [number, number], wCands: any[], lengths: ResolveCandidate[]): ArmLandmark {
    const x = (innerPt[0] + outerPt[0]) / 2;
    const y = (innerPt[1] + outerPt[1]) / 2;
    const dx = outerPt[0] - innerPt[0], dy = outerPt[1] - innerPt[1];
    const base = buildLandmark(id, totalHeight, [{ source: `x=${x.toFixed(2)} y=${y.toFixed(2)} (computed)`, value: y }], wCands, { yRatio: 0, halfWRatio: CANONICAL_HW[id] ?? 0.02 });
    base.halfW = Math.sqrt(dx * dx + dy * dy) / 2;
    return { ...base, side: 'left', section, x, y, innerPt, outerPt, lengthCandidates: lengths };
  }

  const lerpPt = (p1: [number, number], p2: [number, number], t: number): [number, number] => [
    p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t,
  ];
  const outerShoulder: [number, number] = [outerShoulderX, outerShoulderY];
  const outerElbow: [number, number] = [outerElbowX, outerElbowY];
  const outerWrist: [number, number] = [outerWristX, outerWristY];
  const outerUpperArm = lerpPt(outerShoulder, outerElbow, 0.45);
  const outerAboveElbow = lerpPt(outerShoulder, outerElbow, 0.78);
  const outerLowerArm = lerpPt(outerElbow, outerWrist, 0.5);

  const insetFromOuter = (prev: [number, number], point: [number, number], next: [number, number], width: number): [number, number] => {
    const dx = next[0] - prev[0], dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const normalX = -dy / len, normalY = dx / len;
    const direction = normalX >= 0 ? 1 : -1;
    return [point[0] + direction * normalX * width, point[1] + direction * normalY * width];
  };
  const innerUpperArm = insetFromOuter(outerShoulder, outerUpperArm, outerAboveElbow, widths.upperArm);
  const innerAboveElbow = insetFromOuter(outerUpperArm, outerAboveElbow, outerElbow, widths.aboveElbow);
  const innerElbow = insetFromOuter(outerAboveElbow, outerElbow, outerLowerArm, widths.elbow);
  const innerLowerArm = insetFromOuter(outerElbow, outerLowerArm, outerWrist, widths.lowerArm);

  const palmY = innerWristY - handLen * 0.45;
  const tipY = innerWristY - handLen;
  const innerPalmX = bodySideXAtY?.(palmY) ?? innerWristX;
  const innerTipX = bodySideXAtY?.(tipY) ?? innerWristX;
  const innerPalm: [number, number] = [innerPalmX, palmY];
  const outerPalm: [number, number] = [innerPalmX - widths.handPalm, palmY];
  const innerTip: [number, number] = [innerTipX, tipY];
  const outerTip: [number, number] = [innerTipX - widths.handTip, tipY];

  return {
    landmarks: [
      lm('shoulder',    'arm',  [innerShoulderX, innerShoulderY], outerArmfold, shoulderWC(R), armfoldLengths),
      lm('upper-arm',   'arm',  innerUpperArm,    outerUpperArm,   upperArmWC(R), upperArmLengths),
      lm('above-elbow', 'arm',  innerAboveElbow,  outerAboveElbow, aboveElbowWC(R), upperArmLengths),
      lm('elbow',       'arm',  innerElbow,       outerElbow,      elbowWC(R), upperArmLengths),
      lm('lower-arm',   'arm',  innerLowerArm,    outerLowerArm,   lowerArmWC(R), forearmLengths),
      lm('wrist',       'arm',  [innerWristX, innerWristY], outerWrist, wristWC(R), forearmLengths),
      lm('hand-palm',   'hand', innerPalm,        outerPalm,       flatHandPalmWC(R), handLengths),
      lm('hand-tip',    'hand', innerTip,         outerTip,        flatHandTipWC(R), handLengths),
    ],
    elbowIdx: 3,
    shoulderTip: [shoulderTipX, shoulderTipY],
    torsoAttachment,
    debugPts: {
      ST: [shoulderTipX, shoulderTipY],
      A: [innerShoulderX, innerShoulderY],
      B: outerArmfold,
      C: innerElbow,
      D: outerElbow,
      E: [innerWristX, innerWristY],
      F: outerWrist,
      G: innerPalm,
      H: outerPalm,
      I: innerTip,
      J: outerTip,
    },
  };
}

// armfoldPt: [x, y] in measurement-space, traced down torso outline from shoulder tip.
// armAngle: degrees from vertical (0 = straight down, positive = outward, like a jumping jack).
export function resolveRightArmLandmarks(R: R, shoulderTipX: number, shoulderTipY: number, armfoldPt: [number, number], totalHeight: number, armAngle = 0, torsoAttachment?: [number, number][]): ArmResolved {
  const directLength = (source: string, value: number): ResolveCandidate => ({
    source,
    value: value > 0 ? value : 0,
    used: value > 0,
    missing: !(value > 0),
  });
  const armfoldLengths = [directLength('shoulder_tip_to_armfold_f', R.shoulder_tip_to_armfold_f)];
  const elbowLengths = [
    directLength('arm_shoulder_tip_to_elbow', R.arm_shoulder_tip_to_elbow),
    directLength('arm_armpit_to_elbow', R.arm_armpit_to_elbow),
  ];
  const forearmLengths = [
    directLength('arm_elbow_to_wrist', R.arm_elbow_to_wrist),
    directLength('arm_elbow_to_wrist_inside', R.arm_elbow_to_wrist_inside),
  ];
  const handLengths = [directLength('hand_length', R.hand_length)];

  // ST: shoulder tip — the anatomical pivot (arm bone connects here)
  const ST_x = shoulderTipX;
  const ST_y = shoulderTipY;

  // A: inner armfold — fixed on the torso outline, does NOT rotate with the arm
  const A_x = armfoldPt[0];
  const A_y = armfoldPt[1];

  // The straight arm grows in stages as direct measurements become available.
  // Do not fabricate missing stages from canonical proportions.
  if (!(R.shoulder_tip_to_armfold_f > 0 && R.arm_upper_circ > 0)) {
    return { landmarks: [], elbowIdx: -1, shoulderTip: [ST_x, ST_y], torsoAttachment, armAngle };
  }

  const W_upper = R.arm_upper_circ * CIRC_TO_WIDTH;
  const L_A = R.shoulder_tip_to_armfold_f;

  // All other arm points are in the reference pose (θ=0, arm straight down)
  // and then rotated around ST by armAngle.
  // A stays fixed because it is a torso attachment point, not a limb point.
  const theta  = armAngle * Math.PI / 180;
  const cosT   = Math.cos(theta);
  const sinT   = Math.sin(theta);
  const rotST  = (px: number, py: number): [number, number] => {
    const dx = px - ST_x, dy = py - ST_y;
    return [ST_x + dx * cosT - dy * sinT, ST_y + dx * sinT + dy * cosT];
  };

  // Reference pose (θ=0): arm hangs straight down from ST.
  // B: outer armfold = A displaced right by arm_upper_circ width.
  // mid0: arm centerline origin for all length measurements.
  const mid0_x = A_x + W_upper / 2;
  const mid0_y = A_y;

  const [B_x, B_y] = rotST(A_x + W_upper, A_y);

  const lerpPt = (p1: [number, number], p2: [number, number], t: number): [number, number] => [
    p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t,
  ];

  function lm(id: string, section: 'arm'|'hand', innerPt: [number, number], outerPt: [number, number], wCands: any[], lengths: ResolveCandidate[]): ArmLandmark {
    const centerX = (innerPt[0] + outerPt[0]) / 2;
    const centerY = (innerPt[1] + outerPt[1]) / 2;
    const dx = outerPt[0] - innerPt[0], dy = outerPt[1] - innerPt[1];
    const base = buildLandmark(id, totalHeight, [{ source: 'computed', value: centerY }], wCands);
    base.halfW = Math.sqrt(dx * dx + dy * dy) / 2;
    return { ...base, side: 'right', section, x: centerX, y: centerY, innerPt, outerPt, lengthCandidates: lengths };
  }

  const landmarks = [
    lm('shoulder', 'arm', [A_x, A_y], [B_x, B_y], shoulderWC(R), armfoldLengths),
  ];

  if (!(R.arm_shoulder_tip_to_elbow > 0 && R.arm_armpit_to_elbow > 0 && R.arm_elbow_circ > 0)) {
    return { landmarks, elbowIdx: -1, shoulderTip: [ST_x, ST_y], torsoAttachment, armAngle };
  }

  const W_elbow = R.arm_elbow_circ * CIRC_TO_WIDTH;
  const L_elbow = (R.arm_armpit_to_elbow + R.arm_shoulder_tip_to_elbow) / 2;
  const [C_x, C_y] = rotST(mid0_x - W_elbow / 2, mid0_y - L_elbow);
  const [D_x, D_y] = rotST(mid0_x + W_elbow / 2, mid0_y - L_elbow);
  landmarks.push(
    lm('upper-arm',   'arm', lerpPt([A_x,A_y],[C_x,C_y], 0.35), lerpPt([B_x,B_y],[D_x,D_y], 0.35), upperArmWC(R), elbowLengths),
    lm('above-elbow', 'arm', lerpPt([A_x,A_y],[C_x,C_y], 0.70), lerpPt([B_x,B_y],[D_x,D_y], 0.70), aboveElbowWC(R), elbowLengths),
    lm('elbow',       'arm', [C_x, C_y],                         [D_x, D_y],                         elbowWC(R),      elbowLengths),
  );

  if (!(R.arm_elbow_to_wrist > 0 && R.arm_elbow_to_wrist_inside > 0 && R.arm_wrist_circ > 0)) {
    return { landmarks, elbowIdx: 3, shoulderTip: [ST_x, ST_y], torsoAttachment, armAngle };
  }

  const W_wrist = R.arm_wrist_circ * CIRC_TO_WIDTH;
  const forearmLength = (R.arm_elbow_to_wrist_inside + R.arm_elbow_to_wrist) / 2;
  const forearmAngle = theta - RIGHT_ELBOW_FLEX_ANGLE;
  const elbowMidX = (C_x + D_x) / 2;
  const elbowMidY = (C_y + D_y) / 2;
  const forearmCenterX = elbowMidX + Math.sin(forearmAngle) * forearmLength;
  const forearmCenterY = elbowMidY - Math.cos(forearmAngle) * forearmLength;
  const forearmNormalX = Math.cos(forearmAngle);
  const forearmNormalY = Math.sin(forearmAngle);
  const E_x = forearmCenterX - forearmNormalX * W_wrist / 2;
  const E_y = forearmCenterY - forearmNormalY * W_wrist / 2;
  const F_x = forearmCenterX + forearmNormalX * W_wrist / 2;
  const F_y = forearmCenterY + forearmNormalY * W_wrist / 2;
  landmarks.push(
    lm('lower-arm', 'arm', lerpPt([C_x,C_y],[E_x,E_y], 0.5), lerpPt([D_x,D_y],[F_x,F_y], 0.5), lowerArmWC(R), forearmLengths),
    lm('wrist',     'arm', [E_x, E_y],                         [F_x, F_y],                         wristWC(R),    forearmLengths),
  );

  if (!(R.hand_length > 0 && R.hand_circ > 0)) {
    return { landmarks, elbowIdx: 3, shoulderTip: [ST_x, ST_y], torsoAttachment, armAngle };
  }

  const W_hand = R.hand_circ * CIRC_TO_WIDTH;
  const W_tip = W_hand * 0.4;
  const handPalmCenterX = forearmCenterX + Math.sin(forearmAngle) * R.hand_length * 0.45;
  const handPalmCenterY = forearmCenterY - Math.cos(forearmAngle) * R.hand_length * 0.45;
  const handTipCenterX = forearmCenterX + Math.sin(forearmAngle) * R.hand_length;
  const handTipCenterY = forearmCenterY - Math.cos(forearmAngle) * R.hand_length;
  const G_x = handPalmCenterX - forearmNormalX * W_hand / 2;
  const G_y = handPalmCenterY - forearmNormalY * W_hand / 2;
  const H_x = handPalmCenterX + forearmNormalX * W_hand / 2;
  const H_y = handPalmCenterY + forearmNormalY * W_hand / 2;
  const I_x = handTipCenterX - forearmNormalX * W_tip / 2;
  const I_y = handTipCenterY - forearmNormalY * W_tip / 2;
  const J_x = handTipCenterX + forearmNormalX * W_tip / 2;
  const J_y = handTipCenterY + forearmNormalY * W_tip / 2;
  landmarks.push(
    lm('hand-palm', 'hand', [G_x, G_y], [H_x, H_y], handPalmWC(R), handLengths),
    lm('hand-tip',  'hand', [I_x, I_y], [J_x, J_y], handTipWC(R),  handLengths),
  );

  return { landmarks, elbowIdx: 3, shoulderTip: [ST_x, ST_y], torsoAttachment, armAngle };
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
  if (resolved.landmarks.length === 0) return '';
  const { axisX, toY, scale, fill, stroke } = opts;
  const fillOpacity = opts.fillOpacity ?? 0.22, strokeWidth = opts.strokeWidth ?? 1.5, strokeOpacity = opts.strokeOpacity ?? 0.55;

  const center: [number, number][] = resolved.landmarks.map(l => [axisX + l.x * scale, toY(l.y!)]);
  const hws = resolved.landmarks.map(l => (l.halfW ?? 0) * scale), ns = computeNormals(center);

  const dir = opts.flipNormals ? -1 : 1;
  const outer: [number, number][] = resolved.landmarks.map((l, i) => {
    if (l.outerPt) return [axisX + l.outerPt[0] * scale, toY(l.outerPt[1])] as [number, number];
    return [center[i][0] + dir * ns[i][0] * hws[i], center[i][1] + dir * ns[i][1] * hws[i]] as [number, number];
  });
  
  const inner: [number, number][] = resolved.landmarks.map((l, i) => {
    if (l.innerPt) return [axisX + l.innerPt[0] * scale, toY(l.innerPt[1])] as [number, number];
    return [center[i][0] - dir * ns[i][0] * hws[i], center[i][1] - dir * ns[i][1] * hws[i]] as [number, number];
  }).reverse();

  if (resolved.landmarks.length === 1) {
    return `<line x1="${inner[0][0].toFixed(1)}" y1="${inner[0][1].toFixed(1)}" x2="${outer[0][0].toFixed(1)}" y2="${outer[0][1].toFixed(1)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
  }

  const sw = opts.capSweep ?? 1;
  let cap = '';
  if (resolved.shoulderTip) {
    // Two-part shoulder cap:
    //   A → ST  : inner armhole side, following the rendered torso outline
    //   ST → B  : deltoid side — control point mirrors outer[1] through B (G1 at B),
    //             pushing the curve outward to represent the Deltoid muscle bulk
    const A_svg  = inner[inner.length - 1];
    const B_svg  = outer[0];
    const ST_svg: [number, number] = [axisX + resolved.shoulderTip[0] * scale, toY(resolved.shoulderTip[1])];

    const torsoAttachment = resolved.torsoAttachment
      ?.map(([x, y]) => [axisX + x * scale, toY(y)] as [number, number])
      .reverse();
    const innerArmhole = torsoAttachment && torsoAttachment.length > 1
      ? crPath(torsoAttachment, false)
      : ` Q ${((A_svg[0] + ST_svg[0]) / 2).toFixed(1)} ${((A_svg[1] + ST_svg[1]) / 2).toFixed(1)} ${ST_svg[0].toFixed(1)} ${ST_svg[1].toFixed(1)}`;

    // Deltoid (ST→B): mirror outer[1] (upper-arm outer) through B.
    // outer[1] is slightly inward and below B, so the mirror is outward and above B —
    // exactly where the deltoid peak sits. G1 with the outer edge at B is automatic.
    const d_cpx = (2 * B_svg[0] - outer[1][0]).toFixed(1);
    const d_cpy = (2 * B_svg[1] - outer[1][1]).toFixed(1);

    cap = innerArmhole +
          ` Q ${d_cpx} ${d_cpy} ${B_svg[0].toFixed(1)} ${B_svg[1].toFixed(1)}`;
  } else if (resolved.landmarks[0].innerPt) {
    cap = ` L ${outer[0][0].toFixed(1)} ${outer[0][1].toFixed(1)}`;
  } else {
    const capR = hws[0].toFixed(1);
    cap = `A ${capR} ${capR} 0 0 ${sw} ${outer[0][0].toFixed(1)} ${outer[0][1].toFixed(1)}`;
  }

  const d = crPath(outer) + ` L ${inner[0][0].toFixed(1)} ${inner[0][1].toFixed(1)}` + crPath(inner, false) + cap;

  return `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round"/>`;
}
