/**
 * First-run onboarding (S11).
 * Four steps, one job each — remounts PageFadeIn per step (no slide deck).
 * Download/load goes through App.handleDownloadModel only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { PageFadeIn } from '../components/PageFadeIn';
import { showAlert } from '../components/CustomAlert';
import { DownloadCancellationToken } from '../api/model';
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
import {
  checkDiskSpaceForDownload,
  diskPreflightAlertMessage,
  parseSizeToBytes,
} from '../utils/diskPreflight';
import {
  toUserFacingDownloadError,
  toUserFacingLoadError,
} from '../utils/userFacingErrors';
import { showLoadFailureAlert } from '../utils/loadFailureAlert';
import { llamaProvider } from '../providers/llamaProvider';

type Step = 0 | 1 | 2 | 3;

export type OnboardingExit = 'conversation' | 'modelSelection' | 'info';

interface Props {
  downloadedModels: string[];
  handleDownloadModel: (
    file: string,
    repoId: string,
    onProgress: (progress: number) => void,
    cancellationToken?: DownloadCancellationToken,
    expectedBytes?: number | null,
  ) => Promise<void>;
  /** After Skip / finish — already marked complete by this screen. */
  onFinished: (destination: OnboardingExit) => void;
  /**
   * Where Skip returns when reviewing from About.
   * First-run defaults to conversation.
   */
  skipDestination?: OnboardingExit;
}

