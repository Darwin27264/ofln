/**
 * Perspective editor — create/edit debate presets.
 * Enter transition via App PageFadeIn (same as PersonaEditor).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import { BottomSheet } from '../components/BottomSheet';
import { useScrollPadForFloatingBack } from '../utils/layoutInsets';
import {
  savePerspectivePreset,
  generateSeatId,
  countDistinctModels,
  WARN_PERSPECTIVE_SEATS,
  MIN_PERSPECTIVE_SEATS,
  DEFAULT_DEBATE_N_PREDICT,
  createEmptyPreset,
  type PerspectivePreset,
  type PerspectiveSeat,
} from '../services/perspectiveService';
import { getPersonas, type Persona } from '../services/personaService';
import { PersonaAvatar } from '../components/PersonaAvatar';
import { SETTING_RANGES } from '../services/modelSettingsService';
import { prettifyModelName } from '../utils/modelUtils';

type SeatPickerTarget =
  | { seatId: string; field: 'persona' }
  | { seatId: string; field: 'model' }
  | null;

interface PerspectiveEditorScreenProps {
  preset?: PerspectivePreset | null;
  downloadedModels: string[];
  onSave: (preset: PerspectivePreset) => void;
  onCancel: () => void;
}

export default function PerspectiveEditorScreen({
  preset,
  downloadedModels,
  onSave,
  onCancel,
}: PerspectiveEditorScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [editing, setEditing] = useState<PerspectivePreset>(() =>
    preset
      ? {
          ...preset,
          seats: preset.seats.map((s) => ({ ...s })),
          overrides: preset.overrides ? { ...preset.overrides } : undefined,
        }
      : createEmptyPreset(),
  );
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [seatPicker, setSeatPicker] = useState<SeatPickerTarget>(null);

  useEffect(() => {
    void getPersonas()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  const fieldLabelStyle = useMemo(
    () => ({
      fontSize: 14,
      fontWeight: '500' as const,
      color: theme.colors.text,
      fontFamily: 'Poppins',
      marginBottom: 8,
    }),
    [theme.colors.text],
  );

  const inputBaseStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 12,
      color: theme.colors.text,
      fontFamily: 'Poppins',
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }),
    [theme.colors],
  );

  const dropdownStyle = useMemo(
    () => ({
      ...inputBaseStyle,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    }),
    [inputBaseStyle],
  );

  const helperTextStyle = useMemo(
    () => ({
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontFamily: 'Poppins',
      lineHeight: 21,
      marginBottom: 16,
    }),
    [theme.colors.textSecondary],
  );

  const sectionTitleStyle = useMemo(
    () => ({
      fontSize: 18,
      fontWeight: '600' as const,
      color: theme.colors.text,
      fontFamily: 'Poppins',
      marginBottom: 8,
    }),
    [theme.colors.text],
  );

  const personaLabel = useCallback(
    (seat: PerspectiveSeat) => {
      if (!seat.personaId) {
        if (seat.inlinePersona?.name) return seat.inlinePersona.name;
        return 'None';
      }
      return personas.find((p) => p.id === seat.personaId)?.name ?? 'Persona';
    },
    [personas],
  );

  const modelLabel = useCallback((seat: PerspectiveSeat) => {
    if (!seat.modelFileName?.trim()) return 'Choose model…';
    return prettifyModelName(seat.modelFileName);
  }, []);

  const updateSeat = (seatId: string, patch: Partial<PerspectiveSeat>) => {
    setEditing((prev) => ({
      ...prev,
      seats: prev.seats.map((s) =>
        s.id === seatId ? { ...s, ...patch } : s,
      ),
    }));
  };

  const addSeat = () => {
    const nextCount = editing.seats.length + 1;
    const append = () => {
      setEditing((prev) => ({
        ...prev,
        seats: [
          ...prev.seats,
          {
            id: generateSeatId(),
            label: `Speaker ${String.fromCharCode(64 + nextCount)}`,
          },
        ],
      }));
    };
    if (nextCount >= WARN_PERSPECTIVE_SEATS) {
      showAlert(
        'More speakers',
        'Adding 3 or more speakers may significantly slow rounds on this device. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add', onPress: append },
        ],
      );
      return;
    }
    append();
  };

  const removeSeat = (seatId: string) => {
    if (editing.seats.length <= MIN_PERSPECTIVE_SEATS) {
      showAlert(
        'Minimum speakers',
        `Keep at least ${MIN_PERSPECTIVE_SEATS} speakers.`,
        [{ text: 'OK' }],
      );
      return;
    }
    setEditing((prev) => ({
      ...prev,
      seats: prev.seats.filter((s) => s.id !== seatId),
    }));
  };

  const persistEditing = async () => {
    const name = editing.name.trim();
    if (!name) {
      showAlert('Name required', 'Give this perspective a name.', [
        { text: 'OK' },
      ]);
      return;
    }
    if (editing.seats.length < MIN_PERSPECTIVE_SEATS) {
      showAlert(
        'Need speakers',
        `Add at least ${MIN_PERSPECTIVE_SEATS} speakers.`,
        [{ text: 'OK' }],
      );
      return;
    }
    const missingModel = editing.seats.find((s) => !s.modelFileName?.trim());
    if (missingModel) {
      showAlert(
        'Model required',
        `Choose a model for each speaker (missing on “${missingModel.label || 'a seat'}”).`,
        [{ text: 'OK' }],
      );
      return;
    }

    const warnings: string[] = [];
    if (editing.seats.length >= WARN_PERSPECTIVE_SEATS) {
      warnings.push(
        `${editing.seats.length} speakers will run one after another. Rounds may take much longer and use more battery.`,
      );
    }
    if (countDistinctModels(editing.seats) >= 2) {
      warnings.push(
        'Different models reload between speakers (one GGUF at a time). Expect slower rounds and higher memory pressure.',
      );
    }

    const doSave = async () => {
      try {
        const next: PerspectivePreset = {
          ...editing,
          name,
          isBuiltin: false,
          updatedAt: Date.now(),
        };
        await savePerspectivePreset(next);
        onSave(next);
      } catch (e) {
        console.error(e);
        showAlert('Error', 'Could not save perspective.', [{ text: 'OK' }]);
      }
    };

    if (warnings.length) {
      showAlert('Hardware note', warnings.join('\n\n'), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', onPress: () => void doSave() },
      ]);
      return;
    }
    await doSave();
  };

  const overrides = editing.overrides ?? {};
  const pickerSeat = seatPicker
    ? editing.seats.find((s) => s.id === seatPicker.seatId)
    : undefined;

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <TouchableOpacity
          onPress={onCancel}
          style={{ padding: 8 }}
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '600',
            color: theme.colors.text,
            fontFamily: 'Poppins',
          }}
        >
          {preset ? 'Edit perspective' : 'Create perspective'}
        </Text>
        <TouchableOpacity
          onPress={() => void persistEditing()}
          style={{
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
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
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: scrollPadBottom,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitleStyle}>Basics</Text>
          <View style={{ marginBottom: 16 }}>
            <Text style={fieldLabelStyle}>
              Name <Text style={{ color: theme.colors.error }}>*</Text>
            </Text>
            <TextInput
              style={inputBaseStyle}
              value={editing.name}
              onChangeText={(t) => setEditing({ ...editing, name: t })}
              placeholder="Perspective name…"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
          <View style={{ marginBottom: 8 }}>
            <Text style={fieldLabelStyle}>Description</Text>
            <TextInput
              style={{
                ...inputBaseStyle,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
              value={editing.description ?? ''}
              onChangeText={(t) => setEditing({ ...editing, description: t })}
              multiline
              placeholder="Optional short description…"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitleStyle}>Speakers</Text>
          <Text style={helperTextStyle}>
            Each seat needs a downloaded model. Optionally add a persona for
            that speaker’s voice.
          </Text>

          {editing.seats.map((seat, index) => (
            <View
              key={seat.id}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    fontFamily: 'Poppins',
                    color: theme.colors.text,
                  }}
                >
                  Seat {index + 1}
                </Text>
                <TouchableOpacity
                  onPress={() => removeSeat(seat.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={`Remove seat ${index + 1}`}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={fieldLabelStyle}>Label</Text>
                <TextInput
                  style={inputBaseStyle}
                  value={seat.label ?? ''}
                  onChangeText={(t) => updateSeat(seat.id, { label: t })}
                  placeholder="Speaker label…"
                  placeholderTextColor={theme.colors.textTertiary}
                />
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={fieldLabelStyle}>Persona</Text>
                <TouchableOpacity
                  style={dropdownStyle}
                  onPress={() =>
                    setSeatPicker({ seatId: seat.id, field: 'persona' })
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontFamily: 'Poppins',
                      color: theme.colors.text,
                      marginRight: 8,
                    }}
                    numberOfLines={1}
                  >
                    {personaLabel(seat)}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View>
                <Text style={fieldLabelStyle}>
                  Model <Text style={{ color: theme.colors.error }}>*</Text>
                </Text>
                <TouchableOpacity
                  style={dropdownStyle}
                  onPress={() =>
                    setSeatPicker({ seatId: seat.id, field: 'model' })
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontFamily: 'Poppins',
                      color: seat.modelFileName?.trim()
                        ? theme.colors.text
                        : theme.colors.textTertiary,
                      marginRight: 8,
                    }}
                    numberOfLines={1}
                  >
                    {modelLabel(seat)}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity
            onPress={addSeat}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderStyle: 'dashed',
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name="add"
              size={20}
              color={theme.colors.textSecondary}
            />
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontFamily: 'Poppins',
                fontSize: 14,
                marginLeft: 8,
              }}
            >
              Add speaker
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitleStyle}>Debate-only overrides</Text>
          <Text style={helperTextStyle}>
            Applied only during Perspective rounds. Normal chats keep your model
            settings.
          </Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: 'Poppins',
                fontSize: 16,
                flex: 1,
                marginRight: 12,
              }}
            >
              Cap reply length
            </Text>
            <Switch
              value={overrides.n_predict != null}
              onValueChange={(on) =>
                setEditing({
                  ...editing,
                  overrides: {
                    ...overrides,
                    n_predict: on ? DEFAULT_DEBATE_N_PREDICT : undefined,
                  },
                })
              }
            />
          </View>
          {overrides.n_predict != null ? (
            <TextInput
              keyboardType="number-pad"
              value={String(overrides.n_predict)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/\D/g, ''), 10);
                if (!Number.isFinite(n)) return;
                const clamped = Math.max(
                  SETTING_RANGES.n_predict.min,
                  Math.min(SETTING_RANGES.n_predict.max, n),
                );
                setEditing({
                  ...editing,
                  overrides: { ...overrides, n_predict: clamped },
                });
              }}
              style={[inputBaseStyle, { marginBottom: 16 }]}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: 'Poppins',
                fontSize: 16,
                flex: 1,
                marginRight: 12,
              }}
            >
              Temperature override
            </Text>
            <Switch
              value={overrides.temperature != null}
              onValueChange={(on) =>
                setEditing({
                  ...editing,
                  overrides: {
                    ...overrides,
                    temperature: on ? 0.75 : undefined,
                  },
                })
              }
            />
          </View>
          {overrides.temperature != null ? (
            <TextInput
              keyboardType="decimal-pad"
              value={String(overrides.temperature)}
              onChangeText={(t) => {
                const n = parseFloat(t);
                if (!Number.isFinite(n)) return;
                const clamped = Math.max(0, Math.min(2, n));
                setEditing({
                  ...editing,
                  overrides: { ...overrides, temperature: clamped },
                });
              }}
              style={inputBaseStyle}
            />
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        visible={!!seatPicker && !!pickerSeat}
        onClose={() => setSeatPicker(null)}
        title={
          seatPicker?.field === 'persona' ? 'Choose persona' : 'Choose model'
        }
        fitContent
        maxHeight={0.7}
      >
        {/* ~5 persona rows (avatar 36 + vertical pad) */}
        <ScrollView
          style={{
            maxHeight:
              seatPicker?.field === 'persona' ? 64 * 5 : 51 * 5,
          }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {seatPicker?.field === 'persona' ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (!seatPicker) return;
                  updateSeat(seatPicker.seatId, {
                    personaId: undefined,
                    inlinePersona: undefined,
                  });
                  setSeatPicker(null);
                }}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 56,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    marginRight: 12,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="remove-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontFamily: 'Poppins',
                    color: theme.colors.text,
                    marginRight: 12,
                  }}
                >
                  None
                </Text>
                {!pickerSeat?.personaId && !pickerSeat?.inlinePersona ? (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.colors.text}
                  />
                ) : null}
              </TouchableOpacity>
              {pickerSeat?.inlinePersona?.name && !pickerSeat.personaId ? (
                <TouchableOpacity
                  onPress={() => setSeatPicker(null)}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 56,
                  }}
                >
                  <View style={{ marginRight: 12 }}>
                    <PersonaAvatar
                      persona={{
                        id: pickerSeat.id,
                        name: pickerSeat.inlinePersona.name,
                        tagline: pickerSeat.inlinePersona.tagline ?? '',
                        createdAt: 0,
                        avatar: pickerSeat.inlinePersona.avatar,
                      }}
                      size={36}
                      borderRadius={10}
                      backgroundColor={theme.colors.surface}
                      iconColor={theme.colors.text}
                    />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontFamily: 'Poppins',
                      color: theme.colors.text,
                      marginRight: 12,
                    }}
                    numberOfLines={1}
                  >
                    {pickerSeat.inlinePersona.name}
                  </Text>
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.colors.text}
                  />
                </TouchableOpacity>
              ) : null}
              {personas.map((p) => {
                const selected = pickerSeat?.personaId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      if (!seatPicker) return;
                      updateSeat(seatPicker.seatId, {
                        personaId: p.id,
                        inlinePersona: undefined,
                      });
                      setSeatPicker(null);
                    }}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: 56,
                    }}
                  >
                    <View style={{ marginRight: 12 }}>
                      <PersonaAvatar
                        persona={p}
                        size={36}
                        borderRadius={10}
                        backgroundColor={theme.colors.surface}
                        iconColor={theme.colors.text}
                      />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 16,
                        fontFamily: 'Poppins',
                        color: theme.colors.text,
                        marginRight: 12,
                      }}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={22}
                        color={theme.colors.text}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : (
            <>
              {downloadedModels.length === 0 ? (
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: 'Poppins',
                    color: theme.colors.textSecondary,
                    paddingVertical: 16,
                    lineHeight: 21,
                  }}
                >
                  No models downloaded yet. Add one from Models, then come back
                  to assign it to this speaker.
                </Text>
              ) : (
                downloadedModels.map((m) => {
                  const selected = pickerSeat?.modelFileName === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        if (!seatPicker) return;
                        updateSeat(seatPicker.seatId, { modelFileName: m });
                        setSeatPicker(null);
                      }}
                      style={{
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 16,
                          fontFamily: 'Poppins',
                          color: theme.colors.text,
                          marginRight: 12,
                        }}
                        numberOfLines={1}
                      >
                        {prettifyModelName(m)}
                      </Text>
                      {selected ? (
                        <Ionicons
                          name="checkmark"
                          size={22}
                          color={theme.colors.text}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
