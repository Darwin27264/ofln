/**
 * Chat composer: attach menu, pending image/PDF preview, input, voice/send/stop.
 * Presentational — ConversationScreen owns handlers and keyboard padding.
 * Empty bar shows a sound-wave (voice) control; it becomes send once there is content.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Path } from 'react-native-svg';

import { FrostedGlass } from './FrostedGlass';
import { InputListeningGlow } from './InputListeningGlow';
import { CommandPalette } from './CommandPalette';
import type { SlashCommand } from '../utils/slashCommands';
import { useTheme } from '../context/ThemeContext';
import {
  createStyles,
  COMPOSER_INPUT_MAX_HEIGHT,
} from '../styles/styles';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

/**
 * Show clear, and lock the field height, from the draft alone.
 * Once the text can fill the cap, Android's multiline measure alternates
 * between the real content height and maxHeight. Any onLayout setState
 * (fade or overlay) lays the field out again and the two heights chase
 * each other — Maximum update depth. Locking `height` stops the chase.
 */
const CLEAR_SHOW_MIN_CHARS = 80;
const CLEAR_SHOW_MIN_LINES = 5;

function draftShowsClear(text: string): boolean {
  if (text.length === 0) return false;
  if (text.split('\n').length >= CLEAR_SHOW_MIN_LINES) return true;
  return text.length >= CLEAR_SHOW_MIN_CHARS;
}

/** Minimal rightward sound-wave mark (voice dictation) — three arcs, no mic silhouette. */
function VoiceWaveIcon({
  size,
  color,
  active = false,
}: {
  size: number;
  color: string;
  active?: boolean;
}) {
  const stroke = active ? 2.35 : 1.85;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 9.2c1.15 1.05 1.15 4.55 0 5.6"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M12.6 6.6c2.05 1.85 2.05 8.95 0 10.8"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M16.2 4c3 2.7 3 13.3 0 16"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export type ComposerPendingAttachment = {
  uri: string;
  fileName?: string;
  /** MIME hint from pickers (e.g. image/jpeg, application/pdf). */
  type?: string;
  /** Product attachment kind — image (OCR) vs pdf (text extract). */
  kind?: 'image' | 'pdf';
  width?: number;
  height?: number;
};

/**
 * Shell-colored wash under the dock: transparent at the top so messages tuck
 * into it, fully opaque at the bottom so it meets the system nav seamlessly.
 * Memoized — it only depends on size and tint, so typing and the keyboard
 * animation must not re-rasterize the gradient.
 */
const ComposerFade = React.memo(function ComposerFade({
  shellBackground,
  style,
}: {
  shellBackground: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Fill the dock. A pixel height taken from onLayout setState remeasured
  // the capped TextInput and looped.
  return (
    <View style={style} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="chatInputFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={shellBackground} stopOpacity="0" />
            <Stop offset="0.22" stopColor={shellBackground} stopOpacity="0.12" />
            <Stop offset="0.42" stopColor={shellBackground} stopOpacity="0.32" />
            <Stop offset="0.62" stopColor={shellBackground} stopOpacity="0.55" />
            <Stop offset="0.78" stopColor={shellBackground} stopOpacity="0.78" />
            <Stop offset="0.9" stopColor={shellBackground} stopOpacity="0.94" />
            <Stop offset="1" stopColor={shellBackground} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatInputFade)" />
      </Svg>
    </View>
  );
});

export type ChatComposerProps = {
  shellBackground: string;
  /**
   * Distance (px) the dock sits above its resting position while the keyboard
   * is open. Driven natively as a translate — animating `paddingBottom` instead
   * relaid out the blur/SVG chrome every frame and dropped frames.
   */
  composerLift: Animated.Value;
  /** Optional enter fade (tutorial → chat). Omitted means fully visible. */
  enterOpacity?: Animated.Value;
  /** Static resting gap below the input row (nav clearance). */
  restingBottomPadding: number;
  scaleAnim: Animated.Value;
  onOverlayLayout: (height: number) => void;

  userInput: string;
  onChangeText: (text: string) => void;
  onInputFocus: () => void;

  /** Scrolled away from newest messages — frosted “New” pill above the bar. */
  showJumpToLatest?: boolean;
  onJumpToLatest?: () => void;

  pendingAttachment: ComposerPendingAttachment | null;
  isOcrRunning: boolean;
  onClearAttachment: () => void;

  isGenerating: boolean;
  isLoading: boolean;
  sendDisabled: boolean;
  onSend: () => void;
  onStop: () => void;

  /** Platform STT — voice/send share one trailing control in the input bar. */
  isListening: boolean;
  onMicPress: () => void;

  addButtonRef: React.RefObject<View | null>;
  onOpenAttachMenu: () => void;

  attachMenuVisible: boolean;
  attachMenuAnchor: { x: number; y: number; width: number; height: number } | null;
  attachMenuOpacity: Animated.Value;
  attachMenuScale: Animated.Value;
  attachItem0Opacity: Animated.Value;
  attachItem0Translate: Animated.Value;
  attachItem1Opacity: Animated.Value;
  attachItem1Translate: Animated.Value;
  attachItem2Opacity: Animated.Value;
  attachItem2Translate: Animated.Value;
  onDismissAttachMenu: (onComplete?: () => void) => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseDocument: () => void;
  onSelectSlashCommand?: (command: SlashCommand) => void;
};

