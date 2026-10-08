import { useRef, useCallback, useEffect } from 'react';

// Port of lib/core/utils/debouncer.dart: delays invoking `action` until
// `delayMs` has passed since the last call, cancelling any pending call.
// Used for live place-search-as-you-type requests.
export function useDebouncedCallback<A extends unknown[]>(
  action: (...args: A) => void,
  delayMs = 400
): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => action(...args), delayMs);
    },
    [action, delayMs]
  );
}
