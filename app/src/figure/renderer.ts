/**
 * Body figure SVG renderer.
 */
import type { SeamlyDocument } from '@seamlyme/core';
import { R, Landmark, PathOptions, resolveArcRatio, crPath } from './common';
import { resolveFullBody, FullBodyResolved } from './factory';
import { buildTorsoPath, buildNeckBackLines, buildNecklineCurve, buildBustpointMark } from './torso';
import { buildHipPath, buildLegPaths, buildFootPaths } from './lower-body';
import { buildArmPath } from './arm';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FigureLandmark {
  id: string;
  label: string;
  widthVariable: string | null;
  widthValue: number | null;
  heightVariable: string | null;
  heightValue: number | null;
  heightCalculation: string | null;
  heightDependencies: string[];
  relatedVariables: string[];
  confidence: 'measured' | 'derived' | 'fallback' | 'missing';
}

interface FigMeasurement {
  id: string;
  name: string;
}

export const FIGURE_MEASUREMENTS: FigMeasurement[] = [
  { id: 'neck-back', name: 'Neck back' },
  { id: 'neck-side', name: 'Neck side' },
  { id: 'neck-front', name: 'Neck front' },
  { id: 'shoulder', name: 'Shoulder tip' },
  { id: 'highbust', name: 'Highbust' },
  { id: 'bust', name: 'Bust' },
  { id: 'lowbust', name: 'Lowbust' },
  { id: 'rib', name: 'Rib' },
  { id: 'waist', name: 'Waist' },
  { id: 'highhip', name: 'Highhip' },
  { id: 'hip', name: 'Hip' },
  { id: 'crotch', name: 'Crotch' },
  { id: 'thigh-upper', name: 'Thigh upper' },
  { id: 'thigh-mid', name: 'Thigh mid' },
  { id: 'knee', name: 'Knee' },
  { id: 'calf', name: 'Calf' },
  { id: 'ankle-high', name: 'Ankle high' },
  { id: 'ankle', name: 'Ankle' },
];

const GUIDE_GROUP_COLORS: Record<string, { label: string; color: string }> = {
  neckShoulder: { label: 'neck shoulder', color: '#66c2a5' },
  bustRib:      { label: 'bust rib',      color: '#fc8d62' },
  waist:        { label: 'waist',         color: '#a6d854' },
  hipCrotch:    { label: 'hip crotch',    color: '#e78ac3' },
  legs:         { label: 'legs',          color: '#8da0cb' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function guideGroupForName(name: string) {
  if (/^(Neck|Shoulder)/.test(name)) return GUIDE_GROUP_COLORS.neckShoulder;
  if (/^(Highbust|Bust|Lowbust|Rib)$/.test(name)) return GUIDE_GROUP_COLORS.bustRib;
  if (name === 'Waist') return GUIDE_GROUP_COLORS.waist;
  if (/^(Highhip|Hip|Crotch)$/.test(name)) return GUIDE_GROUP_COLORS.hipCrotch;
  if (/^(Thigh|Knee|Calf|Ankle)/.test(name)) return GUIDE_GROUP_COLORS.legs;
  return { label: 'other', color: '#71717a' };
}

function nf(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v % 1 === 0) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

function escXml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] ?? c));
}

function buildPalette(hex: string) {
  const fill = hex || '#f2c6a0';
  return { fill, stroke: '#5f3a2d' };
}

// ── Landmark Access ───────────────────────────────────────────────────────────

