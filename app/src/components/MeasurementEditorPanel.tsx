import { memo, useEffect, useRef, useState } from 'react';
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
  return cm !== null ? cm.toFixed(2) : null;
}

function calculatedText(m: SeamlyMeasurement, unit: string): string {
  if (!m.hasValue) return 'Not set';
  if (m.error) return m.error;
  const cm = m.resolved != null ? toCm(m.resolved, unit) : null;
  return `= ${fmtVal(m.resolved)} ${unit}${cm ? ` (${cm} cm)` : ''}`;
}

interface MeasurementEditorProps {
  measurement: SeamlyMeasurement;
  measurements: Record<string, SeamlyMeasurement>;
  unit: string;
  dependents: string[];
  placeholderZero: boolean;
  nameExists: (name: string) => boolean;
  onApply: (oldName: string, newName: string, value: string, description: string) => void;
  onSelectVariable: (name: string) => void;
}

interface DependencyLinksProps {
  label: string;
  names: string[];
  nameExists: (name: string) => boolean;
  onSelect: (name: string) => void;
}

function DependencyLinks({ label, names, nameExists, onSelect }: DependencyLinksProps) {
  return (
    <div className="measurement-editor-links">
      <span>{label}</span>
      <div className="measurement-editor-links-content">
        {names.length > 0 ? names.map(name => (
          <button key={name} type="button" disabled={!nameExists(name)}
            onClick={() => onSelect(name)}>
            {name}
          </button>
        )) : <em className="measurement-editor-links-empty">None</em>}
      </div>
    </div>
  );
}

interface DependencyTreeProps {
  names: string[];
  measurements: Record<string, SeamlyMeasurement>;
  onSelect: (name: string) => void;
}

function DependencyTree({ names, measurements, onSelect }: DependencyTreeProps) {
  function renderNode(name: string, ancestors: Set<string>): React.ReactNode {
    const dependency = measurements[name];
    const repeated = ancestors.has(name);
    const nextAncestors = new Set(ancestors).add(name);
    return (
      <li key={`${[...ancestors].join('/')}/${name}`}>
        <div className="dependency-tree-node">
          <button type="button" disabled={!dependency} onClick={() => onSelect(name)}>{name}</button>
          {repeated && <em>cycle</em>}
        </div>
        {dependency && !repeated && dependency.dependencies.length > 0 && (
          <ul>{dependency.dependencies.map(child => renderNode(child, nextAncestors))}</ul>
        )}
      </li>
    );
  }

  return (
    <div className="measurement-editor-topology">
      <span>Uses</span>
      <div className="measurement-editor-topology-content">
        {names.length > 0 ? (
          <ul>{names.map(name => renderNode(name, new Set()))}</ul>
        ) : (
          <em className="measurement-editor-links-empty">None</em>
        )}
      </div>
    </div>
  );
}

