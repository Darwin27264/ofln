/**
 * Create / edit a scheduled task — calm, progressive form.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { FloatingBackButton } from "../components/FloatingBackButton";
import { PersonaAvatar } from "../components/PersonaAvatar";
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from "../utils/layoutInsets";
import {
  ANIMATION_DURATIONS,
  EASING,
} from "../utils/animationConfig";
import {
  buildNewScheduledTask,
  generateTaskId,
  removeTask,
  saveTask,
  type ScheduledTask,
  type TaskKind,
} from "../services/taskService";
import {
  checkNotificationPermission,
  requestNotificationPermission,
} from "../services/nativeTaskScheduler";
import { getPersonasEnsured, type Persona } from "../services/personaService";
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

const WHEEL_ITEM_H = 48;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H;
const WHEEL_COLLAPSED_H = WHEEL_ITEM_H;
const WHEEL_EXPANDED_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_IDLE_MS = 1200;
const WHEEL_EXPAND_MS = ANIMATION_DURATIONS.FAST;
const WHEEL_COLLAPSE_MS = ANIMATION_DURATIONS.SLOW;

type DigitWheelProps = {
  count: number;
  value: number;
  onChange: (next: number) => void;
  textColor: string;
  accessibilityLabel: string;
  onInteractStart: () => void;
  onInteractEnd: () => void;
};

function DigitWheel({
  count,
  value,
  onChange,
  textColor,
  accessibilityLabel,
  onInteractStart,
  onInteractEnd,
}: DigitWheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(value * WHEEL_ITEM_H)).current;
  const dragging = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const values = useMemo(
    () => Array.from({ length: count }, (_, i) => i),
    [count],
  );

  const syncScroll = useCallback(
    (next: number, animated: boolean) => {
      const y = next * WHEEL_ITEM_H;
      scrollRef.current?.scrollTo({ y, animated });
      if (!animated) scrollY.setValue(y);
    },
    [scrollY],
  );

  useEffect(() => {
    if (dragging.current) return;
    syncScroll(value, false);
  }, [value, syncScroll]);

  const commitOffset = useCallback(
    (y: number) => {
      const idx = Math.max(
        0,
        Math.min(count - 1, Math.round(y / WHEEL_ITEM_H)),
      );
      syncScroll(idx, true);
      if (idx !== valueRef.current) onChange(idx);
      return idx;
    },
    [count, onChange, syncScroll],
  );

  const finishInteraction = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const wasDragging = dragging.current;
      dragging.current = false;
      commitOffset(e.nativeEvent.contentOffset.y);
      if (wasDragging) onInteractEnd();
    },
    [commitOffset, onInteractEnd],
  );

  return (
    <View
      style={localStyles.wheelCol}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: 0,
        max: count - 1,
        now: value,
        text: String(value).padStart(2, "0"),
      }}
    >
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        disableIntervalMomentum
        bounces={false}
        overScrollMode="never"
        contentOffset={{ x: 0, y: value * WHEEL_ITEM_H }}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          dragging.current = true;
          onInteractStart();
        }}
        onMomentumScrollEnd={finishInteraction}
        onScrollEndDrag={(e) => {
          const vy = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(vy) < 0.08) {
            finishInteraction(e);
          }
        }}
      >
        {values.map((n) => {
          const center = n * WHEEL_ITEM_H;
          const opacity = scrollY.interpolate({
            inputRange: [
              center - WHEEL_ITEM_H * 2,
              center - WHEEL_ITEM_H,
              center,
              center + WHEEL_ITEM_H,
              center + WHEEL_ITEM_H * 2,
            ],
            outputRange: [0.18, 0.4, 1, 0.4, 0.18],
            extrapolate: "clamp",
          });
          const scale = scrollY.interpolate({
            inputRange: [
              center - WHEEL_ITEM_H,
              center,
              center + WHEEL_ITEM_H,
            ],
            outputRange: [0.82, 1.06, 0.82],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              key={n}
              style={[
                localStyles.wheelItem,
                { opacity, transform: [{ scale }] },
              ]}
            >
              <Text style={[localStyles.wheelDigit, { color: textColor }]}>
                {String(n).padStart(2, "0")}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

type TimeWheelPickerProps = {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  textColor: string;
  surfaceColor: string;
  borderColor: string;
  highlightBg: string;
  captionColor: string;
};

function TimeWheelPicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  textColor,
  surfaceColor,
  borderColor,
  highlightBg,
  captionColor,
}: TimeWheelPickerProps) {
  const expandAnim = useRef(new Animated.Value(0)).current;
  const expandedRef = useRef(false);
  const locks = useRef({ touch: false, drag: false });
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const clearIdle = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const animateExpand = useCallback(
    (toExpanded: boolean) => {
      if (expandedRef.current === toExpanded) return;
      expandedRef.current = toExpanded;
      animRef.current?.stop();
      animRef.current = Animated.timing(expandAnim, {
        toValue: toExpanded ? 1 : 0,
        duration: toExpanded ? WHEEL_EXPAND_MS : WHEEL_COLLAPSE_MS,
        easing: toExpanded ? EASING.DECELERATE : EASING.STANDARD,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished) animRef.current = null;
      });
    },
    [expandAnim],
  );

  const scheduleCollapse = useCallback(() => {
    clearIdle();
    idleTimer.current = setTimeout(() => {
      if (locks.current.touch || locks.current.drag) return;
      animateExpand(false);
    }, WHEEL_IDLE_MS);
  }, [animateExpand, clearIdle]);

  const onInteractStart = useCallback(() => {
    clearIdle();
    animateExpand(true);
  }, [animateExpand, clearIdle]);

  const onDragStart = useCallback(() => {
    locks.current.drag = true;
    clearIdle();
    animateExpand(true);
  }, [animateExpand, clearIdle]);

  const onDragEnd = useCallback(() => {
    locks.current.drag = false;
    if (!locks.current.touch) scheduleCollapse();
  }, [scheduleCollapse]);

  const onTouchBegin = useCallback(() => {
    locks.current.touch = true;
    onInteractStart();
  }, [onInteractStart]);

  const onTouchFinish = useCallback(() => {
    locks.current.touch = false;
    if (!locks.current.drag) scheduleCollapse();
  }, [scheduleCollapse]);

  useEffect(() => {
    return () => {
      clearIdle();
      animRef.current?.stop();
    };
  }, [clearIdle]);

  const clipHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [WHEEL_COLLAPSED_H, WHEEL_EXPANDED_H],
  });

  const innerOffset = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-WHEEL_PAD, 0],
  });

  const highlightOpacity = expandAnim.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });

  const captionOpacity = expandAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const captionHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 22],
  });

  return (
    <View
      style={[
        localStyles.wheelCard,
        { backgroundColor: surfaceColor, borderColor },
      ]}
      onTouchStart={onTouchBegin}
      onTouchEnd={onTouchFinish}
      onTouchCancel={onTouchFinish}
    >
      <Animated.View style={[localStyles.wheelClip, { height: clipHeight }]}>
        <Animated.View
          style={[
            localStyles.wheelInner,
            { transform: [{ translateY: innerOffset }] },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              localStyles.wheelHighlight,
              {
                backgroundColor: highlightBg,
                opacity: highlightOpacity,
              },
            ]}
          />
          <View style={localStyles.wheelRow}>
            <DigitWheel
              count={24}
              value={hour}
              onChange={onHourChange}
              textColor={textColor}
              accessibilityLabel="Hour"
              onInteractStart={onDragStart}
              onInteractEnd={onDragEnd}
            />
            <Text style={[localStyles.wheelColon, { color: textColor }]}>:</Text>
            <DigitWheel
              count={60}
              value={minute}
              onChange={onMinuteChange}
              textColor={textColor}
              accessibilityLabel="Minute"
              onInteractStart={onDragStart}
              onInteractEnd={onDragEnd}
            />
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          localStyles.wheelLabels,
          { opacity: captionOpacity, height: captionHeight },
        ]}
      >
        <Text style={[localStyles.wheelCaption, { color: captionColor }]}>
          Hour
        </Text>
        <View style={{ width: 28 }} />
        <Text style={[localStyles.wheelCaption, { color: captionColor }]}>
          Minute
        </Text>
      </Animated.View>
    </View>
  );
}

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
  const [modelFileName, setModelFileName] = useState<string | null>(() => {
    const saved = task?.modelFileName?.trim() || null;
    if (saved && downloadedModels.includes(saved)) return saved;
    return downloadedModels[0] ?? null;
  });
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showMore, setShowMore] = useState(
    () => task?.enabled === false,
  );
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void getPersonasEnsured()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  // Prefer an explicit downloaded model — never a vague "default".
  useEffect(() => {
    if (downloadedModels.length === 0) {
      if (modelFileName) setModelFileName(null);
      return;
    }
    if (!modelFileName || !downloadedModels.includes(modelFileName)) {
      setModelFileName(downloadedModels[0]);
    }
  }, [downloadedModels, modelFileName]);

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

  const selectedPersona = useMemo(
    () => (personaId ? personas.find((p) => p.id === personaId) : undefined),
    [personaId, personas],
  );

  const personaName = selectedPersona?.name || "None";

  const modelLabel = useMemo(() => {
    if (!modelFileName) return "Choose model…";
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

  const onHourChange = useCallback(
    (v: number) => {
      setHour(clampHour(v));
      markDirty();
    },
    [markDirty],
  );

  const onMinuteChange = useCallback(
    (v: number) => {
      setMinute(clampMinute(v));
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
        if (saved.enabled) {
          void checkNotificationPermission().then((granted) => {
            if (!granted) {
              void requestNotificationPermission();
            }
          });
        }
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

  const fieldLabel = useMemo(
    () => ({
      fontSize: 14,
      fontWeight: "500" as const,
      color: theme.colors.text,
      fontFamily: "Poppins",
      marginBottom: 8,
    }),
    [theme.colors.text],
  );
  const inputBase = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 12,
      color: theme.colors.text,
      fontFamily: "Poppins",
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }),
    [theme.colors],
  );
  const helper = useMemo(
    () => ({
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontFamily: "Poppins",
      lineHeight: 21,
      marginTop: 8,
    }),
    [theme.colors.textSecondary],
  );
  const sectionTitle = useMemo(
    () => ({
      fontSize: 18,
      fontWeight: "600" as const,
      color: theme.colors.text,
      fontFamily: "Poppins",
      marginBottom: 8,
    }),
    [theme.colors.text],
  );
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
  const dropdownStyle = useMemo(
    () => ({
      ...inputBase,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    }),
    [inputBase],
  );

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitle}>Basics</Text>
          <Text style={fieldLabel}>
            Name <Text style={{ color: theme.colors.error }}>*</Text>
          </Text>
          <TextInput
            style={inputBase}
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
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitle}>What</Text>
          <TouchableOpacity
            style={choiceRow(kind === "llm_prompt")}
            onPress={() => setKindAndPrompt("llm_prompt")}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={22} color={theme.colors.text} />
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
              <Text
                style={{
                  fontFamily: "Poppins",
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                }}
              >
                Run a prompt on a schedule
              </Text>
            </View>
            {kind === "llm_prompt" ? (
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={theme.colors.primary}
              />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[choiceRow(kind === "source_monitor"), { marginBottom: 0 }]}
            onPress={() => setKindAndPrompt("source_monitor")}
            activeOpacity={0.85}
          >
            <Ionicons name="link-outline" size={22} color={theme.colors.text} />
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
              <Text
                style={{
                  fontFamily: "Poppins",
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                }}
              >
                Fetch a link, then analyze it
              </Text>
            </View>
            {kind === "source_monitor" ? (
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={theme.colors.primary}
              />
            ) : null}
          </TouchableOpacity>
        </View>

        {kind === "source_monitor" ? (
          <View style={{ marginBottom: 24 }}>
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

        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitle}>
            {kind === "llm_prompt" ? "Prompt" : "How to analyze"}{" "}
            <Text style={{ color: theme.colors.error, fontSize: 16 }}>*</Text>
          </Text>
          <TextInput
            style={[
              inputBase,
              { minHeight: 120, textAlignVertical: "top", marginBottom: 8 },
            ]}
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
          <Text style={helper}>
            {kind === "llm_prompt"
              ? "This runs on-device with your downloaded model."
              : "The page text is attached to this prompt each run."}
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
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
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
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
          <TimeWheelPicker
            hour={hour}
            minute={minute}
            onHourChange={onHourChange}
            onMinuteChange={onMinuteChange}
            textColor={theme.colors.text}
            surfaceColor={theme.colors.surface}
            borderColor={theme.colors.border}
            highlightBg={theme.colors.secondary}
            captionColor={theme.colors.textTertiary}
          />

          <Text style={[helper, { marginTop: 12 }]}>
            {schedulePreview.summary}. Next: {schedulePreview.nextLabel}.
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={sectionTitle}>Persona & model</Text>
          <Text style={[helper, { marginTop: 0, marginBottom: 16 }]}>
            Persona is optional. A downloaded model is selected automatically —
            change it anytime.
          </Text>

          <View style={{ marginBottom: 14 }}>
            <Text style={fieldLabel}>Persona</Text>
            <TouchableOpacity
              style={dropdownStyle}
              onPress={() => setPicker("persona")}
              activeOpacity={0.85}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  marginRight: 8,
                }}
              >
                {selectedPersona ? (
                  <View style={{ marginRight: 10 }}>
                    <PersonaAvatar
                      persona={selectedPersona}
                      size={28}
                      borderRadius={8}
                      backgroundColor={theme.colors.background}
                      iconColor={theme.colors.text}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      marginRight: 10,
                      backgroundColor: theme.colors.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="remove-outline"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontFamily: "Poppins",
                    color: theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {personaName}
                </Text>
              </View>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={fieldLabel}>Model</Text>
            <TouchableOpacity
              style={dropdownStyle}
              onPress={() => setPicker("model")}
              activeOpacity={0.85}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontFamily: "Poppins",
                  color: modelFileName
                    ? theme.colors.text
                    : theme.colors.textTertiary,
                  marginRight: 8,
                }}
                numberOfLines={1}
              >
                {modelLabel}
              </Text>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

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
          <Ionicons
            name={showMore ? "chevron-up" : "chevron-down"}
            size={22}
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
        title={picker === "persona" ? "Choose persona" : "Choose model"}
        fitContent
        maxHeight={0.7}
      >
        <ScrollView
          style={{
            maxHeight: picker === "persona" ? 64 * 5 : 51 * 5,
          }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {picker === "persona" ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  setPersonaId(null);
                  markDirty();
                  setPicker(null);
                }}
                style={[
                  localStyles.pickerRow,
                  { borderBottomColor: theme.colors.border },
                ]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    marginRight: 12,
                    backgroundColor: theme.colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="remove-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    localStyles.pickerLabel,
                    { color: theme.colors.text },
                  ]}
                >
                  None
                </Text>
                {!personaId ? (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.colors.text}
                  />
                ) : null}
              </TouchableOpacity>
              {personas.length === 0 ? (
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins",
                    color: theme.colors.textSecondary,
                    paddingVertical: 16,
                    lineHeight: 21,
                  }}
                >
                  No personas yet. Create one from Personas, then come back to
                  assign it.
                </Text>
              ) : (
                personas.map((p) => {
                  const selected = personaId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => {
                        setPersonaId(p.id);
                        markDirty();
                        setPicker(null);
                      }}
                      style={[
                        localStyles.pickerRow,
                        { borderBottomColor: theme.colors.border },
                      ]}
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
                        style={[
                          localStyles.pickerLabel,
                          { color: theme.colors.text },
                        ]}
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
                })
              )}
            </>
          ) : null}

          {picker === "model" ? (
            <>
              {downloadedModels.length === 0 ? (
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins",
                    color: theme.colors.textSecondary,
                    paddingVertical: 16,
                    lineHeight: 21,
                  }}
                >
                  No models downloaded yet. Add one from Models, then come back
                  to assign it to this task.
                </Text>
              ) : (
                downloadedModels.map((m) => {
                  const selected = modelFileName === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setModelFileName(m);
                        markDirty();
                        setPicker(null);
                      }}
                      style={[
                        localStyles.pickerRow,
                        {
                          borderBottomColor: theme.colors.border,
                          minHeight: 48,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.pickerLabel,
                          { color: theme.colors.text },
                        ]}
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
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wheelCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  wheelClip: {
    overflow: "hidden",
    alignSelf: "center",
    width: "100%",
  },
  wheelInner: {
    height: WHEEL_EXPANDED_H,
    justifyContent: "flex-start",
  },
  wheelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: WHEEL_EXPANDED_H,
  },
  wheelCol: {
    width: 88,
    height: WHEEL_EXPANDED_H,
    overflow: "hidden",
  },
  wheelHighlight: {
    position: "absolute",
    left: 24,
    right: 24,
    top: WHEEL_PAD,
    height: WHEEL_ITEM_H,
    borderRadius: 14,
    zIndex: 0,
  },
  wheelItem: {
    height: WHEEL_ITEM_H,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelDigit: {
    fontFamily: "Poppins",
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: 1,
  },
  wheelColon: {
    fontFamily: "Poppins",
    fontSize: 32,
    fontWeight: "600",
    marginHorizontal: 6,
    marginBottom: 2,
  },
  wheelLabels: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  wheelCaption: {
    width: 88,
    textAlign: "center",
    fontFamily: "Poppins",
    fontSize: 12,
    fontWeight: "500",
  },
  pickerRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
  },
  pickerLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Poppins",
    marginRight: 12,
  },
});
