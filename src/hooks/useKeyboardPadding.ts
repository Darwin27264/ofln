import { useEffect, useState, useRef } from "react";
import { Keyboard, Platform, KeyboardEvent, Animated, Easing } from "react-native";

export function useKeyboardPadding() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Use keyboardWillShow on iOS for smooth animations, keyboardDidShow on Android
    // On Android, keyboardWillShow may not be available, so we use keyboardDidShow
    // but we'll animate it smoothly
    const showEvent = Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const handleShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
      
      // Animate the height change smoothly
      // iOS provides duration in the event, Android doesn't, so we use a reasonable default
      const duration = event.duration 
        ? event.duration 
        : Platform.OS === "android" 
          ? 250 // Android default animation duration
          : 250;
      
      Animated.timing(animatedHeight, {
        toValue: height,
        duration: duration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
        useNativeDriver: false, // Padding animations can't use native driver
      }).start();
    };

    const handleHide = (event?: KeyboardEvent) => {
      setKeyboardHeight(0);
      
      // Animate the height change smoothly
      const duration = event?.duration 
        ? event.duration 
        : Platform.OS === "android" 
          ? 250 
          : 250;
      
      Animated.timing(animatedHeight, {
        toValue: 0,
        duration: duration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    };

    const showListener = Keyboard.addListener(showEvent, handleShow);
    const hideListener = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [animatedHeight]);

  return { keyboardHeight, animatedHeight };
}

