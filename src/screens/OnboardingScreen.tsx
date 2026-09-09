/**
 * First-run onboarding.
 * Five steps, one job each — remounts PageFadeIn per step (no slide deck).
 * Model download/load stays in the library after the guide.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle as SvgCircle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { PageFadeIn } from '../components/PageFadeIn';
import { FrostedGlass } from '../components/FrostedGlass';
import { LavaLampBackground } from '../components/LavaLampBackground';
import { useFloatingBackBottom } from '../utils/layoutInsets';
import {
  ONBOARDING_MODEL_CANDIDATES,
  markOnboardingComplete,
  pickRecommendedOnboardingModel,
  type OnboardingModelCandidate,
} from '../services/onboardingService';
import {
  classifyRamFitFromSize,
  getTotalMemoryBytes,
  RAM_FIT_LABELS,
} from '../services/ramFitService';

type Step = 0 | 1 | 2 | 3 | 4;

const LAST_STEP: Step = 4;

const FEATURE_HIGHLIGHTS: {
  icon: string;
  title: string;
  body: string;
}[] = [
  {
    icon: 'person-outline',
    title: 'Personas',
    body: 'Shape tone and style so replies match how you work.',
  },
  {
    icon: 'git-compare-outline',
    title: 'Perspective',
    body: 'Run a topic through multiple speakers, one turn at a time.',
  },
  {
    icon: 'flash-outline',
    title: 'Temporary mode',
    body: 'Hold a private exchange that never enters history.',
  },
  {
    icon: 'image-outline',
    title: 'On-device OCR',
    body: 'Attach a photo — text is read locally and added to your message.',
  },
  {
    icon: 'library-outline',
    title: 'History & library',
    body: 'Revisit threads and manage models entirely on this device.',
  },
];

export type OnboardingExit = 'conversation' | 'modelSelection' | 'info';

interface Props {
  downloadedModels: string[];
  /** After last-step Skip / finish — already marked complete by this screen. */
  onFinished: (destination: OnboardingExit) => void;
  /**
   * Where last-step Skip returns when reviewing from About.
   * First-run defaults to conversation.
   */
  skipDestination?: OnboardingExit;
}

const CIRCLE = 58;

