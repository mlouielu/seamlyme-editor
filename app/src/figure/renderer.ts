/**
 * Production adapter for the figure modules.
 *
 * Keep panel-specific markup out of this file. The modules in this directory
 * own landmark resolution and path construction; the app only supplies values
 * and presentation colors.
 */
import type { SeamlyDocument } from '@seamlyme/core';
import type { Landmark, PathOptions, R, ResolveCandidate } from './common';
import type { ArmLandmark } from './arm';
import { buildArmPath } from './arm';
import { resolveFullBody } from './factory';
import { buildHeadPath, buildNeckPath } from './head';
import { buildFootPaths, buildHipPath, buildLegPaths } from './lower-body';
import {
  buildBustpointMark,
  buildNeckBackLines,
  buildNecklineCurve,
  buildTorsoPath,
} from './torso';

export interface RenderOptions {
  skinColor: string;
  showGuideTicks?: boolean;
  showGuideLabels?: boolean;
}

export interface FigureLandmarkCandidates {
  id: string;
  lengthCandidates: ResolveCandidate[];
  widthCandidates: ResolveCandidate[];
}

interface Guide {
  label: string;
  side: 'left' | 'right';
  lane: 'inline' | 'left' | 'right';
  anchorX: number;
  anchorY: number;
  segments: string;
  color: string;
  xs: number[];
}

function resolvedValues(doc: SeamlyDocument): R {
  const values: R = {};
  for (const [name, measurement] of Object.entries(doc.measurements)) {
    if (measurement.resolved != null) values[name] = measurement.resolved;
  }
  return values;
}

export function getFigureLandmarkCandidates(doc: SeamlyDocument, id: string): FigureLandmarkCandidates | null {
  const figure = resolveFullBody(resolvedValues(doc));
  let landmark: Landmark | undefined;

  if (id.startsWith('l-')) {
    landmark = figure.leftArm.landmarks.find(candidate => candidate.id === id.slice(2));
  } else if (id.startsWith('r-')) {
    landmark = figure.rightArm.landmarks.find(candidate => candidate.id === id.slice(2));
  } else {
    landmark = [
      ...figure.head.landmarks,
      ...(figure.torso.neckBack ? [figure.torso.neckBack] : []),
      ...figure.torso.outline,
      ...figure.torso.interior,
      ...figure.lowerBody.hip,
      ...figure.lowerBody.leg,
      ...(figure.lowerBody.foot ? [figure.lowerBody.foot] : []),
    ].find(candidate => candidate.id === id);
  }

  return landmark ? {
    id,
    lengthCandidates: (landmark as ArmLandmark).lengthCandidates ?? landmark.yCandidates,
    widthCandidates: landmark.wCandidates,
  } : null;
}

const GUIDE_COLORS = {
  head: '#a6cee3',
  neck: '#1f78b4',
  leftArm: '#b2df8a',
  leftHand: '#33a02c',
  rightArm: '#fb9a99',
  rightHand: '#e31a1c',
  torso: '#fdbf6f',
  hip: '#ff7f00',
  legs: '#cab2d6',
  foot: '#6a3d9a',
};

function bodyGuideColor(id: string): string {
  if (id === 'crown' || id === 'head-mid' || id === 'chin') return GUIDE_COLORS.head;
  if (id.startsWith('neck-')) return GUIDE_COLORS.neck;
  if (id === 'highhip' || id === 'hip' || id === 'crotch') return GUIDE_COLORS.hip;
  return GUIDE_COLORS.torso;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, visible = true): string {
  if (!visible) return '';
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
}

function escXml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[char] ?? char);
}

function layoutLabels(guides: Guide[], minY: number, maxY: number, gap: number): Map<Guide, number> {
  const sorted = [...guides].sort((a, b) => a.anchorY - b.anchorY);
  const positions = sorted.map(guide => guide.anchorY);

  positions.forEach((position, index) => {
    positions[index] = Math.max(position, index === 0 ? minY : positions[index - 1] + gap);
  });

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const upperBound = index === positions.length - 1 ? maxY : positions[index + 1] - gap;
    positions[index] = Math.min(positions[index], upperBound);
  }

  return new Map(sorted.map((guide, index) => [guide, positions[index]]));
}

