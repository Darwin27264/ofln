/**
 * Center-focused ambient hue for the empty chat canvas.
 * Palette shifts with chat mode (default gold, temporary violet, perspective teal)
 * via a soft crossfade — never an abrupt swap.
 * - Handoff from onboarding: edge energy gathers to the middle
 * - Cold empty chat: subtle fade-in after load
 * - Keyboard / input focus: slides down and fades out
 * - New empty chat: fades back in (any mode)
 *
 * Four oversized blobs rather than the nine it used to stack: with a Gaussian
 * falloff (see hue/hueTokens.ts) each blob covers far more ground, and fewer
 * alpha-composited layers means no lens-shaped seams where they overlap.
 *
 * Mode crossfade keeps two persistent slots. The previous implementation swapped
 * a single GlowLayer for a pair (and back) via `crossfading` state — that
 * remounted eight masked SVGs and restarted every drift loop, which is the
 * hitch you feel between Normal / Temporary / Perspective.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAmbientMotion } from '../context/AmbientMotionContext';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';
import {
  HueField,
  huePalette,
  type HueBlobExtras,
  type HueBlobSpec,
  type HueMode,
} from './hue';

const { width: W, height: H } = Dimensions.get('window');

const MODE_CROSSFADE_MS = 480;

export type AmbientHueMode = HueMode;

/** Geometry + drift — independent of palette so extras stay referentially stable. */
type AmbientBlobGeom = {
  id: string;
  width: number;
  height: number;
  left: number;
  top: number;
  edgeLeft: number;
  edgeTop: number;
  dx: number;
  dy: number;
  duration: number;
  /** Which palette swatch feeds this blob. */
  swatch: 'deep' | 'soft' | 'fade';
  peakDark: number;
  peakLight: number;
};

const BLOB_GEOM: readonly AmbientBlobGeom[] = [
  {
    id: 'core',
    width: W * 1.5,
    height: H * 0.72,
    left: -W * 0.25,
    top: H * 0.1,
    edgeLeft: W * 0.18,
    edgeTop: H * 0.22,
    dx: -105,
    dy: 78,
    duration: 4700,
    swatch: 'soft',
    peakDark: 0.19,
    peakLight: 0.115,
  },
  {
    id: 'left',
    width: W * 1.15,
    height: H * 0.58,
    left: -W * 0.355,
    top: H * 0.18,
    edgeLeft: -W * 0.28,
    edgeTop: H * 0.16,
    dx: 117,
    dy: -72,
    duration: 5400,
    swatch: 'deep',
    peakDark: 0.13,
    peakLight: 0.08,
  },
  {
    id: 'right',
    width: W * 1.15,
    height: H * 0.58,
    left: W * 0.225,
    top: H * 0.15,
    edgeLeft: W * 0.32,
    edgeTop: H * 0.14,
    dx: -107,
    dy: 95,
    duration: 5050,
    swatch: 'fade',
    peakDark: 0.13,
    peakLight: 0.08,
  },
  {
    id: 'low',
    width: W * 1.3,
    height: H * 0.5,
    left: -W * 0.15,
    top: H * 0.35,
    edgeLeft: 0,
    edgeTop: H * 0.28,
    dx: 72,
    dy: -100,
    duration: 5800,
    swatch: 'soft',
    peakDark: 0.1,
    peakLight: 0.06,
  },
];

function buildBlobs(mode: AmbientHueMode, isDark: boolean): HueBlobSpec[] {
  const palette = huePalette(mode, isDark);
  return BLOB_GEOM.map((g) => ({
    id: g.id,
    width: g.width,
    height: g.height,
    left: g.left,
    top: g.top,
    color: palette[g.swatch],
    peak: isDark ? g.peakDark : g.peakLight,
    dx: g.dx,
    dy: g.dy,
    duration: g.duration,
  }));
}

function GlowLayer({
  mode,
  isDark,
  focus,
  motionEnabled,
  layerOpacity,
}: {
  mode: AmbientHueMode;
  isDark: boolean;
  focus: Animated.Value;
  motionEnabled: boolean;
  layerOpacity: Animated.Value;
}) {
  const blobs = useMemo(() => buildBlobs(mode, isDark), [mode, isDark]);

  // Geometry only — must not rebuild when the palette swaps, or every HueBlob
  // drops its memo and re-rasterizes its SVG mid-crossfade.
  const extras = useMemo(() => {
    const map: Record<string, HueBlobExtras> = {};
    for (const g of BLOB_GEOM) {
      map[g.id] = {
        offsetX: focus.interpolate({
          inputRange: [0, 1],
          outputRange: [g.edgeLeft, 0],
        }),
        offsetY: focus.interpolate({
          inputRange: [0, 1],
          outputRange: [g.edgeTop, 0],
        }),
      };
    }
    return map;
  }, [focus]);

  return (
    <HueField
      blobs={blobs}
      isDark={isDark}
      motionEnabled={motionEnabled}
      extras={extras}
      style={{ opacity: layerOpacity }}
    />
  );
}

export type AmbientHueProps = {
  /** Empty chat canvas (any mode). */
  active: boolean;
  /** Keyboard / input focused — hue slides down and out. */
  keyboardActive: boolean;
  /** Chat mode — shifts the hue family. */
  mode?: AmbientHueMode;
  /** One-shot: arrive from onboarding edge layout → gather to center. */
  handoff?: boolean;
  onHandoffConsumed?: () => void;
};