export function getFigureLandmarks(doc: SeamlyDocument): FigureLandmark[] {
  const values: R = {};
  for (const [name, measurement] of Object.entries(doc.measurements)) {
    values[name] = measurement.resolved ?? 0;
  }
  const fb = resolveFullBody(values);
  
  const allLms: Landmark[] = [
    ...fb.torso.outline,
    ...(fb.torso.neckline ? [fb.torso.neckline.side, fb.torso.neckline.front] : []),
    ...(fb.torso.neckBack ? [fb.torso.neckBack] : []),
    ...fb.torso.interior,
    ...fb.lowerBody.hip,
    ...fb.lowerBody.leg,
    ...(fb.lowerBody.foot ? [fb.lowerBody.foot] : []),
    ...fb.leftArm.landmarks,
    ...fb.rightArm.landmarks,
    fb.head.neck,
  ];

  const landmarksById = new Map<string, Landmark>();
  for (const lm of allLms) landmarksById.set(lm.id, lm);

  return FIGURE_MEASUREMENTS.map(def => {
    const lm = landmarksById.get(def.id);
    const usedY = lm?.yCandidates.find(c => c.used);
    const usedW = lm?.wCandidates.find(c => c.used);
    
    let confidence: FigureLandmark['confidence'] = 'missing';
    if (lm?.y !== null) {
      if (usedY?.source.includes('canonical')) confidence = 'fallback';
      else if (usedY?.source.includes('lerp') || usedY?.source.includes('offset')) confidence = 'derived';
      else confidence = 'measured';
    }

    return {
      id: def.id,
      label: def.name,
      widthVariable: usedW?.source ?? null,
      widthValue: usedW?.value ?? null,
      heightVariable: usedY?.source ?? null,
      heightValue: lm?.y ?? null,
      heightCalculation: usedY?.source ?? null,
      heightDependencies: [],
      relatedVariables: [],
      confidence,
    };
  });
}

export function getFigureLandmark(doc: SeamlyDocument, id: string): FigureLandmark | null {
  return getFigureLandmarks(doc).find(landmark => landmark.id === id) ?? null;
}

// ── Ratio Panel ───────────────────────────────────────────────────────────────

function ratioFmt(v: number) {
  return (v > 0 && isFinite(v)) ? v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '—';
}

