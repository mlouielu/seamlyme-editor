import { memo, useRef, useEffect, useCallback } from 'react';
import { useDispatch } from '../store';

const SVG_URL = `${import.meta.env.BASE_URL}Seamly2d-interactive-body-measurements.svg`;

type SvgDoc = Document;

interface DiagramPanelProps {
  activeCategory: string;
  highlighted: string | null;
  selected: string | null;
  missingVariables: string[];
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getGlobalBBox(el: SVGGraphicsElement, svg: SVGSVGElement): BBox | null {
  try {
    const bb = el.getBBox();
    if (!bb || (bb.width === 0 && bb.height === 0)) return null;
    const ctm = el.getCTM();
    if (!ctm) return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    const corners = [
      [bb.x, bb.y],
      [bb.x + bb.width, bb.y],
      [bb.x, bb.y + bb.height],
      [bb.x + bb.width, bb.y + bb.height],
    ].map(([x, y]) => {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      return point.matrixTransform(ctm);
    });
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  } catch {
    return null;
  }
}

function DiagramPanel({ activeCategory, highlighted, selected, missingVariables }: DiagramPanelProps) {
  const dispatch = useDispatch();
  const objRef     = useRef<HTMLObjectElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bridged = useRef(false);
  const activeSvgHighlights = useRef<SVGElement[]>([]);
  const selectedRef = useRef(selected);
  const sectionBBoxes = useRef<Record<string, BBox>>({});
  const categoryByVariable = useRef<Record<string, string>>({});
  const focusedCategory = useRef<string | null>(null);
  const missingVariablesRef = useRef(missingVariables);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const touchGesture = useRef<
    | { type: 'pan'; x: number; y: number; tx: number; ty: number }
    | { type: 'pinch'; distance: number; cx: number; cy: number; scale: number; tx: number; ty: number }
    | null
  >(null);
  const pendingTap = useRef<{ x: number; y: number } | null>(null);

  function updateMissingHighlights(svgDoc: SvgDoc) {
    svgDoc.querySelectorAll<SVGElement>('.is-svg-missing').forEach(el => {
      el.classList.remove('is-svg-missing');
    });
    missingVariablesRef.current.forEach(variable => {
      svgDoc.querySelectorAll<SVGElement>(`[data-measure-var="${CSS.escape(variable)}"]`).forEach(el => {
        el.classList.add('is-svg-missing');
      });
    });
  }

  // ── Bridge: wire SVG hover/click events into app state ───────────────────
  const bridge = useCallback((svgDoc: SvgDoc) => {
    if (bridged.current) return;
    bridged.current = true;

    const svg = svgDoc.documentElement as unknown as SVGSVGElement;
    const bboxAccum: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {};
    svgDoc.querySelectorAll<SVGElement>('.measure-definition, .measure-target').forEach(el => {
      const varName = el.getAttribute('data-measure-var') ?? '';
      if (!varName) return;
      const code = (el.getAttribute('data-measures') ?? el.getAttribute('data-measure') ?? '')
        .trim().split(/\s+/)[0];
      const category = code?.[0];
      if (category) categoryByVariable.current[varName] = category;

      const graphicsEl = el as SVGGraphicsElement;
      if (category && el.classList.contains('measure-target') && typeof graphicsEl.getBBox === 'function') {
        const bb = getGlobalBBox(graphicsEl, svg);
        if (bb) {
          const cx = bb.x + bb.w / 2;
          const cy = bb.y + bb.h / 2;
          const acc = bboxAccum[category];
          bboxAccum[category] = acc
            ? { x1: Math.min(acc.x1, cx), y1: Math.min(acc.y1, cy), x2: Math.max(acc.x2, cx), y2: Math.max(acc.y2, cy) }
            : { x1: cx, y1: cy, x2: cx, y2: cy };
        }
      }

      el.addEventListener('mouseenter', () => {
        dispatch({ type: 'SELECT_MEASUREMENT', name: varName });
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ type: 'SELECT_MEASUREMENT', name: varName });
      });
    });

    for (const [category, acc] of Object.entries(bboxAccum)) {
      sectionBBoxes.current[category] = {
        x: acc.x1,
        y: acc.y1,
        w: Math.max(acc.x2 - acc.x1, 1),
        h: Math.max(acc.y2 - acc.y1, 1),
      };
    }

    const inkscapeNs = 'http://www.inkscape.org/namespaces/inkscape';
    svgDoc.querySelectorAll<SVGGraphicsElement>('*').forEach(el => {
      const label = el.getAttributeNS(inkscapeNs, 'label') ?? el.getAttribute('inkscape:label');
      const category = label?.match(/^([A-Q])-bbox$/)?.[1];
      const bb = category && typeof el.getBBox === 'function' ? getGlobalBBox(el, svg) : null;
      if (category && bb) sectionBBoxes.current[category] = bb;
    });

    if (!svgDoc.getElementById('rc-highlight-style')) {
      const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.id = 'rc-highlight-style';
      style.textContent = `
        .measure-definition.is-svg-highlighted {
          fill: #dc2626 !important;
          font-weight: 700 !important;
        }
        .measure-target.is-svg-highlighted {
          stroke: #dc2626 !important;
          stroke-opacity: 1 !important;
        }
        text.measure-target.is-svg-highlighted,
        tspan.measure-target.is-svg-highlighted {
          fill: #dc2626 !important;
          stroke: none !important;
        }
        .measure-definition.is-svg-missing {
          fill: #d97706 !important;
          font-weight: 700 !important;
        }
        .measure-target.is-svg-missing {
          stroke: #f59e0b !important;
          stroke-opacity: 1 !important;
          stroke-dasharray: 14 9;
        }
        text.measure-target.is-svg-missing,
        tspan.measure-target.is-svg-missing {
          fill: #d97706 !important;
          stroke: none !important;
        }
        .measure-definition.is-svg-missing.is-svg-highlighted {
          fill: #dc2626 !important;
        }
        .measure-target.is-svg-missing.is-svg-highlighted {
          stroke: #dc2626 !important;
          stroke-dasharray: none;
        }
        text.measure-target.is-svg-missing.is-svg-highlighted,
        tspan.measure-target.is-svg-missing.is-svg-highlighted {
          fill: #dc2626 !important;
          stroke: none !important;
        }
      `;
      svg.appendChild(style);
    }
    updateMissingHighlights(svgDoc);

    if (selectedRef.current) {
      const variable = selectedRef.current;
      activeSvgHighlights.current = [
        ...svgDoc.querySelectorAll<SVGElement>(`[data-measure-var="${CSS.escape(variable)}"]`),
      ];
      activeSvgHighlights.current.forEach(el => el.classList.add('is-svg-highlighted'));
      fitSelectedCategory(variable);
    }
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
    selectedRef.current = selected;
    if (selected) fitSelectedCategory(selected);
  }, [selected]);

  useEffect(() => {
    if (/^[A-Q]$/.test(activeCategory)) fitCategory(activeCategory);
  }, [activeCategory]);

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

  useEffect(() => {
    missingVariablesRef.current = missingVariables;
    try {
      const svgDoc = objRef.current?.contentDocument;
      if (svgDoc) updateMissingHighlights(svgDoc);
    } catch {}
  }, [missingVariables]);

  // ── Desktop pan/zoom (wheel + drag) ─────────────────────────────────────
  const viewerRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
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

  function fitCategory(category: string) {
    if (!category || focusedCategory.current === category) return;
    const viewer = viewerRef.current;
    const bb = sectionBBoxes.current[category];
    if (!viewer || !bb) return;

    const pad = Math.max(viewer.clientHeight * 0.05, 24);
    const x = bb.x - pad;
    const y = bb.y - pad;
    const width = bb.w + pad * 2;
    const height = bb.h + pad * 2;
    transform.current.scale = Math.min(viewer.clientWidth / width, viewer.clientHeight / height);
    transform.current.tx = (viewer.clientWidth - width * transform.current.scale) / 2 - x * transform.current.scale;
    transform.current.ty = (viewer.clientHeight - height * transform.current.scale) / 2 - y * transform.current.scale;
    focusedCategory.current = category;
    clampT();
    commit();
  }

  function fitSelectedCategory(variable: string) {
    const category = categoryByVariable.current[variable];
    if (category) fitCategory(category);
  }

  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function beginTouchGesture() {
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      const [point] = points;
      touchGesture.current = {
        type: 'pan', x: point.x, y: point.y,
        tx: transform.current.tx, ty: transform.current.ty,
      };
    } else if (points.length >= 2) {
      const [a, b] = points;
      touchGesture.current = {
        type: 'pinch', distance: distance(a, b),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        scale: transform.current.scale, tx: transform.current.tx, ty: transform.current.ty,
      };
      pendingTap.current = null;
    } else {
      touchGesture.current = null;
    }
  }

  function selectSvgTargetAt(clientX: number, clientY: number) {
    try {
      const svgDoc = objRef.current?.contentDocument;
      const viewer = viewerRef.current;
      if (!svgDoc || !viewer) return;
      const rect = viewer.getBoundingClientRect();
      const { scale, tx, ty } = transform.current;
      const target = svgDoc.elementFromPoint(
        (clientX - rect.left - tx) / scale,
        (clientY - rect.top - ty) / scale,
      );
      const measurement = target?.closest<SVGElement>('[data-measure-var]');
      const variable = measurement?.getAttribute('data-measure-var');
      if (variable) dispatch({ type: 'SELECT_MEASUREMENT', name: variable });
    } catch {}
  }

  function onTouchPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pendingTap.current = pointers.current.size === 1 ? { x: e.clientX, y: e.clientY } : null;
    beginTouchGesture();
  }

  function onTouchPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const tap = pendingTap.current;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 7) pendingTap.current = null;

    const points = [...pointers.current.values()];
    const gesture = touchGesture.current;
    if (points.length === 1 && gesture?.type === 'pan') {
      transform.current.tx = gesture.tx + points[0].x - gesture.x;
      transform.current.ty = gesture.ty + points[0].y - gesture.y;
    } else if (points.length >= 2 && gesture?.type === 'pinch') {
      const [a, b] = points;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const nextScale = Math.min(8, Math.max(0.05, gesture.scale * distance(a, b) / gesture.distance));
      transform.current.scale = nextScale;
      transform.current.tx = cx - (gesture.cx - gesture.tx) * nextScale / gesture.scale;
      transform.current.ty = cy - (gesture.cy - gesture.ty) * nextScale / gesture.scale;
    }
    clampT();
    commit();
  }

  function onTouchPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const tap = pendingTap.current;
    pointers.current.delete(e.pointerId);
    if (tap && pointers.current.size === 0) selectSvgTargetAt(e.clientX, e.clientY);
    pendingTap.current = null;
    beginTouchGesture();
  }

  useEffect(() => {
    const viewer = viewerRef.current;
    const overlay = overlayRef.current;
    if (!viewer || !overlay) return;

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

    requestAnimationFrame(initFit);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => { overlay.removeEventListener('wheel', onWheel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="diagram-panel">
      <div className="panel-header">
        <span>Body diagram</span>
        <span className="panel-header-hint">scroll to zoom · drag to pan</span>
      </div>
      <div ref={viewerRef} className="diagram-viewer" style={{ overflow: 'hidden', position: 'relative', flex: 1 }}>
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
            pointerEvents: 'auto',
          }}
        />
        <div ref={overlayRef} className="diagram-touch-overlay"
          onPointerDown={onTouchPointerDown}
          onPointerMove={onTouchPointerMove}
          onPointerUp={onTouchPointerUp}
          onPointerCancel={onTouchPointerUp}
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