function MeasurementEditor({
  measurement, measurements, unit, dependents, placeholderZero, nameExists, onApply, onSelectVariable,
}: MeasurementEditorProps) {
  const showZeroPlaceholder = placeholderZero && measurement.raw === '0';
  const [variable, setVariable] = useState(measurement.name);
  const [value, setValue] = useState(showZeroPlaceholder ? '' : measurement.raw);
  const [valueEdited, setValueEdited] = useState(false);
  const [description, setDescription] = useState(measurement.desc);
  const [dependenciesExpanded, setDependenciesExpanded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<number | null>(null);
  const canRename = !idToCategory(measurement.id);

  useEffect(() => {
    setVariable(measurement.name);
    setValue(showZeroPlaceholder ? '' : measurement.raw);
    setValueEdited(false);
    setDescription(measurement.desc);
    setError('');
  }, [measurement.desc, measurement.name, measurement.raw, showZeroPlaceholder]);

  function validate(): string | null {
    const nextVariable = variable.trim();
    if (!/^@?[A-Za-z_][A-Za-z0-9_]*$/.test(nextVariable)) {
      return 'Use letters, numbers, and underscores. An optional @ prefix is allowed.';
    }
    if (nextVariable !== measurement.name && nameExists(nextVariable)) {
      return 'That variable name is already in use.';
    }
    return null;
  }

  function applyImmediately() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError('');
    const nextVariable = variable.trim();
    const nextValue = showZeroPlaceholder && !valueEdited ? measurement.raw : value;
    if (
      nextVariable === measurement.name
      && nextValue === measurement.raw
      && description === measurement.desc
    ) return;
    onApply(measurement.name, nextVariable, nextValue, description);
  }

  useEffect(() => {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError('');
    const nextVariable = variable.trim();
    const nextValue = showZeroPlaceholder && !valueEdited ? measurement.raw : value;
    if (
      nextVariable === measurement.name
      && nextValue === measurement.raw
      && description === measurement.desc
    ) return;
    timerRef.current = window.setTimeout(applyImmediately, 400);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  // `validate` and `applyImmediately` intentionally read the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, measurement.desc, measurement.name, measurement.raw, nameExists, onApply, showZeroPlaceholder, value, valueEdited, variable]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    applyImmediately();
  }

  return (
    <div className="measurement-editor">
      <div className="measurement-editor-row identity-row">
        <div className="measurement-name-field">
          <span>Measurement <code>{measurement.id || 'Custom'}</code></span>
          <strong title={measurement.fullName || measurement.name}>{measurement.fullName || measurement.name}</strong>
          <div className="measurement-name-mobile" aria-hidden="true">
            <code>{measurement.id || 'Custom'}</code>
            <span>|</span>
            <strong title={measurement.fullName || measurement.name}>{measurement.fullName || measurement.name}</strong>
          </div>
        </div>
        <label className="variable-field">
          <span>Variable name</span>
          <input value={variable} onChange={e => setVariable(e.target.value)}
            onKeyDown={onKeyDown} spellCheck={false} disabled={!canRename}
            title={!canRename ? 'Pre-defined variable names cannot be changed' : undefined} />
        </label>
      </div>
      <div className="measurement-editor-row calculation-row">
        <label className="formula-field">
          <span>Formula or value</span>
          <input value={value} placeholder={showZeroPlaceholder ? '0' : undefined}
            onChange={e => {
              setValueEdited(true);
              setValue(e.target.value);
            }}
            onKeyDown={onKeyDown} spellCheck={false} />
        </label>
        <span className="calculation-arrow" aria-hidden="true">-&gt;</span>
        <div className="calculated-field">
          <span>Resolved Value</span>
          <strong className={measurement.error ? 'is-error' : ''}>
            {calculatedText(measurement, unit)}
          </strong>
        </div>
      </div>
      {!dependenciesExpanded && (
        <label className="measurement-description-field">
          <span>Measurement description</span>
          <textarea value={description} rows={2}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add notes or measurement instructions" />
        </label>
      )}
      <div className={`measurement-editor-dependency-section${dependenciesExpanded ? ' is-expanded' : ''}`}>
        <button type="button" className="measurement-editor-dependency-toggle"
          aria-expanded={dependenciesExpanded}
          onClick={() => setDependenciesExpanded(expanded => !expanded)}>
          <span>Dependencies</span>
          <span className="measurement-editor-dependency-toggle-hint">
            {dependenciesExpanded ? 'Hide' : 'Show uses and used by'}
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        {dependenciesExpanded && (
          <div className="measurement-editor-dependencies">
            <DependencyTree names={measurement.dependencies} measurements={measurements}
              onSelect={onSelectVariable} />
            <DependencyLinks label="Used by" names={dependents}
              nameExists={nameExists} onSelect={onSelectVariable} />
          </div>
        )}
      </div>
      {error && <div className="measurement-editor-error">{error}</div>}
    </div>
  );
}

function MeasurementEditorPanel() {
  const { doc, fileName, globalSearch, searchQuery, searchSnapshot, selected } = useAppState();
  const dispatch = useDispatch();
  const measurement = doc && selected ? doc.measurements[selected] : null;
  const canRemove = measurement ? !idToCategory(measurement.id) : false;
  const dependents = doc && measurement
    ? Object.values(doc.measurements)
      .filter(candidate => candidate.dependencies.includes(measurement.name))
      .map(candidate => candidate.name)
    : [];

  return (
    <section className="measurement-editor-panel" aria-label="Measurement editor">
      {doc && (
        <div className="measurement-editor-actions" aria-label="Variable actions">
          <label className="measurement-editor-search">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m11.5 11.5 3 3" />
              <circle cx="7" cy="7" r="4.5" />
            </svg>
            <input type="search" placeholder="Search measurements"
              value={searchQuery}
              onChange={e => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
              autoComplete="off" />
            <button type="button" className={`measurement-editor-global-search${globalSearch ? ' is-active' : ''}`}
              aria-pressed={globalSearch}
              title={globalSearch ? 'Global search enabled: search all categories' : 'Search only the current category'}
              onClick={() => dispatch({ type: 'TOGGLE_GLOBAL_SEARCH' })}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" />
                <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2C6 4 6 12 8 14" />
              </svg>
            </button>
          </label>
          {searchSnapshot && (
            <button type="button" className="measurement-editor-restore-search"
              title={`Restore search: ${searchSnapshot.query}`}
              onClick={() => dispatch({ type: 'RESTORE_SEARCH' })}>
              <span aria-hidden="true">↩</span>
              Search
            </button>
          )}
          <button type="button" onClick={() => dispatch({ type: 'ADD_MEASUREMENT' })}>
            <span aria-hidden="true">+</span> Add
          </button>
          <button type="button" disabled={!measurement}
            onClick={() => measurement && dispatch({ type: 'DUPLICATE_MEASUREMENT', name: measurement.name })}>
            <svg className="measurement-editor-action-icon" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
              <path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" />
            </svg>
            Duplicate
          </button>
          <button type="button" className="is-danger" disabled={!canRemove}
            title={measurement && !canRemove ? 'Pre-defined measurements cannot be removed' : undefined}
            onClick={() => {
              if (!measurement || !canRemove) return;
              if (!window.confirm(`Remove ${measurement.name}? Formulas that use it may stop resolving.`)) return;
              dispatch({ type: 'REMOVE_MEASUREMENT', name: measurement.name });
            }}>
            <span aria-hidden="true">-</span> Remove
          </button>
        </div>
      )}
      {doc && measurement ? (
        <MeasurementEditor measurement={measurement} measurements={doc.measurements}
          unit={doc.unit} dependents={dependents} placeholderZero={fileName === 'new'}
          nameExists={name => Boolean(doc.measurements[name])}
          onApply={(oldName, newName, value, description) => {
            dispatch({ type: 'APPLY_EDIT', oldName, newName, value, description });
          }}
          onSelectVariable={name => dispatch({ type: 'SELECT_MEASUREMENT', name })} />
      ) : (
        <div className="measurement-editor-empty">Select a measurement to edit its variable name or formula.</div>
      )}
    </section>
  );
}

export default memo(MeasurementEditorPanel);
