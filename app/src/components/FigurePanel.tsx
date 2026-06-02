import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { SeamlyDocument } from '@seamlyme/core';
import { useDispatch } from '../store';
import {
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
];

interface FigurePanelProps {
  doc: SeamlyDocument | null;
  skinColor: string;
}

function FigurePanel({ doc, skinColor }: FigurePanelProps) {
  const dispatch = useDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const copyStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [hideLabel, setHideLabel] = useState(false);
  const [hideGuideline, setHideGuideline] = useState(false);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !doc) return;

    function inspectLabel(target: EventTarget | null) {
      const label = (target as Element | null)?.closest<SVGTextElement>('[data-landmark-id]');
      if (!label) return;
      setSelectedLandmarkId(label.dataset.landmarkId ?? null);
    }

    function onClick(event: MouseEvent) {
      inspectLabel(event.target);
    }

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [doc, figureHtml]);

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
              <td><code>{candidate.source}</code></td>
              <td className="figure-candidate-value">
                {candidate.missing ? '-' : candidate.value.toFixed(3)}
              </td>
              <td className="figure-candidate-kind">{candidate.confidence ?? ''}</td>
              <td className="figure-candidate-actions">
                {candidateVariables(candidate).map(name => (
                  <button
                    key={name}
                    type="button"
                    title={`Jump to ${name}`}
                    onClick={() => dispatch({ type: 'SELECT_MEASUREMENT', name })}
                  >
                    Jump
                  </button>
                ))}
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
        <div className="figure-scroll">
          <div
            ref={containerRef}
            className="figure-container"
            dangerouslySetInnerHTML={{ __html: figureHtml }}
          />
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
