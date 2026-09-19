/**
 * Tasks library — Tasks / Results tabs; expand a card for Run / Edit / Delete.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  FloatingBackButton,
  FloatingIconButton,
} from "../components/FloatingBackButton";
import { BottomSheet } from "../components/BottomSheet";
import { SegmentedTabBar } from "../components/SegmentedTabBar";
import {
  LibraryCardEnter,
  useLibraryCardEnter,
} from "../components/LibraryCardEnter";
import { FrostedPanel, SETTINGS_BLOCK } from "../components/FrostedGlass";
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from "../utils/layoutInsets";
import {
  getAllTaskRuns,
  getRunsForTask,
  getTasks,
  removeTask,
  replaceAllTaskRuns,
  setTaskEnabled,
  taskKindLabel,
  type ScheduledTask,
  type TaskLastStatus,
  type TaskRun,
} from "../services/taskService";
import {
  formatNextRun,
  formatScheduleSummary,
} from "../utils/taskScheduleHelpers";
import { isTaskRunnerBusy, runTaskById } from "../services/taskRunnerService";
import {
  checkNotificationPermission,
  requestNotificationPermission,
} from "../services/nativeTaskScheduler";
import type { ChromeScale } from "../utils/chromeScale";

const LIBRARY_TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "results", label: "Results" },
] as const;

export type TasksLibraryTabId = (typeof LIBRARY_TABS)[number]["id"];
type LibraryTabId = TasksLibraryTabId;

interface Props {
  onBack: () => void;
  onEditTask: (task: ScheduledTask | null) => void;
  onOpenRun: (run: TaskRun) => void;
  fallbackModelFileName?: string | null;
  chromeScale: ChromeScale;
  /** Controlled tab so Results stays selected after opening a run. */
  libraryTab?: LibraryTabId;
  onLibraryTabChange?: (tab: LibraryTabId) => void;
}

const BACK_ROW_H = 42;
const TAB_BAR_H = 48;
const TAB_ABOVE_BACK_GAP = 12;

const OUTCOME_SEGMENTS = 22;

function statusColor(
  status: TaskLastStatus | TaskRun["status"],
  colors: {
    success: string;
    error: string;
    warning: string;
    textTertiary: string;
  },
): string {
  switch (status) {
    case "success":
      return colors.success;
    case "failed":
      return colors.error;
    case "running":
    case "pending_analysis":
      return colors.warning;
    default:
      return colors.textTertiary;
  }
}

function statusLabel(status: TaskLastStatus | TaskRun["status"]): string {
  switch (status) {
    case "success":
      return "Done";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "pending_analysis":
      return "Queued";
    case "skipped":
      return "Skipped";
    default:
      return "Ready";
  }
}

function formatRunAgo(ms?: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 45_000) return "Just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(ms);
  }
}

function formatNextRunAbsolute(nextRunAt: number): string {
  try {
    return new Date(nextRunAt).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(nextRunAt);
  }
}

function resultPreview(run: TaskRun): string {
  const text = (run.resultText || run.error || "").trim();
  if (!text) {
    if (run.status === "running" || run.status === "pending_analysis") {
      return "In progress…";
    }
    return "No output";
  }
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 100 ? `${oneLine.slice(0, 100)}…` : oneLine;
}

function outcomeSummaryMessage(done: number, failed: number): string {
  const finished = done + failed;
  if (finished === 0) return "No finished runs yet.";
  if (failed === 0) return "All finished runs completed successfully.";
  if (done === 0) return "Every finished run has failed so far.";
  const rate = done / finished;
  if (rate >= 0.85) return "Most runs are completing cleanly.";
  if (rate >= 0.5) return `${done} completed, ${failed} failed.`;
  return "More runs are failing than completing.";
}

function OutcomeSegmentBar({
  done,
  failed,
  fillColor,
  failColor,
  emptyColor,
}: {
  done: number;
  failed: number;
  fillColor: string;
  failColor: string;
  emptyColor: string;
}) {
  const finished = done + failed;
  const doneSegs =
    finished === 0 ? 0 : Math.round((done / finished) * OUTCOME_SEGMENTS);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        height: 18,
        gap: 2,
      }}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: finished === 0 ? 0 : Math.round((done / finished) * 100),
      }}
    >
      {Array.from({ length: OUTCOME_SEGMENTS }, (_, i) => {
        let backgroundColor = emptyColor;
        if (finished > 0) {
          backgroundColor = i < doneSegs ? fillColor : failColor;
        }
        return (
          <View
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              backgroundColor,
            }}
          />
        );
      })}
    </View>
  );
}

