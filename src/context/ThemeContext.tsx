import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
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
  accent: string;
  
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
    background: '#FFFFFF',
    surface: '#F8F9FA',
    card: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.1)',
    
    text: '#000000',
    textSecondary: '#334155',
    textTertiary: '#94A3B8',
    
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    
    primary: '#000000',
    primaryText: '#FFFFFF',
    secondary: '#EAEAEA',
    accent: '#2563EB',
    
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    
    transparent: 'transparent',
    glass: 'rgba(255, 255, 255, 0.8)',
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
    accent: '#3B82F6',
    
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    
    transparent: 'transparent',
    glass: 'rgba(26, 26, 26, 0.8)',
  },
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@app_theme_mode';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Animation value for smooth theme transition
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousThemeMode = useRef<ThemeMode>('light');

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

  const toggleTheme = async () => {
    setIsTransitioning(true);
    
    const newMode = themeMode === 'light' ? 'dark' : 'light';
    
    // Animate fade out
    Animated.timing(fadeAnim, {
      toValue: 0.3,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      // Change theme at the midpoint of the transition
      setThemeMode(newMode);
      previousThemeMode.current = newMode;
      
      // Save to storage
      AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch((error) => {
        console.error('Error saving theme:', error);
      });
      
      // Animate fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  if (!isInitialized) {
    return null; // Or a loading screen
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        isDark: themeMode === 'dark',
        isTransitioning,
      }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
        }}
      >
        {children}
      </Animated.View>
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

