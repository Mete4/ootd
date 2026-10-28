/**
 * Single source for colors and type sizes.
 *
 * Each screen used to declare its own copy of this palette. The copies drifted
 * apart, and one copy that lacked `danger` crashed the app on web. Import from
 * here instead.
 */
export const C = {
  main: '#121212',
  surface: '#1E1E1E',
  elevated: '#2A2A2A',
  primary: '#EDEDED',
  secondary: '#B0B0B0',
  muted: '#9A9A9A', // smallest readable gray on `surface`
  accent: '#00BFA5',
  accentAlt: '#FFB300',
  subtle: '#333333',
  dark: '#181818',
  danger: '#FF3B30',
  /** Light tint behind an accent icon or on an accent banner. */
  accentTint: '#00BFA522',
  /** Text and icons on top of a photo. */
  onPhoto: '#FFFFFF',
  /** Dark plate under a badge or a button on top of a photo. */
  photoScrim: 'rgba(0,0,0,0.6)',
  /** The dimmed screen behind a bottom sheet. */
  sheetBackdrop: 'rgba(0,0,0,0.8)',
};

/** Opacity of a disabled button or an item that cannot be picked. */
export const DIMMED_OPACITY = 0.4;

/** Corner radius of each kind of element, so that one kind looks the same everywhere. */
export const R = {
  /** Small badges on a photo, such as the item number. */
  badge: 6,
  /** Small photos in a list row. */
  thumbnail: 10,
  /** Text fields, search bars, banners, and buttons inside a sheet or a card. */
  control: 12,
  /** Item tiles, cards and large screen buttons. */
  tile: 16,
  /** Pills, chips and tabs. */
  pill: 22,
};

/** Category colors for the charts. */
export const CAT_COLORS: Record<string, string> = {
  Tops: '#4B7BFF',
  Bottoms: '#00C8B8',
  Jackets: '#FFB300',
  Shoes: '#34C759',
  Misc: '#FF6B35',
};

export const BRAND_COLORS = ['#4B7BFF', '#00C8B8', '#FFB300', '#FF3B30', '#AF52DE', '#34C759'];

/**
 * Type sizes. 11 is the smallest size that stays readable, so no value here is
 * less than 11.
 */
export const T = {
  micro: 11,
  caption: 12,
  footnote: 13,
  body: 15,
  headline: 17,
  title: 22,
  large: 28,
};

/** The smallest touch target that a finger hits reliably. */
export const HIT = 44;

/** hitSlop that grows a small icon to the minimum touch target. */
export const hitSlopFor = (size: number) => {
  const pad = Math.max(0, Math.ceil((HIT - size) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
};