export function renderFigure(doc: SeamlyDocument, opts: RenderOptions): string {
  const values = resolvedValues(doc);
  const figure = resolveFullBody(values);
  const skinColor = opts.skinColor || '#f2c6a0';
  const strokeColor = '#5f3a2d';
  const showGuideTicks = opts.showGuideTicks ?? true;
  const showGuideLabels = opts.showGuideLabels ?? true;

  const pad = 20;
  const bodyHeight = 500;
  const axisX = 160;
  const scale = bodyHeight / figure.totalHeight;
  const toY = (height: number) => pad + (figure.totalHeight - height) * scale;
  const pathOpts: PathOptions = {
    axisX,
    toY,
    scale,
    fill: skinColor,
    stroke: strokeColor,
    fillOpacity: 0.22,
    strokeWidth: 1.5,
    strokeOpacity: 0.55,
  };

  const paths: string[] = [];
  paths.push(`<line x1="${axisX}" y1="${pad}" x2="${axisX}" y2="${pad + bodyHeight}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>`);

  paths.push(buildHipPath(figure.lowerBody.hip, pathOpts));
  const crotch = figure.lowerBody.hip.find(landmark => landmark.id === 'crotch') ?? null;
  paths.push(buildLegPaths(figure.lowerBody.leg, figure.lowerBody.legOffset, crotch, pathOpts));
  const ankle = figure.lowerBody.leg.find(landmark => landmark.id === 'ankle') ?? null;
  if (ankle && figure.lowerBody.foot) {
    paths.push(buildFootPaths(ankle, figure.lowerBody.foot, figure.lowerBody.legOffset, pathOpts));
  }

  paths.push(buildArmPath(figure.leftArm, { ...pathOpts, capSweep: 1 }));
  paths.push(buildArmPath(figure.rightArm, { ...pathOpts, flipNormals: true, capSweep: 0 }));
  const neckSide = figure.torso.outline.find(landmark => landmark.id === 'neck-side');
  if (neckSide) paths.push(buildNeckPath(figure.head, neckSide, pathOpts));
  paths.push(buildHeadPath(figure.head, pathOpts));
  paths.push(buildTorsoPath(figure.torso.outline, pathOpts));

  if (figure.torso.neckline) {
    paths.push(buildNecklineCurve(figure.torso.neckline, pathOpts));
  }
  if (figure.torso.neckBack && figure.torso.neckline) {
    paths.push(buildNeckBackLines(figure.torso.neckline.side, figure.torso.neckBack, pathOpts));
  }
  figure.torso.interior.forEach(landmark => {
    if (landmark.id === 'bustpoint') paths.push(buildBustpointMark(landmark, pathOpts));
  });

  const guides: Guide[] = [];
  const addGuide = (
    label: string,
    side: Guide['side'],
    anchorX: number,
    anchorY: number,
    segments: string,
    color: string,
    xs: number[],
    lane: Guide['lane'] = side,
  ) => guides.push({ label, side, lane, anchorX, anchorY, segments, color, xs });

  const seenBodyLabels = new Set<string>();
  const inlineBodyLabels = new Set([
    'shoulder',
    'highbust',
    'bust',
    'lowbust',
    'rib',
    'waist',
    'highhip',
    'hip',
    'crotch',
  ]);
  const addBodyGuide = (landmark: Landmark) => {
    if (landmark.y == null || landmark.halfW == null || seenBodyLabels.has(landmark.id)) return;
    seenBodyLabels.add(landmark.id);
    const y = toY(landmark.y);
    const halfWidth = landmark.halfW * scale;
    const x1 = axisX - halfWidth;
    const x2 = axisX + halfWidth;
    const color = bodyGuideColor(landmark.id);
    addGuide(
      landmark.id,
      'right',
      x2,
      y,
      line(x1, y, x2, y, color, showGuideTicks),
      color,
      [x1, x2],
      inlineBodyLabels.has(landmark.id) ? 'inline' : 'right',
    );
  };

  figure.head.landmarks.forEach(addBodyGuide);
  if (figure.torso.neckBack) addBodyGuide(figure.torso.neckBack);
  figure.torso.outline.forEach(addBodyGuide);
  figure.torso.interior.forEach(addBodyGuide);
  figure.lowerBody.hip.forEach(addBodyGuide);

  const legOffset = figure.lowerBody.legOffset * scale;
  figure.lowerBody.leg.forEach(landmark => {
    if (landmark.y == null || landmark.halfW == null) return;
    const y = toY(landmark.y);
    const halfWidth = landmark.halfW * scale;
    const leftX1 = axisX - legOffset - halfWidth;
    const leftX2 = axisX - legOffset + halfWidth;
    const rightX1 = axisX + legOffset - halfWidth;
    const rightX2 = axisX + legOffset + halfWidth;
    const color = GUIDE_COLORS.legs;
    addGuide(
      landmark.id,
      'left',
      leftX1,
      y,
      line(leftX1, y, leftX2, y, color, showGuideTicks) + line(rightX1, y, rightX2, y, color, showGuideTicks),
      color,
      [leftX1, leftX2, rightX1, rightX2],
    );
  });

  const footReach = (figure.lowerBody.foot?.footLength ?? 0) * scale;
  if (figure.lowerBody.foot) {
    const y = toY(0);
    const leftX = axisX - legOffset - footReach;
    const rightX = axisX + legOffset + footReach;
    const color = GUIDE_COLORS.foot;
    addGuide(
      'foot',
      'right',
      rightX,
      y,
      line(axisX - legOffset, y, leftX, y, color, showGuideTicks) + line(axisX + legOffset, y, rightX, y, color, showGuideTicks),
      color,
      [leftX, rightX],
    );
  }

  const addArmGuides = (landmarks: ArmLandmark[], side: Guide['side']) => {
    landmarks.forEach((landmark, index) => {
      if (landmark.y == null || landmark.halfW == null) return;
      const previous = landmarks[Math.max(0, index - 1)];
      const next = landmarks[Math.min(landmarks.length - 1, index + 1)];
      const dx = (next.x - previous.x) * scale;
      const dy = toY(next.y!) - toY(previous.y!);
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const halfWidth = landmark.halfW * scale;
      const centerX = axisX + landmark.x * scale;
      const centerY = toY(landmark.y);
      const normalX = -dy / length;
      const normalY = dx / length;
      const x1 = landmark.innerPt ? axisX + landmark.innerPt[0] * scale : centerX - normalX * halfWidth;
      const y1 = landmark.innerPt ? toY(landmark.innerPt[1]) : centerY - normalY * halfWidth;
      const x2 = landmark.outerPt ? axisX + landmark.outerPt[0] * scale : centerX + normalX * halfWidth;
      const y2 = landmark.outerPt ? toY(landmark.outerPt[1]) : centerY + normalY * halfWidth;
      const color = side === 'left'
        ? landmark.section === 'hand' ? GUIDE_COLORS.leftHand : GUIDE_COLORS.leftArm
        : landmark.section === 'hand' ? GUIDE_COLORS.rightHand : GUIDE_COLORS.rightArm;
      const anchorX = side === 'left' ? Math.min(x1, x2) : Math.max(x1, x2);
      addGuide(
        `${side === 'left' ? 'l' : 'r'}-${landmark.id}`,
        side,
        anchorX,
        centerY,
        line(x1, y1, x2, y2, color, showGuideTicks),
        color,
        [x1, x2],
        side,
      );
    });
  };

  addArmGuides(figure.leftArm.landmarks, 'left');
  addArmGuides(figure.rightArm.landmarks, 'right');

  const guideXs = guides.flatMap(guide => guide.xs);
  const minX = Math.min(...guideXs) - pad;
  const maxX = Math.max(...guideXs) + pad;
  const height = bodyHeight + pad * 2;
  const labelGap = 12;
  const labelMinY = pad / 2;
  const labelMaxY = height - pad / 2;
  const labels = new Map([
    ...layoutLabels(guides.filter(guide => guide.lane === 'left'), labelMinY, labelMaxY, labelGap),
    ...layoutLabels(guides.filter(guide => guide.lane === 'right'), labelMinY, labelMaxY, labelGap),
  ]);
  const labelWidth = 86;
  const leftLabelX = minX - 14;
  const rightLabelX = maxX + 14;

  guides.forEach(guide => {
    if (guide.lane === 'inline') {
      if (!showGuideLabels) return;
      paths.push(`<g class="figure-guide">${guide.segments}<text class="figure-guide-label" data-landmark-id="${escXml(guide.label)}" x="${axisX.toFixed(1)}" y="${(guide.anchorY - 3).toFixed(1)}" fill="${guide.color}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" font-size="8" font-family="ui-monospace, monospace" text-anchor="middle">${escXml(guide.label)}</text></g>`);
      return;
    }
    if (!showGuideLabels) return;
    const labelY = labels.get(guide) ?? guide.anchorY;
    const labelX = guide.side === 'left' ? leftLabelX : rightLabelX;
    const elbowX = guide.side === 'left' ? labelX + 8 : labelX - 8;
    const textAnchor = guide.side === 'left' ? 'end' : 'start';
    paths.push(`<g class="figure-guide">${guide.segments}<polyline points="${guide.anchorX.toFixed(1)},${guide.anchorY.toFixed(1)} ${elbowX.toFixed(1)},${guide.anchorY.toFixed(1)} ${elbowX.toFixed(1)},${labelY.toFixed(1)} ${labelX.toFixed(1)},${labelY.toFixed(1)}" fill="none" stroke="${guide.color}" stroke-width="0.8"/><text class="figure-guide-label" data-landmark-id="${escXml(guide.label)}" x="${labelX.toFixed(1)}" y="${(labelY + 3).toFixed(1)}" fill="${guide.color}" font-size="8" font-family="ui-monospace, monospace" text-anchor="${textAnchor}">${escXml(guide.label)}</text></g>`);
  });

  const viewMinX = leftLabelX - labelWidth;
  const viewMaxX = rightLabelX + labelWidth;
  return `<svg viewBox="${viewMinX.toFixed(1)} 0 ${(viewMaxX - viewMinX).toFixed(1)} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">${paths.join('')}</svg>`;
}
