import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react';
import {
  addMeasurement,
  addMeasurementAfter,
  type SeamlyDocument,
  cloneDocument,
  removeMeasurement,
  renameMeasurement,
  setMeasurementMeta,
  setMeasurementValue,
} from '@seamlyme/core';

// ── State ────────────────────────────────────────────────────────────────────

export type ValueFilter = 'all' | 'with' | 'without';

interface SearchSnapshot {
  query: string;
  globalSearch: boolean;
  category: string;
}

export interface AppState {
  doc: SeamlyDocument | null;
  /** Raw XML at load time — used to compute "modified" badges. */
  originalRaws: Record<string, string>;
  fileName: string;
  activeCategory: string;   // letter 'A'-'Q', 'custom', 'errors', 'recommended', or 'all'
  /** Variable name selected for editing in the bottom panel. */
  selected: string | null;
  /** Variable name of the currently highlighted measurement, or null. */
  highlighted: string | null;
  searchQuery: string;
  globalSearch: boolean;
  searchSnapshot: SearchSnapshot | null;
  valueFilter: ValueFilter;
  skinColor: string;
}

const initial: AppState = {
  doc: null,
  originalRaws: {},
  fileName: '',
  activeCategory: 'A',
  selected: null,
  highlighted: null,
  searchQuery: '',
  globalSearch: false,
  searchSnapshot: null,
  valueFilter: 'all',
  skinColor: localStorage.getItem('skinColor') ?? '#f2c6a0',
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD'; doc: SeamlyDocument; fileName: string }
  | { type: 'APPLY_EDIT'; oldName: string; newName: string; value: string; description: string }
  | { type: 'ADD_MEASUREMENT' }
  | { type: 'DUPLICATE_MEASUREMENT'; name: string }
  | { type: 'REMOVE_MEASUREMENT'; name: string }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SELECT_MEASUREMENT'; name: string }
  | { type: 'SELECT_SEARCH_RESULT'; name: string }
  | { type: 'JUMP_FROM_SEARCH'; name: string }
  | { type: 'RESTORE_SEARCH' }
  | { type: 'SET_HIGHLIGHT'; name: string | null }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'TOGGLE_GLOBAL_SEARCH' }
  | { type: 'SET_VALUE_FILTER'; filter: ValueFilter }
  | { type: 'SET_SKIN_COLOR'; color: string };

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  function uniqueCustomName(doc: SeamlyDocument, base: string): string {
    if (!doc.measurements[base]) return base;
    let suffix = 2;
    while (doc.measurements[`${base}_${suffix}`]) suffix += 1;
    return `${base}_${suffix}`;
  }

  switch (action.type) {
    case 'LOAD': {
      const raws: Record<string, string> = {};
      for (const [name, m] of Object.entries(action.doc.measurements)) {
        raws[name] = m.raw;
      }
      return {
        ...state,
        doc: action.doc,
        originalRaws: raws,
        fileName: action.fileName,
        activeCategory: 'A',
        selected: null,
        highlighted: null,
        searchQuery: '',
        globalSearch: false,
        searchSnapshot: null,
        valueFilter: 'all',
      };
    }

    case 'APPLY_EDIT': {
      if (!state.doc) return state;
      const original = state.doc.measurements[action.oldName];
      if (!original) return state;
      if (/^([A-Q])\d+$/.test(original.id) && action.newName !== action.oldName) return state;
      const next = cloneDocument(state.doc);
      try {
        if (action.newName !== action.oldName) {
          renameMeasurement(next, action.oldName, action.newName);
        }
        setMeasurementValue(next, action.newName, action.value);
        setMeasurementMeta(next, action.newName, { description: action.description });
      } catch {
        return state;
      }
      return {
        ...state,
        doc: next,
        activeCategory: state.activeCategory === 'errors'
          && !Object.values(next.measurements).some(measurement => measurement.error)
          ? next.measurements[action.newName]?.id.match(/^([A-Q])\d+$/)?.[1] ?? 'custom'
          : state.activeCategory,
        highlighted: state.highlighted === action.oldName
          ? action.newName
          : state.highlighted,
        selected: state.selected === action.oldName
          ? action.newName
          : state.selected,
      };
    }

    case 'ADD_MEASUREMENT': {
      if (!state.doc) return state;
      const next = cloneDocument(state.doc);
      const name = uniqueCustomName(next, '@new_measurement');
      try {
        if (state.selected && next.measurements[state.selected]) {
          addMeasurementAfter(next, state.selected, name);
        } else {
          addMeasurement(next, name);
        }
      } catch {
        return state;
      }
      return {
        ...state,
        doc: next,
        activeCategory: 'custom',
        selected: name,
        highlighted: name,
        searchQuery: '',
        searchSnapshot: null,
      };
    }

    case 'DUPLICATE_MEASUREMENT': {
      if (!state.doc) return state;
      const source = state.doc.measurements[action.name];
      if (!source) return state;
      const next = cloneDocument(state.doc);
      const base = `@${source.name.replace(/^@/, '')}_copy`;
      const name = uniqueCustomName(next, base);
      try {
        addMeasurementAfter(next, source.name, name, source.raw);
        setMeasurementMeta(next, name, {
          fullName: source.fullName,
          description: source.desc,
        });
      } catch {
        return state;
      }
      return {
        ...state,
        doc: next,
        activeCategory: 'custom',
        selected: name,
        highlighted: name,
        searchQuery: '',
        searchSnapshot: null,
      };
    }

    case 'REMOVE_MEASUREMENT': {
      if (!state.doc) return state;
      const measurement = state.doc.measurements[action.name];
      if (!measurement || /^([A-Q])\d+$/.test(measurement.id)) return state;
      const next = cloneDocument(state.doc);
      const removedIndex = next.measurementOrder.indexOf(action.name);
      try {
        removeMeasurement(next, action.name);
      } catch {
        return state;
      }
      const nextSelected = next.measurementOrder[
        Math.min(Math.max(removedIndex, 0), next.measurementOrder.length - 1)
      ] ?? null;
      const nextCategory = nextSelected
        ? next.measurements[nextSelected]?.id.match(/^([A-Q])\d+$/)?.[1] ?? 'custom'
        : state.activeCategory;
      return {
        ...state,
        doc: next,
        activeCategory: nextCategory,
        selected: nextSelected,
        highlighted: nextSelected,
        searchQuery: '',
        searchSnapshot: null,
      };
    }

    case 'SET_CATEGORY':
      return { ...state, activeCategory: action.category, searchQuery: '', searchSnapshot: null, highlighted: null };

    case 'SELECT_MEASUREMENT': {
      if (!state.doc?.measurements[action.name]) return state;
      const measurement = state.doc.measurements[action.name];
      const category = state.activeCategory === 'recommended'
        ? 'recommended'
        : state.activeCategory === 'errors' && measurement.error
          ? 'errors'
          : measurement.id.match(/^([A-Q])\d+$/)?.[1] ?? 'custom';
      if (
        state.selected === action.name
        && state.highlighted === action.name
        && state.activeCategory === category
      ) return state;
      return {
        ...state,
        activeCategory: category,
        searchQuery: '',
        selected: action.name,
        highlighted: action.name,
      };
    }

    case 'SELECT_SEARCH_RESULT': {
      if (!state.doc?.measurements[action.name]) return state;
      return {
        ...state,
        selected: action.name,
        highlighted: action.name,
      };
    }

    case 'JUMP_FROM_SEARCH': {
      if (!state.doc?.measurements[action.name] || !state.searchQuery) return state;
      const measurement = state.doc.measurements[action.name];
      return {
        ...state,
        activeCategory: measurement.id.match(/^([A-Q])\d+$/)?.[1] ?? 'custom',
        selected: action.name,
        highlighted: action.name,
        searchSnapshot: {
          query: state.searchQuery,
          globalSearch: state.globalSearch,
          category: state.activeCategory,
        },
        searchQuery: '',
      };
    }

    case 'RESTORE_SEARCH': {
      if (!state.searchSnapshot) return state;
      return {
        ...state,
        activeCategory: state.searchSnapshot.category,
        searchQuery: state.searchSnapshot.query,
        globalSearch: state.searchSnapshot.globalSearch,
        searchSnapshot: null,
      };
    }

    case 'SET_HIGHLIGHT':
      return state.highlighted === action.name
        ? state
        : { ...state, highlighted: action.name };

    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query, searchSnapshot: null };

    case 'TOGGLE_GLOBAL_SEARCH':
      return { ...state, globalSearch: !state.globalSearch };

    case 'SET_VALUE_FILTER':
      return { ...state, valueFilter: action.filter };

    case 'SET_SKIN_COLOR':
      localStorage.setItem('skinColor', action.color);
      return { ...state, skinColor: action.color };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const StateCtx   = createContext<AppState>(initial);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState() { return useContext(StateCtx); }
export function useDispatch() { return useContext(DispatchCtx); }