export function AmbientHue({
  active,
  keyboardActive,
  mode = 'default',
  handoff = false,
  onHandoffConsumed,
}: AmbientHueProps) {
  const { isDark } = useTheme();
  const { ambientMotion } = useAmbientMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const focus = useRef(new Animated.Value(handoff ? 0 : 1)).current;
  const bloom = useRef(new Animated.Value(handoff ? 1.18 : 1)).current;
  const opacityA = useRef(new Animated.Value(1)).current;
  const opacityB = useRef(new Animated.Value(0)).current;
  const readyRef = useRef(false);
  const handoffPlayed = useRef(false);
  const onHandoffConsumedRef = useRef(onHandoffConsumed);
  onHandoffConsumedRef.current = onHandoffConsumed;
  /** Which slot is the settled (visible) front after the last completed fade. */
  const frontIsA = useRef(true);
  const targetModeRef = useRef(mode);
  const crossAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  /**
   * Slot that was in front when a mode change was queued. The fade runs in a
   * follow-up effect so the hidden slot's new palette is committed before we
   * start raising its opacity (otherwise the old colors fade in for a frame).
   */
  const pendingOutgoingIsA = useRef<boolean | null>(null);

  const [modeA, setModeA] = useState<AmbientHueMode>(mode);
  const [modeB, setModeB] = useState<AmbientHueMode>(mode);
  const [crossGen, setCrossGen] = useState(0);
  /** Second slot mounts on the first mode change — idle empty chat stays at 4 blobs. */
  const [slotBMounted, setSlotBMounted] = useState(false);

  // Queue: paint the new palette onto the hidden slot.
  useEffect(() => {
    if (mode === targetModeRef.current) return;
    targetModeRef.current = mode;

    const showingA = frontIsA.current;
    pendingOutgoingIsA.current = showingA;
    if (showingA) {
      setModeB(mode);
    } else {
      setModeA(mode);
    }
    frontIsA.current = !showingA;
    setSlotBMounted(true);
    setCrossGen((g) => g + 1);
  }, [mode]);

  // Run: crossfade only after the hidden slot has the new palette.
  useEffect(() => {
    if (crossGen === 0) return;
    const showingA = pendingOutgoingIsA.current;
    if (showingA === null) return;
    pendingOutgoingIsA.current = null;

    const frontOp = showingA ? opacityA : opacityB;
    const backOp = showingA ? opacityB : opacityA;

    crossAnimRef.current?.stop();
    // Slot we are fading in may still hold opacity from an interrupted fade in
    // the other direction — zero it so a freshly painted palette never pops in
    // mid-strength. Fast toggle-back still looks fine: the outgoing side keeps
    // its residual weight and we only raise the returning slot from 0.
    backOp.setValue(0);
    bloom.setValue(1.06);

    const anim = Animated.parallel([
      Animated.timing(frontOp, {
        toValue: 0,
        duration: MODE_CROSSFADE_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(backOp, {
        toValue: 1,
        duration: MODE_CROSSFADE_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bloom, {
        toValue: 1,
        duration: MODE_CROSSFADE_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]);
    crossAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) crossAnimRef.current = null;
    });
    return () => {
      anim.stop();
    };
  }, [crossGen, opacityA, opacityB, bloom]);

  // Show / hide + keyboard exit
  useEffect(() => {
    const show = active && !keyboardActive;
    if (!readyRef.current) {
      readyRef.current = true;
      if (handoff && active) {
        opacity.setValue(0.85);
        slideY.setValue(0);
      } else if (show) {
        opacity.setValue(0);
        slideY.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 720,
          delay: 120,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }).start();
      } else {
        opacity.setValue(0);
        slideY.setValue(keyboardActive ? 140 : 0);
      }
      return;
    }

    if (show) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: OVERLAY_MOTION.FADE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(slideY, {
          toValue: 0,
          duration: OVERLAY_MOTION.SCALE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (keyboardActive && active) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 320,
          easing: EASING.EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(slideY, {
          toValue: Math.round(H * 0.22),
          duration: 380,
          easing: EASING.EASE_IN,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: OVERLAY_MOTION.FADE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 48,
        duration: OVERLAY_MOTION.SCALE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, keyboardActive, handoff, opacity, slideY]);

  // Onboarding → chat: gather edge energy into the middle.
  // Callback is read from a ref so a parent re-render cannot cancel this run
  // and leave `focus` parked at the edges.
  useEffect(() => {
    if (!handoff || handoffPlayed.current) return;
    handoffPlayed.current = true;
    focus.setValue(0);
    bloom.setValue(1.2);
    const anim = Animated.parallel([
      Animated.timing(focus, {
        toValue: 1,
        duration: 900,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bloom, {
        toValue: 1,
        duration: 900,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onHandoffConsumedRef.current?.();
    });
    return () => {
      anim.stop();
    };
  }, [handoff, focus, bloom, opacity]);

  const [mounted, setMounted] = useState(active || handoff);
  useEffect(() => {
    if (active || handoff) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), OVERLAY_MOTION.FADE_OUT_MS + 40);
    return () => clearTimeout(t);
  }, [active, handoff]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          transform: [{ translateY: slideY }, { scale: bloom }],
        },
      ]}
    >
      <GlowLayer
        mode={modeA}
        isDark={isDark}
        focus={focus}
        motionEnabled={ambientMotion}
        layerOpacity={opacityA}
      />
      {slotBMounted ? (
        <GlowLayer
          mode={modeB}
          isDark={isDark}
          focus={focus}
          motionEnabled={ambientMotion}
          layerOpacity={opacityB}
        />
      ) : null}
    </Animated.View>
  );
}
