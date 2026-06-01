/**
 * Body figure SVG renderer — TypeScript port of the original vanilla-JS renderer.
 * Pure function: given a document + options, returns an HTML string.
 */
import type { SeamlyDocument } from '@seamlyme/core';

// ── Constants ─────────────────────────────────────────────────────────────────

const _HW_WIDTH = 0.5;
const _HW_ARC   = 0.5;
const _HW_CIRC  = 1 / Math.PI;
const DEFAULT_ARC_WIDTH_RATIO = 2 / Math.PI;

const ARC_WIDTH_PAIRS = [
  { arcVar: 'bust_arc_f',  widthVar: 'width_bust'  },
  { arcVar: 'waist_arc_f', widthVar: 'width_waist' },
  { arcVar: 'hip_arc_f',   widthVar: 'width_hip'   },
];
const CIRC_WIDTH_PAIRS = [
  { circVar: 'bust_circ',  widthVar: 'width_bust'  },
  { circVar: 'waist_circ', widthVar: 'width_waist' },
  { circVar: 'hip_circ',   widthVar: 'width_hip'   },
];

type R = Record<string, number>;

interface FigMeasurement {
  name: string;
  wVar: string | null;
  wScale?: number;
  hVar?: string;
  hFB?: string;
  hFn?: (r: R) => number | null;
  hCalc?: string;
  hDeps?: string[];
  widthVar?: string;
}

const LEG_LEVELS: Array<{ hVar?: string; hFn?: (r: R) => number | null; circVar: string }> = [
  { hVar: 'height_gluteal_fold', circVar: 'leg_thigh_upper_circ' },
  { hFn: r => lerp(r.height_gluteal_fold, r.height_knee, 0.5), circVar: 'leg_thigh_mid_circ' },
  { hVar: 'height_knee',       circVar: 'leg_knee_circ'        },
  { hVar: 'height_calf',       circVar: 'leg_calf_circ'        },
  { hVar: 'height_ankle_high', circVar: 'leg_ankle_high_circ'  },
  { hVar: 'height_ankle',      circVar: 'leg_ankle_circ'       },
];

export const FIGURE_MEASUREMENTS: FigMeasurement[] = [
  { name: 'Neck back',    wVar: null,                              hVar: 'height_neck_back' },
  { name: 'Neck arc',     wVar: 'neck_arc_f',      wScale: _HW_ARC, hVar: 'height_neck_front', hFB: 'height_neck_side' },
  { name: 'Neck width',   wVar: 'neck_width',      wScale: _HW_ARC, hVar: 'height_neck_front', hFB: 'height_neck_side' },
  { name: 'Neck side',    wVar: 'neck_width',      wScale: _HW_ARC,
    hFn: r => offsetUp(r.height_waist_front, r.neck_side_to_waist_f) ?? offsetUp(r.height_waist_front, r.neck_side_to_waist_side_f) ?? r.height_neck_side,
    hCalc: 'height_waist_front + neck_side_to_waist_f',
    hDeps: ['height_waist_front', 'neck_side_to_waist_f', 'neck_side_to_waist_side_f', 'height_neck_side'] },
  { name: 'Shoulder tip', wVar: 'shoulder_tip_to_shoulder_tip_f', wScale: _HW_ARC, widthVar: 'width_shoulder',
    hFn: r => shoulderTipHeight(r), hCalc: 'height_neck_front - Δy(neck_front_to_shoulder_tip_f)',
    hDeps: ['height_neck_front', 'neck_width', 'neck_front_to_shoulder_tip_f', 'height_shoulder_tip'] },
  { name: 'Highbust',     wVar: 'highbust_arc_f',  wScale: _HW_ARC,
    hFn: r => offsetDown(r.height_neck_front, r.neck_front_to_highbust_f) ?? lerp(r.height_armpit, r.height_bustpoint, 0.5),
    hCalc: 'height_neck_front - neck_front_to_highbust_f',
    hDeps: ['height_neck_front', 'neck_front_to_highbust_f', 'height_armpit', 'height_bustpoint'] },
  { name: 'Bust',         wVar: 'bust_arc_f',      wScale: _HW_ARC, hVar: 'height_bustpoint' },
  { name: 'Lowbust',      wVar: 'lowbust_arc_f',   wScale: _HW_ARC,
    hFn: r => offsetUp(r.height_waist_front, r.lowbust_to_waist_f) ?? lerp(r.height_bustpoint, r.height_waist_side, 0.35),
    hCalc: 'height_waist_front + lowbust_to_waist_f',
    hDeps: ['height_waist_front', 'lowbust_to_waist_f', 'height_bustpoint', 'height_waist_side'] },
  { name: 'Rib',          wVar: 'rib_arc_f',       wScale: _HW_ARC,
    hFn: r => lerp(r.height_bustpoint, r.height_waist_side, 0.68), hCalc: 'lerp(height_bustpoint, height_waist_side, 0.68)',
    hDeps: ['height_bustpoint', 'height_waist_side'] },
  { name: 'Waist',        wVar: 'waist_arc_f',     wScale: _HW_ARC, hVar: 'height_waist_side', hFB: 'height_waist_front' },
  { name: 'Highhip',      wVar: 'highhip_arc_f',   wScale: _HW_ARC, hVar: 'height_highhip' },
  { name: 'Hip',          wVar: 'hip_arc_f',       wScale: _HW_ARC, hVar: 'height_hip' },
  { name: 'Crotch',       wVar: null,                              hVar: 'leg_crotch_to_floor' },
  { name: 'Thigh upper',  wVar: 'leg_thigh_upper_circ', wScale: _HW_CIRC, hVar: 'height_gluteal_fold' },
  { name: 'Thigh mid',    wVar: 'leg_thigh_mid_circ',   wScale: _HW_CIRC,
    hFn: r => lerp(r.height_gluteal_fold, r.height_knee, 0.5), hCalc: 'lerp(height_gluteal_fold, height_knee, 0.5)',
    hDeps: ['height_gluteal_fold', 'height_knee'] },
  { name: 'Knee',         wVar: 'leg_knee_circ',   wScale: _HW_CIRC, hVar: 'height_knee' },
  { name: 'Calf',         wVar: 'leg_calf_circ',   wScale: _HW_CIRC, hVar: 'height_calf' },
  { name: 'Ankle high',   wVar: 'leg_ankle_high_circ', wScale: _HW_CIRC, hVar: 'height_ankle_high' },
  { name: 'Ankle',        wVar: 'leg_ankle_circ',  wScale: _HW_CIRC, hVar: 'height_ankle' },
];

