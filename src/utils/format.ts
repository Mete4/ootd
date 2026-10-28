/**
 * Formatting helpers.
 *
 * These use the Intl API, so numbers and dates obey the settings of the device
 * instead of a hard-coded locale.
 */

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const currencyFmtWhole = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Keeps "1 item" and "2 items" correct in every message and screen-reader label. */
export const plural = (n: number, word = 'item') => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Formats a price, for example 20 to "$20.00". */
export const formatPrice = (value?: number | string) => {
  const n = Number(value) || 0;
  return currencyFmt.format(n);
};

/** Formats a price without cents, for example 1250 to "$1,250". */
export const formatPriceWhole = (value?: number | string) => {
  const n = Number(value) || 0;
  return currencyFmtWhole.format(n);
};

/** Formats a large total in a short form, for example 12500 to "$12.5k". */
export const formatPriceCompact = (value?: number | string) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return currencyFmtWhole.format(n);
};

type DateInput = Date | string | number;

/** Formats a date, for example "Aug 20, 2026". */
export const formatDate = (date: DateInput) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Formats a date with its day of the week, for example "Thu, Aug 20, 2026".
 * `long` spells the day out, for example "Thursday, Aug 20, 2026", which a
 * screen reader speaks better.
 */
export const formatDateWithWeekday = (date: DateInput, weekday: 'short' | 'long' = 'short') =>
  new Date(date).toLocaleDateString(undefined, { weekday, month: 'short', day: 'numeric', year: 'numeric' });

/** Formats a long date, for example "Thursday, August 20". */
export const formatDateLong = (date: DateInput) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** Formats a month and a year, for example "August 2026". */
export const formatMonthYear = (date: DateInput) =>
  new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Formats a time, for example "2:30 PM". */
export const formatTime = (date: DateInput) =>
  new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Counts whole calendar days between a past date and today. */
export const daysSince = (date: Date | string | number) => {
  const then = new Date(date);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86400000);
};

/** Says when a share link stops working, in plain words. */
export const expiryLabel = (expiresAt?: string | null) => {
  if (!expiresAt) return 'Never expires.';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return 'Never expires.';
  if (ms <= 0) return 'Expired. Share again to make a new one.';

  // Inside the last day, count hours. They matter then.
  if (ms < 86400000) {
    const hours = Math.max(1, Math.ceil(ms / 3600000));
    return `Deletes itself in ${hours} hour${hours === 1 ? '' : 's'}.`;
  }

  // `round`, not `floor`. A link made one second ago with a 14 day life has
  // 13.99 days left, and `floor` reported that as 13, which reads as a fault.
  const days = Math.round(ms / 86400000);
  if (days <= 1) return 'Deletes itself tomorrow.';
  return `Deletes itself in ${days} days.`;
};

/**
 * Describes when an item was last worn.
 *
 * `Math.ceil` on raw milliseconds reported "1d ago" for an outfit worn the same
 * morning. This compares calendar days instead.
 */
export const relativeDayLabel = (date?: Date | string | number | null) => {
  if (!date) return 'Never worn';
  const d = daysSince(date);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
};

/**
 * Describes when an item was last worn, from its wear timestamps newest first.
 * An outfit planned for a later day is not worn yet, so it does not count.
 */
export const lastWornLabelFrom = (wearDatesNewestFirst: number[]) => {
  const lastWorn = wearDatesNewestFirst.find(t => daysSince(t) >= 0);
  return lastWorn === undefined ? 'Never worn' : relativeDayLabel(lastWorn);
};
