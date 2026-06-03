import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { SeamlyDocument } from '@seamlyme/core';
import { useAppState, useDispatch } from '../store';
import {
  findLandmarkIdForMeasurement,
  getFigureLandmarkCandidates,
  renderFigure,
} from '../figure/renderer';
import type { ResolveCandidate } from '../figure/common';

const SKIN_PRESETS = [
  { name: 'Porcelain', color: '#f7d9c4' },
  { name: 'Light',     color: '#f2c6a0' },
  { name: 'Sand',      color: '#dfae82' },
  { name: 'Tan',       color: '#c98e62' },
  { name: 'Deep',      color: '#8a5a44' },
  { name: 'Brown',     color: '#6d3800' },
  { name: 'Black',     color: '#1e0f00' },
];

interface FigurePanelProps {
  doc: SeamlyDocument | null;
  skinColor: string;
  onRequestFocus?: () => void;
}

function FigurePanel({ doc, skinColor, onRequestFocus }: FigurePanelProps) {
  const { selected } = useAppState();
  const dispatch = useDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const copyStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [hideLabel, setHideLabel] = useState(false);
  const [hideGuideline, setHideGuideline] = useState(false);

  // Sync editor selection → figure landmark highlight
  useEffect(() => {
    if (!doc || !selected) return;
    setSelectedLandmarkId(findLandmarkIdForMeasurement(doc, selected));
  }, [doc, selected]);

  // ── Pan / zoom state ────────────────────────────────────────────────────────
  const xform    = useRef({ tx: 0, ty: 0, scale: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture  = useRef<
    | { type: 'pan';   x0: number; y0: number; tx0: number; ty0: number }
    | { type: 'pinch'; d0: number; cx: number; cy: number; scale0: number; tx0: number; ty0: number }
    | null
  >(null);
  const pendingTap = useRef<{ x: number; y: number } | null>(null);

  function commitTransform() {
    const el = containerRef.current;
    if (!el) return;
    const { tx, ty, scale } = xform.current;
    el.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }

  function zoomAt(px: number, py: number, factor: number) {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const W = scroll.clientWidth, H = scroll.clientHeight;
    const { tx, ty, scale } = xform.current;
    const ns = Math.min(8, Math.max(0.1, scale * factor));
    const r  = ns / scale;
    xform.current = {
      scale: ns,
      tx: px - W / 2 - (px - W / 2 - tx) * r,
      ty: py - H / 2 - (py - H / 2 - ty) * r,
    };
    commitTransform();
  }

  function resetZoom() {
    xform.current = { tx: 0, ty: 0, scale: 1 };
    commitTransform();
  }

  function inspectAt(target: Element | null) {
    const label = target?.closest<SVGTextElement>('[data-landmark-id]');
    if (label) setSelectedLandmarkId(label.dataset.landmarkId ?? null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      pendingTap.current = { x: e.clientX, y: e.clientY };
      gesture.current = { type: 'pan', x0: e.clientX, y0: e.clientY, tx0: xform.current.tx, ty0: xform.current.ty };
    } else {
      pendingTap.current = null;
      const [a, b] = pts;
      const rect = scrollRef.current!.getBoundingClientRect();
      gesture.current = {
        type: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2 - rect.left,
        cy: (a.y + b.y) / 2 - rect.top,
        scale0: xform.current.scale,
        tx0: xform.current.tx,
        ty0: xform.current.ty,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const tap = pendingTap.current;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 7) pendingTap.current = null;
    const g   = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && g?.type === 'pan') {
      xform.current.tx = g.tx0 + e.clientX - g.x0;
      xform.current.ty = g.ty0 + e.clientY - g.y0;
      commitTransform();
    } else if (pts.length >= 2 && g?.type === 'pinch') {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ns   = Math.min(8, Math.max(0.1, g.scale0 * dist / g.d0));
      const W = scrollRef.current!.clientWidth, H = scrollRef.current!.clientHeight;
      const r = ns / g.scale0;
      xform.current = { scale: ns, tx: g.cx - W/2 - (g.cx - W/2 - g.tx0) * r, ty: g.cy - H/2 - (g.cy - H/2 - g.ty0) * r };
      commitTransform();
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const tap = pendingTap.current;
    pointers.current.delete(e.pointerId);
    if (tap && pointers.current.size === 0) inspectAt(document.elementFromPoint(tap.x, tap.y) as Element);
    pendingTap.current = null;
    const pts = [...pointers.current.values()];
    if (pts.length === 0) {
      gesture.current = null;
    } else if (pts.length === 1) {
      const [pt] = pts;
      gesture.current = { type: 'pan', x0: pt.x, y0: pt.y, tx0: xform.current.tx, ty0: xform.current.ty };
    }
  }

  // Non-passive wheel for zoom
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = scroll!.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    scroll.addEventListener('wheel', onWheel, { passive: false });
    return () => scroll.removeEventListener('wheel', onWheel);
  // zoomAt reads only refs, no reactive deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const figureHtml = useMemo(
    () => doc ? renderFigure(doc, {
      skinColor,
      showGuideLabels: !hideLabel,
      showGuideTicks: !hideGuideline,
    }) : null,
    [doc, skinColor, hideLabel, hideGuideline],
  );
  const selectedLandmark = useMemo(
    () => doc && selectedLandmarkId
      ? getFigureLandmarkCandidates(doc, selectedLandmarkId)
      : null,
    [doc, selectedLandmarkId],
  );


  useEffect(() => () => {
    if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
  }, []);

  function showCopyStatus(status: 'copied' | 'error') {
    setCopyStatus(status);
    if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    copyStatusTimerRef.current = setTimeout(() => setCopyStatus('idle'), 1600);
  }

  function fallbackCopySvg(svg: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = svg;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }

  async function copySvg() {
    if (!figureHtml) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(figureHtml);
      } else if (!fallbackCopySvg(figureHtml)) {
        throw new Error('Clipboard copy failed');
      }
      showCopyStatus('copied');
    } catch {
      showCopyStatus(fallbackCopySvg(figureHtml) ? 'copied' : 'error');
    }
  }

  function candidateVariables(candidate: ResolveCandidate): string[] {
    if (!doc) return [];
    const names = candidate.source.match(/@?[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    return [...new Set(names.filter(name => doc.measurements[name]))];
  }

  function candidateTable(candidates: ResolveCandidate[]) {
    if (!candidates.length) return <div className="figure-candidate-empty">No candidates</div>;
    return (
      <table className="figure-candidate-table">
        <tbody>
          {candidates.map((candidate, index) => (
            <tr
              key={`${candidate.source}-${index}`}
              className={candidate.missing ? 'is-missing' : candidate.used ? 'is-used' : undefined}
            >
              <td className="figure-candidate-mark">{candidate.missing ? 'x' : candidate.used ? '*' : '-'}</td>
              <td className="figure-candidate-formula"><code>{candidate.source}</code></td>
              <td className="figure-candidate-meta">
                <span className="figure-candidate-value">
                  {candidate.missing ? '-' : candidate.value.toFixed(3)}
                </span>
                <span className="figure-candidate-kind">{candidate.confidence ?? ''}</span>
                <span className="figure-candidate-actions">
                  {candidateVariables(candidate).map(name => (
                    <button
                      key={name}
                      type="button"
                      title={`Jump to ${name}`}
                      onClick={() => {
                        dispatch({ type: 'SELECT_MEASUREMENT', name });
                        onRequestFocus?.();
                      }}
                    >
                      Jump
                    </button>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="figure-panel">
      <div className="panel-header">
        <span>Body figure</span>
        <div className="figure-header-actions">
          <label className="figure-toggle">
            <input
              type="checkbox"
              checked={hideLabel}
              onChange={event => setHideLabel(event.target.checked)}
            />
            Hide label
          </label>
          <label className="figure-toggle">
            <input
              type="checkbox"
              checked={hideGuideline}
              onChange={event => setHideGuideline(event.target.checked)}
            />
            Hide guideline
          </label>
          <button
            type="button"
            className="figure-copy-button"
            disabled={!figureHtml}
            onClick={copySvg}
          >
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy SVG'}
          </button>
          <div className="skin-swatches">
            {SKIN_PRESETS.map(preset => (
              <button
                key={preset.color}
                className={`skin-swatch${skinColor === preset.color ? ' is-active' : ''}`}
                title={preset.name}
                style={{ background: preset.color }}
                onClick={() => dispatch({ type: 'SET_SKIN_COLOR', color: preset.color })}
              />
            ))}
            <input
              type="color"
              className="skin-picker"
              value={skinColor}
              title="Custom skin color"
              onChange={event => dispatch({ type: 'SET_SKIN_COLOR', color: event.target.value })}
            />
          </div>
        </div>
      </div>

      {!doc && (
        <div className="figure-empty">Load a .smis file to see the body figure.</div>
      )}

      {figureHtml && (
        <div
          ref={scrollRef}
          className="figure-scroll"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            ref={containerRef}
            className="figure-container"
            dangerouslySetInnerHTML={{ __html: figureHtml }}
          />
          <button
            type="button"
            className="figure-reset-zoom"
            title="Reset zoom"
            onPointerDown={e => e.stopPropagation()}
            onClick={resetZoom}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.51 15a9 9 0 1 0 .49-3.31"/><polyline points="1 4 1 10 7 10"/>
            </svg>
            Reset
          </button>
        </div>
      )}

      {selectedLandmark && (
        <div className="figure-candidates">
          <div className="figure-candidates-header">
            <strong>{selectedLandmark.id}</strong>
            <button type="button" onClick={() => setSelectedLandmarkId(null)} aria-label="Close landmark details">x</button>
          </div>
          <div className="figure-candidates-grid">
            <section>
              <h3>Length candidates</h3>
              {candidateTable(selectedLandmark.lengthCandidates)}
            </section>
            <section>
              <h3>Width candidates</h3>
              {candidateTable(selectedLandmark.widthCandidates)}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FigurePanel);