export default function OnboardingScreen({
  downloadedModels,
  handleDownloadModel,
  onFinished,
  skipDestination = 'conversation',
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [step, setStep] = useState<Step>(0);
  const [totalMemoryBytes, setTotalMemoryBytes] = useState<number | null>(null);
  const [selected, setSelected] = useState<OnboardingModelCandidate>(
    ONBOARDING_MODEL_CANDIDATES[0],
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

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
    if (busy) return;
    void finish(skipDestination);
  }, [busy, finish, skipDestination]);

  const goNext = useCallback(() => {
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }, []);

  const alreadyHaveSelected = downloadedModels.includes(selected.fileName);

  const runDownloadOrLoad = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProgress(alreadyHaveSelected ? null : 0);
    try {
      if (!alreadyHaveSelected) {
        const disk = await checkDiskSpaceForDownload(selected.size);
        if (!disk.ok) {
          const uf = diskPreflightAlertMessage(disk);
          showAlert(uf.title, uf.message, [{ text: 'OK' }]);
          return;
        }
      }

      await handleDownloadModel(
        selected.fileName,
        selected.repoId,
        (p) => setProgress(p),
        undefined,
        parseSizeToBytes(selected.size),
      );
      // Success (or no-op return) — persist so cold start never auto-shows again.
      await markOnboardingComplete();
      // handleDownloadModel navigates to conversation on success.
    } catch (error) {
      console.warn('Onboarding download/load failed', error);
      const uf =
        toUserFacingDownloadError(error) ??
        toUserFacingLoadError(error, llamaProvider.getStatus().error);
      if (uf.kind === 'auth') {
        showAlert(uf.title, uf.message, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Browse models',
            onPress: () => {
              void finish('modelSelection');
            },
          },
        ]);
      } else if (
        uf.kind === 'oom' ||
        uf.kind === 'corrupt' ||
        uf.kind === 'generic_load' ||
        uf.kind === 'not_found'
      ) {
        showLoadFailureAlert(uf, {
          modelFileName: selected.fileName,
          onRetry: () => {
            void runDownloadOrLoad();
          },
          onModels: () => {
            void finish('modelSelection');
          },
        });
      } else {
        showAlert(uf.title, uf.message, [{ text: 'OK' }]);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [
    alreadyHaveSelected,
    busy,
    finish,
    handleDownloadModel,
    selected.fileName,
    selected.repoId,
    selected.size,
  ]);

  const ramFit = classifyRamFitFromSize(selected.size, totalMemoryBytes);

  const titleForStep =
    step === 0
      ? 'OFLN'
      : step === 1
        ? 'Private by default'
        : step === 2
          ? 'Get a model'
          : "You're ready";

  const bodyForStep =
    step === 0
      ? 'A calm offline reasoning companion. Models and chats stay on your phone — no account and no cloud AI for replies.'
      : step === 1
        ? 'Wi‑Fi is only needed to download a model from Hugging Face. After that, everything runs on-device.'
        : step === 2
          ? 'Here’s a small Q4_0 pick that usually fits. Download now if you like — or continue and choose from Models whenever you’re ready.'
          : 'Open chat anytime. Pick or load a model from Models when you’re ready. You can review this guide anytime from Settings → About.';

  const primaryLabel =
    step === 2 ? 'Continue' : step === 3 ? 'Start chatting' : 'Continue';

  const downloadLabel = alreadyHaveSelected
    ? busy
      ? 'Loading…'
      : 'Load & chat'
    : busy
      ? progress != null
        ? `Downloading ${Math.round(progress)}%`
        : 'Working…'
      : 'Download & load';

  const onPrimary = () => {
    if (step < 2) {
      goNext();
      return;
    }
    if (step === 2) {
      // Never download/load on Continue — user can do that later from Models.
      setStep(3);
      return;
    }
    void finish('conversation');
  };

  return (
    <PageFadeIn key={`onboarding-step-${step}`}>
      <View
        style={[
          styles.container,
          {
            padding: 20,
            flex: 1,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <Text style={[styles.settingsTitle, { marginBottom: 12 }]}>{titleForStep}</Text>
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.textSecondary,
            lineHeight: 24,
            fontFamily: 'Poppins',
            marginBottom: 28,
          }}
        >
          {bodyForStep}
        </Text>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: step === 2 ? 220 : 120 }}
          showsVerticalScrollIndicator={false}
        >
          {step === 2 && (
            <View>
              {ONBOARDING_MODEL_CANDIDATES.map((m) => {
                const isSelected = selected.id === m.id;
                const fit = classifyRamFitFromSize(m.size, totalMemoryBytes);
                const have = downloadedModels.includes(m.fileName);
                return (
                  <TouchableOpacity
                    key={m.id}
                    activeOpacity={0.7}
                    disabled={busy}
                    onPress={() => setSelected(m)}
                    style={{
                      borderWidth: 1,
                      borderColor: isSelected ? theme.colors.text : theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 14,
                      padding: 16,
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '600',
                          fontFamily: 'Poppins',
                          color: theme.colors.text,
                          flex: 1,
                          paddingRight: 8,
                        }}
                      >
                        {m.name}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.text} />
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: 'Poppins',
                        color: theme.colors.textSecondary,
                        marginBottom: 6,
                      }}
                    >
                      {m.size}
                      {fit ? ` · ${RAM_FIT_LABELS[fit.tier]}` : ''}
                      {have ? ' · Downloaded' : ''}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: 'Poppins',
                        color: theme.colors.textTertiary,
                        lineHeight: 18,
                      }}
                    >
                      {m.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {ramFit && (
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: 'Poppins',
                    color: theme.colors.textTertiary,
                    marginTop: 4,
                    marginBottom: 8,
                  }}
                >
                  Suggested for your phone: {RAM_FIT_LABELS[ramFit.tier]} for the selected size.
                </Text>
              )}
            </View>
          )}

          {step === 3 && (
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'Poppins',
                color: theme.colors.textSecondary,
                lineHeight: 22,
              }}
            >
              Tip: Prefer Q4_0 on Android when you want GPU/NPU offload. You don’t need a model yet —
              open Models anytime to download or load one. Need a refresher later? Settings → About →
              Review onboarding.
            </Text>
          )}
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
          }}
        >
          <TouchableOpacity
            onPress={onPrimary}
            disabled={busy}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 30,
              paddingVertical: 14,
              paddingHorizontal: 20,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              opacity: busy ? 0.85 : 1,
            }}
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 18,
                fontFamily: 'Poppins',
                fontWeight: '600',
              }}
            >
              {primaryLabel}
            </Text>
          </TouchableOpacity>

          {step === 2 && (
            <TouchableOpacity
              onPress={() => {
                if (busy) return;
                void runDownloadOrLoad();
              }}
              disabled={busy}
              style={{
                marginTop: 12,
                borderRadius: 30,
                paddingVertical: 12,
                paddingHorizontal: 20,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              {busy && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.text}
                  style={{ marginRight: 10 }}
                />
              )}
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 16,
                  fontFamily: 'Poppins',
                  fontWeight: '600',
                }}
              >
                {downloadLabel}
              </Text>
            </TouchableOpacity>
          )}

          {step === 2 && (
            <TouchableOpacity
              onPress={() => {
                if (busy) return;
                void finish('modelSelection');
              }}
              disabled={busy}
              style={{ alignItems: 'center', marginTop: 14 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: 'Poppins',
                  color: theme.colors.textSecondary,
                }}
              >
                Browse all models
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={skip}
            disabled={busy}
            style={{ alignItems: 'center', marginTop: 14 }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'Poppins',
                color: theme.colors.textTertiary,
              }}
            >
              Skip
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </PageFadeIn>
  );
}
