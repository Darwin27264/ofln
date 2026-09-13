/**
 * Create / edit a scheduled task — calm, progressive form.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { FloatingBackButton } from "../components/FloatingBackButton";
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from "../utils/layoutInsets";
import {
  buildNewScheduledTask,
  generateTaskId,
  removeTask,
  saveTask,
  type ScheduledTask,
  type TaskKind,
} from "../services/taskService";
import { getPersonas, type Persona } from "../services/personaService";
import { prettifyModelName } from "../utils/modelUtils";
import {
  clampHour,
  clampMinute,
  computeNextRunAt,
  formatNextRun,
  formatScheduleSummary,
  isValidHttpUrl,
  normalizeSchedule,
  normalizeWeekdays,
  type TaskCadence,
} from "../utils/taskScheduleHelpers";

interface Props {
  task?: ScheduledTask | null;
  downloadedModels: string[];
  onSave: (task: ScheduledTask) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

const WEEKDAYS = [
  { value: 0, label: "S" },
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
] as const;

const TIME_PRESETS = [
  { label: "Morning", hour: 9, minute: 0 },
  { label: "Noon", hour: 12, minute: 0 },
  { label: "Evening", hour: 18, minute: 0 },
] as const;

const LLM_DEFAULT =
  "Write a short original poem for this morning. Keep it warm and vivid, about 8–12 lines.";
const SOURCE_DEFAULT =
  "Summarize the important updates from this source. Call out anything new, urgent, or actionable.";

type PickerTarget = "persona" | "model" | null;

export default function TaskEditorScreen({
  task,
  downloadedModels,
  onSave,
  onCancel,
  onDeleted,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();
  const isEditMode = !!task;

  const [taskId] = useState(() => task?.id || generateTaskId());
  const [name, setName] = useState(task?.name || "");
  const [kind, setKind] = useState<TaskKind>(
    task?.kind === "source_monitor" ? "source_monitor" : "llm_prompt",
  );
  const [enabled, setEnabled] = useState(task?.enabled !== false);
  const [sourceUrl, setSourceUrl] = useState(task?.sourceUrl || "");
  const [analysisPrompt, setAnalysisPrompt] = useState(() => {
    if (task?.analysisPrompt) return task.analysisPrompt;
    return task?.kind === "source_monitor" ? SOURCE_DEFAULT : LLM_DEFAULT;
  });
  const [cadence, setCadence] = useState<TaskCadence>(
    task?.schedule?.cadence === "weekly" ? "weekly" : "daily",
  );
  const [hour, setHour] = useState(clampHour(task?.schedule?.hour ?? 9));
  const [minute, setMinute] = useState(clampMinute(task?.schedule?.minute ?? 0));
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    normalizeWeekdays(
      task?.schedule?.weekdays,
      (task?.schedule as { weekday?: number } | undefined)?.weekday,
    ),
  );
  const [personaId, setPersonaId] = useState<string | null>(
    task?.personaId ?? null,
  );
  const [modelFileName, setModelFileName] = useState<string | null>(
    task?.modelFileName ?? null,
  );
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showMore, setShowMore] = useState(
    () => !!(task?.personaId || task?.modelFileName || task?.enabled === false),
  );
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void getPersonas()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  const markDirty = useCallback(() => setDirty(true), []);

  const schedulePreview = useMemo(() => {
    const schedule = normalizeSchedule({
      cadence,
      hour,
      minute,
      weekdays,
    });
    const next = computeNextRunAt(schedule);
    return {
      summary: formatScheduleSummary(schedule),
      nextLabel: formatNextRun(next),
      schedule,
      next,
    };
  }, [cadence, hour, minute, weekdays]);

  const activeTimePreset = TIME_PRESETS.find(
    (p) => p.hour === hour && p.minute === minute,
  );

  const personaName = useMemo(() => {
    if (!personaId) return "Default";
    return personas.find((p) => p.id === personaId)?.name || "Persona";
  }, [personaId, personas]);

  const modelLabel = useMemo(() => {
    if (!modelFileName) return "Default model";
    return prettifyModelName(modelFileName);
  }, [modelFileName]);

  const setKindAndPrompt = useCallback(
    (next: TaskKind) => {
      if (next === kind) return;
      setKind(next);
      setAnalysisPrompt((prev) => {
        if (next === "llm_prompt" && prev.trim() === SOURCE_DEFAULT) {
          return LLM_DEFAULT;
        }
        if (next === "source_monitor" && prev.trim() === LLM_DEFAULT) {
          return SOURCE_DEFAULT;
        }
        return prev;
      });
      markDirty();
    },
    [kind, markDirty],
  );

  const toggleWeekday = useCallback(
    (day: number) => {
      setWeekdays((prev) => {
        const has = prev.includes(day);
        if (has) {
          if (prev.length <= 1) return prev;
          return prev.filter((d) => d !== day).sort((a, b) => a - b);
        }
        return [...prev, day].sort((a, b) => a - b);
      });
      markDirty();
    },
    [markDirty],
  );

  const nudgeHour = useCallback(
    (delta: number) => {
      setHour((h) => clampHour(h + delta));
      markDirty();
    },
    [markDirty],
  );

  const nudgeMinute = useCallback(
    (delta: number) => {
      setMinute((m) => {
        let next = m + delta;
        while (next >= 60) next -= 60;
        while (next < 0) next += 60;
        return clampMinute(next);
      });
      markDirty();
    },
    [markDirty],
  );

  const handleBack = useCallback(() => {
    if (!dirty) {
      onCancel();
      return;
    }
    showAlert("Discard changes?", "Your edits will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onCancel },
    ]);
  }, [dirty, onCancel]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showAlert("Name required", "Give this task a short name.", [{ text: "OK" }]);
      return;
    }
    if (!analysisPrompt.trim()) {
      showAlert(
        "Prompt required",
        kind === "llm_prompt"
          ? "Tell the model what to write."
          : "Tell the model how to analyze the page.",
        [{ text: "OK" }],
      );
      return;
    }
    if (kind === "source_monitor" && !isValidHttpUrl(sourceUrl)) {
      showAlert("URL required", "Enter a valid http(s) link to watch.", [
        { text: "OK" },
      ]);
      return;
    }

    const base = buildNewScheduledTask({
      id: taskId,
      name: name.trim(),
      kind,
      sourceUrl: kind === "source_monitor" ? sourceUrl.trim() : "",
      enabled,
      analysisPrompt,
      schedule: schedulePreview.schedule,
      personaId,
      modelFileName,
      createdAt: task?.createdAt,
      lastStatus: task?.lastStatus || "idle",
      lastRunAt: task?.lastRunAt,
      nextRunAt: schedulePreview.next,
    });

    void saveTask(base)
      .then((saved) => {
        setDirty(false);
        onSave(saved);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        showAlert("Save failed", msg, [{ text: "OK" }]);
      });
  }, [
    name,
    kind,
    sourceUrl,
    enabled,
    analysisPrompt,
    schedulePreview,
    personaId,
    modelFileName,
    taskId,
    task,
    onSave,
  ]);

  const handleDelete = useCallback(() => {
    showAlert("Delete task?", "Run history will be removed too.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void removeTask(taskId)
            .then(() => onDeleted?.())
            .catch(() => {
              showAlert("Error", "Could not delete task.", [{ text: "OK" }]);
            });
        },
      },
    ]);
  }, [taskId, onDeleted]);

  const fieldLabel = {
    fontSize: 14,
    fontWeight: "500" as const,
    color: theme.colors.text,
    fontFamily: "Poppins",
    marginBottom: 8,
  };
  const inputBase = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    color: theme.colors.text,
    fontFamily: "Poppins",
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };
  const helper = {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: "Poppins",
    lineHeight: 19,
    marginTop: 8,
  };
  const sectionTitle = {
    fontSize: 18,
    fontWeight: "600" as const,
    color: theme.colors.text,
    fontFamily: "Poppins",
    marginBottom: 12,
  };
  const choiceRow = (active: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: active ? theme.colors.primary : theme.colors.border,
    backgroundColor: active ? theme.colors.secondary : theme.colors.surface,
    marginBottom: 8,
  });
  const dropdownRow = {
    ...inputBase,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  };

  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={styles.settingsTitle}>
        {isEditMode ? "Edit task" : "New task"}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: theme.colors.textSecondary,
          fontFamily: "Poppins",
          marginTop: -6,
          marginBottom: 16,
          lineHeight: 20,
        }}
      >
        Name it, write the prompt, pick a time. Everything else is optional.
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <Text style={fieldLabel}>
          Name <Text style={{ color: theme.colors.error }}>*</Text>
        </Text>
        <TextInput
          style={[inputBase, { marginBottom: 24 }]}
          value={name}
          onChangeText={(t) => {
            setName(t);
            markDirty();
          }}
          placeholder={
            kind === "llm_prompt" ? "Morning poem" : "Blog watch"
          }
          placeholderTextColor={theme.colors.textTertiary}
        />

        {/* What */}
        <Text style={sectionTitle}>What</Text>
        <TouchableOpacity
          style={choiceRow(kind === "llm_prompt")}
          onPress={() => setKindAndPrompt("llm_prompt")}
          activeOpacity={0.85}
        >
          <Icon
            name="edit"
            size={22}
            color={theme.colors.text}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Poppins",
                fontWeight: "600",
                fontSize: 15,
                color: theme.colors.text,
              }}
            >
              Write something
            </Text>
            <Text style={{ fontFamily: "Poppins", fontSize: 13, color: theme.colors.textSecondary }}>
              Run a prompt on a schedule
            </Text>
          </View>
          {kind === "llm_prompt" ? (
            <Icon name="check-circle" size={22} color={theme.colors.primary} />
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[choiceRow(kind === "source_monitor"), { marginBottom: 20 }]}
          onPress={() => setKindAndPrompt("source_monitor")}
          activeOpacity={0.85}
        >
          <Icon name="link" size={22} color={theme.colors.text} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Poppins",
                fontWeight: "600",
                fontSize: 15,
                color: theme.colors.text,
              }}
            >
              Watch a webpage
            </Text>
            <Text style={{ fontFamily: "Poppins", fontSize: 13, color: theme.colors.textSecondary }}>
              Fetch a link, then analyze it
            </Text>
          </View>
          {kind === "source_monitor" ? (
            <Icon name="check-circle" size={22} color={theme.colors.primary} />
          ) : null}
        </TouchableOpacity>

        {kind === "source_monitor" ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={fieldLabel}>
              Page URL <Text style={{ color: theme.colors.error }}>*</Text>
            </Text>
            <TextInput
              style={inputBase}
              value={sourceUrl}
              onChangeText={(t) => {
                setSourceUrl(t);
                markDirty();
              }}
              placeholder="https://…"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        ) : null}

        {/* Prompt */}
        <Text style={sectionTitle}>
          {kind === "llm_prompt" ? "Prompt" : "How to analyze"}{" "}
          <Text style={{ color: theme.colors.error, fontSize: 16 }}>*</Text>
        </Text>
        <TextInput
          style={[inputBase, { minHeight: 120, textAlignVertical: "top", marginBottom: 8 }]}
          value={analysisPrompt}
          onChangeText={(t) => {
            setAnalysisPrompt(t);
            markDirty();
          }}
          placeholder={
            kind === "llm_prompt"
              ? "Write a short poem about…"
              : "Summarize what changed and why it matters…"
          }
          placeholderTextColor={theme.colors.textTertiary}
          multiline
        />
        <Text style={[helper, { marginBottom: 24 }]}>
          {kind === "llm_prompt"
            ? "This runs on-device with your downloaded model."
            : "The page text is attached to this prompt each run."}
        </Text>

        {/* When */}
        <Text style={sectionTitle}>When</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {(["daily", "weekly"] as const).map((c) => {
            const active = cadence === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => {
                  setCadence(c);
                  markDirty();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: active
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins",
                    fontWeight: "600",
                    fontSize: 14,
                    color: active
                      ? theme.colors.primaryText
                      : theme.colors.text,
                  }}
                >
                  {c === "daily" ? "Every day" : "Some days"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {cadence === "weekly" ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 12,
              gap: 4,
            }}
          >
            {WEEKDAYS.map((d) => {
              const selected = weekdays.includes(d.value);
              return (
                <TouchableOpacity
                  key={d.value}
                  onPress={() => toggleWeekday(d.value)}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    maxWidth: 44,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected
                      ? theme.colors.primary
                      : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins",
                      fontWeight: "700",
                      fontSize: 13,
                      color: selected
                        ? theme.colors.primaryText
                        : theme.colors.text,
                    }}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={fieldLabel}>Time</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {TIME_PRESETS.map((p) => {
            const active =
              activeTimePreset?.label === p.label;
            return (
              <TouchableOpacity
                key={p.label}
                onPress={() => {
                  setHour(p.hour);
                  setMinute(p.minute);
                  markDirty();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: active
                    ? theme.colors.secondary
                    : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: active
                    ? theme.colors.primary
                    : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins",
                    fontWeight: "600",
                    fontSize: 13,
                    color: theme.colors.text,
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginBottom: 8,
            paddingVertical: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => nudgeHour(-1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Icon name="remove" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nudgeMinute(15)}
            accessibilityLabel="Later by 15 minutes"
          >
            <Text
              style={{
                fontFamily: "Poppins",
                fontSize: 28,
                fontWeight: "600",
                color: theme.colors.text,
                minWidth: 90,
                textAlign: "center",
              }}
            >
              {timeStr}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nudgeHour(1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Icon name="add" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={[helper, { textAlign: "center", marginBottom: 24 }]}>
          {schedulePreview.summary}. Next: {schedulePreview.nextLabel}.
          {"\n"}+/− changes the hour · tap the clock for +15 min.
        </Text>

        {/* More */}
        <TouchableOpacity
          onPress={() => setShowMore((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 12,
            marginBottom: showMore ? 12 : 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Poppins",
              fontWeight: "600",
              fontSize: 16,
              color: theme.colors.text,
            }}
          >
            More options
          </Text>
          <Icon
            name={showMore ? "expand-less" : "expand-more"}
            size={24}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {showMore ? (
          <View style={{ marginBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontFamily: "Poppins",
                    fontWeight: "500",
                    fontSize: 15,
                    color: theme.colors.text,
                  }}
                >
                  Enabled
                </Text>
                <Text style={helper}>
                  Off keeps the task saved without running.
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(v) => {
                  setEnabled(v);
                  markDirty();
                }}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                thumbColor={theme.colors.card}
              />
            </View>

            <Text style={fieldLabel}>Persona</Text>
            <TouchableOpacity
              style={[dropdownRow, { marginBottom: 16 }]}
              onPress={() => setPicker("persona")}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {personaName}
              </Text>
              <Icon name="expand-more" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <Text style={fieldLabel}>Model</Text>
            <TouchableOpacity
              style={dropdownRow}
              onPress={() => {
                if (downloadedModels.length === 0) {
                  showAlert(
                    "No models",
                    "Download a model in Settings → Models first.",
                    [{ text: "OK" }],
                  );
                  return;
                }
                setPicker("model");
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {modelLabel}
              </Text>
              <Icon name="expand-more" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {isEditMode ? (
          <TouchableOpacity
            onPress={handleDelete}
            style={{
              marginTop: 8,
              marginBottom: 24,
              paddingVertical: 14,
              alignItems: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.error,
            }}
          >
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: "Poppins",
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              Delete task
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ height: 16 }} />
        )}
      </ScrollView>

      <View style={{ position: "absolute", left: 15, bottom: backBottom }}>
        <FloatingBackButton onPress={handleBack} />
      </View>
      <TouchableOpacity
        onPress={handleSave}
        accessibilityLabel="Save task"
        style={{
          position: "absolute",
          right: 15,
          bottom: backBottom,
          backgroundColor: theme.colors.primary,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 24,
        }}
      >
        <Text
          style={{
            color: theme.colors.primaryText,
            fontSize: 16,
            fontWeight: "600",
            fontFamily: "Poppins",
          }}
        >
          Save
        </Text>
      </TouchableOpacity>

      <BottomSheet
        visible={picker != null}
        onClose={() => setPicker(null)}
        title={picker === "persona" ? "Persona" : "Model"}
        height={0.5}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {picker === "persona" ? (
            <>
              <TouchableOpacity
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderLight,
                }}
                onPress={() => {
                  setPersonaId(null);
                  markDirty();
                  setPicker(null);
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins",
                    fontSize: 16,
                    color: theme.colors.text,
                    fontWeight: !personaId ? "700" : "400",
                  }}
                >
                  Default
                </Text>
              </TouchableOpacity>
              {personas.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.borderLight,
                  }}
                  onPress={() => {
                    setPersonaId(p.id);
                    markDirty();
                    setPicker(null);
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins",
                      fontSize: 16,
                      color: theme.colors.text,
                      fontWeight: personaId === p.id ? "700" : "400",
                    }}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : null}
          {picker === "model" ? (
            <>
              <TouchableOpacity
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderLight,
                }}
                onPress={() => {
                  setModelFileName(null);
                  markDirty();
                  setPicker(null);
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins",
                    fontSize: 16,
                    color: theme.colors.text,
                    fontWeight: !modelFileName ? "700" : "400",
                  }}
                >
                  Default model
                </Text>
              </TouchableOpacity>
              {downloadedModels.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.borderLight,
                  }}
                  onPress={() => {
                    setModelFileName(m);
                    markDirty();
                    setPicker(null);
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins",
                      fontSize: 15,
                      color: theme.colors.text,
                      fontWeight: modelFileName === m ? "700" : "400",
                    }}
                    numberOfLines={2}
                  >
                    {prettifyModelName(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
