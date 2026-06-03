import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { createPortal } from 'react-dom';
import { createDocument, parseSmis, serializeSmis } from '@seamlyme/core';
import { AppProvider, useAppState, useDispatch } from './store';
import { APP_NAME, DEFAULT_SAVE_NAME, NEW_FILE_NAME } from './config';
import { loadRecentMetas, loadSession, deleteSession, type SessionMeta } from './autosave';
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

type Unit = 'cm' | 'mm' | 'inch';

function loadNewSheet(dispatch: ReturnType<typeof useDispatch>, unit: Unit = 'cm') {
  dispatch({ type: 'LOAD', doc: createDocument({ unit, template: 'default', defaultValue: 0 }), fileName: NEW_FILE_NAME });
  document.title = `${NEW_FILE_NAME} — ${APP_NAME}`;
}

// ── New file dialog ────────────────────────────────────────────────────────────

interface NewFileDialogProps {
  onConfirm: (unit: Unit) => void;
  onCancel: () => void;
}

function NewFileDialog({ onConfirm, onCancel }: NewFileDialogProps) {
  const [unit, setUnit] = useState<Unit>('cm');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm(unit);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unit, onConfirm, onCancel]);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div className="dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal aria-label="New file">
        <h2 className="dialog-title">New measurement file</h2>
        <p className="dialog-body">Choose the unit for all measurements.</p>
        <div className="dialog-unit-options">
          {(['cm', 'mm', 'inch'] as Unit[]).map(u => (
            <label key={u} className={`dialog-unit-option${unit === u ? ' is-selected' : ''}`}>
              <input type="radio" name="unit" value={u} checked={unit === u}
                onChange={() => setUnit(u)} />
              <span className="dialog-unit-label">{u}</span>
              <span className="dialog-unit-hint">
                {u === 'cm' ? 'centimetres' : u === 'mm' ? 'millimetres' : 'inches'}
              </span>
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={() => onConfirm(unit)}>Create</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Drop zone (shown before a file is loaded) ─────────────────────────────────

function DropZone() {
  const dispatch = useDispatch();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRecentDialog, setShowRecentDialog] = useState(false);

  const load = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const doc = parseSmis(e.target!.result as string);
        dispatch({ type: 'LOAD', doc, fileName: file.name });
        document.title = `${file.name} — ${APP_NAME}`;
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

  function handleRestore(id: string) {
    const data = loadSession(id);
    if (!data) { alert('Could not restore session.'); return; }
    dispatch({ type: 'RESTORE_SESSION', data });
    document.title = `${data.current.fileName} — ${APP_NAME}`;
    setShowRecentDialog(false);
  }

  return (
    <div className="drop-screen" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <div className="drop-zone">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <h2>Drop your .smis file here</h2>
        <p>{APP_NAME} body measurements · formulas evaluated automatically</p>
        <div className="drop-zone-actions">
          <label className="btn primary">
            Browse file…
            <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
          </label>
          <button className="btn" onClick={() => setShowRecentDialog(true)}>Recent</button>
          <button className="btn" onClick={() => setShowNewDialog(true)}>New</button>
        </div>
      </div>
      {showNewDialog && (
        <NewFileDialog
          onConfirm={unit => { loadNewSheet(dispatch, unit); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
      {showRecentDialog && (
        <RecentSessionsDialog
          onRestore={handleRestore}
          onClose={() => setShowRecentDialog(false)}
        />
      )}
    </div>
  );
}

// ── Recent sessions dialog ────────────────────────────────────────────────────

interface RecentSessionsDialogProps {
  onRestore: (id: string) => void;
  onClose: () => void;
}

function RecentSessionsDialog({ onRestore, onClose }: RecentSessionsDialogProps) {
  const [metas, setMetas] = useState<SessionMeta[]>(() => loadRecentMetas());

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleDelete(id: string) {
    deleteSession(id);
    setMetas(m => m.filter(s => s.id !== id));
  }

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog dialog-recent" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal aria-label="Recent files">
        <h2 className="dialog-title">Recent files</h2>
        {metas.length === 0 ? (
          <p className="dialog-body">No autosaved sessions yet. Sessions are saved automatically as you edit.</p>
        ) : (
          <ul className="recent-list">
            {metas.map(meta => (
              <li key={meta.id} className="recent-item">
                <button className="recent-item-main" onClick={() => onRestore(meta.id)}>
                  <span className="recent-item-name">{meta.fileName}</span>
                  <span className="recent-item-meta">
                    {meta.measurementCount} measurements &middot; {new Date(meta.savedAt).toLocaleString()}
                  </span>
                </button>
                <button className="recent-item-delete" title="Remove from recent" onClick={() => handleDelete(meta.id)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  const { doc, fileName, canUndo, canRedo } = useAppState();
  const dispatch = useDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRecentDialog, setShowRecentDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleRestore(id: string) {
    const data = loadSession(id);
    if (!data) { alert('Could not restore session.'); return; }
    dispatch({ type: 'RESTORE_SESSION', data });
    document.title = `${data.current.fileName} — ${APP_NAME}`;
    setShowRecentDialog(false);
  }

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
        document.title = `${file.name} — ${APP_NAME}`;
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
        <span className="app-title">{APP_NAME}</span>
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
      {doc && (
        <div className="header-file-actions">
          <button className="btn primary" onClick={saveFile}>Save</button>
          <label className="btn">
            Load
            <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
          </label>
          <button className="btn" onClick={() => setShowRecentDialog(true)}>Recent</button>
          <button className="btn" onClick={() => setShowNewDialog(true)}>New</button>
        </div>
      )}
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
                Load
                <input type="file" accept=".smis,.xml,.vit" style={{ display: 'none' }} onChange={onInputChange} />
              </label>
              <button className="header-dropdown-item" onClick={() => { setMenuOpen(false); setShowRecentDialog(true); }}>
                Recent
              </button>
              <button className="header-dropdown-item" onClick={() => { setMenuOpen(false); setShowNewDialog(true); }}>
                New
              </button>
            </div>
          )}
        </div>
      )}
      {showNewDialog && (
        <NewFileDialog
          onConfirm={unit => { loadNewSheet(dispatch, unit); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
      {showRecentDialog && (
        <RecentSessionsDialog
          onRestore={handleRestore}
          onClose={() => setShowRecentDialog(false)}
        />
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
  const editorPanelRef = useRef<import('./components/MeasurementEditorPanel').MeasurementEditorPanelHandle>(null);
  const requestFocusFormula = () => editorPanelRef.current?.focusFormula();
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
                    <FigurePanel doc={doc} skinColor={skinColor} onRequestFocus={requestFocusFormula} />
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
            <EditorPanel onRowClick={requestFocusFormula} />
          </Profiler>
          <Profiler id="MeasurementEditorPanel" onRender={logProfile}>
            <MeasurementEditorPanel ref={editorPanelRef} />
          </Profiler>
        </div>
        {!isMobile && showFigure && (
          <div className="workspace-right">
            <Profiler id="FigurePanel" onRender={logProfile}>
              <FigurePanel
                doc={doc}
                skinColor={skinColor}
                onRequestFocus={requestFocusFormula}
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