export default function OnboardingScreen({
  downloadedModels,
  onFinished,
  skipDestination = 'conversation',
}: Props) {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const [step, setStep] = useState<Step>(0);
  const [totalMemoryBytes, setTotalMemoryBytes] = useState<number | null>(null);
  const [selected, setSelected] = useState<OnboardingModelCandidate>(
    ONBOARDING_MODEL_CANDIDATES[0],
  );

  // Warm gold accent on Next — theme accent (lava family)
  const nextFill = theme.colors.accent;
  const nextIcon = theme.colors.accentText;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mem = await getTotalMemoryBytes();
      if (cancelled) return;
      setTotalMemoryBytes(mem);
      setSelected(pickRecommendedOnboardingModel(ONBOARDING_MODEL_CANDIDATES, mem));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(
    async (destination: OnboardingExit) => {
      await markOnboardingComplete();
      onFinished(destination);
    },
    [onFinished],
  );

  const skip = useCallback(() => {
    if (step < LAST_STEP) {
      setStep((s) => (s < LAST_STEP ? ((s + 1) as Step) : s));
      return;
    }
    void finish(skipDestination);
  }, [finish, skipDestination, step]);

  const exitTutorial = useCallback(() => {
    void finish(skipDestination);
  }, [finish, skipDestination]);

  const goNext = useCallback(() => {
    setStep((s) => (s < LAST_STEP ? ((s + 1) as Step) : s));
  }, []);

  const goPrev = useCallback(() => {
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  }, []);

  const ramFit = classifyRamFitFromSize(selected.size, totalMemoryBytes);

  const eyebrowForStep =
    step === 0
      ? 'Introduction'
      : step === 1
        ? 'On-device'
        : step === 2
          ? 'Capabilities'
          : step === 3
            ? 'Foundation'
            : 'Begin';

  const titleForStep =
    step === 0
      ? 'OFLN'
      : step === 1
        ? 'Intelligence that stays with you'
        : step === 2
          ? 'Built for how you work'
          : step === 3
            ? 'Choose a foundation'
            : 'Your space is ready';

  const bodyForStep =
    step === 0
      ? 'Private conversation on your phone. No account. No cloud model in the loop.'
      : step === 1
        ? 'Connectivity is only for bringing models onto the device. Every reply runs locally after that.'
        : step === 2
          ? 'Beyond chat — tools that stay private, flexible, and under your control.'
          : step === 3
            ? 'Pick a starting model. You can install it from the library after the guide.'
            : 'Return to chat anytime. Load a model from the library when you need one.';

  const primaryA11y = step === LAST_STEP ? 'Enter chat' : 'Continue';

  const onPrimary = () => {
    if (step < LAST_STEP) {
      goNext();
      return;
    }
    void finish('conversation');
  };

  const bottomChromePad = CIRCLE + 28;

  return (
    <View style={[local.screen, { backgroundColor: theme.colors.background }]}>
      <LavaLampBackground pulseKey={step} />

      {/* Exit — leave the guide immediately (first-run still marks complete) */}
      <TouchableOpacity
        onPress={exitTutorial}
        accessibilityRole="button"
        accessibilityLabel="Exit tutorial"
        accessibilityHint="Leaves the guide and continues into the app"
        style={[local.topTextHit, { top: 8, left: 20 }]}
        activeOpacity={0.7}
      >
        <Text style={[local.topText, { color: theme.colors.textSecondary }]}>Exit</Text>
      </TouchableOpacity>

      {/* Skip — advances one step; exits only on the last page */}
      <TouchableOpacity
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel={step < LAST_STEP ? 'Skip this step' : 'Skip onboarding'}
        style={[local.topTextHit, { top: 8, right: 20 }]}
        activeOpacity={0.7}
      >
        <Text style={[local.topText, { color: theme.colors.textSecondary }]}>Skip</Text>
      </TouchableOpacity>

      <PageFadeIn key={`onboarding-step-${step}`}>
        <View
          style={[
            local.content,
            {
              paddingTop: 44,
              paddingBottom: backBottom + bottomChromePad,
            },
          ]}
        >
          {step === 2 ? (
            <>
              <View style={local.copyBlock}>
                <Text style={[local.eyebrow, { color: theme.colors.textTertiary }]}>
                  {eyebrowForStep}
                </Text>
                <Text style={styles.settingsTitle}>{titleForStep}</Text>
                <Text style={[local.body, { color: theme.colors.textSecondary }]}>
                  {bodyForStep}
                </Text>
              </View>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {FEATURE_HIGHLIGHTS.map((feature) => (
                  <View
                    key={feature.title}
                    style={[
                      local.featureCard,
                      {
                        borderColor: isDark
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(0,0,0,0.06)',
                      },
                    ]}
                  >
                    <FrostedGlass
                      style={StyleSheet.absoluteFillObject}
                      blurAmount={18}
                      tintOpacity={isDark ? 0.16 : 0.28}
                      inverted={isDark}
                    />
                    <View style={local.featureRow}>
                      <View
                        style={[
                          local.featureIconWrap,
                          {
                            borderColor: isDark
                              ? 'rgba(255,255,255,0.16)'
                              : 'rgba(0,0,0,0.08)',
                          },
                        ]}
                      >
                        <FrostedGlass
                          style={StyleSheet.absoluteFillObject}
                          blurAmount={14}
                          tintOpacity={isDark ? 0.12 : 0.22}
                          inverted={isDark}
                        />
                        <Ionicons
                          name={feature.icon as any}
                          size={20}
                          color={theme.colors.text}
                        />
                      </View>
                      <View style={local.featureCopy}>
                        <Text style={[local.featureTitle, { color: theme.colors.text }]}>
                          {feature.title}
                        </Text>
                        <Text
                          style={[local.featureBody, { color: theme.colors.textSecondary }]}
                        >
                          {feature.body}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : step === 3 ? (
            <>
              <View style={local.copyBlock}>
                <Text style={[local.eyebrow, { color: theme.colors.textTertiary }]}>
                  {eyebrowForStep}
                </Text>
                <Text style={styles.settingsTitle}>{titleForStep}</Text>
                <Text style={[local.body, { color: theme.colors.textSecondary }]}>
                  {bodyForStep}
                </Text>
              </View>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {ONBOARDING_MODEL_CANDIDATES.map((m) => {
                  const isSelected = selected.id === m.id;
                  const fit = classifyRamFitFromSize(m.size, totalMemoryBytes);
                  const have = downloadedModels.includes(m.fileName);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      activeOpacity={0.7}
                      onPress={() => setSelected(m)}
                      style={[
                        local.modelCard,
                        {
                          borderColor: isSelected
                            ? isDark
                              ? 'rgba(255,255,255,0.35)'
                              : 'rgba(0,0,0,0.2)'
                            : isDark
                              ? 'rgba(255,255,255,0.12)'
                              : 'rgba(0,0,0,0.06)',
                        },
                      ]}
                    >
                      <FrostedGlass
                        style={StyleSheet.absoluteFillObject}
                        blurAmount={18}
                        tintOpacity={
                          isSelected ? (isDark ? 0.26 : 0.4) : isDark ? 0.14 : 0.28
                        }
                        inverted={isDark}
                      />
                      <View style={local.modelCardInner}>
                        <View style={local.modelCardHeader}>
                          <Text
                            style={[local.modelName, { color: theme.colors.text }]}
                            numberOfLines={1}
                          >
                            {m.name}
                          </Text>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color={theme.colors.text}
                            />
                          )}
                        </View>
                        <Text
                          style={[local.modelMeta, { color: theme.colors.textSecondary }]}
                        >
                          {m.size}
                          {fit ? ` · ${RAM_FIT_LABELS[fit.tier]}` : ''}
                          {have ? ' · On device' : ''}
                        </Text>
                        <Text
                          style={[local.modelDesc, { color: theme.colors.textTertiary }]}
                        >
                          {m.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {ramFit && (
                  <Text style={[local.ramHint, { color: theme.colors.textTertiary }]}>
                    Recommended for this device: {RAM_FIT_LABELS[ramFit.tier]} at the selected
                    size.
                  </Text>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={local.lowerCopy}>
              <Text style={[local.eyebrow, { color: theme.colors.textTertiary }]}>
                {eyebrowForStep}
              </Text>
              <Text style={styles.settingsTitle}>{titleForStep}</Text>
              <Text style={[local.body, { color: theme.colors.textSecondary }]}>
                {bodyForStep}
              </Text>
              {step === LAST_STEP && (
                <Text style={[local.tip, { color: theme.colors.textSecondary }]}>
                  Q4_0 models pair best with on-device GPU and NPU acceleration. The library is
                  always available when you want another foundation.
                </Text>
              )}
            </View>
          )}
        </View>
      </PageFadeIn>

      <View
        style={[local.bottomBar, { bottom: backBottom }]}
        pointerEvents="box-none"
      >
        <View style={local.bottomSide}>
          {step > 0 ? (
            <TouchableOpacity
              onPress={goPrev}
              accessibilityRole="button"
              accessibilityLabel="Previous"
              style={[
                local.circleBtn,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.1)',
                },
              ]}
              activeOpacity={0.75}
            >
              <FrostedGlass
                style={StyleSheet.absoluteFillObject}
                blurAmount={22}
                tintOpacity={isDark ? 0.16 : 0.26}
                inverted={isDark}
              />
              <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={local.circlePlaceholder} />
          )}
        </View>

        <View style={local.dots}>
          {([0, 1, 2, 3, 4] as Step[]).map((i) => (
            <View
              key={i}
              style={[
                local.dot,
                {
                  backgroundColor:
                    i === step ? nextFill : theme.colors.textTertiary,
                  opacity: i === step ? 1 : 0.35,
                  width: i === step ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>

        <View style={[local.bottomSide, { alignItems: 'flex-end' }]}>
          <View style={local.nextHaloWrap}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width={CIRCLE + 28} height={CIRCLE + 28}>
                <Defs>
                  <RadialGradient id="next-halo" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor={nextFill} stopOpacity={isDark ? 0.45 : 0.35} />
                    <Stop offset="55%" stopColor={nextFill} stopOpacity={isDark ? 0.12 : 0.1} />
                    <Stop offset="100%" stopColor={nextFill} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <SvgCircle
                  cx={(CIRCLE + 28) / 2}
                  cy={(CIRCLE + 28) / 2}
                  r={(CIRCLE + 28) / 2}
                  fill="url(#next-halo)"
                />
              </Svg>
            </View>
            <TouchableOpacity
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryA11y}
              style={[
                local.circleBtn,
                local.nextBtn,
                { backgroundColor: nextFill },
              ]}
              activeOpacity={0.8}
            >
              {step === LAST_STEP ? (
                <Ionicons name="checkmark" size={24} color={nextIcon} />
              ) : (
                <Ionicons name="chevron-forward" size={24} color={nextIcon} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topTextHit: {
    position: 'absolute',
    zIndex: 20,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  topText: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  copyBlock: {
    marginBottom: 20,
  },
  lowerCopy: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Poppins',
  },
  modelCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  featureCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 12,
  },
  featureCopy: {
    flex: 1,
    paddingTop: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins',
    marginBottom: 4,
  },
  featureBody: {
    fontSize: 14,
    fontFamily: 'Poppins',
    lineHeight: 20,
  },
  modelCardInner: {
    padding: 16,
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins',
    flex: 1,
    paddingRight: 8,
  },
  modelMeta: {
    fontSize: 13,
    fontFamily: 'Poppins',
    marginBottom: 6,
  },
  modelDesc: {
    fontSize: 13,
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  ramHint: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 4,
    marginBottom: 8,
  },
  tip: {
    fontSize: 14,
    fontFamily: 'Poppins',
    lineHeight: 22,
    marginBottom: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  bottomSide: {
    width: CIRCLE + 28,
    alignItems: 'flex-start',
  },
  circlePlaceholder: {
    width: CIRCLE,
    height: CIRCLE,
  },
  circleBtn: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  nextHaloWrap: {
    width: CIRCLE + 28,
    height: CIRCLE + 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    borderWidth: 0,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
});
