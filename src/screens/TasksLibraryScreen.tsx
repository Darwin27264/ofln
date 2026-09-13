/**
 * Tasks library — simple list; expand a card for Run / Results / Delete.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  FloatingBackButton,
  FloatingIconButton,
} from "../components/FloatingBackButton";
import {
  LibraryCardEnter,
  useLibraryCardEnter,
} from "../components/LibraryCardEnter";
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from "../utils/layoutInsets";
import {
  getRunsForTask,
  getTasks,
  removeTask,
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

interface Props {
  onBack: () => void;
  onEditTask: (task: ScheduledTask | null) => void;
  onOpenRun: (run: TaskRun) => void;
  fallbackModelFileName?: string | null;
}

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
      return "Waiting";
    case "skipped":
      return "Skipped";
    default:
      return "Ready";
  }
}

export default function TasksLibraryScreen({
  onBack,
  onEditTask,
  onOpenRun,
  fallbackModelFileName,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [latestByTask, setLatestByTask] = useState<
    Record<string, TaskRun | undefined>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { animatedIds } = useLibraryCardEnter();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await getTasks();
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(list);
      const map: Record<string, TaskRun | undefined> = {};
      await Promise.all(
        list.map(async (t) => {
          const runs = await getRunsForTask(t.id);
          map[t.id] = runs[0];
        }),
      );
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
          showAlert("Run failed", run.error || "Unknown error", [{ text: "OK" }]);
        } else if (run) {
          showAlert("Finished", statusLabel(run.status), [
            { text: "OK" },
            { text: "View", onPress: () => onOpenRun(run) },
          ]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showAlert("Run failed", msg, [{ text: "OK" }]);
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

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={styles.settingsTitle}>Tasks</Text>
      <Text
        style={{
          fontSize: 14,
          color: theme.colors.textSecondary,
          fontFamily: "Poppins",
          marginBottom: 16,
          marginTop: -8,
          lineHeight: 20,
        }}
      >
        Scheduled writing or page checks, on-device.
        {Platform.OS === "ios"
          ? " On iOS, some runs finish when you reopen the app."
          : ""}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>

      <View style={[fixedBtnStyle, { left: 15 }]}>
        <FloatingBackButton onPress={onBack} />
      </View>
      {tasks.length > 0 ? (
        <View style={[fixedBtnStyle, { right: 15 }]}>
          <FloatingIconButton
            icon="add-outline"
            onPress={() => onEditTask(null)}
            accessibilityLabel="Add task"
          />
        </View>
      ) : null}
    </View>
  );
}
