import { memo } from 'react';
import { CATEGORY_LABELS, CATEGORY_LETTERS, idToCategory } from '../catalog';
import { useAppState, useDispatch } from '../store';

interface CategorySelectorProps {
  placement?: 'desktop' | 'mobile';
}

function CategorySelector({ placement = 'desktop' }: CategorySelectorProps) {
  const { doc, activeCategory } = useAppState();
  const dispatch = useDispatch();

  if (!doc) return null;

  const measurements = Object.values(doc.measurements);
  const availableCategories = CATEGORY_LETTERS.filter(letter =>
    measurements.some(measurement => idToCategory(measurement.id) === letter)
  );
  const hasCustom = measurements.some(measurement => !idToCategory(measurement.id));

  return (
    <nav className={`category-selector category-selector-${placement}`} aria-label="Measurement category">
      {availableCategories.map(letter => (
        <button key={letter} className={`cat-tab${activeCategory === letter ? ' is-active' : ''}`}
          title={CATEGORY_LABELS[letter]}
          onClick={() => dispatch({ type: 'SET_CATEGORY', category: letter })}>
          {letter}
        </button>
      ))}
      {hasCustom && (
        <button className={`cat-tab${activeCategory === 'custom' ? ' is-active' : ''}`}
          title="Custom measurements"
          onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'custom' })}>
          *
        </button>
      )}
      <button className={`cat-tab${activeCategory === 'all' ? ' is-active' : ''}`}
        title="All measurements"
        onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'all' })}>
        All
      </button>
      <span className="cat-tab-label">{CATEGORY_LABELS[activeCategory] ?? activeCategory}</span>
    </nav>
  );
}

export default memo(CategorySelector);
