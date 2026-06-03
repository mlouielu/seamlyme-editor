import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { createDocument, parseSmis, serializeSmis } from '@seamlyme/core';
import { AppProvider, useAppState, useDispatch } from './store';
import { DEFAULT_SAVE_NAME, NEW_FILE_NAME } from './config';
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
  dispatch({ type: 'LOAD', doc: createDocument({ template: 'default', defaultValue: 0 }), fileName: NEW_FILE_NAME });
  document.title = `${NEW_FILE_NAME} - SeamlyME`;
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
  const { doc, fileName, canUndo, canRedo } = useAppState();
  const dispatch = useDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  function loadFile(file: File) {
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
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
    setMenuOpen(false);
  }

  function saveFile() {
    if (!doc) return;
    const xml = serializeSmis(doc);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (fileName && fileName !== NEW_FILE_NAME) ? fileName : DEFAULT_SAVE_NAME;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
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
      {doc && (
        <div className="header-history">
          <button
            className="btn btn-icon"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => dispatch({ type: 'UNDO' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.31"/>
            </svg>
          </button>
          <button
            className="btn btn-icon"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={() => dispatch({ type: 'REDO' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-.49-3.31"/>
            </svg>
          </button>
        </div>
      )}
      <div className="header-file-actions">
        {doc && <button className="btn primary" onClick={saveFile}>Save</button>}
        <label className="btn">
          {doc ? 'Load another…' : 'Load .smis…'}
          <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
        </label>
        {doc && <button className="btn" onClick={() => loadNewSheet(dispatch)}>New</button>}
      </div>
      {doc && (
        <div className="header-hamburger-wrap" ref={menuRef}>
          <button
            className="btn btn-icon"
            aria-label="Menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <svg width="16" height="13" viewBox="0 0 16 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="0" y1="1.5" x2="16" y2="1.5"/>
              <line x1="0" y1="6.5" x2="16" y2="6.5"/>
              <line x1="0" y1="11.5" x2="16" y2="11.5"/>
            </svg>
          </button>
          {menuOpen && (
            <div className="header-dropdown">
              <button className="header-dropdown-item" onClick={saveFile}>
                Save
              </button>
              <label className="header-dropdown-item">
                Load another…
                <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
              </label>
              <button className="header-dropdown-item" onClick={() => { loadNewSheet(dispatch); setMenuOpen(false); }}>
                New
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

// ── Mobile breakpoint hook ────────────────────────────────────────────────────

function useIsMobile() {
  const [is, setIs] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const h = (e: MediaQueryListEvent) => setIs(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return is;
}

// ── Layout ────────────────────────────────────────────────────────────────────

function Layout() {
  const { doc, activeCategory, fileName, highlighted, selected, skinColor } = useAppState();
  const dispatch = useDispatch();
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'diagram' | 'figure'>('diagram');
  const debugParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);
  const [showDiagram, setShowDiagram] = useState(
    import.meta.env.DEV ? debugParams.get('diagram') !== '0' : true,
  );
  const [showFigure, setShowFigure] = useState(
    import.meta.env.DEV ? debugParams.get('figure') !== '0' : true,
  );
  const missingVariables = useMemo(() => Object.values(doc?.measurements ?? {})
    .filter(measurement => !measurement.hasValue || (fileName === NEW_FILE_NAME && measurement.raw === '0'))
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
          {isMobile ? (
            <div className="workspace-top-panel">
              <div className="mobile-view-tabs">
                <button
                  className={`mobile-tab${mobileTab === 'diagram' ? ' is-active' : ''}`}
                  onClick={() => setMobileTab('diagram')}
                >Diagram</button>
                <button
                  className={`mobile-tab${mobileTab === 'figure' ? ' is-active' : ''}`}
                  onClick={() => setMobileTab('figure')}
                >Figure</button>
              </div>
              {mobileTab === 'diagram' ? (
                showDiagram && (
                  <div className="workspace-diagram">
                    <Profiler id="DiagramPanel" onRender={logProfile}>
                      <DiagramPanel activeCategory={activeCategory} highlighted={highlighted}
                        selected={selected} missingVariables={missingVariables} />
                    </Profiler>
                  </div>
                )
              ) : (
                <div className="workspace-figure-mobile">
                  <Profiler id="FigurePanel" onRender={logProfile}>
                    <FigurePanel doc={doc} skinColor={skinColor} />
                  </Profiler>
                </div>
              )}
            </div>
          ) : (
            showDiagram && (
              <div className="workspace-diagram">
                <Profiler id="DiagramPanel" onRender={logProfile}>
                  <DiagramPanel activeCategory={activeCategory} highlighted={highlighted}
                    selected={selected} missingVariables={missingVariables} />
                </Profiler>
              </div>
            )
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
        {!isMobile && showFigure && (
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
