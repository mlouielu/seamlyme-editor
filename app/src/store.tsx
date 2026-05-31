import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
  type Dispatch,
} from 'react';
import {
  type SeamlyDocument,
  cloneDocument,
  setMeasurementValue,
} from '@seamlyme/core';

// ── State ────────────────────────────────────────────────────────────────────

export type ValueFilter = 'all' | 'with' | 'without';

export interface AppState {
  doc: SeamlyDocument | null;
  /** Raw XML at load time — used to compute "modified" badges. */
  originalRaws: Record<string, string>;
  fileName: string;
  activeCategory: string;   // letter 'A'-'Q', 'custom', or 'all'
  /** Variable name of the currently highlighted measurement, or null. */
  highlighted: string | null;
  searchQuery: string;
  valueFilter: ValueFilter;
  skinColor: string;
  projectionRatioEnabled: boolean;
}

const initial: AppState = {
  doc: null,
  originalRaws: {},
  fileName: '',
  activeCategory: 'A',
  highlighted: null,
  searchQuery: '',
  valueFilter: 'all',
  skinColor: localStorage.getItem('skinColor') ?? '#f2c6a0',
  projectionRatioEnabled: true,
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD'; doc: SeamlyDocument; fileName: string }
  | { type: 'SET_VALUE'; name: string; value: string }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SET_HIGHLIGHT'; name: string | null }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_VALUE_FILTER'; filter: ValueFilter }
  | { type: 'SET_SKIN_COLOR'; color: string }
  | { type: 'TOGGLE_PROJECTION_RATIO' };

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
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
        highlighted: null,
        searchQuery: '',
        valueFilter: 'all',
      };
    }

    case 'SET_VALUE': {
      if (!state.doc) return state;
      const next = cloneDocument(state.doc);
      try {
        setMeasurementValue(next, action.name, action.value);
      } catch {
        return state;
      }
      return { ...state, doc: next };
    }

    case 'SET_CATEGORY':
      return { ...state, activeCategory: action.category, searchQuery: '', highlighted: null };

    case 'SET_HIGHLIGHT':
      return state.highlighted === action.name
        ? state
        : { ...state, highlighted: action.name };

    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };

    case 'SET_VALUE_FILTER':
      return { ...state, valueFilter: action.filter };

    case 'SET_SKIN_COLOR':
      localStorage.setItem('skinColor', action.color);
      return { ...state, skinColor: action.color };

    case 'TOGGLE_PROJECTION_RATIO':
      return { ...state, projectionRatioEnabled: !state.projectionRatioEnabled };

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

/** Stable setValue callback to pass down to table cells. */
export function useSetValue() {
  const dispatch = useDispatch();
  return useCallback(
    (name: string, value: string) => dispatch({ type: 'SET_VALUE', name, value }),
    [dispatch],
  );
}
