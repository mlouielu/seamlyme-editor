import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_LETTERS, idToCategory } from '../catalog';
import { RECOMMENDED_FIGURE_MEASUREMENTS } from '../recommended';
import { useAppState, useDispatch } from '../store';

interface CategorySelectorProps {
  placement?: 'desktop' | 'mobile';
}

function CategorySelector({ placement = 'desktop' }: CategorySelectorProps) {
  const { doc, activeCategory } = useAppState();
  const dispatch = useDispatch();
  const selectorRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const selector = selectorRef.current;
    if (!selector) return;

    setCanScrollLeft(selector.scrollLeft > 1);
    setCanScrollRight(selector.scrollLeft + selector.clientWidth < selector.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const selector = selectorRef.current;
    if (!selector) return;

    const resizeObserver = new ResizeObserver(updateScrollIndicators);
    resizeObserver.observe(selector);
    selector.addEventListener('scroll', updateScrollIndicators, { passive: true });
    const frame = requestAnimationFrame(updateScrollIndicators);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      selector.removeEventListener('scroll', updateScrollIndicators);
    };
  }, [activeCategory, updateScrollIndicators]);

  useEffect(() => {
    const selector = selectorRef.current;
    const activeTab = selector?.querySelector<HTMLElement>('.cat-tab.is-active');
    activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeCategory]);

  if (!doc) return null;

  const measurements = Object.values(doc.measurements);
  const availableCategories = CATEGORY_LETTERS.filter(letter =>
    measurements.some(measurement => idToCategory(measurement.id) === letter)
  );
  const errorCount = measurements.filter(measurement => measurement.error).length;
  const recommended = RECOMMENDED_FIGURE_MEASUREMENTS
    .map(name => doc.measurements[name])
    .filter(Boolean);
  const recommendedComplete = recommended.filter(measurement => (measurement.resolved ?? 0) > 0).length;
  const showRecommended = recommended.length > 0;
  const hasCustom = measurements.some(measurement => !idToCategory(measurement.id));

  function labelParts(category: string): { letter: string; name: string } {
    const label = CATEGORY_LABELS[category] ?? category;
    const [letter, ...rest] = label.split('—');
    return {
      letter: letter.trim(),
      name: rest.length > 0 ? rest.join('—').trim() : label,
    };
  }

  function activeLabel(category: string): { chip: string; name: string } {
    if (category === 'recommended') return { chip: '✓', name: `${recommendedComplete}/${recommended.length} Viz` };
    if (category === 'errors') return { chip: '!', name: `${errorCount} errors` };
    if (category === 'custom') return { chip: '*', name: 'Custom' };
    if (category === 'all') return { chip: 'All', name: 'Measurements' };
    return { chip: labelParts(category).letter, name: labelParts(category).name };
  }

  function scrollCategories(direction: -1 | 1) {
    selectorRef.current?.scrollBy({ left: direction * 160, behavior: 'smooth' });
  }

  return (
    <div className={`category-selector-shell category-selector-shell-${placement}`}>
      {errorCount > 0 && (
        <button className={`cat-tab cat-tab-errors${activeCategory === 'errors' ? ' is-active' : ''}`}
          title={`${errorCount} variables have formula errors`}
          onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'errors' })}>
          <span className="cat-tab-chip">!</span>
          <span>{errorCount} errors</span>
        </button>
      )}
      <div className="category-selector-scroll-area">
        <button type="button"
          className={`category-scroll-button is-left${canScrollLeft ? ' is-visible' : ''}`}
          aria-label="Scroll categories left"
          onClick={() => scrollCategories(-1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <nav ref={selectorRef} className={`category-selector category-selector-${placement}`} aria-label="Measurement category">
          {showRecommended && (
            <button className={`cat-tab cat-tab-recommended${activeCategory === 'recommended' ? ' is-active' : ''}`}
              title="Recommended measurements to fill in first"
              onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'recommended' })}>
              {activeCategory === 'recommended' ? (
                <>
                  <span className="cat-tab-chip">{activeLabel('recommended').chip}</span>
                  <span className="cat-tab-name">{activeLabel('recommended').name}</span>
                </>
              ) : (
                <span className="cat-tab-letter">Viz {recommendedComplete}/{recommended.length}</span>
              )}
            </button>
          )}
          <button className={`cat-tab${activeCategory === 'all' ? ' is-active' : ''}`}
            title="All measurements"
            onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'all' })}>
            {activeCategory === 'all' ? (
              <>
                <span className="cat-tab-chip">{activeLabel('all').chip}</span>
                <span className="cat-tab-name">{activeLabel('all').name}</span>
              </>
            ) : (
              <span className="cat-tab-letter">All</span>
            )}
          </button>
          {hasCustom && (
            <button className={`cat-tab${activeCategory === 'custom' ? ' is-active' : ''}`}
              title="Custom measurements"
              onClick={() => dispatch({ type: 'SET_CATEGORY', category: 'custom' })}>
              {activeCategory === 'custom' ? (
                <>
                  <span className="cat-tab-chip">{activeLabel('custom').chip}</span>
                  <span className="cat-tab-name">{activeLabel('custom').name}</span>
                </>
              ) : (
                <span className="cat-tab-letter">*</span>
              )}
            </button>
          )}
          {availableCategories.map(letter => (
            <button key={letter} className={`cat-tab${activeCategory === letter ? ' is-active' : ''}`}
              title={CATEGORY_LABELS[letter]}
              onClick={() => dispatch({ type: 'SET_CATEGORY', category: letter })}>
              {activeCategory === letter ? (
                <>
                  <span className="cat-tab-chip">{activeLabel(letter).chip}</span>
                  <span className="cat-tab-name">{activeLabel(letter).name}</span>
                </>
              ) : (
                <span className="cat-tab-letter">{letter}</span>
              )}
            </button>
          ))}
        </nav>
        <button type="button"
          className={`category-scroll-button is-right${canScrollRight ? ' is-visible' : ''}`}
          aria-label="Scroll categories right"
          onClick={() => scrollCategories(1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default memo(CategorySelector);