/** Body copy for the post-run alert — task name is the title. */
function runCompleteMessage(run: TaskRun): string {
  const preview = (run.resultText || "").trim().replace(/\s+/g, " ");
  const short =
    preview.length > 160 ? `${preview.slice(0, 160)}…` : preview;

  switch (run.status) {
    case "success":
      return short || "Completed successfully.";
    case "pending_analysis":
      return "Fetched. Finish analysis when the model is free, or tap View.";
    case "skipped":
      return "This run was skipped.";
    case "running":
      return "Still running…";
    default:
      return statusLabel(run.status);
  }
}

export default function TasksLibraryScreen({
  onBack,
  onEditTask,
  onOpenRun,
  fallbackModelFileName,
  chromeScale,
  libraryTab: libraryTabProp,
  onLibraryTabChange,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [libraryTabInternal, setLibraryTabInternal] =
    useState<LibraryTabId>("tasks");
  const libraryTab = libraryTabProp ?? libraryTabInternal;
  const setLibraryTab = useCallback(
    (tab: LibraryTabId) => {
      onLibraryTabChange?.(tab);
      if (libraryTabProp == null) setLibraryTabInternal(tab);
    },
    [libraryTabProp, onLibraryTabChange],
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [latestByTask, setLatestByTask] = useState<
    Record<string, TaskRun | undefined>
  >({});
  const [allRuns, setAllRuns] = useState<TaskRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { animatedIds } = useLibraryCardEnter();

  const tabChromeOuter = useMemo(
    () => ({
      borderRadius: 12,
      padding: 4,
      backgroundColor: "transparent" as const,
    }),
    [],
  );

  const tabChromeInner = useMemo(
    () => ({
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    }),
    [],
  );

  const tabBarBottom = backBottom + BACK_ROW_H + TAB_ABOVE_BACK_GAP;
  const contentPadBottom =
    scrollPadBottom + TAB_BAR_H + TAB_ABOVE_BACK_GAP + 8;

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [list, runsRaw] = await Promise.all([getTasks(), getAllTaskRuns()]);
      // Drop leftover UI-preview mock if it was seeded earlier.
      const runs = runsRaw.filter((r) => r.id !== "run_mock_failed_preview");
      if (runs.length !== runsRaw.length) {
        await replaceAllTaskRuns(runs);
      }
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(list);
      const sortedRuns = [...runs].sort(
        (a, b) =>
          (b.finishedAt || b.startedAt) - (a.finishedAt || a.startedAt),
      );
      setAllRuns(sortedRuns);
      const map: Record<string, TaskRun | undefined> = {};
      for (const run of sortedRuns) {
        if (!map[run.taskId]) map[run.taskId] = run;
      }
      setLatestByTask(map);
    } catch (e) {
      console.error(e);
      showAlert("Error", "Failed to load tasks.", [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runStats = useMemo(() => {
    let running = 0;
    let waiting = 0;
    let done = 0;
    let failed = 0;
    for (const r of allRuns) {
      if (r.status === "running") running += 1;
      else if (r.status === "pending_analysis") waiting += 1;
      else if (r.status === "success") done += 1;
      else if (r.status === "failed") failed += 1;
    }
    const activeTasks = tasks.filter((t) => t.enabled).length;
    return { running, waiting, done, failed, activeTasks, total: allRuns.length };
  }, [allRuns, tasks]);

  const nextScheduled = useMemo(() => {
    const upcoming = tasks
      .filter(
        (t) =>
          t.enabled && Number.isFinite(t.nextRunAt) && t.nextRunAt > 0,
      )
      .sort((a, b) => a.nextRunAt - b.nextRunAt);
    return upcoming[0] ?? null;
  }, [tasks]);

  const summaryItems = useMemo(() => {
    return {
      done: runStats.done,
      failed: runStats.failed,
      active: runStats.activeTasks,
    };
  }, [runStats]);

  const handleToggle = useCallback(
    async (task: ScheduledTask, enabled: boolean) => {
      // Optimistic — avoid full reload (re-sort / remount flash).
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                enabled,
                nextRunAt: enabled ? t.nextRunAt : t.nextRunAt,
              }
            : t,
        ),
      );
      try {
        const saved = await setTaskEnabled(task.id, enabled);
        if (saved) {
          if (enabled) {
            void checkNotificationPermission().then((granted) => {
              if (!granted) {
                void requestNotificationPermission();
              }
            });
          }
          setTasks((prev) =>
            prev.map((t) => (t.id === saved.id ? { ...t, ...saved } : t)),
          );
        }
      } catch {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, enabled: !enabled } : t)),
        );
        showAlert("Error", "Could not update task.", [{ text: "OK" }]);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (task: ScheduledTask) => {
      showAlert(
        "Delete task?",
        `Remove “${task.name}” and its history?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await removeTask(task.id);
                  setExpandedId(null);
                  await load();
                } catch {
                  showAlert("Error", "Could not delete task.", [{ text: "OK" }]);
                }
              })();
            },
          },
        ],
      );
    },
    [load],
  );

  const handleRunNow = useCallback(
    async (task: ScheduledTask) => {
      if (isTaskRunnerBusy() || runningId) {
        showAlert("Busy", "A task is already running.", [{ text: "OK" }]);
        return;
      }
      setRunningId(task.id);
      try {
        const run = await runTaskById(task.id, {
          skipForegroundService: true,
          forceAnalysis: true,
          fallbackModelFileName,
        });
        await load();
        if (run?.status === "failed") {
          showAlert(
            task.name,
            run.error?.trim() || "This run failed.",
            [
              { text: "OK" },
              { text: "View", onPress: () => onOpenRun(run) },
            ],
          );
        } else if (run) {
          showAlert(task.name, runCompleteMessage(run), [
            { text: "OK" },
            { text: "View", onPress: () => onOpenRun(run) },
          ]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showAlert(task.name, msg || "This run failed.", [{ text: "OK" }]);
        await load();
      } finally {
        setRunningId(null);
      }
    },
    [fallbackModelFileName, load, onOpenRun, runningId],
  );

  const openHistory = useCallback(
    async (task: ScheduledTask) => {
      const runs = await getRunsForTask(task.id);
      if (!runs.length) {
        showAlert("No results yet", "Tap Run to create the first result.", [
          { text: "OK" },
        ]);
        return;
      }
      onOpenRun(runs[0]);
    },
    [onOpenRun],
  );

  const cardStyle = {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 12,
  };

  const fixedBtnStyle = {
    position: "absolute" as const,
    bottom: backBottom,
    backgroundColor: "transparent" as const,
  };

  const renderTasksTab = () => (
    <>
      {isLoading && (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      )}

      {!isLoading && tasks.length === 0 && (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 60,
          }}
        >
          <Icon name="alarm" size={64} color={theme.colors.textTertiary} />
          <Text
            style={{
              fontSize: 20,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            No tasks yet
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              fontFamily: "Poppins",
              textAlign: "center",
              marginBottom: 24,
              paddingHorizontal: 32,
              lineHeight: 20,
            }}
          >
            Try a morning poem, or watch a page and summarize it later.
          </Text>
          <TouchableOpacity
            onPress={() => onEditTask(null)}
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
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Add task
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {tasks.map((task, index) => {
        const latest = latestByTask[task.id];
        const chipStatus =
          task.lastStatus === "idle" && latest
            ? latest.status
            : task.lastStatus;
        const chipColor = statusColor(chipStatus, theme.colors);
        const expanded = expandedId === task.id;

        return (
          <LibraryCardEnter
            key={task.id}
            itemId={task.id}
            index={index}
            animatedIds={animatedIds}
          >
            <View style={cardStyle}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    setExpandedId((id) => (id === task.id ? null : task.id))
                  }
                  style={{ flex: 1 }}
                >
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: theme.colors.text,
                      fontFamily: "Poppins",
                    }}
                    numberOfLines={1}
                  >
                    {task.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                      marginTop: 4,
                    }}
                    numberOfLines={1}
                  >
                    {formatScheduleSummary(task.schedule)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: chipColor,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {statusLabel(chipStatus)}
                      {task.enabled
                        ? ` · Next ${formatNextRun(task.nextRunAt)}`
                        : " · Paused"}
                      {` · ${taskKindLabel(task.kind)}`}
                    </Text>
                    <Icon
                      name={expanded ? "expand-less" : "expand-more"}
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                </TouchableOpacity>
                <Switch
                  value={task.enabled}
                  onValueChange={(v) => void handleToggle(task, v)}
                  trackColor={{
                    false: theme.colors.border,
                    true: theme.colors.primary,
                  }}
                  thumbColor={theme.colors.card}
                />
              </View>

              {expanded ? (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                    marginTop: 12,
                    marginHorizontal: -16,
                    marginBottom: -16,
                    padding: 12,
                    backgroundColor: theme.colors.surface,
                    borderBottomLeftRadius: 16,
                    borderBottomRightRadius: 16,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => onEditTask(task)}
                      style={{
                        flex: 1,
                        minWidth: "45%",
                        backgroundColor: theme.colors.primary,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
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
                          fontWeight: "600",
                          fontFamily: "Poppins",
                          marginLeft: 6,
                        }}
                      >
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleRunNow(task)}
                      disabled={runningId === task.id}
                      style={{
                        flex: 1,
                        minWidth: "45%",
                        backgroundColor: theme.colors.accent,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: runningId === task.id ? 0.6 : 1,
                      }}
                      activeOpacity={0.85}
                    >
                      <Icon
                        name="play-arrow"
                        size={18}
                        color={theme.colors.accentText}
                      />
                      <Text
                        style={{
                          color: theme.colors.accentText,
                          fontSize: 14,
                          fontWeight: "600",
                          fontFamily: "Poppins",
                          marginLeft: 6,
                        }}
                      >
                        {runningId === task.id ? "Running…" : "Run"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void openHistory(task)}
                      style={{
                        flex: 1,
                        minWidth: "45%",
                        backgroundColor: theme.colors.secondary,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      activeOpacity={0.85}
                    >
                      <Icon
                        name="history"
                        size={18}
                        color={theme.colors.text}
                      />
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontSize: 14,
                          fontWeight: "600",
                          fontFamily: "Poppins",
                          marginLeft: 6,
                        }}
                      >
                        Results
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(task)}
                      style={{
                        flex: 1,
                        minWidth: "45%",
                        backgroundColor: theme.colors.error + "20",
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      activeOpacity={0.85}
                    >
                      <Icon
                        name="delete-outline"
                        size={18}
                        color={theme.colors.error}
                      />
                      <Text
                        style={{
                          color: theme.colors.error,
                          fontSize: 14,
                          fontWeight: "600",
                          fontFamily: "Poppins",
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
      })}
    </>
  );

  const renderResultsTab = () => {
    const finished = summaryItems.done + summaryItems.failed;
    const successRate =
      finished === 0 ? null : Math.round((summaryItems.done / finished) * 100);
    const failRate =
      finished === 0 ? null : Math.round((summaryItems.failed / finished) * 100);

    const tagStyle = {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    } as const;

    return (
      <>
        {isLoading && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}

        {!isLoading && (
          <>
            {/* Single compact overview: outcomes + next up */}
            <FrostedPanel
              style={{
                padding: SETTINGS_BLOCK.padding,
                marginBottom: SETTINGS_BLOCK.gap + 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <View style={tagStyle}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: "Poppins",
                      fontWeight: "600",
                      color: theme.colors.success,
                    }}
                  >
                    {summaryItems.done} done
                  </Text>
                </View>
                <View style={tagStyle}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: "Poppins",
                      fontWeight: "600",
                      color: theme.colors.error,
                    }}
                  >
                    {summaryItems.failed} failed
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  lineHeight: 18,
                  marginBottom: 8,
                }}
              >
                {outcomeSummaryMessage(summaryItems.done, summaryItems.failed)}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 36,
                    fontWeight: "700",
                    fontFamily: "Poppins",
                    color: theme.colors.text,
                    lineHeight: 40,
                  }}
                >
                  {successRate == null ? "—" : `${successRate}%`}
                </Text>
                {failRate != null && failRate > 0 ? (
                  <View
                    style={{
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.colors.border,
                      borderRadius: 7,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        fontFamily: "Poppins",
                        color: theme.colors.error,
                      }}
                    >
                      {failRate}% failed
                    </Text>
                  </View>
                ) : finished > 0 ? (
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginBottom: 6,
                    }}
                  >
                    success
                  </Text>
                ) : null}
              </View>

              <OutcomeSegmentBar
                done={summaryItems.done}
                failed={summaryItems.failed}
                fillColor={theme.colors.text}
                failColor={`${theme.colors.error}55`}
                emptyColor={
                  theme.mode === "dark"
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(15,23,42,0.12)"
                }
              />

              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: theme.colors.border,
                  marginTop: 12,
                  marginBottom: 10,
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: nextScheduled ? 6 : 0,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 1,
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={theme.colors.text}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                    }}
                  >
                    Next up
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                  }}
                >
                  {summaryItems.active === 1
                    ? "1 job active"
                    : `${summaryItems.active} jobs active`}
                </Text>
              </View>

              {nextScheduled ? (
                <>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: theme.colors.text,
                      fontFamily: "Poppins",
                      lineHeight: 22,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {nextScheduled.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                    }}
                    numberOfLines={1}
                  >
                    {formatNextRunAbsolute(nextScheduled.nextRunAt)}
                    {" · "}
                    {formatNextRun(nextScheduled.nextRunAt)}
                  </Text>
                </>
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    lineHeight: 18,
                  }}
                >
                  {tasks.length === 0
                    ? "Add a task to schedule runs."
                    : "No enabled tasks are scheduled."}
                </Text>
              )}
            </FrostedPanel>

            {allRuns.length === 0 ? (
              <FrostedPanel
                style={{
                  padding: SETTINGS_BLOCK.padding,
                  marginBottom: SETTINGS_BLOCK.gap,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    marginBottom: 6,
                  }}
                >
                  No results yet
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    lineHeight: 19,
                  }}
                >
                  Run a task once, or wait for the next scheduled run.
                </Text>
              </FrostedPanel>
            ) : (
              allRuns.slice(0, 40).map((run, index) => {
                const color = statusColor(run.status, theme.colors);
                return (
                  <LibraryCardEnter
                    key={run.id}
                    itemId={run.id}
                    index={index}
                    animatedIds={animatedIds}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => onOpenRun(run)}
                      style={{ marginBottom: SETTINGS_BLOCK.gap }}
                    >
                      <FrostedPanel
                        style={{
                          padding: SETTINGS_BLOCK.padding,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: color,
                            }}
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color,
                              fontFamily: "Poppins",
                            }}
                          >
                            {statusLabel(run.status)}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.colors.textSecondary,
                              fontFamily: "Poppins",
                              flex: 1,
                              textAlign: "right",
                            }}
                            numberOfLines={1}
                          >
                            {formatRunAgo(run.finishedAt || run.startedAt)}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            marginBottom: 4,
                          }}
                          numberOfLines={1}
                        >
                          {run.taskName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            color: theme.colors.textSecondary,
                            fontFamily: "Poppins",
                            lineHeight: 19,
                          }}
                          numberOfLines={2}
                        >
                          {resultPreview(run)}
                        </Text>
                      </FrostedPanel>
                    </TouchableOpacity>
                  </LibraryCardEnter>
                );
              })
            )}
          </>
        )}
      </>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={styles.settingsTitle}>Tasks</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        showsVerticalScrollIndicator={false}
      >
        {libraryTab === "tasks" ? renderTasksTab() : renderResultsTab()}
      </ScrollView>

      {/* Tasks / Results — docks above Back / Info, like history search */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 15,
          right: 15,
          bottom: tabBarBottom,
          zIndex: 20,
        }}
      >
        <SegmentedTabBar
          tabs={[...LIBRARY_TABS]}
          activeId={libraryTab}
          onChange={(id) => setLibraryTab(id as LibraryTabId)}
          chromeOuter={tabChromeOuter}
          chromeInner={tabChromeInner}
          chromeScale={chromeScale}
          activeLabelColor={theme.colors.primaryText}
          inactiveLabelColor={theme.colors.text}
          activePillColor={theme.colors.primary}
        />
      </View>

      <View style={[fixedBtnStyle, { left: 15 }]}>
        <FloatingBackButton onPress={onBack} />
      </View>
      <View
        style={[
          fixedBtnStyle,
          {
            right: 15,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          },
        ]}
      >
        <FloatingIconButton
          icon="information"
          onPress={() => setInfoOpen(true)}
          accessibilityLabel="How tasks work"
          accessibilityHint="Explains scheduled tasks and results"
        />
        {libraryTab === "tasks" ? (
          <FloatingIconButton
            icon="add-outline"
            onPress={() => onEditTask(null)}
            accessibilityLabel="Add task"
          />
        ) : null}
      </View>

      <BottomSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How tasks work"
        subtitle="Scheduled writing or page checks, on-device"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
            marginBottom: Platform.OS === "ios" ? 12 : 0,
          }}
        >
          Create prompts or page monitors that run on a schedule. Results appear
          in the Results tab when a run finishes.
        </Text>
        {Platform.OS === "ios" ? (
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              fontFamily: "Poppins",
              lineHeight: 21,
            }}
          >
            On iOS, some runs finish when you reopen the app.
          </Text>
        ) : null}
      </BottomSheet>
    </View>
  );
}
