import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    // Soft elevation vs white — visible, but not muddy on list cards.
    background: '#FFFFFF',
    surface: '#F7F7F7',
    card: '#F4F4F4',
    overlay: 'rgba(0, 0, 0, 0.1)',

    text: '#000000',
    textSecondary: '#334155',
    textTertiary: '#64748B',

    border: '#E2E8F0',
    borderLight: '#F1F5F9',

    primary: '#000000',
    primaryText: '#FFFFFF',
    secondary: '#F0F0F0',
    // Matches AmbientHue / lava deepLight + onboarding Next
    accent: '#C9A227',
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
    accent: '#F0D78C',
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
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const previousThemeMode = useRef<ThemeMode>('light');
  // Fade overlay sits *above* the tree — never wraps children — so Modals /
  // absolute overlays under screens are not put inside a native opacity layer.
  const fadeOverlay = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeMode(savedTheme);
          previousThemeMode.current = savedTheme;
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    const newMode = themeMode === 'light' ? 'dark' : 'light';

    Animated.timing(fadeOverlay, {
      toValue: 0.35,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setThemeMode(newMode);
      previousThemeMode.current = newMode;

      AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch((error) => {
        console.error('Error saving theme:', error);
      });

      Animated.timing(fadeOverlay, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  /** Quiet apply (backup / restore) — no crossfade. */
  const applyThemeMode = (mode: ThemeMode) => {
    if (mode !== 'light' && mode !== 'dark') return;
    setThemeMode(mode);
    previousThemeMode.current = mode;
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch((error) => {
      console.error('Error saving theme:', error);
    });
  };

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setThemeMode: applyThemeMode,
        isDark: themeMode === 'dark',
        isTransitioning,
      }}
    >
      <View style={styles.root}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fadeOverlay,
            {
              opacity: fadeOverlay,
              backgroundColor: '#000000',
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
    zIndex: 100000,
    elevation: 100000,
  },
});
