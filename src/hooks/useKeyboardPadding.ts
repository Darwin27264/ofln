import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Platform, KeyboardEvent, Animated, Easing } from "react-native";

/** Get current keyboard height if visible (RN 0.76+). Returns 0 if closed or unavailable. */
function getKeyboardHeight(): number {
  try {
    const metrics = (Keyboard as typeof Keyboard & { metrics?: () => { height: number } }).metrics?.();
    if (metrics && typeof metrics.height === "number" && metrics.height > 0) return metrics.height;
  } catch {
    // metrics() may not exist on older RN
  }
  return 0;
}

const KEYBOARD_ANIM_DURATION = 250;
/** Staggered syncs on mount: keyboard event can fire before we subscribe (all devices). metrics() can be late. */
const MOUNT_SYNC_DELAYS_MS = [0, 150, 400, 700];

export function useKeyboardPadding() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const syncRef = useRef<() => void>(() => {});

  // Subscribe in useLayoutEffect so we don't miss keyboardDidShow when it fires before useEffect
  useLayoutEffect(() => {
    const showEvent = Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const handleShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
      // Set animated value immediately so padding is applied without waiting for animation
      animatedHeight.setValue(height);
      Animated.timing(animatedHeight, {
        toValue: height,
        duration: typeof event.duration === "number" && event.duration > 0 ? event.duration : KEYBOARD_ANIM_DURATION,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    };

    const handleHide = (event?: KeyboardEvent) => {
      setKeyboardHeight(0);
      const duration = (event && (event as { duration?: number }).duration) || KEYBOARD_ANIM_DURATION;
      Animated.timing(animatedHeight, {
        toValue: 0,
        duration,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    const sync = () => {
      const h = getKeyboardHeight();
      if (h > 0) {
        setKeyboardHeight(h);
        animatedHeight.setValue(h);
      }
    };
    syncRef.current = sync;

    const timeouts = MOUNT_SYNC_DELAYS_MS.map((delay) => setTimeout(sync, delay));

    return () => {
      showSub.remove();
      hideSub.remove();
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [animatedHeight]);

  const syncKeyboardState = useCallback(() => {
    syncRef.current();
  }, []);

  return { keyboardHeight, animatedHeight, syncKeyboardState };
}
