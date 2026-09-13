/**
 * Perspectives library — list presets; edit opens PerspectiveEditor via App.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import { FloatingBackButton } from '../components/FloatingBackButton';
import { BottomSheet } from '../components/BottomSheet';
import {
  LibraryCardEnter,
  useLibraryCardEnter,
} from '../components/LibraryCardEnter';
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from '../utils/layoutInsets';
import {
  getPerspectivePresets,
  removePerspectivePreset,
  type PerspectivePreset,
} from '../services/perspectiveService';

interface PerspectivesLibraryScreenProps {
  onBack: () => void;
  onEditPreset?: (preset: PerspectivePreset | null) => void;
  onUsePreset?: (preset: PerspectivePreset) => void;
}

export default function PerspectivesLibraryScreen({
  onBack,
  onEditPreset,
  onUsePreset,
}: PerspectivesLibraryScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [presets, setPresets] = useState<PerspectivePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const { animatedIds } = useLibraryCardEnter();

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setPresets(await getPerspectivePresets());
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to load perspectives.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deletePreset = (preset: PerspectivePreset) => {
    showAlert('Delete perspective', `Remove “${preset.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removePerspectivePreset(preset.id);
          if (expandedPresetId === preset.id) setExpandedPresetId(null);
          await reload();
        },
      },
    ]);
  };

  const fixedBtnStyle = {
    position: 'absolute' as const,
    bottom: backBottom,
    backgroundColor: 'transparent' as const,
  };

  const pillButtonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  };

  const iconPillStyle = {
    ...pillButtonStyle,
    paddingHorizontal: 12,
    minWidth: 42,
    minHeight: 42,
  };

  return (
    <View
      style={[
        styles.container,
        { padding: 20, flex: 1, backgroundColor: theme.colors.background },
      ]}
    >
      <Text style={styles.settingsTitle}>Perspective</Text>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
      >
        {loading ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontFamily: 'Poppins',
              fontSize: 16,
            }}
          >
            Loading…
          </Text>
        ) : presets.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: 60,
            }}
          >
            <Icon
              name="compare-arrows"
              size={64}
              color={theme.colors.textTertiary}
            />
            <Text
              style={{
                fontSize: 20,
                fontWeight: '600',
                color: theme.colors.text,
                fontFamily: 'Poppins',
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              No perspectives yet
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                fontFamily: 'Poppins',
                textAlign: 'center',
                marginBottom: 24,
                paddingHorizontal: 40,
              }}
            >
              Create a preset with two or more speakers to debate a topic
              on-device.
            </Text>
            <TouchableOpacity
              onPress={() => onEditPreset?.(null)}
              style={{
                backgroundColor: theme.colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 20,
              }}
            >
              <Text
                style={{
                  color: theme.colors.primaryText,
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Poppins',
                }}
              >
                Create a perspective
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          presets.map((preset, index) => {
            const isExpanded = expandedPresetId === preset.id;
            return (
            <LibraryCardEnter
              key={preset.id}
              itemId={preset.id}
              index={index}
              animatedIds={animatedIds}
            >
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
                overflow: 'hidden',
              }}
            >
              <TouchableOpacity
                style={{
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() =>
                  setExpandedPresetId(isExpanded ? null : preset.id)
                }
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.text,
                      fontFamily: 'Poppins',
                      marginBottom: preset.description ? 6 : 0,
                    }}
                    numberOfLines={2}
                  >
                    {preset.name}
                  </Text>
                  {preset.description ? (
                    <Text
                      style={{
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                        fontFamily: 'Poppins',
                        lineHeight: 21,
                      }}
                      numberOfLines={isExpanded ? undefined : 2}
                    >
                      {preset.description}
                    </Text>
                  ) : null}
                </View>
                <Icon
                  name={isExpanded ? 'expand-less' : 'expand-more'}
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {isExpanded ? (
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  padding: 12,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <View
                  style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}
                >
                  {onUsePreset ? (
                    <TouchableOpacity
                      onPress={() => onUsePreset(preset)}
                      style={{
                        flex: 1,
                        minWidth: '45%',
                        backgroundColor: theme.colors.accent,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      activeOpacity={0.85}
                    >
                      <Icon name="check-circle" size={18} color={theme.colors.accentText} />
                      <Text
                        style={{
                          color: theme.colors.accentText,
                          fontSize: 14,
                          fontWeight: '600',
                          fontFamily: 'Poppins',
                          marginLeft: 6,
                        }}
                      >
                        Use
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => onEditPreset?.(preset)}
                    style={{
                      flex: 1,
                      minWidth: '45%',
                      backgroundColor: theme.colors.primary,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    activeOpacity={0.85}
                  >
                    <Icon
                      name="edit"
                      size={18}
                      color={theme.colors.primaryText}
                    />
                    <Text
                      style={{
                        color: theme.colors.primaryText,
                        fontSize: 14,
                        fontWeight: '600',
                        fontFamily: 'Poppins',
                        marginLeft: 6,
                      }}
                    >
                      Edit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deletePreset(preset)}
                    style={{
                      flex: 1,
                      minWidth: '45%',
                      backgroundColor: theme.colors.error + '20',
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    activeOpacity={0.85}
                  >
                    <Icon name="delete" size={18} color={theme.colors.error} />
                    <Text
                      style={{
                        color: theme.colors.error,
                        fontSize: 14,
                        fontWeight: '600',
                        fontFamily: 'Poppins',
                        marginLeft: 6,
                      }}
                    >
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              ) : null}
            </View>
            </LibraryCardEnter>
            );
          })
        )}
      </ScrollView>

      <View style={[fixedBtnStyle, { left: 15 }]}>
        <FloatingBackButton onPress={onBack} />
      </View>

      <View
        style={[
          fixedBtnStyle,
          {
            right: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => setInfoOpen(true)}
          style={iconPillStyle}
          accessibilityLabel="How Perspective works"
          accessibilityHint="Explains multi-speaker debates on this device"
        >
          <Ionicons
            name="information"
            size={24}
            color={theme.colors.primaryText}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEditPreset?.(null)}
          style={iconPillStyle}
          accessibilityLabel="Add perspective"
        >
          <Ionicons
            name="add-outline"
            size={23}
            color={theme.colors.primaryText}
          />
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How Perspective works"
        subtitle="Multi-speaker debates on-device"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: 'Poppins',
            lineHeight: 21,
            marginBottom: 12,
          }}
        >
          Pick a preset in chat, send a topic, and each speaker replies in turn.
          Only one model loads at a time — seats with different models reload
          between turns. Start a new chat to leave Perspective.
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: 'Poppins',
            lineHeight: 21,
          }}
        >
        Debate overrides (temperature, reply length) apply only in Perspective
        and never change your normal model settings. Each speaker must have a
        downloaded model assigned before you can use a preset.
        </Text>
      </BottomSheet>
    </View>
  );
}
