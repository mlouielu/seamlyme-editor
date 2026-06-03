import { memo, useEffect, useRef } from 'react';
import type { SeamlyMeasurement } from '@seamlyme/core';
import { idToCategory } from '../catalog';
import { RECOMMENDED_FIGURE_MEASUREMENTS, RECOMMENDED_GROUP_BY_NAME } from '../recommended';
import { useAppState, useDispatch } from '../store';
import { NEW_FILE_NAME } from '../config';

function fmtVal(v: number | null | undefined): string {
  if (v == null) return 'Not set';
  return v.toFixed(2);
}

function toCm(val: number, unit: string): string | null {
  let cm: number | null = null;
  if (unit === 'inch' || unit === 'in') cm = val * 2.54;
  else if (unit === 'mm') cm = val / 10;
  return cm !== null ? cm.toFixed(2) : null;
}

function CalculatedValue({
  measurement, unit, placeholderZero,
}: {
  measurement: SeamlyMeasurement;
  unit: string;
  placeholderZero: boolean;
}) {
  if (!measurement.hasValue || (placeholderZero && measurement.raw === '0')) return <>Not set</>;
  if (measurement.error) return <>{measurement.error}</>;

  const isFormula = measurement.dependencies.length > 0;
  const cm = measurement.resolved != null ? toCm(measurement.resolved, unit) : null;

  return (
    <>
      <span className={`measurement-list-calculated-line${isFormula ? ' is-formula' : ''}`}>
        <span className="measurement-list-calculated-prefix">=</span>
        <span className="measurement-list-calculated-number">{fmtVal(measurement.resolved)}</span>
        <span>{unit}</span>
      </span>
      {cm && (
        <span className="measurement-list-calculated-line is-secondary">
          <span className="measurement-list-calculated-prefix" />
          <span className="measurement-list-calculated-number">{cm}</span>
          <span>cm</span>
        </span>
      )}
    </>
  );
}

function EditorPanel({ onRowClick }: { onRowClick?: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { doc, activeCategory, fileName, searchQuery, globalSearch, valueFilter, highlighted, selected: selectedName } = state;
  const selectedRowRef = useRef<HTMLDivElement>(null);

  const allRows: SeamlyMeasurement[] = doc
    ? Object.values(doc.measurements).filter(m => {
        if (globalSearch && searchQuery) return true;
        const cat = idToCategory(m.id);
        if (activeCategory === 'recommended') return RECOMMENDED_FIGURE_MEASUREMENTS.includes(m.name);
        if (activeCategory === 'errors') return Boolean(m.error);
        if (activeCategory === 'custom') return !cat;
        if (activeCategory !== 'all') return cat === activeCategory;
        return true;
      }).sort((a, b) => {
        if (activeCategory === 'recommended') {
          return RECOMMENDED_FIGURE_MEASUREMENTS.indexOf(a.name) - RECOMMENDED_FIGURE_MEASUREMENTS.indexOf(b.name);
        }
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
        <div className="search-wrap editor-toolbar-search">
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
        {filteredRows.map((m, idx) => {
          const missing = !m.hasValue || (fileName === NEW_FILE_NAME && m.raw === '0');
          const groupLabel = activeCategory === 'recommended' ? RECOMMENDED_GROUP_BY_NAME[m.name] : undefined;
          const showHeader = groupLabel !== undefined && groupLabel !== RECOMMENDED_GROUP_BY_NAME[filteredRows[idx - 1]?.name];
          return (
            <div key={m.name}>
              {showHeader && (
                <div className="measurement-list-section-header" aria-hidden="true">
                  {groupLabel}
                </div>
              )}
              <div role="listitem"
                ref={selectedName === m.name ? selectedRowRef : null}
                className={`measurement-list-row${selectedName === m.name ? ' is-selected' : ''}${highlighted === m.name ? ' is-highlighted' : ''}${missing ? ' is-missing' : ''}${m.error ? ' has-error' : ''}`}
              >
                <button type="button" className="measurement-list-select"
                  onClick={() => {
                    dispatch({ type: searchQuery ? 'SELECT_SEARCH_RESULT' : 'SELECT_MEASUREMENT', name: m.name });
                    onRowClick?.();
                  }}>
                  <code className="badge-id">{m.id || '-'}</code>
                  <span className="measurement-list-name">
                    <strong>{m.fullName || m.name}</strong>
                    <code>{m.name}</code>
                  </span>
                  <span className={`measurement-list-calculated${m.error ? ' is-error' : ''}`}
                    title={m.error ?? undefined}>
                    <CalculatedValue measurement={m} unit={doc.unit} placeholderZero={fileName === NEW_FILE_NAME} />
                  </span>
                </button>
                <div className="measurement-list-actions">
                  {m.hasValue && m.dependencies.length === 0 && !(fileName === NEW_FILE_NAME && m.raw === '0') && (
                    <button type="button" className="measurement-list-clear"
                      title="Clear value"
                      onClick={() => dispatch({ type: 'APPLY_EDIT', oldName: m.name, newName: m.name, value: '', description: m.desc })}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4"/>
                      </svg>
                    </button>
                  )}
                  {searchQuery && (
                    <button type="button" className="measurement-list-jump"
                      title={`Clear search and open ${idToCategory(m.id) ?? 'Custom'} category`}
                      aria-label={`Clear search and open ${idToCategory(m.id) ?? 'Custom'} category`}
                      onClick={() => dispatch({ type: 'JUMP_FROM_SEARCH', name: m.name })}>
                      <span aria-hidden="true">↗</span>
                      {idToCategory(m.id) ?? '*'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(EditorPanel);
