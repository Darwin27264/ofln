import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EASING, THEME_TRANSITION } from '../utils/animationConfig';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  // Backgrounds
  background: string;
  surface: string;
  card: string;
  overlay: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;

  // Borders
  border: string;
  borderLight: string;

  // Interactive
  primary: string;
  primaryText: string;
  secondary: string;
  /** Warm gold — lava / ambient / rare emphasis (not CTA chrome). */
  accent: string;
  /** Label/icon color on `accent` fills. */
  accentText: string;

  // Status
  success: string;
  warning: string;
  error: string;

  // Special
  transparent: string;
  glass: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    // Soft elevation vs white — visible, but not muddy on list cards.
    background: '#FFFFFF',
    surface: '#ECEEF2',
    card: '#EAECEF',
    overlay: 'rgba(0, 0, 0, 0.1)',

    text: '#000000',
    textSecondary: '#334155',
    textTertiary: '#64748B',

    border: '#D8DCE2',
    borderLight: '#E8ECF0',

    primary: '#000000',
    primaryText: '#FFFFFF',
    secondary: '#E2E5E9',
    // Matches AmbientHue / lava deepLight + onboarding Next
    accent: '#D97706',
    accentText: '#FFFFFF',

    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',

    transparent: 'transparent',
    glass: '#F2F2F2',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#0A0A0A',
    surface: '#141414',
    card: '#1A1A1A',
    overlay: 'rgba(255, 255, 255, 0.1)',

    text: '#FFFFFF',
    textSecondary: '#E5E7EB',
    textTertiary: '#9CA3AF',

    border: '#2A2A2A',
    borderLight: '#1F1F1F',

    primary: '#FFFFFF',
    primaryText: '#000000',
    secondary: '#2A2A2A',
    // Matches AmbientHue / lava softDark + onboarding Next
    accent: '#FFC845',
    accentText: '#1A1608',

    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',

    transparent: 'transparent',
    glass: 'rgba(36, 36, 36, 0.75)',
  },
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  /** Apply a saved theme without toggle animation (backup restore). */
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = '@app_theme_mode';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const previousThemeMode = useRef<ThemeMode>('dark');
  // Sync guard — React state alone can miss a double-tap before re-render.
  const transitioningRef = useRef(false);
  // Bumped on unmount so in-flight cover/RAF/dissolve callbacks become no-ops.
  const transitionGenerationRef = useRef(0);
  // Fade overlay sits *above* the tree — never wraps children — so Modals /
  // absolute overlays under screens are not put inside a native opacity layer.
  const fadeOverlay = useRef(new Animated.Value(0)).current;
  const coverAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const rafIdsRef = useRef<number[]>([]);

  const clearRafs = () => {
    for (const id of rafIdsRef.current) cancelAnimationFrame(id);
    rafIdsRef.current = [];
  };

  /** Run `fn` after `frames` animation frames (native paint settle). */
  const afterFrames = (frames: number, fn: () => void) => {
    if (frames <= 0) {
      fn();
      return;
    }
    const id = requestAnimationFrame(() => afterFrames(frames - 1, fn));
    rafIdsRef.current.push(id);
  };

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeMode(savedTheme);
          previousThemeMode.current = savedTheme;
        } else {
          setThemeMode('dark');
          previousThemeMode.current = 'dark';
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    return () => {
      transitionGenerationRef.current += 1;
      coverAnimRef.current?.stop();
      clearRafs();
      transitioningRef.current = false;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    setIsTransitioning(true);

    const newMode = themeMode === 'light' ? 'dark' : 'light';
    const generation = transitionGenerationRef.current;

    // Soft black cover → opaque, swap tokens only under full cover, then dissolve.
    // Never use a white cover (reads as a flash). Semi-opaque covers let the new
    // theme luminance peek through mid-dissolve — that was the remaining flash.
    //
    // Do not stop()/restart mid-flight: transitioningRef blocks re-entry, and
    // stop()'s finished:false callback would clear the guard while RAFs still run.
    clearRafs();

    const coverIn = Animated.timing(fadeOverlay, {
      toValue: THEME_TRANSITION.COVER_OPACITY,
      duration: THEME_TRANSITION.COVER_IN_MS,
      easing: EASING.EASE_OUT,
      useNativeDriver: true,
    });
    coverAnimRef.current = coverIn;

    coverIn.start(({ finished }) => {
      if (!finished || generation !== transitionGenerationRef.current) {
        // Unmount/interrupt only — re-entry is blocked, so this is not a restart path.
        if (generation === transitionGenerationRef.current) {
          fadeOverlay.setValue(0);
          transitioningRef.current = false;
          setIsTransitioning(false);
        }
        return;
      }

      // Settle opaque cover on the native side before swapping tokens.
      afterFrames(THEME_TRANSITION.SETTLE_FRAMES, () => {
        if (generation !== transitionGenerationRef.current) return;

        setThemeMode(newMode);
        previousThemeMode.current = newMode;

        AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch((error) => {
          console.error('Error saving theme:', error);
        });

        // Let the new theme commit under the still-opaque cover, then dissolve.
        afterFrames(THEME_TRANSITION.SETTLE_FRAMES, () => {
          if (generation !== transitionGenerationRef.current) return;

          const dissolve = Animated.timing(fadeOverlay, {
            toValue: 0,
            duration: THEME_TRANSITION.DISSOLVE_MS,
            easing: EASING.STANDARD,
            useNativeDriver: true,
          });
          coverAnimRef.current = dissolve;
          dissolve.start(({ finished: dissolveFinished }) => {
            if (generation !== transitionGenerationRef.current) return;
            if (!dissolveFinished) fadeOverlay.setValue(0);
            transitioningRef.current = false;
            setIsTransitioning(false);
          });
        });
      });
    });
  }, [themeMode, fadeOverlay]);

  /** Quiet apply (backup / restore) — no crossfade. */
  const applyThemeMode = useCallback((mode: ThemeMode) => {
    if (mode !== 'light' && mode !== 'dark') return;
    setThemeMode(mode);
    previousThemeMode.current = mode;
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch((error) => {
      console.error('Error saving theme:', error);
    });
  }, []);

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  const contextValue = useMemo(
    () => ({
      theme,
      toggleTheme,
      setThemeMode: applyThemeMode,
      isDark: themeMode === 'dark',
      isTransitioning,
    }),
    [theme, toggleTheme, applyThemeMode, themeMode, isTransitioning],
  );

  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      <View style={styles.root}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fadeOverlay,
            {
              opacity: fadeOverlay,
              backgroundColor: '#000000',
              // Above CustomAlert (200000) and all in-tree absolute overlays so
              // theme swap never flashes through an open alert. Idle opacity is
              // 0 and pointerEvents stay none — alerts remain tappable.
              zIndex: 300000,
              elevation: 300000,
            },
          ]}
        />
      </View>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
