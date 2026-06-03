import type { AppState, HistoryEnvelope, ValueFilter } from './store';
import { parseSmis, serializeSmis } from '@seamlyme/core';

// ── Persisted shapes ──────────────────────────────────────────────────────────

interface PersistedState {
  docXml: string;
  activeCategory: string;
  selected: string | null;
  highlighted: string | null;
  valueFilter: ValueFilter;
  searchQuery: string;
  globalSearch: boolean;
}

interface PersistedSession {
  id: string;
  fileName: string;
  savedAt: number;
  measurementCount: number;
  originalRaws: Record<string, string>;
  current: PersistedState;
  past: PersistedState[];
  future: PersistedState[];
}

export interface SessionMeta {
  id: string;
  fileName: string;
  savedAt: number;
  measurementCount: number;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const RECENT_KEY = 'seamlyme:recent';
const SESSION_PREFIX = 'seamlyme:session:';
const MAX_RECENT = 5;

// ── Serialization helpers ─────────────────────────────────────────────────────

function serializeState(state: AppState): PersistedState | null {
  if (!state.doc) return null;
  return {
    docXml: serializeSmis(state.doc),
    activeCategory: state.activeCategory,
    selected: state.selected,
    highlighted: state.highlighted,
    valueFilter: state.valueFilter,
    searchQuery: state.searchQuery,
    globalSearch: state.globalSearch,
  };
}

function deserializeState(
  p: PersistedState,
  originalRaws: Record<string, string>,
  fileName: string,
): AppState | null {
  try {
    const doc = parseSmis(p.docXml);
    return {
      doc,
      originalRaws,
      fileName,
      activeCategory: p.activeCategory,
      selected: p.selected,
      highlighted: p.highlighted,
      valueFilter: p.valueFilter,
      searchQuery: p.searchQuery,
      globalSearch: p.globalSearch,
      searchSnapshot: null,
      skinColor: localStorage.getItem('skinColor') ?? '#f2c6a0',
      canUndo: false,
      canRedo: false,
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function saveSession(fileName: string, envelope: HistoryEnvelope): void {
  const { current, past, future } = envelope;
  if (!current.doc || !fileName) return;

  const currentPersisted = serializeState(current);
  if (!currentPersisted) return;

  const compact = (states: AppState[]): PersistedState[] =>
    states.flatMap(s => { const p = serializeState(s); return p ? [p] : []; });

  const session: PersistedSession = {
    id: fileName,
    fileName,
    savedAt: Date.now(),
    measurementCount: Object.keys(current.doc.measurements).length,
    originalRaws: current.originalRaws,
    current: currentPersisted,
    past: compact(past),
    future: compact(future),
  };

  try {
    localStorage.setItem(SESSION_PREFIX + fileName, JSON.stringify(session));
    const prev = loadRecentMetas().filter(m => m.id !== fileName);
    const next: SessionMeta[] = [
      { id: fileName, fileName, savedAt: session.savedAt, measurementCount: session.measurementCount },
      ...prev,
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

export function loadRecentMetas(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as SessionMeta[];
  } catch {
    return [];
  }
}

export function loadSession(id: string): HistoryEnvelope | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + id);
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedSession;

    const current = deserializeState(s.current, s.originalRaws, s.fileName);
    if (!current) return null;

    const deserialize = (arr: PersistedState[]) =>
      arr
        .map(p => deserializeState(p, s.originalRaws, s.fileName))
        .filter((x): x is AppState => x !== null);

    return { current, past: deserialize(s.past), future: deserialize(s.future) };
  } catch {
    return null;
  }
}

export function deleteSession(id: string): void {
  try {
    localStorage.removeItem(SESSION_PREFIX + id);
    const metas = loadRecentMetas().filter(m => m.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(metas));
  } catch {}
}
