import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shirt, Check, AlertTriangle, Search, X } from 'lucide-react';
import { supabase } from './lib/supabase';

const CATEGORIES = ['All', 'Tops', 'Bottoms', 'Jackets', 'Shoes', 'Misc'];

// ─── Rules copied from the app. Keep each one the same as its source. ────────

/** Same as `itemNumber ?? idx + 1` in src/hooks/useWearIndex.ts. */
function numberOf(item: any, items: any[]): number {
  return item.itemNumber ?? items.findIndex(candidate => candidate.id === item.id) + 1;
}

/** Same as `plural` in src/utils/format.ts. */
const plural = (n: number, word = 'item') => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Same as `formatDate` in src/utils/format.ts: the viewer's own date format. */
const formatDate = (date: string | number | Date) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Same as `daysSince` in src/utils/format.ts: whole calendar days, not hours. */
function daysSince(date: string | number | Date) {
  const then = new Date(date);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** Same as `relativeDayLabel` in src/utils/format.ts. */
function relativeDayLabel(date: string | number | Date) {
  const d = daysSince(date);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

// ─── Outfit logic, from src/utils/outfitLogic.ts ─────────────────────────────

function getBaseOutfitKey(itemIds: string[], items: any[]) {
  const selected = itemIds.map(id => items.find((i: any) => i.id === id)).filter(Boolean);
  const tops = selected.filter((i: any) => i.hierarchyCategory === 'Tops').map((i: any) => i.id).sort();
  const bottoms = selected.filter((i: any) => i.hierarchyCategory === 'Bottoms').map((i: any) => i.id).sort();
  const hasLayer = selected.some((i: any) => i.hierarchyCategory === 'Jackets') || tops.length > 1;
  return { tops, bottoms, hasLayer };
}

/**
 * The tops and bottoms of a past outfit. The app sends them as `base`, because
 * archived items are not shared and their categories are not known here.
 * Links saved before that have no `base`, so this falls back to the shared items.
 */
function historyBaseOf(outfit: any, items: any[]): { tops: string[]; bottoms: string[] } {
  if (outfit.base) return outfit.base;
  return getBaseOutfitKey(outfit.itemIds || [], items);
}

/**
 * Returns the dateWorn of the most-recent matching outfit, or null.
 * Matches on tops + bottoms only. If a layer is present, returns null (unique outfit).
 * Requires at least 1 top AND 1 bottom to trigger.
 */
function checkIsDuplicateBase(selectionIds: string[], outfits: any[], items: any[]): string | null {
  const base = getBaseOutfitKey(selectionIds, items);
  if (base.tops.length === 0 || base.bottoms.length === 0) return null;
  if (base.hasLayer) return null;

  const topsStr = base.tops.join(',');
  const bottomsStr = base.bottoms.join(',');

  const sorted = [...outfits].sort((a, b) =>
    new Date(b.dateWorn).getTime() - new Date(a.dateWorn).getTime()
  );

  for (const outfit of sorted) {
    const hist = historyBaseOf(outfit, items);
    if (hist.tops.join(',') === topsStr && hist.bottoms.join(',') === bottomsStr) {
      return outfit.dateWorn as string;
    }
  }
  return null;
}

/**
 * Returns IDs to gray out.
 * - If tops selected → gray bottoms that were worn with ALL of those tops
 * - If bottoms selected → gray tops that were worn with ALL of those bottoms
 * Shoes, Jackets, Misc are NEVER grayed.
 */
function getGrayOutItemIds(selectionIds: string[], outfits: any[], items: any[]): Set<string> {
  const base = getBaseOutfitKey(selectionIds, items);
  const gray = new Set<string>();

  if (base.tops.length > 0) {
    for (const outfit of outfits) {
      const hist = historyBaseOf(outfit, items);
      const containsAllTops = base.tops.every(t => hist.tops.includes(t));
      if (containsAllTops) {
        hist.bottoms.forEach(b => gray.add(b));
      }
    }
  }

  if (base.bottoms.length > 0) {
    for (const outfit of outfits) {
      const hist = historyBaseOf(outfit, items);
      const containsAllBottoms = base.bottoms.every(b => hist.bottoms.includes(b));
      if (containsAllBottoms) {
        hist.tops.forEach(t => gray.add(t));
      }
    }
  }

  return gray;
}

function getLastWornLabel(itemId: string, outfits: any[]): string {
  const itemOutfits = outfits.filter(outfit => (outfit.itemIds || []).includes(itemId));
  if (itemOutfits.length === 0) return 'Never worn';

  const mostRecent = [...itemOutfits].sort((a, b) => new Date(b.dateWorn).getTime() - new Date(a.dateWorn).getTime())[0];
  return relativeDayLabel(mostRecent.dateWorn);
}

// ─── Component ───────────────────────────────────────────────────────────────

// The database refuses a longer name or more items
// (20261014_share_abuse_limits.sql).
const MAX_NAME_LENGTH = 60;
const MAX_SUGGESTED_ITEMS = 50;

/** Says why the database refused a suggestion, in words a friend understands. */
function suggestionErrorText(error: { code?: string; message: string }) {
  if (error.message.includes('too many suggestions')) {
    return 'This closet got many suggestions in the last hour. Try again later.';
  }
  // 42501: the insert policy refused it, because the link expired.
  if (error.code === '42501') return 'This link has expired. Ask your friend for a new one.';
  return 'The suggestion was not sent. Check your connection and try again.';
}

/** The duplicate warning, from the friend's point of view. */
const wornBeforeText = (date: string) => `Your friend wore this top and bottom together on ${formatDate(date)}.`;

function App() {
  const { token } = useParams<{ token: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [outfits, setOutfits] = useState<any[]>([]);
  const [scope, setScope] = useState<'full' | 'vacation'>('full');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [suggestedBy, setSuggestedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    const fetchCloset = async () => {
      // The server returns the closet only for its exact token.
      const { data, error } = await supabase
        .rpc('get_shared_closet', { p_token: token })
        .maybeSingle<{ items_json: any[]; outfits_json: any[]; scope: string }>();

      if (error) {
        console.error('get_shared_closet', error);
        setError('The closet did not load. Check your connection, then reload the page.');
      } else if (!data) {
        // The server returns no row for an unknown or expired token.
        setError('This link does not open a closet. It may have expired. Ask your friend for a new link.');
      } else {
        setItems(data.items_json || []);
        setOutfits(data.outfits_json || []);
        setScope(data.scope === 'vacation' ? 'vacation' : 'full');
      }
      setLoading(false);
    };
    fetchCloset();
  }, [token]);

  const toggleItem = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length > MAX_SUGGESTED_ITEMS) {
      alert(`Pick ${MAX_SUGGESTED_ITEMS} items or fewer.`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('suggestions').insert({
      closet_token: token,
      suggested_by: suggestedBy.trim().slice(0, MAX_NAME_LENGTH) || 'Anonymous Friend',
      item_ids: selectedIds,
    });
    setSubmitting(false);
    if (error) {
      console.error('insert suggestion', error);
      alert(suggestionErrorText(error));
    } else {
      setShowModal(false);
      setSubmitted(true);
      setSelectedIds([]);
      setTimeout(() => setSubmitted(false), 3000);
    }
  };

  // ── Derived state (same logic as mobile OutfitBuilder) ──────────────────

  const grayOutIds = useMemo(() =>
    getGrayOutItemIds(selectedIds, outfits, items),
    [selectedIds, outfits, items]
  );

  const selectedItems = useMemo(
    () => selectedIds.map(id => items.find(item => item.id === id)).filter(Boolean),
    [selectedIds, items]
  );

  const duplicateDate = useMemo(() =>
    checkIsDuplicateBase(selectedIds, outfits, items),
    [selectedIds, outfits, items]
  );

  // Category-filtered items, with grayed items sorted to the END (same as app)
  const filteredItems = useMemo(() => {
    const base = activeCategory === 'All'
      ? items
      : items.filter((item: any) => item.hierarchyCategory === activeCategory);
    const searchText = search.trim().toLowerCase();
    const searched = searchText
      ? base.filter((item: any) => {
          const num = numberOf(item, items);
          return (
            (item.name || '').toLowerCase().includes(searchText) ||
            (item.subCategory || '').toLowerCase().includes(searchText) ||
            (item.brand || '').toLowerCase().includes(searchText) ||
            (item.description || '').toLowerCase().includes(searchText) ||
            (item.color || '').toLowerCase().includes(searchText) ||
            (item.size || '').toLowerCase().includes(searchText) ||
            String(num) === searchText ||
            `#${num}` === searchText
          );
        })
      : base;

    return [...searched].sort((a, b) => {
      const aGray = grayOutIds.has(a.id) ? 1 : 0;
      const bGray = grayOutIds.has(b.id) ? 1 : 0;
      return aGray - bGray;
    });
  }, [items, activeCategory, search, grayOutIds]);

  if (loading) return <div className="loading">Loading closet...</div>;
  if (error) return <div className="error-state"><h2>Closet not available</h2><p>{error}</p></div>;

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="logo">OOTD<span>.</span></h1>
        <div style={{ color: 'var(--secondary)' }}>
          {scope === 'vacation' ? `Packing list · ${plural(items.length)}` : plural(items.length)}
        </div>
      </header>

      <main className="container">
        <div className="hero">
          <h1>Build an outfit</h1>
          <p>Pick clothes from your friend's closet and send them an outfit idea. When you pick an item, the items that your friend already wore with it turn grey.</p>
        </div>

        <div className="canvas">
          {selectedItems.length === 0 ? (
            <div className="canvas-empty">
              <Shirt size={28} color="var(--border)" />
              <div className="canvas-hint">Tap items below to build an outfit</div>
            </div>
          ) : (
            <div className="canvas-scroll">
              {selectedItems.map((item: any) => (
                <div key={item.id} className="canvas-item">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name || item.subCategory} className="canvas-item-img" />
                  ) : (
                    <div className="canvas-item-placeholder">
                      <Shirt size={24} color="var(--secondary)" />
                    </div>
                  )}
                  <button className="canvas-remove-btn" onClick={() => toggleItem(item.id)} aria-label="Remove item">
                    <X size={12} color="var(--primary)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="search-row">
          <div className="search-bar">
            <Search size={16} color="var(--secondary)" />
            <input
              type="text"
              className="search-input"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search.length > 0 && (
              <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs under the search bar */}
        <div className="tabs-container">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Duplicate warning — matches mobile app exactly */}
        {duplicateDate && (
          <div className="warning-banner">
            <AlertTriangle size={18} />
            <span>{wornBeforeText(duplicateDate)} Add a layer to make it different.</span>
          </div>
        )}

        <div className="closet-grid">
          {filteredItems.map((item: any) => {
            const isSelected = selectedIds.includes(item.id);
            const isGrayed = grayOutIds.has(item.id) && !isSelected;
            const num = numberOf(item, items);
            return (
              <div
                key={item.id}
                className={`item-card ${isSelected ? 'selected' : ''} ${isGrayed ? 'grayed' : ''}`}
                onClick={() => toggleItem(item.id)}
              >
                <div className="id-badge">#{num}</div>
                {isSelected && <div className="check-badge"><Check size={12} color="#121212" /></div>}
                {item.imageUrl && !brokenImageIds.has(item.id) ? (
                  // The public address loads when the card comes into view. It
                  // carries a version, so the cache never shows a replaced photo.
                  <img
                    src={item.imageUrl}
                    alt={item.name || item.subCategory}
                    className="item-image"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      console.error('photo did not load', item.imageUrl);
                      setBrokenImageIds(prev => new Set(prev).add(item.id));
                    }}
                  />
                ) : (
                  <div className="item-image placeholder-image">
                    <Shirt size={48} color="var(--border)" />
                  </div>
                )}
                <div className="item-info">
                  <h3 className="item-name">{item.subCategory || item.name || 'Unknown Item'}</h3>
                  <p className="item-category">{item.brand ? `${item.brand} • ` : ''}{item.color}</p>
                  <p className="item-category item-last-worn"><span>{getLastWornLabel(item.id, outfits)}</span></p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating action bar */}
      {selectedIds.length > 0 && !submitted && (
        <div className={`action-bar ${duplicateDate ? 'action-bar-warn' : ''}`}>
          {duplicateDate ? (
            <>
              <AlertTriangle size={18} color="#121212" />
              <div className="action-text" style={{ color: '#121212', maxWidth: '40ch' }}>
                {wornBeforeText(duplicateDate)} Add a layer to make it different.
              </div>
              <button className="btn-primary btn-warn" onClick={() => setShowModal(true)}>
                Suggest Anyway
              </button>
            </>
          ) : (
            <>
              <div className="action-text">
                <span>{selectedIds.length}</span> item{selectedIds.length !== 1 ? 's' : ''} selected
              </div>
              <button className="btn-primary" onClick={() => setShowModal(true)}>
                Suggest Outfit
              </button>
            </>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Send Suggestion</h2>
            {duplicateDate && (
              <div className="modal-dupe-notice">
                <AlertTriangle size={16} />
                <span>{wornBeforeText(duplicateDate)} You can still suggest it.</span>
              </div>
            )}
            <p style={{ color: 'var(--secondary)', marginBottom: '1.5rem' }}>
              Add your name so your friend knows who suggested this!
            </p>
            <input
              type="text"
              className="input-field"
              placeholder="Your Name (optional)"
              maxLength={MAX_NAME_LENGTH}
              value={suggestedBy}
              onChange={e => setSuggestedBy(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setShowModal(false)} disabled={submitting}>
                Cancel
              </button>
              <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitted && (
        <div className="action-bar" style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }}>
          <Check color="#121212" />
          <span style={{ color: '#121212', fontWeight: 700 }}>Suggestion Sent!</span>
        </div>
      )}
    </div>
  );
}

export default App;
