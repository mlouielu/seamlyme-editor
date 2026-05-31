import { memo, useRef, useEffect, useMemo, useState } from 'react';
import type { SeamlyDocument } from '@seamlyme/core';
import { useDispatch } from '../store';
import { renderFigure, FIGURE_MEASUREMENTS, primaryVar } from '../figure/renderer';

const SKIN_PRESETS = [
  { name: 'Porcelain', color: '#f7d9c4' },
  { name: 'Light',     color: '#f2c6a0' },
  { name: 'Sand',      color: '#dfae82' },
  { name: 'Tan',       color: '#c98e62' },
  { name: 'Deep',      color: '#8a5a44' },
];

interface DepInfo {
  name: string;
  wVar: string | null;
  hVar: string | null;
  wVal: string;
  hVal: string;
  unit: string;
}

interface FigurePanelProps {
  doc: SeamlyDocument | null;
  highlighted: string | null;
  skinColor: string;
  projectionRatioEnabled: boolean;
}

function FigurePanel({ doc, highlighted, skinColor, projectionRatioEnabled }: FigurePanelProps) {
  const dispatch = useDispatch();

  const containerRef = useRef<HTMLDivElement>(null);
  const [depInfo, setDepInfo] = useState<DepInfo | null>(null);

  const figureHtml = useMemo(() => {
    if (!doc) return null;
    return renderFigure(doc, { skinColor, projectionRatioEnabled });
  }, [doc, skinColor, projectionRatioEnabled]);

  // Apply guide highlight when `highlighted` changes, without re-rendering SVG
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Remove all current highlights
    container.querySelectorAll<SVGElement>('[data-guide].is-guide-active')
      .forEach(el => el.classList.remove('is-guide-active'));

    if (!highlighted) return;

    container.querySelectorAll<SVGElement>(`[data-pvar="${CSS.escape(highlighted)}"]`)
      .forEach(el => el.classList.add('is-guide-active'));
  }, [highlighted]);

  // Wire guide hover/click via event delegation after HTML injection
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !figureHtml) return;

    function getGuideEl(target: EventTarget | null): SVGElement | null {
      let el = target as HTMLElement | null;
      while (el && el !== container) {
        if (el.dataset?.guide) return el as unknown as SVGElement;
        el = el.parentElement;
      }
      return null;
    }

    function onMouseEnter(e: MouseEvent) {
      const guide = getGuideEl(e.target);
      if (!guide) return;
      const pvar = guide.dataset?.pvar;
      if (pvar) dispatch({ type: 'SET_HIGHLIGHT', name: pvar });
    }
    function onMouseLeave(e: MouseEvent) {
      const guide = getGuideEl(e.target);
      if (guide) dispatch({ type: 'SET_HIGHLIGHT', name: null });
    }
    function onClick(e: MouseEvent) {
      const guide = getGuideEl(e.target);
      if (!guide || !doc) return;
      const idx = Number(guide.dataset.guide?.replace('guide-', ''));
      const d = FIGURE_MEASUREMENTS[idx];
      if (!d) return;

      const unit = doc.unit;
      const R = Object.fromEntries(Object.entries(doc.measurements).map(([k,m]) => [k, m.resolved ?? 0]));
      setDepInfo({
        name: d.name,
        wVar: d.wVar ?? null,
        hVar: d.hVar ?? null,
        wVal: d.wVar ? (R[d.wVar] > 0 ? `${R[d.wVar].toFixed(2)} ${unit}` : '—') : '—',
        hVal: d.hVar ? (R[d.hVar] > 0 ? `${R[d.hVar].toFixed(2)} ${unit}` : '—') : '—',
        unit,
      });
      const pvar = primaryVar(d);
      if (pvar) dispatch({ type: 'SET_HIGHLIGHT', name: pvar });
    }

    container.addEventListener('mouseenter', onMouseEnter, true);
    container.addEventListener('mouseleave', onMouseLeave, true);
    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('mouseenter', onMouseEnter, true);
      container.removeEventListener('mouseleave', onMouseLeave, true);
      container.removeEventListener('click', onClick);
    };
  }, [figureHtml, doc, dispatch]);

  return (
    <div className="figure-panel">
      <div className="panel-header">
        <span>Body figure</span>
        <div className="figure-controls">
          <label className="control-label">
            <input
              type="checkbox"
              checked={projectionRatioEnabled}
              onChange={() => dispatch({ type: 'TOGGLE_PROJECTION_RATIO' })}
            />
            Proj. ratio
          </label>
          <div className="skin-swatches">
            {SKIN_PRESETS.map(p => (
              <button
                key={p.color}
                className={`skin-swatch${skinColor === p.color ? ' is-active' : ''}`}
                title={p.name}
                style={{ background: p.color }}
                onClick={() => dispatch({ type: 'SET_SKIN_COLOR', color: p.color })}
              />
            ))}
            <input
              type="color"
              className="skin-picker"
              value={skinColor}
              title="Custom skin color"
              onChange={e => dispatch({ type: 'SET_SKIN_COLOR', color: e.target.value })}
            />
          </div>
        </div>
      </div>

      {!doc && (
        <div className="figure-empty">Load a .smis file to see the body figure.</div>
      )}

      {doc && !figureHtml && (
        <div className="figure-empty">
          No height measurements found.<br />Add measurements like <code>height</code>, <code>height_knee</code> to see the figure.
        </div>
      )}

      {figureHtml && (
        <div className="figure-scroll">
          <div
            ref={containerRef}
            className="figure-container"
            dangerouslySetInnerHTML={{ __html: figureHtml }}
          />
        </div>
      )}

      {depInfo && (
        <div className="dep-panel">
          <div className="dep-panel-header">
            <span className="dep-panel-title">{depInfo.name}</span>
            <button className="dep-panel-close" onClick={() => setDepInfo(null)}>✕</button>
          </div>
          <table className="dep-table">
            <tbody>
              {depInfo.wVar && (
                <tr>
                  <td className="dep-role">Width</td>
                  <td><code>{depInfo.wVar}</code></td>
                  <td className="dep-val">{depInfo.wVal}</td>
                  <td>
                    <button className="dep-jump" onClick={() => {
                      dispatch({ type: 'SET_HIGHLIGHT', name: depInfo.wVar! });
                    }}>↑ jump</button>
                  </td>
                </tr>
              )}
              {depInfo.hVar && (
                <tr>
                  <td className="dep-role">Height</td>
                  <td><code>{depInfo.hVar}</code></td>
                  <td className="dep-val">{depInfo.hVal}</td>
                  <td>
                    <button className="dep-jump" onClick={() => {
                      dispatch({ type: 'SET_HIGHLIGHT', name: depInfo.hVar! });
                    }}>↑ jump</button>
                  </td>
                </tr>
              )}
              {depInfo.wVar && doc?.measurements[depInfo.wVar]?.dependencies?.length ? (
                <tr>
                  <td className="dep-role muted" colSpan={4}>
                    deps: {doc!.measurements[depInfo.wVar!]!.dependencies.join(', ')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default memo(FigurePanel);
