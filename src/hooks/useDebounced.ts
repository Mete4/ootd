import { useEffect, useState } from 'react';

/**
 * Returns the value after it stays the same for `delay` milliseconds.
 *
 * The search fields filter the whole closet on each keystroke. This keeps the
 * text field responsive and runs the filter one time after the user stops.
 */
export function useDebounced<V>(value: V, delay = 180): V {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return settled;
}
