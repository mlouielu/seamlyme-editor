import { Profiler, useCallback, useMemo, useState, type ProfilerOnRenderCallback } from 'react';
import { createDocument, parseSmis } from '@seamlyme/core';
import { AppProvider, useAppState, useDispatch } from './store';
import EditorPanel   from './components/EditorPanel';
import DiagramPanel  from './components/DiagramPanel';
import FigurePanel   from './components/FigurePanel';
import MeasurementEditorPanel from './components/MeasurementEditorPanel';
import CategorySelector from './components/CategorySelector';

const logProfile: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
) => {
  console.log(
    `[profile] ${id} ${phase}: actual=${actualDuration.toFixed(1)}ms base=${baseDuration.toFixed(1)}ms`,
  );
};

function loadNewSheet(dispatch: ReturnType<typeof useDispatch>) {
  dispatch({ type: 'LOAD', doc: createDocument({ template: 'default', defaultValue: 0 }), fileName: 'new' });
  document.title = 'new - SeamlyME';
}

// ── Drop zone (shown before a file is loaded) ─────────────────────────────────

function DropZone() {
  const dispatch = useDispatch();

  const load = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const doc = parseSmis(e.target!.result as string);
        dispatch({ type: 'LOAD', doc, fileName: file.name });
        document.title = `${file.name} — SeamlyME`;
      } catch (err) {
        alert('Could not parse file: ' + (err instanceof Error ? err.message : err));
      }
    };
    reader.readAsText(file);
  }, [dispatch]);

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) load(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) load(file);
  }

  return (
    <div className="drop-screen" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <div className="drop-zone">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <h2>Drop your .smis file here</h2>
        <p>SeamlyME body measurements · formulas evaluated automatically</p>
        <label className="btn primary">
          Browse file…
          <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
        </label>
        <button className="btn" onClick={() => loadNewSheet(dispatch)}>New</button>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  const { doc, fileName } = useAppState();
  const dispatch = useDispatch();

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const loaded = parseSmis(ev.target!.result as string);
        dispatch({ type: 'LOAD', doc: loaded, fileName: file.name });
        document.title = `${file.name} — SeamlyME`;
      } catch (err) {
        alert('Could not parse file: ' + (err instanceof Error ? err.message : err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const present  = doc ? Object.values(doc.measurements).filter(m => m.hasValue).length : 0;
  const total    = doc ? Object.keys(doc.measurements).length : 0;
  const resolved = doc ? Object.values(doc.measurements).filter(m => m.hasValue && m.resolved !== null).length : 0;

  return (
    <header className="app-header">
      <div>
        <span className="app-title">SeamlyME Viewer</span>
        {fileName && <span className="app-filename">{fileName}</span>}
      </div>
      {doc && (
        <div className="header-pills">
          <span className="pill">Unit: <strong>{doc.unit}</strong></span>
          {doc.pmSys && <span className="pill">PM: <strong>{doc.pmSys}</strong></span>}
          <span className="pill"><strong>{present}</strong>/{total} set</span>
          <span className="pill"><strong>{resolved}</strong> resolved</span>
        </div>
      )}
      <label className="btn">
        {doc ? 'Load another…' : 'Load .smis…'}
        <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
      </label>
      {doc && <button className="btn" onClick={() => loadNewSheet(dispatch)}>New</button>}
    </header>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

function Layout() {
  const { doc, activeCategory, fileName, highlighted, selected, skinColor } = useAppState();
  const debugParams = new URLSearchParams(window.location.search);
  const [showDiagram, setShowDiagram] = useState(
    import.meta.env.DEV ? debugParams.get('diagram') !== '0' : true,
  );
  const [showFigure, setShowFigure] = useState(
    import.meta.env.DEV ? debugParams.get('figure') !== '0' : true,
  );
  const missingVariables = useMemo(() => Object.values(doc?.measurements ?? {})
    .filter(measurement => !measurement.hasValue || (fileName === 'new' && measurement.raw === '0'))
    .map(measurement => measurement.name), [doc, fileName]);

  if (!doc) return (
    <>
      <Header />
      <DropZone />
    </>
  );

  return (
    <div className="app-shell">
      <Header />
      {import.meta.env.DEV && (
        <div className="debug-toolbar">
          <strong>Debug panels</strong>
          <label>
            <input
              type="checkbox"
              checked={showDiagram}
              onChange={e => setShowDiagram(e.target.checked)}
            />
            Embedded SVG diagram
          </label>
          <label>
            <input
              type="checkbox"
              checked={showFigure}
              onChange={e => setShowFigure(e.target.checked)}
            />
            Generated body figure
          </label>
          <span className="debug-toolbar-links">
            Reload:
            <a href="?diagram=0&figure=0">editor only</a>
            <a href="?diagram=0&figure=1">+ figure</a>
            <a href="?diagram=1&figure=0">+ diagram</a>
          </span>
        </div>
      )}
      <div className="workspace-split">
        <div className="workspace-left">
          {showDiagram && (
            <div className="workspace-diagram">
              <Profiler id="DiagramPanel" onRender={logProfile}>
                <DiagramPanel activeCategory={activeCategory} highlighted={highlighted}
                  selected={selected} missingVariables={missingVariables} />
              </Profiler>
            </div>
          )}
          <CategorySelector placement="desktop" />
          <CategorySelector placement="mobile" />
          <Profiler id="EditorPanel" onRender={logProfile}>
            <EditorPanel />
          </Profiler>
          <Profiler id="MeasurementEditorPanel" onRender={logProfile}>
            <MeasurementEditorPanel />
          </Profiler>
        </div>
        {showFigure && (
          <div className="workspace-right">
            <Profiler id="FigurePanel" onRender={logProfile}>
              <FigurePanel
                doc={doc}
                skinColor={skinColor}
              />
            </Profiler>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
