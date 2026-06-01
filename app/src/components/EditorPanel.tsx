import { memo, useEffect, useRef } from 'react';
import type { SeamlyMeasurement } from '@seamlyme/core';
import { idToCategory } from '../catalog';
import { useAppState, useDispatch } from '../store';

function fmtVal(v: number | null | undefined): string {
  if (v == null) return 'Not set';
  return (v % 1 === 0) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
}

function toCm(val: number, unit: string): string | null {
  let cm: number | null = null;
  if (unit === 'inch' || unit === 'in') cm = val * 2.54;
  else if (unit === 'mm') cm = val / 10;
  return cm !== null ? cm.toFixed(1).replace(/\.0$/, '') : null;
}

function calculatedText(m: SeamlyMeasurement, unit: string): string {
  if (!m.hasValue) return 'Not set';
  if (m.error) return 'Formula error';
  const cm = m.resolved != null ? toCm(m.resolved, unit) : null;
  return `= ${fmtVal(m.resolved)} ${unit}${cm ? ` (${cm} cm)` : ''}`;
}

function EditorPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { doc, activeCategory, searchQuery, valueFilter, highlighted, selected: selectedName } = state;
  const selectedRowRef = useRef<HTMLButtonElement>(null);

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

  const filteredRows = allRows.filter(m => {
    if (valueFilter === 'with' && !m.hasValue) return false;
    if (valueFilter === 'without' && m.hasValue) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (m.id || '').toLowerCase().includes(q)
      || m.name.toLowerCase().includes(q)
      || (m.fullName || '').toLowerCase().includes(q);
  });

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedName, activeCategory]);

  if (!doc) return null;
  return (
    <div className="editor-panel">
      <div className="editor-toolbar">
        <div className="search-wrap">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="search-icon">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <input className="search-input" type="search" placeholder="Search ID, name, variable..."
            value={searchQuery} onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
            autoComplete="off" />
        </div>
        <select className="value-filter" value={valueFilter}
          onChange={e => dispatch({ type: 'SET_VALUE_FILTER', filter: e.target.value as 'all'|'with'|'without' })}>
          <option value="all">All</option>
          <option value="with">With value</option>
          <option value="without">Without value</option>
        </select>
        <span className="editor-count muted">{filteredRows.length} rows</span>
      </div>

      <div className="measurement-list" role="list">
        {filteredRows.length === 0 && <div className="empty-cell">No measurements match your filters.</div>}
        {filteredRows.map(m => (
          <button key={m.name} type="button" role="listitem"
            ref={selectedName === m.name ? selectedRowRef : null}
            className={`measurement-list-row${selectedName === m.name ? ' is-selected' : ''}${highlighted === m.name ? ' is-highlighted' : ''}${!m.hasValue ? ' is-missing' : ''}`}
            onClick={() => dispatch({ type: 'SELECT_MEASUREMENT', name: m.name })}>
            <code className="badge-id">{m.id || '-'}</code>
            <span className="measurement-list-name">
              <strong>{m.fullName || m.name}</strong>
              <code>{m.name}</code>
            </span>
            <span className={`measurement-list-calculated${m.error ? ' is-error' : ''}`}>
              {calculatedText(m, doc.unit)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(EditorPanel);
