/**
 * Ambient motion preference provider.
 *
 * Exists as its own context rather than a prop so the five hue surfaces —
 * chat canvas, app-shell edge, onboarding lava, composer listening glow and the
 * response loader — can read it without threading a boolean through
 * ConversationScreen, ChatComposer and MessageList.
 *
 * `useAmbientMotion` falls back to the default instead of throwing when no
 * provider is mounted, so a hue component can be rendered in isolation (tests,
 * previews) without also standing up this provider.
 */
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AMBIENT_MOTION_STORAGE_KEY,
  DEFAULT_AMBIENT_MOTION,
  parseAmbientMotion,
  serializeAmbientMotion,
} from '../utils/ambientMotion';

type AmbientMotionContextType = {
  /** True when hue blobs should drift. */
  ambientMotion: boolean;
  setAmbientMotion: (enabled: boolean) => void;
  toggleAmbientMotion: () => void;
};

const FALLBACK: AmbientMotionContextType = {
  ambientMotion: DEFAULT_AMBIENT_MOTION,
  setAmbientMotion: () => {},
  toggleAmbientMotion: () => {},
};

const AmbientMotionContext = createContext<AmbientMotionContextType | undefined>(
  undefined,
);

export const AmbientMotionProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [ambientMotion, setAmbientMotionState] = useState(DEFAULT_AMBIENT_MOTION);

  useEffect(() => {
    AsyncStorage.getItem(AMBIENT_MOTION_STORAGE_KEY)
      .then((raw) => {
        const saved = parseAmbientMotion(raw);
        if (saved != null) {
          setAmbientMotionState(saved);
        }
      })
      .catch((error) => {
        console.error('Error loading ambient motion preference:', error);
      });
  }, []);

  const setAmbientMotion = useCallback((enabled: boolean) => {
    setAmbientMotionState(enabled);
    AsyncStorage.setItem(
      AMBIENT_MOTION_STORAGE_KEY,
      serializeAmbientMotion(enabled),
    ).catch((error) => {
      console.error('Error saving ambient motion preference:', error);
    });
  }, []);

  const toggleAmbientMotion = useCallback(() => {
    setAmbientMotionState((prev) => {
      const next = !prev;
      AsyncStorage.setItem(
        AMBIENT_MOTION_STORAGE_KEY,
        serializeAmbientMotion(next),
      ).catch((error) => {
        console.error('Error saving ambient motion preference:', error);
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ ambientMotion, setAmbientMotion, toggleAmbientMotion }),
    [ambientMotion, setAmbientMotion, toggleAmbientMotion],
  );

  return (
    <AmbientMotionContext.Provider value={value}>
      {children}
    </AmbientMotionContext.Provider>
  );
};

export const useAmbientMotion = (): AmbientMotionContextType =>
  useContext(AmbientMotionContext) ?? FALLBACK;
