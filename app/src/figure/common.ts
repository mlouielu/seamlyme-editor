/**
 * Shared types and utilities for figure rendering.
 */

export type R = Record<string, number>;

export const CIRC_TO_WIDTH = 1 / Math.PI;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveCandidate {
  source: string;   // human-readable formula
  value: number;    // resolved measurement value
  used: boolean;    // true for the selected candidate
  confidence?: WidthConfidence;
  missing?: boolean; // true when the underlying measurement is absent
}

export type WidthConfidence = 'direct' | 'arc' | 'circ' | 'derived' | 'canonical';

export interface Landmark {
  id: string;
  y: number | null;
  ySource: string | null;
  yCandidates: ResolveCandidate[];
  halfW: number | null;
  wSource: string | null;
  wCandidates: ResolveCandidate[];
  widthConfidence: WidthConfidence;
}

export interface YCandidateDef { source: string; value: number }
export interface WCandidateDef { source: string; value: number; confidence: WidthConfidence; missing?: boolean }

// ── Resolution Helpers ────────────────────────────────────────────────────────

export function pickY(candidates: YCandidateDef[]): { y: number; source: string; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const used = candidates[0];
  return {
    y: used.value,
    source: used.source,
    all: candidates.map((c, i) => ({ source: c.source, value: c.value, used: i === 0 })),
  };
}

export function pickW(candidates: WCandidateDef[]): { width: number; source: string; confidence: WidthConfidence; all: ResolveCandidate[] } | null {
  if (!candidates.length) return null;
  const idx = candidates.findIndex(c => !c.missing);
  const used = candidates[idx >= 0 ? idx : candidates.length - 1];
  return {
    width: used.value,
    source: used.source,
    confidence: used.confidence,
    all: candidates.map((c, i) => ({
      source: c.source,
      value: c.value,
      used: i === (idx >= 0 ? idx : candidates.length - 1),
      confidence: c.confidence,
      missing: c.missing
    })),
  };
}

export function buildLandmark(
  id: string,
  totalHeight: number,
  yCandidates: YCandidateDef[],
  wCandidates: WCandidateDef[],
  canonical?: { yRatio: number; halfWRatio: number }
): Landmark {
  const allY = [...yCandidates];
  if (canonical) {
    allY.push({ source: `canonical ratio ${canonical.yRatio}`, value: totalHeight * canonical.yRatio });
  }

  const allW = [...wCandidates];
  if (canonical) {
    allW.push({
      source: `canonical ratio ${canonical.halfWRatio * 2}`,
      value: totalHeight * canonical.halfWRatio * 2,
      confidence: 'canonical'
    });
  }

  const yr = pickY(allY);
  const wr = pickW(allW);

  return {
    id,
    y: yr?.y ?? null,
    ySource: yr?.source ?? null,
    yCandidates: yr?.all ?? [],
    halfW: wr ? wr.width / 2 : null,
    wSource: wr?.source ?? null,
    wCandidates: wr?.all ?? [],
    widthConfidence: wr?.confidence ?? 'canonical',
  };
}

// ── Candidate Helpers ─────────────────────────────────────────────────────────

export function measuredY(R: R, name: string): YCandidateDef[] {
  return R[name] > 0 ? [{ source: name, value: R[name] }] : [];
}

export function measuredW(R: R, name: string, confidence: WidthConfidence = 'direct'): WCandidateDef[] {
  const val = R[name];
  return [{
    source: name,
    value: val > 0 ? val : 0,
    confidence,
    missing: !(val > 0)
  }];
}

export function offsetUpY(R: R, base: string, offset: string): YCandidateDef[] {
  if (R[base] > 0 && R[offset] > 0) {
    return [{ source: `${base} + ${offset}`, value: R[base] + R[offset] }];
  }
  return [];
}

export function offsetDownY(R: R, base: string, offset: string): YCandidateDef[] {
  if (R[base] > 0 && R[offset] > 0) {
    return [{ source: `${base} - ${offset}`, value: R[base] - R[offset] }];
  }
  return [];
}

export function lerpY(R: R, a: string, b: string, t: number): YCandidateDef[] {
  if (R[a] > 0 && R[b] > 0) {
    return [{ source: `lerp(${a}, ${b}, ${t})`, value: lerp(R[a], R[b], t) }];
  }
  return [];
}

export function arcWidth(R: R, name: string, ratio: number): WCandidateDef[] {
  const val = R[name];
  return [{
    source: `${name} × ${ratio.toFixed(3)} × 2`,
    value: val > 0 ? val * ratio * 2 : 0,
    confidence: 'arc',
    missing: !(val > 0)
  }];
}

export function circWidth(R: R, name: string): WCandidateDef[] {
  const val = R[name];
  return [{
    source: `${name} / π`,
    value: val > 0 ? val * CIRC_TO_WIDTH : 0,
    confidence: 'circ',
    missing: !(val > 0)
  }];
}

// ── Math Helpers ──────────────────────────────────────────────────────────────

export function resolveArcRatio(R: R): number {
  const pairs = [
    { arc: R.bust_arc_f,  width: R.width_bust  },
    { arc: R.waist_arc_f, width: R.width_waist },
    { arc: R.hip_arc_f,   width: R.width_hip   },
  ];
  const ratios = pairs
    .filter(p => p.arc > 0 && p.width > 0)
    .map(p => (p.width / 2) / p.arc);
  if (!ratios.length) return 0.5;
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  return Math.min(Math.max(avg, 0.35), 0.65);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Path Helpers ──────────────────────────────────────────────────────────────

export function crPath(pts: [number, number][], startWithM = true): string {
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

export interface PathOptions {
  axisX: number;
  toY: (h: number) => number;
  scale: number;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}
