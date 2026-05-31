import {
  memo, useRef, useState, useCallback, useEffect,
  type KeyboardEvent, type ClipboardEvent, type ChangeEvent,
} from 'react';
import type { SeamlyMeasurement } from '@seamlyme/core';
import { CATEGORY_LABELS, CATEGORY_LETTERS, idToCategory } from '../catalog';
import { useAppState, useDispatch, useSetValue } from '../store';

// ── Helpers ────────────────────────────────────────────────────────────────────

function isFormula(raw: string) { return /[a-zA-Z_@]/.test(raw) || /[+\-*/()]/.test(raw); }

function fmtVal(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v % 1 === 0) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
}

function toCm(val: number, unit: string): string | null {
  let cm: number | null = null;
  if (unit === 'inch' || unit === 'in') cm = val * 2.54;
  else if (unit === 'mm') cm = val / 10;
  return cm !== null ? cm.toFixed(1).replace(/\.0$/, '') : null;
}

// ── Editable Raw Cell ─────────────────────────────────────────────────────────

interface RawCellProps {
  name: string;
  raw: string;
  isModified: boolean;
  onFocus: () => void;
}

function RawCell({ name, raw, isModified, onFocus }: RawCellProps) {
  const setValue = useSetValue();
  const [localVal, setLocalVal] = useState(raw);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep localVal in sync when doc changes externally
  useEffect(() => { setLocalVal(raw); }, [raw]);

  function commit(val: string) {
    if (val !== raw) setValue(name, val);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.currentTarget.blur(); return; }
    if (e.key === 'Escape') { setLocalVal(raw); e.currentTarget.blur(); return; }
    // Tab: move to next row's input
    if (e.key === 'Tab') {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.raw-cell-input'));
      const idx = inputs.indexOf(e.currentTarget);
      const next = inputs[e.shiftKey ? idx - 1 : idx + 1];
      if (next) { commit(localVal); next.focus(); }
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return; // single value → default paste
    e.preventDefault();

    // Multi-line paste: fill this cell and subsequent cells downward
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.raw-cell-input'));
    const startIdx = inputs.indexOf(e.currentTarget);
    lines.forEach((line, i) => {
      const target = inputs[startIdx + i];
      if (!target) return;
      const mname = target.dataset.mname!;
      // Extract first tab-column (in case user pasted multiple columns)
      const val = line.split('\t')[0].trim();
      if (val) setValue(mname, val);
    });
    // Update local state for current cell
    setLocalVal(lines[0].split('\t')[0].trim());
  }

  return (
    <input
      ref={inputRef}
      className={`raw-cell-input${isModified ? ' is-modified' : ''}`}
      data-mname={name}
      value={localVal}
      placeholder="—"
      autoComplete="off"
      spellCheck={false}
      onFocus={onFocus}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalVal(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

function EditorPanel() {
  const state    = useAppState();
  const dispatch = useDispatch();
  const { doc, originalRaws, activeCategory, searchQuery, valueFilter, highlighted } = state;

  // Rows: all individual measurements visible in this category
  const allRows: SeamlyMeasurement[] = doc
    ? Object.values(doc.measurements).filter(m => {
        const cat = idToCategory(m.id);
        if (activeCategory === 'custom') return !cat;
        if (activeCategory !== 'all') return cat === activeCategory;
        return true;
      }).sort((a, b) => {
        if (a.id && b.id) return a.id.localeCompare(b.id);
        if (a.id) return -1; if (b.id) return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  // Available tabs: only letters that have at least one measurement in the doc
  const availableCategories = doc
    ? CATEGORY_LETTERS.filter(l =>
        Object.values(doc.measurements).some(m => idToCategory(m.id) === l)
      )
    : [];

  const hasCustom = doc
    ? Object.values(doc.measurements).some(m => !idToCategory(m.id))
    : false;

  // Filter by search + valueFilter
  const filteredRows = allRows.filter(m => {
    if (valueFilter === 'with'    && !m.hasValue) return false;
    if (valueFilter === 'without' &&  m.hasValue) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (m.id||'').toLowerCase().includes(q)
      || m.name.toLowerCase().includes(q)
      || (m.fullName||'').toLowerCase().includes(q);
  });

  const handleHighlight = useCallback((name: string | null) => {
    dispatch({ type: 'SET_HIGHLIGHT', name });
  }, [dispatch]);

  const unit = doc?.unit ?? '';

  if (!doc) return null;

  return (
    <div className="editor-panel">
      {/* Category tabs */}
      <div className="cat-tabs">
        {availableCategories.map(letter => (
          <button
            key={letter}
            className={`cat-tab${activeCategory === letter ? ' is-active' : ''}`}
            title={CATEGORY_LABELS[letter]}
            onClick={() => dispatch({ type: 'SET_CATEGORY', category: letter })}
          >
            {letter}
          </button>
        ))}
        {hasCustom && (
          <button
            className={`cat-tab${activeCategory === 'custom' ? ' is-active' : ''}`}
            title="Custom measurements"
            onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'custom' })}
          >
            ★
          </button>
        )}
        <button
          className={`cat-tab${activeCategory === 'all' ? ' is-active' : ''}`}
          title="All measurements"
          onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'all' })}
        >
          All
        </button>
        <span className="cat-tab-label">{CATEGORY_LABELS[activeCategory] ?? activeCategory}</span>
      </div>

      {/* Toolbar: search + filter */}
      <div className="editor-toolbar">
        <div className="search-wrap">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="search-icon">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <input
            className="search-input"
            type="search"
            placeholder="Search ID, name, variable…"
            value={searchQuery}
            onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
            autoComplete="off"
          />
        </div>
        <select
          className="value-filter"
          value={valueFilter}
          onChange={e => dispatch({ type: 'SET_VALUE_FILTER', filter: e.target.value as 'all'|'with'|'without' })}
        >
          <option value="all">All</option>
          <option value="with">With value</option>
          <option value="without">Without value</option>
        </select>
        <span className="editor-count muted">{filteredRows.length} rows</span>
      </div>

      {/* Table */}
      <div className="table-scroll">
        <table className="meas-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}>ID</th>
              <th>Name</th>
              <th style={{ width: 200 }}>Raw value (editable)</th>
              <th style={{ width: 130 }}>Resolved</th>
              <th style={{ width: 160 }}>Variable</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={5} className="empty-cell">No measurements match your filters.</td></tr>
            )}
            {filteredRows.map(m => {
              const isHighlighted = highlighted === m.name;
              const display = m.fullName || m.name;
              const desc = m.desc && m.desc !== display ? m.desc : '';
              const resolved = fmtVal(m.resolved);
              const cm = m.resolved != null ? toCm(m.resolved, unit) : null;
              const formula = isFormula(m.raw);
              return (
                <tr
                  key={m.name}
                  className={[
                    isHighlighted ? 'is-highlighted' : '',
                    m.hasValue && m.error ? 'has-error' : '',
                    !m.hasValue ? 'missing-value' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => handleHighlight(m.name)}
                  onMouseLeave={() => handleHighlight(null)}
                >
                  <td>{m.id ? <code className="badge-id">{m.id}</code> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="cell-name">
                      <span className="cell-name-full" title={display}>{display}</span>
                      {desc && <span className="cell-name-desc" title={desc}>{desc}</span>}
                    </div>
                  </td>
                  <td>
                    <RawCell
                      name={m.name}
                      raw={m.raw}
                      isModified={m.raw !== (originalRaws[m.name] ?? '')}
                      onFocus={() => handleHighlight(m.name)}
                    />
                  </td>
                  <td>
                    {!m.hasValue ? <span className="muted">—</span>
                      : m.error ? <span className="is-error" title={m.error}>err</span>
                      : (
                        <span className={`cell-resolved${formula ? ' is-formula' : ''}`}>
                          {resolved}
                          <span className="unit-label"> {unit}</span>
                          {formula && <span className="badge-formula">f(x)</span>}
                          {cm && <span className="cell-cm">{cm} cm</span>}
                        </span>
                      )}
                  </td>
                  <td><code className="badge-var">{m.name}</code></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(EditorPanel);
