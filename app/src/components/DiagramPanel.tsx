import { memo, useRef, useEffect, useCallback } from 'react';
import { useDispatch } from '../store';

const SVG_URL = '/Seamly2d-interactive-body-measurements.svg';

type SvgDoc = Document;

interface DiagramPanelProps {
  highlighted: string | null;
}

function DiagramPanel({ highlighted }: DiagramPanelProps) {
  const dispatch = useDispatch();
  const objRef  = useRef<HTMLObjectElement>(null);
  const bridged = useRef(false);
  const activeSvgHighlights = useRef<SVGElement[]>([]);

  // ── Bridge: wire SVG hover/click events into app state ───────────────────
  const bridge = useCallback((svgDoc: SvgDoc) => {
    if (bridged.current) return;
    bridged.current = true;

    svgDoc.querySelectorAll<SVGElement>('.measure-definition, .measure-target').forEach(el => {
      const varName = el.getAttribute('data-measure-var') ?? '';
      if (!varName) return;

      el.addEventListener('mouseenter', () => {
        dispatch({ type: 'SET_HIGHLIGHT', name: varName });
      });
      el.addEventListener('mouseleave', () => {
        dispatch({ type: 'SET_HIGHLIGHT', name: null });
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ type: 'SET_HIGHLIGHT', name: varName });
      });
    });
  }, [dispatch]);

  function tryBridge() {
    try {
      const doc = objRef.current?.contentDocument;
      if (doc?.readyState === 'complete' && doc.querySelector('.measure-definition')) {
        bridge(doc); return true;
      }
    } catch {}
    return false;
  }

  useEffect(() => {
    const obj = objRef.current;
    if (!obj) return;
    let raf: number;
    let timer: number;
    let stopped = false;
    function poll() {
      if (!stopped && !tryBridge()) raf = requestAnimationFrame(poll);
    }
    function onLoad() {
      timer = window.setTimeout(poll, 100);
    }
    obj.addEventListener('load', onLoad);
    raf = requestAnimationFrame(poll);
    return () => {
      stopped = true;
      obj.removeEventListener('load', onLoad);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // ── Highlight: when `highlighted` changes, trigger SVG element ───────────
  useEffect(() => {
    try {
      const svgDoc = objRef.current?.contentDocument;
      if (!svgDoc) return;

      // Clear only the elements touched by the previous app highlight.
      activeSvgHighlights.current.forEach(el => {
        el.classList.remove('is-svg-highlighted');
      });
      activeSvgHighlights.current = [];

      if (!highlighted) return;

      // Highlight all elements sharing the same var
      activeSvgHighlights.current = [
        ...svgDoc.querySelectorAll<SVGElement>(`[data-measure-var="${CSS.escape(highlighted)}"]`),
      ];
      activeSvgHighlights.current.forEach(el => el.classList.add('is-svg-highlighted'));

    } catch {}
  }, [highlighted]);

  // ── Desktop pan/zoom (wheel + drag) ─────────────────────────────────────
  const viewerRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragging  = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);
  const SVG_W = 3003, SVG_H = 6802;

  function commit() {
    const obj = objRef.current;
    if (!obj) return;
    const { scale, tx, ty } = transform.current;
    obj.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }

  function clampT() {
    const v = viewerRef.current;
    if (!v) return;
    const { scale } = transform.current;
    const pad = 40;
    transform.current.tx = Math.min(v.clientWidth - pad, Math.max(pad - SVG_W*scale, transform.current.tx));
    transform.current.ty = Math.min(v.clientHeight - pad, Math.max(pad - SVG_H*scale, transform.current.ty));
  }

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    function initFit() {
      const { clientWidth: vw, clientHeight: vh } = viewer!;
      transform.current.scale = Math.min(vw / SVG_W, vh / SVG_H);
      transform.current.tx = 0;
      transform.current.ty = 0;
      commit();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = viewer!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? 1.12 : 1/1.12;
      const { scale, tx, ty } = transform.current;
      const newScale = Math.min(8, Math.max(0.05, scale * delta));
      transform.current.scale = newScale;
      transform.current.tx = mx - (mx - tx) * (newScale / scale);
      transform.current.ty = my - (my - ty) * (newScale / scale);
      clampT(); commit();
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      dragging.current = { startX: e.clientX, startY: e.clientY, tx0: transform.current.tx, ty0: transform.current.ty };
      viewer!.style.cursor = 'grabbing';
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      transform.current.tx = dragging.current.tx0 + e.clientX - dragging.current.startX;
      transform.current.ty = dragging.current.ty0 + e.clientY - dragging.current.startY;
      clampT(); commit();
    }
    function onMouseUp() {
      dragging.current = null;
      viewer!.style.cursor = 'grab';
    }

    requestAnimationFrame(initFit);
    viewer.addEventListener('wheel', onWheel, { passive: false });
    viewer.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      viewer.removeEventListener('wheel', onWheel);
      viewer.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inject highlight CSS into SVG doc once bridged
  useEffect(() => {
    try {
      const svgDoc = objRef.current?.contentDocument;
      if (!svgDoc) return;
      if (svgDoc.getElementById('rc-highlight-style')) return;
      const style = svgDoc.createElement('style');
      style.id = 'rc-highlight-style';
      style.textContent = `.is-svg-highlighted { outline: 2.5px solid #f59e0b !important; filter: drop-shadow(0 0 4px #f59e0b88); }`;
      svgDoc.head?.appendChild(style);
    } catch {}
  }, [highlighted]);

  return (
    <div className="diagram-panel">
      <div className="panel-header">
        <span>Body diagram</span>
        <span className="panel-header-hint">scroll to zoom · drag to pan</span>
      </div>
      <div ref={viewerRef} className="diagram-viewer" style={{ cursor: 'grab', overflow: 'hidden', position: 'relative', flex: 1 }}>
        <object
          ref={objRef}
          type="image/svg+xml"
          data={SVG_URL}
          aria-label="Interactive body measurements diagram"
          style={{
            display: 'block',
            width: SVG_W,
            height: SVG_H,
            border: 0,
            background: 'white',
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            pointerEvents: 'none', // let overlay handle pan, SVG handles hover via bridge
          }}
        />
      </div>
      {highlighted && (
        <div className="diagram-status">
          <span className="diagram-status-var">{highlighted}</span>
        </div>
      )}
    </div>
  );
}

export default memo(DiagramPanel);