function buildRatioPanelHtml(fb: FullBodyResolved, unit: string): string {
  const rows: Array<{ name: string; value: string; ref: string; calc: string }> = [];
  const push = (name: string, value: string | null, ref: string, calc: string) =>
    rows.push({ name, value: value ?? '—', ref, calc });

  const shoulder = fb.torso.outline.find(l => l.id === 'shoulder');
  const hip = fb.lowerBody.hip.find(l => l.id === 'hip');
  const waist = fb.torso.outline.find(l => l.id === 'waist');
  const ankle = fb.lowerBody.leg.find(l => l.id === 'ankle');

  if (hip?.halfW && shoulder?.halfW)
    push('Hip:shoulder', `1:${ratioFmt(shoulder.halfW/hip.halfW)}`, 'avg women 1:1.03; men 1:1.18', 'shoulder_halfW/hip_halfW');
  
  if (ankle?.y && hip?.y) {
    const legLen = hip.y - ankle.y;
    push('Leg:height', ratioFmt(legLen/fb.totalHeight), 'LBR mean 0.491', '(hip_y - ankle_y)/total_height');
  }

  if (waist?.halfW && fb.totalHeight) {
    const waistCirc = waist.halfW * 2 * Math.PI; 
    push('Waist:height', ratioFmt(waistCirc/fb.totalHeight), 'healthy adult ~0.45–0.53', 'waist_circ/height');
  }

  return `<div class="ratio-panel">
  <table><thead><tr><th>Ratio</th><th>Value</th><th>Reference / calc</th></tr></thead>
  <tbody>${rows.map(r => `<tr>
    <td>${escXml(r.name)}</td><td class="ratio-value">${escXml(r.value)}</td>
    <td><div>${escXml(r.ref)}</div><div class="ratio-note">${escXml(r.calc)}</div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

// ── Main Renderer ─────────────────────────────────────────────────────────────

export interface RenderOptions {
  skinColor: string;
  projectionRatioEnabled: boolean;
}

export function renderFigure(doc: SeamlyDocument, opts: RenderOptions): string | null {
  const { measurements, unit } = doc;
  const R: R = {};
  for (const [k, m] of Object.entries(measurements)) R[k] = m.resolved ?? 0;

  const fb = resolveFullBody(R);
  const palette = buildPalette(opts.skinColor);
  
  const PAD_TOP = 36, PAD_BOT = 20, BODY_H = 500;
  const scale = BODY_H / fb.totalHeight;
  const AXIS_X = 150;
  const toY = (h: number) => PAD_TOP + (fb.totalHeight - h) * scale;

  const pathOpts: PathOptions = {
    axisX: AXIS_X,
    toY,
    scale,
    fill: palette.fill,
    stroke: palette.stroke,
    fillOpacity: 0.22,
    strokeWidth: 1.5,
    strokeOpacity: 0.55
  };

  const S: string[] = [];

  // 1. Torso
  S.push(buildTorsoPath(fb.torso.outline, pathOpts));
  if (fb.torso.neckline) S.push(buildNecklineCurve(fb.torso.neckline, pathOpts));
  if (fb.torso.neckBack && fb.torso.neckline) S.push(buildNeckBackLines(fb.torso.neckline.side, fb.torso.neckBack, pathOpts));
  fb.torso.interior.forEach(bp => {
    if (bp.id === 'bustpoint') S.push(buildBustpointMark(bp, pathOpts));
  });

  // 2. Lower Body
  S.push(buildHipPath(fb.lowerBody.hip, pathOpts));
  const crotch = fb.lowerBody.hip.find(l => l.id === 'crotch') ?? null;
  S.push(buildLegPaths(fb.lowerBody.leg, fb.lowerBody.legOffset, crotch, pathOpts));
  if (fb.lowerBody.foot && fb.lowerBody.leg.length > 0) {
    S.push(buildFootPaths(fb.lowerBody.leg[fb.lowerBody.leg.length-1], fb.lowerBody.foot, fb.lowerBody.legOffset, pathOpts));
  }

  // 3. Arms
  S.push(buildArmPath(fb.leftArm, { ...pathOpts, capSweep: 1 }));
  S.push(buildArmPath(fb.rightArm, { ...pathOpts, flipNormals: true, capSweep: 0 }));

  // 4. Head
  const { head } = fb.head;
  S.push(`<ellipse cx="${AXIS_X}" cy="${toY(head.cy)}" rx="${head.rx * scale}" ry="${head.ry * scale}" fill="${palette.fill}" fill-opacity="0.22" stroke="${palette.stroke}" stroke-width="1.5" stroke-opacity="0.55"/>`);

  // 5. Guides and Labels
  const items = getFigureLandmarks(doc).filter(l => l.heightValue !== null);
  items.sort((a, b) => (b.heightValue ?? 0) - (a.heightValue ?? 0));
  
  const LABEL_X = AXIS_X + 150;
  const VAL_X = LABEL_X + 100;

  items.forEach((d, i) => {
    const ly = toY(d.heightValue!);
    const laby = PAD_TOP + 10 + i * 20;
    const group = guideGroupForName(d.label);
    const clr = group.color;
    
    S.push(`<line x1="${AXIS_X - 20}" y1="${ly}" x2="${AXIS_X + 20}" y2="${ly}" stroke="${clr}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
    S.push(`<polyline points="${AXIS_X + 20},${ly} ${LABEL_X - 10},${laby} ${LABEL_X},${laby}" fill="none" stroke="${clr}" stroke-width="0.9" stroke-opacity="0.65"/>`);
    S.push(`<text x="${LABEL_X}" y="${laby + 4}" font-size="11" fill="${clr}" font-weight="600">${escXml(d.label)} <tspan x="${VAL_X}" font-weight="400">${nf(d.heightValue)} ${unit}</tspan></text>`);
  });

  const SVG_W = 500, SVG_H = 600;
  const svgHtml = `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">${S.join('')}</svg>`;
  
  return buildRatioPanelHtml(fb, unit) + svgHtml;
}
