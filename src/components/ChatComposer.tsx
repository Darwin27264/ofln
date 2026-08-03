/**
 * Chat composer: attach menu, pending image preview, input, send/stop.
 * Presentational — ConversationScreen owns handlers and keyboard padding (S04b).
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

import { FrostedGlass } from './FrostedGlass';
import { useTheme } from '../context/ThemeContext';
import { createStyles } from '../styles/styles';

export type ComposerPendingAttachment = {
  uri: string;
  fileName?: string;
  type?: string;
  width?: number;
  height?: number;
};

export type ChatComposerProps = {
  shellBackground: string;
  animatedBottomPadding: Animated.Value;
  scaleAnim: Animated.Value;
  inputOverlayHeight: number;
  onOverlayLayout: (height: number) => void;

  userInput: string;
  onChangeText: (text: string) => void;
  onInputFocus: () => void;

  pendingAttachment: ComposerPendingAttachment | null;
  isOcrRunning: boolean;
  onClearAttachment: () => void;

  isGenerating: boolean;
  isLoading: boolean;
  sendDisabled: boolean;
  onSend: () => void;
  onStop: () => void;

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
  onDismissAttachMenu: (onComplete?: () => void) => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
};

export function ChatComposer({
  shellBackground,
  animatedBottomPadding,
  scaleAnim,
  inputOverlayHeight,
  onOverlayLayout,
  userInput,
  onChangeText,
  onInputFocus,
  pendingAttachment,
  isOcrRunning,
  onClearAttachment,
  isGenerating,
  isLoading,
  sendDisabled,
  onSend,
  onStop,
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
  onDismissAttachMenu,
  onTakePhoto,
  onChoosePhoto,
}: ChatComposerProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const screenWidth = Dimensions.get('window').width;

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
                top: Math.max(8, attachMenuAnchor.y - 116),
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
            </Animated.View>
          )}
        </View>
      )}

      <View
        style={styles.bottomContainer}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          onOverlayLayout(h);
        }}
        pointerEvents="box-none"
      >
        <View style={styles.inputFade} pointerEvents="none">
          <Svg
            width={screenWidth}
            height={inputOverlayHeight}
            preserveAspectRatio="none"
          >
            <Defs>
              <SvgLinearGradient id="chatInputFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={shellBackground} stopOpacity="0" />
                <Stop offset="0.35" stopColor={shellBackground} stopOpacity="0.35" />
                <Stop offset="0.7" stopColor={shellBackground} stopOpacity="0.6" />
                <Stop offset="1" stopColor={shellBackground} stopOpacity="0.75" />
              </SvgLinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={screenWidth}
              height={inputOverlayHeight}
              fill="url(#chatInputFade)"
            />
          </Svg>
        </View>
        <Animated.View
          style={[
            styles.inputBarArea,
            {
              paddingBottom: animatedBottomPadding,
            },
          ]}
          pointerEvents="box-none"
        >
          {pendingAttachment && (
            <View style={styles.attachmentPreviewRow}>
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <Image
                source={{ uri: pendingAttachment.uri }}
                style={styles.attachmentThumb}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentLabel} numberOfLines={1}>
                  {pendingAttachment.fileName || 'Image ready'}
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
                    Text will be read with OCR when you send
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
            <View ref={addButtonRef} collapsable={false}>
              <TouchableOpacity
                style={styles.addButtonOutside}
                onPress={onOpenAttachMenu}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.85}
              >
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Ionicons name="add" size={28} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.inputBar, styles.inputBarInRow]}>
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor={theme.colors.textTertiary}
                value={userInput}
                onChangeText={onChangeText}
                multiline
                onFocus={onInputFocus}
              />
              {isGenerating ? (
                <Animated.View style={{ marginLeft: 'auto' }}>
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={onStop}
                    accessibilityLabel="Stop generation"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="stop-circle" size={40} color={theme.colors.error} />
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <Animated.View style={{ transform: [{ scale: scaleAnim }], marginLeft: 'auto' }}>
                  <TouchableOpacity
                    style={styles.sendIconButton}
                    onPress={onSend}
                    disabled={sendDisabled || isLoading}
                  >
                    <Ionicons
                      name="arrow-up-circle"
                      size={40}
                      color={sendDisabled ? theme.colors.textTertiary : theme.colors.text}
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </>
  );
}