/** Primary variable for a figure measurement (used for cross-panel linking). */
export function primaryVar(d: FigMeasurement): string | null {
  return d.wVar ?? d.hVar ?? null;
}

const GUIDE_GROUP_COLORS: Record<string, { label: string; color: string }> = {
  neckShoulder: { label: 'neck shoulder', color: '#66c2a5' },
  bustRib:      { label: 'bust rib',      color: '#fc8d62' },
  waist:        { label: 'waist',         color: '#a6d854' },
  hipCrotch:    { label: 'hip crotch',    color: '#e78ac3' },
  legs:         { label: 'legs',          color: '#8da0cb' },
};

// ── Math helpers ──────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number | null {
  return (a != null && b != null && a > 0 && b > 0) ? a + (b - a) * t : null;
}
function offsetDown(from: number, dist: number): number | null {
  return (from > 0 && dist > 0) ? from - dist : null;
}
function offsetUp(from: number, dist: number): number | null {
  return (from > 0 && dist > 0) ? from + dist : null;
}
function clampN(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function shoulderTipHalfWidth(R: R): number | null {
  if (R.neck_width > 0 && R.neck_front_to_shoulder_tip_f > 0)
    return R.neck_width * _HW_WIDTH + R.neck_front_to_shoulder_tip_f;
  if (R.width_shoulder > 0) return R.width_shoulder * _HW_WIDTH;
  if (R.shoulder_tip_to_shoulder_tip_f > 0) return R.shoulder_tip_to_shoulder_tip_f * _HW_ARC;
  return null;
}
function shoulderTipHeight(R: R): number | null {
  const halfW = shoulderTipHalfWidth(R);
  if (R.height_neck_front > 0 && R.neck_front_to_shoulder_tip_f > 0 && halfW != null && halfW > 0) {
    const neckHW = R.neck_width > 0 ? R.neck_width * _HW_WIDTH : 0;
    const dx = Math.max(0, halfW - neckHW);
    const dy = Math.sqrt(Math.max(0, R.neck_front_to_shoulder_tip_f ** 2 - dx ** 2));
    if (dy > 0) return R.height_neck_front - dy;
  }
  return R.height_shoulder_tip > 0 ? R.height_shoulder_tip : null;
}
function neckSideHeight(R: R): number | null {
  return offsetUp(R.height_waist_front, R.neck_side_to_waist_f)
    ?? offsetUp(R.height_waist_front, R.neck_side_to_waist_side_f)
    ?? (R.height_neck_side > 0 ? R.height_neck_side : null);
}
function bustPointHeight(R: R): number | null {
  return offsetDown(R.height_neck_front, R.neck_front_to_bust_f)
    ?? (R.height_bustpoint > 0 ? R.height_bustpoint : null);
}
function bustPointHalfWidth(R: R): number | null {
  if (R.bustpoint_to_bustpoint_half > 0) return R.bustpoint_to_bustpoint_half;
  if (R.bustpoint_to_bustpoint > 0) return R.bustpoint_to_bustpoint * 0.5;
  if (R.width_bust > 0) return R.width_bust * _HW_WIDTH;
  if (R.bust_arc_f > 0) return R.bust_arc_f * _HW_ARC * 0.5;
  return null;
}
function handTipHeight(R: R): number | null {
  if (R.height_armpit > 0 && R.arm_armpit_to_wrist > 0 && R.hand_length > 0)
    return R.height_armpit - R.arm_armpit_to_wrist - R.hand_length;
  const shoulderH = shoulderTipHeight(R) ?? (R.height_shoulder_tip > 0 ? R.height_shoulder_tip : null);
  if (R.arm_neck_side_to_finger_tip > 0) {
    const neckSideH = neckSideHeight(R);
    if (neckSideH != null && neckSideH > 0) return neckSideH - R.arm_neck_side_to_finger_tip;
  }
  if (!(shoulderH != null && shoulderH > 0)) return null;
  const armLength = R.arm_shoulder_tip_to_wrist > 0 ? R.arm_shoulder_tip_to_wrist : R.arm_shoulder_tip_to_wrist_bent;
  if (!(armLength > 0)) return null;
  const handLen = R.hand_length > 0 ? R.hand_length : 0;
  return handLen > 0 ? shoulderH - armLength - handLen : null;
}

function arcWidthRatio(R: R): number {
  const ratios = ARC_WIDTH_PAIRS
    .map(p => (R[p.arcVar] > 0 && R[p.widthVar] > 0) ? R[p.widthVar] / R[p.arcVar] : null)
    .filter((v): v is number => v !== null && isFinite(v));
  if (!ratios.length) return DEFAULT_ARC_WIDTH_RATIO;
  return clampN(ratios.reduce((s, v) => s + v, 0) / ratios.length, 0.55, 1.05);
}
function circWidthRatio(R: R): number {
  const ratios = CIRC_WIDTH_PAIRS
    .map(p => (R[p.circVar] > 0 && R[p.widthVar] > 0) ? R[p.widthVar] / R[p.circVar] : null)
    .filter((v): v is number => v !== null && isFinite(v));
  if (!ratios.length) return 1 / Math.PI;
  return clampN(ratios.reduce((s, v) => s + v, 0) / ratios.length, 0.28, 0.48);
}

function projectedWidth(d: FigMeasurement, R: R, arcRatio: number): number | null {
  if (d.name === 'Shoulder tip') {
    const hw = shoulderTipHalfWidth(R);
    return hw != null && hw > 0 ? hw * 2 : null;
  }
  if (d.widthVar && R[d.widthVar] > 0) return R[d.widthVar];
  if (!d.wVar || !(R[d.wVar] > 0)) return null;
  if (d.wVar.endsWith('_arc_f')) return R[d.wVar] * arcRatio;
  if (d.wScale === _HW_CIRC) return null;
  return R[d.wVar];
}

function resolveH(d: FigMeasurement, R: R): number | null {
  if (d.hVar) { const h = R[d.hVar]; if (h > 0) return h; }
  if (d.hFB)  { const h = R[d.hFB];  if (h > 0) return h; }
  if (d.hFn)  { try { const h = d.hFn(R); if (h != null && h > 0) return h; } catch {} }
  return null;
}

function guideGroupForName(name: string) {
  if (/^(Neck|Shoulder)/.test(name)) return GUIDE_GROUP_COLORS.neckShoulder;
  if (/^(Highbust|Bust|Lowbust|Rib)$/.test(name)) return GUIDE_GROUP_COLORS.bustRib;
  if (name === 'Waist') return GUIDE_GROUP_COLORS.waist;
  if (/^(Highhip|Hip|Crotch)$/.test(name)) return GUIDE_GROUP_COLORS.hipCrotch;
  if (/^(Thigh|Knee|Calf|Ankle)/.test(name)) return GUIDE_GROUP_COLORS.legs;
  return { label: 'other', color: '#71717a' };
}

function heightCalcText(d: FigMeasurement, R: R): string {
  if (d.hVar && R[d.hVar] > 0) return d.hVar;
  if (d.hFB && R[d.hFB] > 0) return d.hFB;
  return d.hCalc ?? 'computed';
}
function widthCalcText(d: FigMeasurement, R: R, arcRatio: number): string {
  if (d.name === 'Shoulder tip' && R.neck_width > 0 && R.neck_front_to_shoulder_tip_f > 0)
    return '2*(neck_width/2+neck_front_to_shoulder_tip_f)';
  if (!d.wVar || !(R[d.wVar] > 0)) return 'height-only';
  if (d.widthVar && R[d.widthVar] > 0) return d.widthVar;
  if (d.wVar.endsWith('_arc_f')) return `${d.wVar}*projRatio(${arcRatio.toFixed(3)})`;
  if (d.wScale === _HW_CIRC) return `${d.wVar}*(1/π)`;
  return d.wVar;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function clampByte(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }
function normalizeHex(v: string): string | null {
  const m = String(v).trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
}
function hexToRgb(hex: string) {
  const s = normalizeHex(hex); if (!s) return null;
  return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16) };
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r,g,b].map(v => clampByte(v).toString(16).padStart(2,'0')).join('')}`;
}
function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  if (!ca || !cb) return normalizeHex(a) ?? '#f2c6a0';
  return rgbToHex(ca.r+(cb.r-ca.r)*t, ca.g+(cb.g-ca.g)*t, ca.b+(cb.b-ca.b)*t);
}
function buildPalette(hex: string) {
  const fill = normalizeHex(hex) ?? '#f2c6a0';
  return {
    fill, stroke: mixHex(fill,'#5f3a2d',0.72),
    fillSoft: mixHex(fill,'#ffffff',0.08), strokeSoft: mixHex(fill,'#3f2a21',0.7),
  };
}

// ── Number format helpers ──────────────────────────────────────────────────────

function toCm(val: number, unit: string): number | null {
  if (unit === 'inch' || unit === 'in') return val * 2.54;
  if (unit === 'mm') return val / 10;
  return null;
}
function fmtCm(val: number, unit: string): string | null {
  const cm = toCm(val, unit);
  return cm !== null ? cm.toFixed(1).replace(/\.0$/, '') : null;
}
function nf(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v % 1 === 0) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}
function escXml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] ?? c));
}

// ── Catmull-Rom path helper ────────────────────────────────────────────────────

function crPath(pts: [number,number][], startWithM = true): string {
  if (pts.length < 2) return '';
  let d = startWithM ? `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
    d += ` C ${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ` +
         `${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ` +
         `${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// ── Ratio panel ───────────────────────────────────────────────────────────────

type RatioChoice = { varName?: string; fn?: (r: R) => number | null; label: string };
function chooseRatio(R: R, choices: RatioChoice[]): { value: number; label: string } | null {
  for (const c of choices) {
    const v = c.fn ? c.fn(R) : (c.varName ? R[c.varName] : null);
    if (v != null && v > 0 && isFinite(v)) return { value: v, label: c.label };
  }
  return null;
}
function ratioFmt(v: number) {
  return (v > 0 && isFinite(v)) ? v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '—';
}

function buildRatioPanelHtml(R: R, unit: string, arcRatio: number): string {
  const shoulder = chooseRatio(R, [
    { varName: 'width_shoulder', label: 'width_shoulder' },
    { fn: r => { const hw = shoulderTipHalfWidth(r); return hw != null && hw > 0 ? hw*2 : null; }, label: 'shoulder tip estimate' },
  ]);
  const hipWidth = chooseRatio(R, [
    { varName: 'width_hip', label: 'width_hip' },
    { fn: r => r.hip_arc_f > 0 ? r.hip_arc_f * arcRatio : null, label: 'hip_arc_f*projRatio' },
  ]);
  const waistCirc = chooseRatio(R, [
    { varName: 'waist_circ', label: 'waist_circ' },
    { fn: r => r.waist_arc_f > 0 ? r.waist_arc_f*2 : null, label: 'waist_arc_f*2' },
  ]);
  const hipCirc = chooseRatio(R, [
    { varName: 'hip_circ', label: 'hip_circ' },
    { fn: r => r.hip_arc_f > 0 ? r.hip_arc_f*2 : null, label: 'hip_arc_f*2' },
  ]);
  const height = chooseRatio(R, [{ varName: 'height', label: 'height' }]);
  const legLength = chooseRatio(R, [
    { fn: r => (r.height_hip>0&&r.height_ankle>0) ? r.height_hip-r.height_ankle : null, label: 'height_hip-height_ankle' },
    { fn: r => (r.height_hip>0&&r.height_ankle_high>0) ? r.height_hip-r.height_ankle_high : null, label: 'height_hip-height_ankle_high' },
    { varName: 'leg_crotch_to_floor', label: 'leg_crotch_to_floor' },
  ]);

  const rows: Array<{ name: string; value: string; ref: string; calc: string }> = [];
  const push = (name: string, value: string | null, ref: string, calc: string) =>
    rows.push({ name, value: value ?? '—', ref, calc });

  if (hipWidth && shoulder)
    push('Hip:shoulder', `1:${ratioFmt(shoulder.value/hipWidth.value)}`, 'avg women 1:1.03; men 1:1.18', `${shoulder.label}/${hipWidth.label}`);
  else push('Hip:shoulder', null, 'needs hip and shoulder width', 'width_hip+width_shoulder');

  if (legLength && height)
    push('Leg:height', ratioFmt(legLength.value/height.value), 'LBR mean 0.491; SD 0.015', `${legLength.label}/height`);
  else push('Leg:height', null, 'needs height+hip/ankle height', '(height_hip-height_ankle)/height');

  if (waistCirc && height)
    push('Waist:height', ratioFmt(waistCirc.value/height.value), 'healthy adult ~0.45–0.53', `${waistCirc.label}/height`);
  else push('Waist:height', null, 'needs waist circ and height', 'waist_circ/height');

  if (waistCirc && hipCirc)
    push('Waist:hip', ratioFmt(waistCirc.value/hipCirc.value), 'reference range 0.67–0.80', `${waistCirc.label}/${hipCirc.label}`);
  else push('Waist:hip', null, 'needs waist and hip circ', 'waist_circ/hip_circ');

  return `<div class="ratio-panel">
  <table><thead><tr><th>Ratio</th><th>Value</th><th>Reference / calc</th></tr></thead>
  <tbody>${rows.map(r => `<tr title="${escXml(r.calc)}">
    <td>${escXml(r.name)}</td><td class="ratio-value">${escXml(r.value)}</td>
    <td><div>${escXml(r.ref)}</div><div class="ratio-note">${escXml(r.calc)}${unit ? ` (${escXml(unit)})` : ''}</div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export interface RenderOptions {
  skinColor: string;
  projectionRatioEnabled: boolean;
}

export function renderFigure(doc: SeamlyDocument, opts: RenderOptions): string | null {
  const { measurements, unit } = doc;
  const R: R = {};
  for (const [k, m] of Object.entries(measurements)) R[k] = m.resolved ?? 0;

  const palette = buildPalette(opts.skinColor);
  const { fill: bodyFill, fillSoft: bodyFillSoft, stroke: bodyStroke } = palette;

  const arcRatio = opts.projectionRatioEnabled ? arcWidthRatio(R) : 1;
  circWidthRatio(R); // computed but used implicitly via _HW_CIRC

  const items: Array<FigMeasurement & {
    hVal: number; wVal: number | null; pWidth: number | null;
    lineY: number; halfW: number; labelY: number;
  }> = FIGURE_MEASUREMENTS.map(d => {
    const hVal = resolveH(d, R);
    const wVal = d.wVar ? (R[d.wVar] > 0 ? R[d.wVar] : null) : null;
    const pWidth = projectedWidth(d, R, arcRatio);
    return { ...d, hVal: hVal ?? 0, wVal, pWidth };
  }).filter(d => d.hVal > 0) as typeof items;

  if (!items.length) return null;

  const totalH = (R['height'] > 0 ? R['height'] : null) ?? (Math.max(...items.map(d => d.hVal)) * 1.08);

  const PAD_TOP = 36, PAD_BOT = 20, BODY_H = 500;
  const scale = BODY_H / totalH;

  const wItems = items.filter(d => d.pWidth !== null || d.wVal !== null);

  const shoulderHalfWVal = R['width_shoulder'] > 0
    ? R['width_shoulder'] * _HW_WIDTH
    : R['shoulder_tip_to_shoulder_tip_f'] > 0
    ? R['shoulder_tip_to_shoulder_tip_f'] * _HW_ARC
    : null;

  const armLength  = R['arm_shoulder_tip_to_wrist'] > 0 ? R['arm_shoulder_tip_to_wrist'] : R['arm_shoulder_tip_to_wrist_bent'];
  const elbowLength = R['arm_shoulder_tip_to_elbow'] > 0 ? R['arm_shoulder_tip_to_elbow'] : R['arm_shoulder_tip_to_elbow_bent'];
  const shoulderHVal = shoulderTipHeight(R);
  const handTipHVal  = handTipHeight(R);

  const armFigure = (shoulderHVal != null && shoulderHVal > 0 && shoulderHalfWVal != null && shoulderHalfWVal > 0 && armLength > 0) ? {
    shoulderH: shoulderHVal,
    elbowH: elbowLength > 0 ? shoulderHVal - elbowLength : null,
    wristH: shoulderHVal - armLength,
    handTipH: handTipHVal,
    shoulderHalfW: shoulderHalfWVal * scale,
    upperRadius: ((R['body_armfold_circ'] > 0 ? R['body_armfold_circ'] : R['body_bust_circ']) || 0) * _HW_CIRC * scale * 0.22,
    elbowRadius: R['arm_elbow_circ_bent'] > 0 ? R['arm_elbow_circ_bent'] * _HW_CIRC * scale : 0,
    wristRadius: R['arm_wrist_circ'] > 0 ? R['arm_wrist_circ'] * _HW_CIRC * scale : 0,
  } : null;

  const legLevels = LEG_LEVELS.map(d => {
    const hV = d.hVar ? R[d.hVar] : (d.hFn ? (d.hFn(R) ?? 0) : 0);
    const cV = R[d.circVar] > 0 ? R[d.circVar] : null;
    return (hV > 0 && cV != null && cV > 0)
      ? { hVal: hV, cVal: cV, radius: cV * _HW_CIRC * scale * 0.5, circVar: d.circVar }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a,b) => b.hVal - a.hVal);

  const legFigure = legLevels.length >= 2 ? { levels: legLevels } : null;

  const footFigure = legFigure ? (() => {
    const ankleR = legLevels[legLevels.length-1].radius;
    const len = R['foot_length'] > 0 ? R['foot_length']*scale : Math.max(ankleR*3.2,18);
    const depth = R['foot_circ'] > 0 ? Math.max(R['foot_circ']*_HW_CIRC*scale*0.45, ankleR*0.9) : Math.max(ankleR*1.05,7);
    return { length: len, depth, ankleR };
  })() : null;

  let maxHalfW = wItems.length
    ? Math.max(...wItems.map(d => (d.pWidth != null ? d.pWidth*_HW_WIDTH : (d.wVal??0)*(d.wScale??_HW_ARC))*scale))
    : 48;
  if (armFigure) {
    const armReach = armFigure.shoulderHalfW + Math.max(armFigure.upperRadius||14, armFigure.elbowRadius||10, armFigure.wristRadius||6);
    maxHalfW = Math.max(maxHalfW, armReach);
  }
  if (legFigure) {
    const maxLegR = Math.max(...legFigure.levels.map(p=>p.radius));
    const legCO = maxLegR + Math.max(3, maxLegR*0.12);
    const footReach = footFigure ? legCO + footFigure.length + 4 : maxLegR*2+6;
    maxHalfW = Math.max(maxHalfW, footReach);
  }

  const LEFT_GUTTER = 56;
  const AXIS_X   = Math.ceil(maxHalfW) + LEFT_GUTTER;
  const TETHER_X = AXIS_X + Math.ceil(maxHalfW) + 16;
  const LABEL_X  = TETHER_X + 10;
  const NAME_COL = 88;
  const VAL_X    = LABEL_X + NAME_COL;
  const VAL_COL  = unit !== 'cm' ? 168 : 100;
  const SVG_W    = VAL_X + VAL_COL + 6;

  function toY(h: number) { return PAD_TOP + (totalH - h) * scale; }

  for (const d of items) {
    d.lineY = toY(d.hVal);
    d.halfW = d.pWidth != null
      ? d.pWidth * _HW_WIDTH * scale
      : d.wVal != null ? d.wVal*(d.wScale??_HW_ARC)*scale : 10;
  }
  items.sort((a,b) => a.lineY - b.lineY);

  const floorY = PAD_TOP + BODY_H;
  const MIN_SPACING = 20;
  const LABEL_TOP = PAD_TOP + 10;
  const labelSpan = Math.max(floorY - LABEL_TOP, (items.length-1)*MIN_SPACING);
  const labelStep = items.length > 1 ? labelSpan/(items.length-1) : 0;
  for (let i = 0; i < items.length; i++) items[i].labelY = LABEL_TOP + i*labelStep;

  const footDrop = footFigure ? footFigure.depth*0.55 : 0;
  const SVG_H = Math.max(floorY+footDrop+PAD_BOT, items[items.length-1].labelY+8+PAD_BOT);

  const S: string[] = [];

  const hipItem = items.slice().reverse().find(d => d.wVal != null && !(d.wVar??'').startsWith('leg_') && d.hVal > (R['height_knee']||0));
  const hipHW   = hipItem ? hipItem.halfW : maxHalfW;

  const outlineMap = new Map<number, typeof items[0]>();
  const wdSorted = items.filter(d => d.wVal != null && !(d.wVar??'').startsWith('leg_'));
  for (const d of wdSorted) {
    const key = Math.round(d.lineY);
    if (!outlineMap.has(key) || d.halfW > outlineMap.get(key)!.halfW) outlineMap.set(key, d);
  }
  const outlineR: [number,number][] = [...outlineMap.values()]
    .sort((a,b) => a.lineY-b.lineY)
    .map(d => [AXIS_X+d.halfW, d.lineY]);

  if (legFigure) {
    const crotchY = R['leg_crotch_to_floor'] > 0 ? toY(R['leg_crotch_to_floor']) : toY(legFigure.levels[0].hVal);
    outlineR.push([AXIS_X + hipHW*0.18, crotchY]);
  } else {
    const LEG_FALL = [
      { hVar:'height_gluteal_fold', factor:0.38 }, { hVar:'height_knee', factor:0.28 },
      { hVar:'height_calf', factor:0.22 }, { hVar:'height_ankle_high', factor:0.12 }, { hVar:'height_ankle', factor:0.10 },
    ];
    const hipLineY = hipItem ? hipItem.lineY : floorY;
    for (const leg of LEG_FALL) {
      if (!(R[leg.hVar] > 0)) continue;
      const legY = toY(R[leg.hVar]);
      if (legY <= hipLineY) continue;
      if (outlineR.some(([,y]) => Math.abs(y-legY)<5)) continue;
      outlineR.push([AXIS_X + hipHW*leg.factor, legY]);
    }
    outlineR.push([AXIS_X + hipHW*0.07, floorY]);
  }
  outlineR.sort((a,b) => a[1]-b[1]);

  const outlineL = outlineR.slice().reverse().map(([x,y]): [number,number] => [2*AXIS_X-x,y]);
  const floorL = outlineL[0];
  const outlinePath = crPath(outlineR) +
    ` L ${floorL[0].toFixed(1)} ${floorL[1].toFixed(1)}` +
    crPath(outlineL, false) + ' Z';
  S.push(`<path d="${outlinePath}" fill="${bodyFillSoft}" fill-opacity="0.22" stroke="${bodyStroke}" stroke-width="1.5" stroke-opacity="0.55" stroke-linejoin="round"/>`);

  // Legs
  if (legFigure) {
    const maxLegR = Math.max(...legFigure.levels.map(p=>p.radius));
    const legCO = maxLegR + Math.max(3, maxLegR*0.12);
    const floorRadius = Math.max(legFigure.levels[legFigure.levels.length-1].radius*0.75, 3);
    const crotchY = R['leg_crotch_to_floor'] > 0 ? toY(R['leg_crotch_to_floor']) : toY(legFigure.levels[0].hVal);
    const crotchGap = Math.max(3, maxLegR*0.18);
    const hipY = hipItem ? hipItem.lineY : toY(legFigure.levels[0].hVal);

    function legPath(side: number) {
      const cx = AXIS_X + side*legCO;
      const pts = legFigure!.levels.map(p => ({ y:toY(p.hVal), r:Math.max(p.radius,3) }));
      pts.push({ y:floorY, r:floorRadius });
      const outer: [number,number][] = [[AXIS_X+side*hipHW, hipY], ...pts.map(p => [cx+side*p.r, p.y] as [number,number])];
      const inner: [number,number][] = [...pts.map(p => [cx-side*p.r, p.y] as [number,number]).reverse(), [AXIS_X+side*crotchGap, crotchY]];
      return crPath(outer) + ` L ${inner[0][0].toFixed(1)} ${inner[0][1].toFixed(1)}` + crPath(inner,false) + ' Z';
    }
    function footPath(side: number) {
      if (!footFigure) return '';
      const cx = AXIS_X + side*legCO;
      const { length:len, depth, ankleR } = footFigure;
      const heelBack = Math.max(ankleR*0.45,3), toeLift=Math.max(depth*0.18,2);
      const toeX=cx+side*len, heelX=cx-side*heelBack, ankleOuterX=cx+side*floorRadius;
      const soleY=floorY+depth*0.42, topY=floorY-depth*0.72;
      return `<path d="M ${heelX.toFixed(1)} ${topY.toFixed(1)} C ${cx.toFixed(1)} ${topY.toFixed(1)} ${ankleOuterX.toFixed(1)} ${(floorY-depth*0.55).toFixed(1)} ${(cx+side*len*0.48).toFixed(1)} ${(floorY-depth*0.34).toFixed(1)} C ${(cx+side*len*0.84).toFixed(1)} ${(floorY-depth*0.22).toFixed(1)} ${(toeX+side*3).toFixed(1)} ${(floorY-toeLift).toFixed(1)} ${toeX.toFixed(1)} ${(floorY+depth*0.12).toFixed(1)} C ${(cx+side*len*0.86).toFixed(1)} ${soleY.toFixed(1)} ${(cx+side*len*0.38).toFixed(1)} ${soleY.toFixed(1)} ${(cx-side*floorRadius*0.25).toFixed(1)} ${(floorY+depth*0.18).toFixed(1)} C ${(heelX-side*1.5).toFixed(1)} ${(floorY+depth*0.08).toFixed(1)} ${(heelX-side*1.0).toFixed(1)} ${(floorY-depth*0.42).toFixed(1)} ${heelX.toFixed(1)} ${topY.toFixed(1)} Z"/>`;
    }
    S.push(`<path d="${legPath(-1)}" fill="${bodyFill}" fill-opacity="0.22" stroke="${bodyStroke}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
    S.push(`<path d="${legPath(1)}" fill="${bodyFill}" fill-opacity="0.22" stroke="${bodyStroke}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
    if (footFigure) {
      S.push(`<g fill="${bodyFill}" fill-opacity="0.22" stroke="${bodyStroke}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round">${footPath(-1)}${footPath(1)}</g>`);
    }
  }

  // Arms
  if (armFigure) {
    const shoulderY = toY(armFigure.shoulderH);
    const elbowY = armFigure.elbowH != null && armFigure.elbowH > 0
      ? toY(armFigure.elbowH)
      : shoulderY + (toY(armFigure.wristH) - shoulderY)*0.58;
    const wristY = toY(armFigure.wristH);
    const upperR = Math.max(armFigure.upperRadius||0, armFigure.elbowRadius||0, 8);
    const elbowR = Math.max(armFigure.elbowRadius||upperR*0.7, 6);
    const wristR = Math.max(armFigure.wristRadius||elbowR*0.55, 4);
    const handR  = wristR*1.25;
    const handTipY = armFigure.handTipH != null && armFigure.handTipH > 0 ? toY(armFigure.handTipH) : wristY+handR*1.8;

    function armPath(side: number) {
      const sx = AXIS_X+side*armFigure!.shoulderHalfW;
      return [
        `M ${(sx-side*Math.max(upperR*0.25,3)).toFixed(1)} ${shoulderY.toFixed(1)}`,
        `C ${(sx-side*Math.max(upperR*0.25,3)).toFixed(1)} ${(shoulderY+22).toFixed(1)} ${(sx-side*Math.max(elbowR*0.25,3)).toFixed(1)} ${(elbowY-18).toFixed(1)} ${(sx-side*Math.max(elbowR*0.25,3)).toFixed(1)} ${elbowY.toFixed(1)}`,
        `C ${(sx-side*Math.max(elbowR*0.25,3)).toFixed(1)} ${(elbowY+18).toFixed(1)} ${(sx-side*Math.max(wristR*0.35,2)).toFixed(1)} ${(wristY-12).toFixed(1)} ${(sx-side*Math.max(wristR*0.35,2)).toFixed(1)} ${wristY.toFixed(1)}`,
        `C ${(sx-side*Math.max(handR*0.45,3)).toFixed(1)} ${(wristY+7).toFixed(1)} ${(sx-side*Math.max(handR*0.45,3)).toFixed(1)} ${(handTipY-5).toFixed(1)} ${sx.toFixed(1)} ${handTipY.toFixed(1)}`,
        `C ${(sx+side*handR).toFixed(1)} ${(handTipY-5).toFixed(1)} ${(sx+side*handR).toFixed(1)} ${(wristY+7).toFixed(1)} ${(sx+side*wristR).toFixed(1)} ${wristY.toFixed(1)}`,
        `C ${(sx+side*wristR).toFixed(1)} ${(wristY-12).toFixed(1)} ${(sx+side*(elbowR+4)).toFixed(1)} ${(elbowY+18).toFixed(1)} ${(sx+side*(elbowR+4)).toFixed(1)} ${elbowY.toFixed(1)}`,
        `C ${(sx+side*(elbowR+4)).toFixed(1)} ${(elbowY-18).toFixed(1)} ${(sx+side*upperR).toFixed(1)} ${(shoulderY+22).toFixed(1)} ${(sx+side*upperR).toFixed(1)} ${shoulderY.toFixed(1)} Z`,
      ].join(' ');
    }
    S.push(`<path d="${armPath(-1)}" fill="${bodyFill}" fill-opacity="0.2" stroke="${bodyStroke}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
    S.push(`<path d="${armPath(1)}" fill="${bodyFill}" fill-opacity="0.2" stroke="${bodyStroke}" stroke-width="1.3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
  }

  // Inseam
  if (R['leg_crotch_to_floor'] > 0) {
    const cY = +toY(R['leg_crotch_to_floor']).toFixed(1);
    S.push(`<line x1="${AXIS_X}" y1="${cY}" x2="${AXIS_X}" y2="${floorY}" stroke="#3b82f6" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="4 3"/>`);
  }

  // Head
  const neckD = wdSorted.length ? wdSorted[0] : null;
  const neckHMeas = neckD ? neckD.hVal : totalH*0.87;
  const headHpx = R['head_crown_to_neck_back'] > 0 ? R['head_crown_to_neck_back']*scale : Math.max((totalH-neckHMeas)*scale,28);
  const headRy = headHpx/2;
  const headRx = R['head_width'] > 0 ? (R['head_width']/2)*scale : headRy*0.72;
  const headCY = toY(totalH) + headRy;
  const neckSideHVal = neckSideHeight(R);
  const headBottomY = headCY+headRy;
  const rawNeckTopY = R['height_neck_back'] > 0 ? toY(R['height_neck_back']) : headBottomY-2;
  const neckTopY = clampN(rawNeckTopY, headCY+headRy*0.62, headBottomY+4);
  const neckBaseSourceY = shoulderHVal != null && shoulderHVal > 0 ? toY(shoulderHVal) : neckSideHVal != null && neckSideHVal > 0 ? toY(neckSideHVal) : null;
  const minNeckDepth = Math.max(headRy*0.52,20), maxNeckDepth = Math.max(headRy*1.2,38);
  const neckBaseY = neckBaseSourceY != null && neckBaseSourceY > 0
    ? clampN(Math.max(neckBaseSourceY, neckTopY+minNeckDepth), neckTopY+18, neckTopY+maxNeckDepth)
    : neckTopY+minNeckDepth;
  const neckFrontY = R['height_neck_front'] > 0 ? clampN(toY(R['height_neck_front']), neckTopY+7, neckBaseY-5) : neckTopY+(neckBaseY-neckTopY)*0.45;
  const neckHalfW = R['neck_width'] > 0 ? R['neck_width']*_HW_WIDTH*scale : R['neck_arc_f'] > 0 ? R['neck_arc_f']*arcRatio*_HW_WIDTH*scale : headRx*0.36;
  const neckTopHalfW = clampN(neckHalfW*0.76, 5, headRx*0.64);
  const shoulderBaseHalfW = shoulderHalfWVal != null && shoulderHalfWVal > 0 ? shoulderHalfWVal*scale*0.36 : 0;
  const neckBaseHalfW = clampN(Math.max(neckHalfW*1.08, shoulderBaseHalfW, 8), neckTopHalfW+2, Math.max(neckHalfW*1.45, neckTopHalfW+3));
  const neckCurveDrop = clampN(neckHalfW*0.22, 4, Math.max(4,(neckBaseY-neckFrontY)*0.45));

  S.push(`<path d="M ${(AXIS_X-neckTopHalfW).toFixed(1)} ${neckTopY.toFixed(1)} C ${(AXIS_X-neckBaseHalfW*0.82).toFixed(1)} ${(neckTopY+(neckBaseY-neckTopY)*0.24).toFixed(1)} ${(AXIS_X-neckBaseHalfW).toFixed(1)} ${(neckBaseY-8).toFixed(1)} ${(AXIS_X-neckBaseHalfW).toFixed(1)} ${neckBaseY.toFixed(1)} L ${(AXIS_X+neckBaseHalfW).toFixed(1)} ${neckBaseY.toFixed(1)} C ${(AXIS_X+neckBaseHalfW).toFixed(1)} ${(neckBaseY-8).toFixed(1)} ${(AXIS_X+neckBaseHalfW*0.82).toFixed(1)} ${(neckTopY+(neckBaseY-neckTopY)*0.24).toFixed(1)} ${(AXIS_X+neckTopHalfW).toFixed(1)} ${neckTopY.toFixed(1)} Z" fill="${bodyFillSoft}" fill-opacity="0.34" stroke="none"/>`);
  S.push(`<path d="M ${(AXIS_X-neckHalfW).toFixed(1)} ${neckFrontY.toFixed(1)} Q ${AXIS_X.toFixed(1)} ${(neckFrontY+neckCurveDrop).toFixed(1)} ${(AXIS_X+neckHalfW).toFixed(1)} ${neckFrontY.toFixed(1)}" fill="none" stroke="${bodyStroke}" stroke-width="1" stroke-opacity="0.48" stroke-linecap="round"/>`);
  S.push(`<ellipse cx="${AXIS_X}" cy="${headCY.toFixed(1)}" rx="${headRx.toFixed(1)}" ry="${headRy.toFixed(1)}" fill="${bodyFillSoft}" fill-opacity="0.22" stroke="${bodyStroke}" stroke-width="1.5" stroke-opacity="0.55"/>`);

  // Bust point
  const bpH = bustPointHeight(R), bpHW = bustPointHalfWidth(R);
  if (bpH != null && bpH > 0 && bpHW != null && bpHW > 0) {
    const bustY = +toY(bpH).toFixed(1), bustX = +(AXIS_X+bpHW*scale).toFixed(1);
    const bustClr = GUIDE_GROUP_COLORS.bustRib.color;
    S.push(`<line x1="${(AXIS_X-bpHW*scale).toFixed(1)}" y1="${bustY}" x2="${bustX}" y2="${bustY}" stroke="${bustClr}" stroke-width="1.5" stroke-opacity="0.78"/>`);
    S.push(`<circle cx="${(AXIS_X-bpHW*scale).toFixed(1)}" cy="${bustY}" r="3.2" fill="${bustClr}" stroke="#fff" stroke-width="1"/>`);
    S.push(`<circle cx="${bustX}" cy="${bustY}" r="3.2" fill="${bustClr}" stroke="#fff" stroke-width="1"/>`);
    S.push(`<text x="${(bustX+10).toFixed(1)}" y="${(bustY-8).toFixed(1)}" font-size="10" font-weight="600" fill="${bustClr}">Bust point</text>`);
  }

  // Axis + floor
  const floorExt = Math.ceil(maxHalfW)+14;
  S.push(`<line x1="${AXIS_X}" y1="4" x2="${AXIS_X}" y2="${floorY}" stroke="#e4e4e7" stroke-width="1"/>`);
  S.push(`<line x1="${AXIS_X-floorExt}" y1="${floorY}" x2="${AXIS_X+floorExt}" y2="${floorY}" stroke="#3f3f46" stroke-width="2"/>`);

  if (R['height'] > 0) {
    const ty = +toY(R['height']).toFixed(1);
    const hCm = fmtCm(R['height'], unit);
    S.push(`<line x1="${AXIS_X-floorExt}" y1="${ty}" x2="${AXIS_X+floorExt}" y2="${ty}" stroke="#d4d4d8" stroke-width="1" stroke-dasharray="4 4"/>`);
    S.push(`<text x="${AXIS_X}" y="${ty-6}" text-anchor="middle" font-size="9" fill="#a1a1aa">${nf(R['height'])} ${unit}${hCm ? ` (${hCm} cm)` : ''}</text>`);
  }

  // Guide lines + labels
  const guideLegCO = legFigure ? Math.max(...legFigure.levels.map(p=>p.radius)) + Math.max(3,Math.max(...legFigure.levels.map(p=>p.radius))*0.12) : null;

  for (const d of items) {
    const { lineY, labelY, halfW, hVal, wVal, name } = d;
    const hasW = wVal !== null;
    const group = guideGroupForName(name);
    const clr = group.color;
    const sw  = hasW ? 2 : 1.5;
    const cap = hasW ? 5 : 2;
    const dash = hasW ? '' : ' stroke-dasharray="5 3"';
    const isLegGuide = legFigure != null && (d.wVar??'').startsWith('leg_');
    const legGuideR = isLegGuide ? Math.max(halfW*(hasW?0.5:1),3) : null;
    const pVar = primaryVar(d);

    let x1 = +(AXIS_X-halfW).toFixed(1);
    let x2 = +(AXIS_X+halfW).toFixed(1);

    const legSegs = (isLegGuide && guideLegCO != null && legGuideR != null)
      ? [-1,1].map(side => ({ x1:+(AXIS_X+side*guideLegCO-legGuideR).toFixed(1), x2:+(AXIS_X+side*guideLegCO+legGuideR).toFixed(1) }))
      : null;

    if (legSegs) { x1 = legSegs[0].x1; x2 = legSegs[1].x2; }

    const ly = +lineY.toFixed(1), laby = +labelY.toFixed(1);
    const dispVal = hasW ? (d.pWidth != null ? d.pWidth : wVal!) : hVal;
    const prefix  = hasW ? 'w' : 'h';
    const cmStr   = fmtCm(dispVal, unit);
    const calc    = `${name}: h=${heightCalcText(d,R)} => ${nf(hVal)} ${unit}; ${hasW ? `w=${widthCalcText(d,R,arcRatio)} => ${nf(dispVal)} ${unit}; ` : ''}`;
    const calcAttr = escXml(calc);
    const guideId  = `guide-${items.indexOf(d)}`;
    const gAttr    = `data-guide="${guideId}"${pVar ? ` data-pvar="${escXml(pVar)}"` : ''}`;

    for (const seg of (legSegs ?? [{ x1, x2 }])) {
      S.push(`<line x1="${seg.x1}" y1="${ly}" x2="${seg.x2}" y2="${ly}" stroke="${clr}" stroke-width="${sw}"${dash} ${gAttr} data-calc="${calcAttr}"><title>${calcAttr}</title></line>`);
      S.push(`<line x1="${seg.x1}" y1="${+(ly-cap).toFixed(1)}" x2="${seg.x1}" y2="${+(ly+cap).toFixed(1)}" stroke="${clr}" stroke-width="${sw}" ${gAttr}/>`);
      S.push(`<line x1="${seg.x2}" y1="${+(ly-cap).toFixed(1)}" x2="${seg.x2}" y2="${+(ly+cap).toFixed(1)}" stroke="${clr}" stroke-width="${sw}" ${gAttr}/>`);
    }

    const leaderStartX = Math.max(x2, TETHER_X-10);
    if (x2 < leaderStartX)
      S.push(`<line x1="${x2}" y1="${ly}" x2="${leaderStartX}" y2="${ly}" stroke="${clr}" stroke-width="0.75" stroke-dasharray="2 3" stroke-opacity="0.65" ${gAttr}/>`);
    S.push(`<polyline points="${leaderStartX},${ly} ${LABEL_X-8},${laby} ${LABEL_X-2},${laby}" fill="none" stroke="${clr}" stroke-width="0.9" stroke-opacity="0.65" ${gAttr}/>`);
    S.push(`<circle cx="${leaderStartX}" cy="${ly}" r="2" fill="${clr}" ${gAttr}/>`);
    S.push(`<circle cx="${LABEL_X-8}" cy="${laby}" r="1.8" fill="${clr}" fill-opacity="0.85" ${gAttr}/>`);

    S.push(
      `<text y="${laby+4}" font-size="11" fill="${clr}" ${gAttr} data-guide-label="${guideId}" style="cursor:pointer">` +
      `<title>${calcAttr}</title>` +
      `<tspan x="${LABEL_X}" font-weight="600">${escXml(name)}</tspan>` +
      `<tspan x="${VAL_X}">${prefix}: ${nf(dispVal)}` +
        `<tspan font-size="9" fill="#71717a"> ${unit}${cmStr ? ` (${cmStr} cm)` : ''}</tspan>` +
      `</tspan></text>`
    );
  }

  const ratioHtml = buildRatioPanelHtml(R, unit, arcRatio);
  const svgHtml = `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">${S.join('')}</svg>`;
  return ratioHtml + svgHtml;
}