function ChatComposerView({
  shellBackground,
  composerLift,
  enterOpacity,
  restingBottomPadding,
  scaleAnim,
  onOverlayLayout,
  userInput,
  onChangeText,
  onInputFocus,
  showJumpToLatest = false,
  onJumpToLatest,
  pendingAttachment,
  isOcrRunning,
  onClearAttachment,
  isGenerating,
  isLoading,
  sendDisabled,
  onSend,
  onStop,
  isListening,
  onMicPress,
  addButtonRef,
  onOpenAttachMenu,
  attachMenuVisible,
  attachMenuAnchor,
  attachMenuOpacity,
  attachMenuScale,
  attachItem0Opacity,
  attachItem0Translate,
  attachItem1Opacity,
  attachItem1Translate,
  attachItem2Opacity,
  attachItem2Translate,
  onDismissAttachMenu,
  onTakePhoto,
  onChoosePhoto,
  onChooseDocument,
  onSelectSlashCommand,
}: ChatComposerProps) {
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const screenWidth = Dimensions.get('window').width;
  const reportedOverlayRef = React.useRef(0);
  /** After the field is height-locked, ignore further measure events. */
  const cappedReportedRef = React.useRef(false);

  // Lift is a transform, so the dock keeps its resting height and the gradient
  // below it would expose the canvas — the skirt covers that travel.
  const liftTransform = React.useMemo(
    () => [{ translateY: Animated.multiply(composerLift, -1) }],
    [composerLift],
  );

  const isPendingPdf =
    pendingAttachment?.kind === 'pdf' ||
    pendingAttachment?.type === 'application/pdf' ||
    !!pendingAttachment?.fileName?.toLowerCase().endsWith('.pdf');

  // Derived from text only — no contentSize state, so visibility cannot loop.
  const showClearAll = draftShowsClear(userInput);
  const inputCappedRef = React.useRef(showClearAll);
  inputCappedRef.current = showClearAll;

  const clearAllOpacity = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    // Opacity only. Do not setState here — mounting/unmounting from this
    // effect was the layout feedback that retriggered contentSizeChange.
    Animated.timing(clearAllOpacity, {
      toValue: showClearAll ? 1 : 0,
      duration: ANIMATION_DURATIONS.FAST,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [showClearAll, clearAllOpacity]);

  const jumpPillOpacity = React.useRef(new Animated.Value(0)).current;
  const jumpPillScale = React.useRef(new Animated.Value(0.92)).current;
  const [jumpPillMounted, setJumpPillMounted] = React.useState(false);
  React.useEffect(() => {
    if (showJumpToLatest) {
      setJumpPillMounted(true);
      Animated.parallel([
        Animated.timing(jumpPillOpacity, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          easing: EASING.DECELERATE,
          useNativeDriver: true,
        }),
        Animated.timing(jumpPillScale, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          easing: EASING.DECELERATE,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(jumpPillOpacity, {
        toValue: 0,
        duration: ANIMATION_DURATIONS.FAST,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }),
      Animated.timing(jumpPillScale, {
        toValue: 0.92,
        duration: ANIMATION_DURATIONS.FAST,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setJumpPillMounted(false);
    });
  }, [showJumpToLatest, jumpPillOpacity, jumpPillScale]);

  // One trailing slot: voice while empty (or still listening); send once there is content.
  const showSend = !sendDisabled && !isListening;
  const actionMode = React.useRef(new Animated.Value(showSend ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(actionMode, {
      toValue: showSend ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [showSend, actionMode]);

  const handleClearAll = React.useCallback(() => {
    onChangeText('');
  }, [onChangeText]);

  const handleSelectCommand = React.useCallback(
    (cmd: SlashCommand) => {
      if (onSelectSlashCommand) {
        onSelectSlashCommand(cmd);
      } else {
        onChangeText(cmd.hasArgs ? `${cmd.label} ` : cmd.label);
      }
    },
    [onSelectSlashCommand, onChangeText],
  );

  const handleComposerLayout = React.useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      // Capped TextInput: Android alternates content height vs maxHeight.
      // Reporting that to setState lays it out again. One report, then stop.
      if (inputCappedRef.current) {
        if (cappedReportedRef.current) return;
        cappedReportedRef.current = true;
      } else {
        cappedReportedRef.current = false;
      }
      if (Math.abs(h - reportedOverlayRef.current) < 8) return;
      reportedOverlayRef.current = h;
      onOverlayLayout(h);
    },
    [onOverlayLayout],
  );

  const attachItemStyle = {
    backgroundColor: 'transparent' as const,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  };

  return (
    <>
      {attachMenuVisible && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            elevation: 10000,
          }}
          pointerEvents="box-none"
        >
          <TouchableWithoutFeedback onPress={() => onDismissAttachMenu()}>
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                opacity: attachMenuOpacity,
              }}
            />
          </TouchableWithoutFeedback>
          {attachMenuAnchor && (
            <Animated.View
              style={{
                position: 'absolute',
                left: Math.max(
                  16,
                  Math.min(
                    attachMenuAnchor.x + attachMenuAnchor.width / 2 - 90,
                    screenWidth - 196,
                  ),
                ),
                top: Math.max(8, attachMenuAnchor.y - 172),
                minWidth: 180,
                opacity: attachMenuOpacity,
                transform: [{ scale: attachMenuScale }],
              }}
              onStartShouldSetResponder={() => true}
            >
              <Animated.View
                style={{
                  opacity: attachItem0Opacity,
                  transform: [{ translateY: attachItem0Translate }],
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => onDismissAttachMenu(onTakePhoto)}
                  style={attachItemStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    Take photo (OCR)
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: attachItem1Opacity,
                  transform: [{ translateY: attachItem1Translate }],
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => onDismissAttachMenu(onChoosePhoto)}
                  style={attachItemStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="image-outline" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    Gallery (OCR text)
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: attachItem2Opacity,
                  transform: [{ translateY: attachItem2Translate }],
                }}
              >
                <TouchableOpacity
                  onPress={() => onDismissAttachMenu(onChooseDocument)}
                  style={attachItemStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="document-outline" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    File (PDF)
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          )}
        </View>
      )}

      <Animated.View
        style={[
          styles.bottomContainer,
          { transform: liftTransform },
          enterOpacity != null ? { opacity: enterOpacity } : null,
        ]}
        onLayout={handleComposerLayout}
        pointerEvents="box-none"
      >
        <ComposerFade
          shellBackground={shellBackground}
          style={styles.inputFade}
        />
        {/* Travels with the dock, covering the canvas exposed by the lift. */}
        <View
          pointerEvents="none"
          style={[styles.composerSkirt, { backgroundColor: shellBackground }]}
        />
        <View
          style={[styles.inputBarArea, { paddingBottom: restingBottomPadding }]}
          pointerEvents="box-none"
        >
          {jumpPillMounted && (
            <Animated.View
              pointerEvents={showJumpToLatest ? 'box-none' : 'none'}
              style={[
                styles.jumpToLatestWrapper,
                {
                  opacity: jumpPillOpacity,
                  transform: [{ scale: jumpPillScale }],
                },
              ]}
            >
              <TouchableOpacity
                style={styles.jumpToLatestPill}
                onPress={onJumpToLatest}
                activeOpacity={0.85}
                accessibilityLabel="Jump to new messages"
                accessibilityRole="button"
              >
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={theme.colors.text}
                />
                <Text style={styles.jumpToLatestLabel}>New</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          {pendingAttachment && (
            <View style={styles.attachmentPreviewRow}>
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              {isPendingPdf ? (
                <View
                  style={[
                    styles.attachmentThumb,
                    {
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: pendingAttachment.uri }}
                  style={styles.attachmentThumb}
                  resizeMode="cover"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentLabel} numberOfLines={1}>
                  {pendingAttachment.fileName ||
                    (isPendingPdf ? 'PDF ready' : 'Image ready')}
                </Text>
                {isOcrRunning && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginTop: 4,
                      gap: 6,
                    }}
                  >
                    <ActivityIndicator size="small" color={theme.colors.text} />
                    <Text style={[styles.attachmentLabel, { fontSize: 12 }]}>
                      Extracting text on-device…
                    </Text>
                  </View>
                )}
                {!isOcrRunning && (
                  <Text style={[styles.attachmentLabel, { fontSize: 12, marginTop: 2 }]}>
                    {isPendingPdf
                      ? 'Text will be extracted when you send'
                      : 'Text will be read with OCR when you send'}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.attachmentRemove, { backgroundColor: theme.colors.surface }]}
                onPress={onClearAttachment}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isOcrRunning}
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRowWrapper}>
            {!isGenerating && !isLoading && (
              <CommandPalette
                userInput={userInput}
                onSelectCommand={handleSelectCommand}
              />
            )}
            <View ref={addButtonRef} collapsable={false}>
              <TouchableOpacity
                style={styles.addButtonOutside}
                onPress={onOpenAttachMenu}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.85}
              >
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Ionicons name="add" size={30} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.inputBar, styles.inputBarInRow]}>
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <InputListeningGlow active={isListening} />
              <TextInput
                style={[
                  styles.input,
                  showClearAll && { height: COMPOSER_INPUT_MAX_HEIGHT },
                  isListening && localStyles.inputListening,
                  isListening && { color: theme.colors.text },
                ]}
                placeholder={
                  isGenerating
                    ? 'Responding…'
                    : isListening
                      ? 'Listening…'
                      : 'Message...'
                }
                placeholderTextColor={
                  isListening
                    ? theme.colors.text
                    : theme.colors.textTertiary
                }
                value={userInput}
                onChangeText={onChangeText}
                multiline
                editable={!isGenerating}
                onFocus={onInputFocus}
              />
              <View style={styles.composerActionColumn}>
                {/* Out of flow, just above send — see composerClearSlot. */}
                <View
                  style={styles.composerClearSlot}
                  pointerEvents={showClearAll ? 'box-none' : 'none'}
                >
                  <Animated.View style={{ opacity: clearAllOpacity }}>
                    <TouchableOpacity
                      style={styles.composerClearButton}
                      onPress={handleClearAll}
                      accessibilityLabel="Clear message"
                      accessibilityRole="button"
                      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="close-circle"
                        size={22}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
                {isGenerating ? (
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={onStop}
                    accessibilityLabel="Stop generation"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="stop-circle" size={44} color={theme.colors.error} />
                  </TouchableOpacity>
                ) : (
                  <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <TouchableOpacity
                      style={styles.sendIconButton}
                      onPress={showSend ? onSend : onMicPress}
                      disabled={
                        showSend
                          ? sendDisabled || isLoading
                          : isLoading || isOcrRunning
                      }
                      accessibilityLabel={
                        showSend
                          ? 'Send message'
                          : isListening
                            ? 'Stop listening'
                            : 'Dictate with voice'
                      }
                      accessibilityState={{ selected: isListening && !showSend }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.composerActionIconSlot}>
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.composerActionIconCentered,
                            {
                              opacity: actionMode.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 0],
                              }),
                              transform: [
                                {
                                  scale: actionMode.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 0.72],
                                  }),
                                },
                              ],
                            },
                          ]}
                        >
                          <VoiceWaveIcon
                            size={28}
                            active={isListening}
                            color={
                              isLoading || isOcrRunning
                                ? theme.colors.textTertiary
                                : isListening
                                  ? theme.colors.text
                                  : theme.colors.textSecondary
                            }
                          />
                        </Animated.View>
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.composerActionIconCentered,
                            {
                              opacity: actionMode,
                              transform: [
                                {
                                  scale: actionMode.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.72, 1],
                                  }),
                                },
                              ],
                            },
                          ]}
                        >
                          <Ionicons
                            name="arrow-up-circle"
                            size={44}
                            color={
                              sendDisabled || isLoading
                                ? theme.colors.textTertiary
                                : theme.colors.text
                            }
                          />
                        </Animated.View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </>
  );
}

const localStyles = StyleSheet.create({
  inputListening: {
    fontWeight: '600',
  },
});

/**
 * Parent overlay-height updates must not re-render this tree. A re-render of
 * the multiline TextInput at max height changes its measured height, which
 * fires onLayout, which setState'd the parent again.
 */
export const ChatComposer = React.memo(ChatComposerView);
