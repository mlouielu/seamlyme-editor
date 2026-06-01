import { memo, useEffect, useRef, useState } from 'react';
import type { SeamlyMeasurement } from '@seamlyme/core';
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

interface MeasurementEditorProps {
  measurement: SeamlyMeasurement;
  measurements: Record<string, SeamlyMeasurement>;
  unit: string;
  dependents: string[];
  nameExists: (name: string) => boolean;
  onApply: (oldName: string, newName: string, value: string) => void;
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
  measurement, measurements, unit, dependents, nameExists, onApply, onSelectVariable,
}: MeasurementEditorProps) {
  const [variable, setVariable] = useState(measurement.name);
  const [value, setValue] = useState(measurement.raw);
  const [error, setError] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setVariable(measurement.name);
    setValue(measurement.raw);
    setError('');
  }, [measurement.name, measurement.raw]);

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
    if (nextVariable === measurement.name && value === measurement.raw) return;
    onApply(measurement.name, nextVariable, value);
  }

  useEffect(() => {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError('');
    const nextVariable = variable.trim();
    if (nextVariable === measurement.name && value === measurement.raw) return;
    timerRef.current = window.setTimeout(applyImmediately, 400);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  // `validate` and `applyImmediately` intentionally read the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurement.name, measurement.raw, nameExists, onApply, value, variable]);

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
            onKeyDown={onKeyDown} spellCheck={false} />
        </label>
      </div>
      {measurement.desc && <div className="measurement-editor-desc">{measurement.desc}</div>}
      <div className="measurement-editor-row calculation-row">
        <label className="formula-field">
          <span>Formula or value</span>
          <input value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={onKeyDown} spellCheck={false} />
        </label>
        <span className="calculation-arrow" aria-hidden="true">-&gt;</span>
        <div className="calculated-field">
          <span>Read-only result</span>
          <strong className={measurement.error ? 'is-error' : ''}>
            {calculatedText(measurement, unit)}
          </strong>
        </div>
      </div>
      <div className="measurement-editor-dependencies">
        <DependencyTree names={measurement.dependencies} measurements={measurements}
          onSelect={onSelectVariable} />
        <DependencyLinks label="Used by" names={dependents}
          nameExists={nameExists} onSelect={onSelectVariable} />
      </div>
      {error && <div className="measurement-editor-error">{error}</div>}
    </div>
  );
}

function MeasurementEditorPanel() {
  const { doc, selected } = useAppState();
  const dispatch = useDispatch();
  const measurement = doc && selected ? doc.measurements[selected] : null;
  const dependents = doc && measurement
    ? Object.values(doc.measurements)
      .filter(candidate => candidate.dependencies.includes(measurement.name))
      .map(candidate => candidate.name)
    : [];

  return (
    <section className="measurement-editor-panel" aria-label="Measurement editor">
      {doc && measurement ? (
        <MeasurementEditor measurement={measurement} measurements={doc.measurements}
          unit={doc.unit} dependents={dependents}
          nameExists={name => Boolean(doc.measurements[name])}
          onApply={(oldName, newName, value) => {
            dispatch({ type: 'APPLY_EDIT', oldName, newName, value });
          }}
          onSelectVariable={name => dispatch({ type: 'SELECT_MEASUREMENT', name })} />
      ) : (
        <div className="measurement-editor-empty">Select a measurement to edit its variable name or formula.</div>
      )}
    </section>
  );
}

export default memo(MeasurementEditorPanel);
