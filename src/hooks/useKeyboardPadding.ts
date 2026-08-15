import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';

/** Get current keyboard height if visible (RN 0.76+). Returns 0 if closed or unavailable. */
function getKeyboardHeight(): number {
  try {
    const metrics = (
      Keyboard as typeof Keyboard & { metrics?: () => { height: number } }
    ).metrics?.();
    if (metrics && typeof metrics.height === 'number' && metrics.height > 0) {
      return metrics.height;
    }
  } catch {
    // metrics() may not exist on older RN
  }
  return 0;
}

/** Staggered syncs on mount: keyboard event can fire before we subscribe. */
const MOUNT_SYNC_DELAYS_MS = [0, 150, 400, 700];

/**
 * Android only gets `did*` (keyboard already on screen). A long follow-up
 * animation feels like lag — keep a short catch-up only.
 */
export const KEYBOARD_CATCHUP_MS = 40;
/** iOS fallback when `will*` omits duration. */
export const KEYBOARD_IOS_DEFAULT_MS = 250;

export function keyboardAnimDuration(
  event: { duration?: number },
  platform: typeof Platform.OS = Platform.OS,
): number {
  if (typeof event.duration === 'number' && event.duration > 0) {
    return event.duration;
  }
  return platform === 'android' ? KEYBOARD_CATCHUP_MS : KEYBOARD_IOS_DEFAULT_MS;
}

/**
 * Tracks keyboard height for composer / empty-state layout.
 * `keyboardDuration` matches the IME when the OS reports it (iOS `will*`);
 * on Android `did*` it stays short so chrome doesn't chase a finished keyboard.
 */
export function useKeyboardPadding() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardDuration, setKeyboardDuration] = useState(
    Platform.OS === 'android' ? KEYBOARD_CATCHUP_MS : KEYBOARD_IOS_DEFAULT_MS,
  );
  const syncRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    // Prefer `will*` so animation can start with the IME. Android usually only
    // emits `did*`; we still listen for `will*` on OEMs that provide it.
    const showEvents =
      Platform.OS === 'ios'
        ? (['keyboardWillShow'] as const)
        : (['keyboardWillShow', 'keyboardDidShow'] as const);
    const hideEvents =
      Platform.OS === 'ios'
        ? (['keyboardWillHide'] as const)
        : (['keyboardWillHide', 'keyboardDidHide'] as const);

    const lastHeightRef = { current: 0 };

    const handleShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      if (height <= 0) return;
      // will* + did* can both fire with the same height — don't restart chrome.
      if (height === lastHeightRef.current) return;
      lastHeightRef.current = height;
      setKeyboardDuration(keyboardAnimDuration(event));
      setKeyboardHeight(height);
    };

    const handleHide = (event: KeyboardEvent) => {
      lastHeightRef.current = 0;
      setKeyboardDuration(keyboardAnimDuration(event));
      setKeyboardHeight(0);
    };

    const showSubs = showEvents.map((name) =>
      Keyboard.addListener(name, handleShow),
    );
    const hideSubs = hideEvents.map((name) =>
      Keyboard.addListener(name, handleHide),
    );

    const sync = () => {
      const h = getKeyboardHeight();
      if (h > 0) {
        setKeyboardHeight(h);
      }
    };
    syncRef.current = sync;

    const timeouts = MOUNT_SYNC_DELAYS_MS.map((delay) => setTimeout(sync, delay));

    return () => {
      showSubs.forEach((s) => s.remove());
      hideSubs.forEach((s) => s.remove());
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  const syncKeyboardState = useCallback(() => {
    syncRef.current();
  }, []);

  return { keyboardHeight, keyboardDuration, syncKeyboardState };
}
