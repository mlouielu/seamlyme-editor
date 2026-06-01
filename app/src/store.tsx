import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react';
import {
  type SeamlyDocument,
  cloneDocument,
  renameMeasurement,
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
  /** Variable name selected for editing in the bottom panel. */
  selected: string | null;
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
  selected: null,
  highlighted: null,
  searchQuery: '',
  valueFilter: 'all',
  skinColor: localStorage.getItem('skinColor') ?? '#f2c6a0',
  projectionRatioEnabled: true,
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD'; doc: SeamlyDocument; fileName: string }
  | { type: 'APPLY_EDIT'; oldName: string; newName: string; value: string }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SELECT_MEASUREMENT'; name: string }
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
        selected: null,
        highlighted: null,
        searchQuery: '',
        valueFilter: 'all',
      };
    }

    case 'APPLY_EDIT': {
      if (!state.doc) return state;
      const next = cloneDocument(state.doc);
      try {
        if (action.newName !== action.oldName) {
          renameMeasurement(next, action.oldName, action.newName);
        }
        setMeasurementValue(next, action.newName, action.value);
      } catch {
        return state;
      }
      return {
        ...state,
        doc: next,
        highlighted: state.highlighted === action.oldName
          ? action.newName
          : state.highlighted,
        selected: state.selected === action.oldName
          ? action.newName
          : state.selected,
      };
    }

    case 'SET_CATEGORY':
      return { ...state, activeCategory: action.category, searchQuery: '', highlighted: null };

    case 'SELECT_MEASUREMENT': {
      if (!state.doc?.measurements[action.name]) return state;
      const id = state.doc.measurements[action.name].id;
      const category = id.match(/^([A-Q])\d+$/)?.[1] ?? 'custom';
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
