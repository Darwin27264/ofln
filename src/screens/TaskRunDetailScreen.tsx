/**
 * Inspect a Source Monitor run: status, fetched text, analysis result.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { FloatingBackButton } from "../components/FloatingBackButton";
import {
  useFloatingBackBottom,
  useScrollPadForFloatingBack,
} from "../utils/layoutInsets";
import {
  getRunsForTask,
  getTaskRunById,
  type TaskRun,
} from "../services/taskService";
import {
  formatLogEntryTime,
  formatLogsForClipboard,
} from "../services/taskLogger";

interface Props {
  runId: string;
  onBack: () => void;
  onUseInChat: (run: TaskRun) => void;
}

function formatWhen(ms?: number | null): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export default function TaskRunDetailScreen({
  runId,
  onBack,
  onUseInChat,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [run, setRun] = useState<TaskRun | null>(null);
  const [siblings, setSiblings] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullLogs, setShowFullLogs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getTaskRunById(runId);
      setRun(r);
      if (r) {
        const list = await getRunsForTask(r.taskId);
        setSiblings(list);
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = useCallback((label: string, text: string) => {
    Clipboard.setString(text);
    showAlert("Copied", `${label} copied to clipboard.`, [{ text: "OK" }]);
  }, []);

  const statusColor = (status: TaskRun["status"]) => {
    if (status === "success") return theme.colors.success;
    if (status === "failed") return theme.colors.error;
    if (status === "pending_analysis" || status === "running") {
      return theme.colors.warning;
    }
    return theme.colors.textTertiary;
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            flex: 1,
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  if (!run) {
    return (
      <View
        style={[
          styles.container,
          { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
        ]}
      >
        <Text style={styles.settingsTitle}>Result</Text>
        <Text style={{ color: theme.colors.textSecondary, fontFamily: "Poppins" }}>
          This run could not be found.
        </Text>
        <View style={{ position: "absolute", left: 15, bottom: backBottom }}>
          <FloatingBackButton onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={styles.settingsTitle}>{run.taskName}</Text>
      <Text
        style={{
          fontSize: 13,
          color: theme.colors.textSecondary,
          fontFamily: "Poppins",
          marginTop: -8,
          marginBottom: 12,
        }}
        numberOfLines={2}
      >
        {run.sourceUrl ? run.sourceUrl : "Scheduled LLM prompt"}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              backgroundColor: theme.colors.secondary,
            }}
          >
            <Text
              style={{
                color: statusColor(run.status),
                fontWeight: "700",
                fontFamily: "Poppins",
                fontSize: 13,
                textTransform: "capitalize",
              }}
            >
              {run.status.replace("_", " ")}
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.textTertiary,
              fontFamily: "Poppins",
              fontSize: 12,
              flex: 1,
            }}
          >
            {formatWhen(run.finishedAt || run.startedAt)}
          </Text>
        </View>

        {run.error ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: theme.colors.error,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: "Poppins",
                fontSize: 14,
              }}
            >
              {run.error}
            </Text>
          </View>
        ) : null}

        {run.resultText ? (
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Analysis
              </Text>
              <TouchableOpacity
                onPress={() => copyText("Analysis", run.resultText || "")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="content-copy" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: "Poppins",
                fontSize: 15,
                lineHeight: 22,
              }}
              selectable
            >
              {run.resultText}
            </Text>
          </View>
        ) : null}

        {run.fetchedText ? (
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Fetched text
              </Text>
              <TouchableOpacity
                onPress={() => copyText("Fetched text", run.fetchedText || "")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="content-copy" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                fontSize: 13,
                lineHeight: 20,
              }}
              selectable
            >
              {run.fetchedText.length > 4000
                ? `${run.fetchedText.slice(0, 4000)}\n\n[…truncated for display]`
                : run.fetchedText}
            </Text>
          </View>
        ) : null}

        {/* Execution Logs Section */}
        <View style={{ marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Execution Logs
              </Text>
              {run.trigger ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                    backgroundColor: theme.colors.card,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 11,
                      fontFamily: "Poppins",
                    }}
                  >
                    {run.trigger === "scheduled_native"
                      ? "OS Alarm"
                      : run.trigger === "background_fetch"
                      ? "BG Fetch"
                      : run.trigger === "catch_up"
                      ? "Catch-up"
                      : "Manual"}
                  </Text>
                </View>
              ) : null}
            </View>
            {run.logs && run.logs.length > 0 ? (
              <TouchableOpacity
                onPress={() => copyText("Execution logs", formatLogsForClipboard(run.logs))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="content-copy" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            ) : null}
          </View>

          {run.logs && run.logs.length > 0 ? (
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 12,
              }}
            >
              {(showFullLogs ? run.logs : run.logs.slice(-6)).map((log, i) => {
                const isErr = log.level === "error";
                const isSuccess = log.level === "success";
                const isWarn = log.level === "warn";
                const badgeColor = isErr
                  ? theme.colors.error
                  : isSuccess
                  ? theme.colors.success
                  : isWarn
                  ? theme.colors.warning
                  : theme.colors.textSecondary;

                return (
                  <View
                    key={i}
                    style={{
                      paddingVertical: 6,
                      borderBottomWidth: i < (showFullLogs ? run.logs!.length : Math.min(6, run.logs!.length)) - 1 ? 1 : 0,
                      borderBottomColor: theme.colors.borderLight,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: theme.colors.textTertiary,
                        }}
                      >
                        {formatLogEntryTime(log.timestamp)}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 4,
                          backgroundColor: `${badgeColor}22`,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: badgeColor,
                            fontFamily: "Poppins",
                            textTransform: "uppercase",
                          }}
                        >
                          {log.level}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        lineHeight: 18,
                      }}
                      selectable
                    >
                      {log.message}
                    </Text>
                    {log.details ? (
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: theme.colors.textSecondary,
                          marginTop: 4,
                          backgroundColor: theme.colors.surface,
                          padding: 6,
                          borderRadius: 6,
                        }}
                        selectable
                      >
                        {log.details}
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              {run.logs.length > 6 ? (
                <TouchableOpacity
                  onPress={() => setShowFullLogs((prev) => !prev)}
                  style={{
                    paddingTop: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontSize: 12,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                    }}
                  >
                    {showFullLogs
                      ? "Show recent entries only"
                      : `View all ${run.logs.length} log entries`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 13,
                  fontFamily: "Poppins",
                }}
              >
                No execution logs were recorded for this run.
              </Text>
            </View>
          )}
        </View>

        {siblings.length > 1 && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 8,
              }}
            >
              Recent runs
            </Text>
            {siblings.slice(0, 8).map((s) => (
              <TouchableOpacity
                key={s.id}
                disabled={s.id === run.id}
                onPress={() => {
                  setRun(s);
                }}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderLight,
                  opacity: s.id === run.id ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    color: statusColor(s.status),
                    fontFamily: "Poppins",
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {s.status.replace("_", " ")} · {formatWhen(s.finishedAt || s.startedAt)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ position: "absolute", left: 15, bottom: backBottom }}>
        <FloatingBackButton onPress={onBack} />
      </View>
      {(run.resultText || run.fetchedText) && (
        <TouchableOpacity
          onPress={() => onUseInChat(run)}
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
            Use in chat
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
