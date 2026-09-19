/**
 * Inspect a task run: result first, details tucked into collapsible sections.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
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

const PREVIOUS_RUNS_PAGE = 5;

function formatWhen(ms?: number | null): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
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

function statusLabel(status: TaskRun["status"]): string {
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

function previousRunPreview(run: TaskRun): string {
  const text = (run.resultText || run.error || "").trim();
  if (!text) return "No output";
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

function triggerLabel(trigger?: TaskRun["trigger"]): string | null {
  if (!trigger) return null;
  switch (trigger) {
    case "scheduled_native":
      return "Scheduled";
    case "background_fetch":
      return "Background";
    case "catch_up":
      return "Catch-up";
    case "boot_completed":
      return "On boot";
    case "manual":
      return "Manual";
    default:
      return null;
  }
}

function CollapsibleSection({
  title,
  subtitle,
  open,
  onToggle,
  trailing,
  children,
  colors,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  colors: {
    card: string;
    border: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
  };
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 13,
          gap: 10,
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: colors.text,
              fontFamily: "Poppins",
            }}
          >
            {title}
          </Text>
          {subtitle && !open ? (
            <Text
              style={{
                fontSize: 12,
                color: colors.textTertiary,
                fontFamily: "Poppins",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {open && trailing ? trailing : null}
        <Icon
          name={open ? "expand-less" : "expand-more"}
          size={22}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
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
  const [sourceOpen, setSourceOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showAllPrevious, setShowAllPrevious] = useState(false);

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

  useEffect(() => {
    setShowAllPrevious(false);
  }, [runId]);

  const previousRuns = useMemo(() => {
    if (!run) return [] as TaskRun[];
    // Same task, every other run (newest first — siblings already sorted).
    return siblings.filter((s) => s.id !== run.id);
  }, [siblings, run]);

  const visiblePrevious = useMemo(() => {
    if (showAllPrevious) return previousRuns;
    return previousRuns.slice(0, PREVIOUS_RUNS_PAGE);
  }, [previousRuns, showAllPrevious]);

  const copyText = useCallback((label: string, text: string) => {
    Clipboard.setString(text);
    showAlert("Copied", `${label} copied to clipboard.`, [{ text: "OK" }]);
  }, []);

  const statusColor = useCallback(
    (status: TaskRun["status"]) => {
      if (status === "success") return theme.colors.success;
      if (status === "failed") return theme.colors.error;
      if (status === "pending_analysis" || status === "running") {
        return theme.colors.warning;
      }
      return theme.colors.textTertiary;
    },
    [theme.colors],
  );

  const metaChips = useMemo(() => {
    if (!run) return { trigger: null as string | null, model: null as string | null };
    return {
      trigger: triggerLabel(run.trigger),
      model: run.modelFileName?.trim() || null,
    };
  }, [run]);

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

  const when = formatWhen(run.finishedAt || run.startedAt);
  const fetchedPreview = run.fetchedText
    ? `${run.fetchedText.slice(0, 80).replace(/\s+/g, " ")}${
        run.fetchedText.length > 80 ? "…" : ""
      }`
    : undefined;
  const logCount = run.logs?.length ?? 0;

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={styles.settingsTitle} numberOfLines={2}>
        {run.taskName}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom + 72 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status strip */}
        {/* Status strip — Done + time on top; Manual + model below */}
        <View style={{ marginBottom: 16, marginTop: 4, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: `${statusColor(run.status)}18`,
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: statusColor(run.status),
                }}
              />
              <Text
                style={{
                  color: statusColor(run.status),
                  fontWeight: "700",
                  fontFamily: "Poppins",
                  fontSize: 13,
                }}
              >
                {statusLabel(run.status)}
              </Text>
            </View>
            <Text
              style={{
                color: theme.colors.textTertiary,
                fontFamily: "Poppins",
                fontSize: 12,
                flexShrink: 0,
                textAlign: "right",
              }}
            >
              {when}
            </Text>
          </View>

          {(metaChips.trigger || metaChips.model) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {metaChips.trigger ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                    backgroundColor: theme.colors.secondary,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 11,
                      fontFamily: "Poppins",
                    }}
                    numberOfLines={1}
                  >
                    {metaChips.trigger}
                  </Text>
                </View>
              ) : null}
              {metaChips.model ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                    backgroundColor: theme.colors.secondary,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 11,
                      fontFamily: "Poppins",
                    }}
                    numberOfLines={1}
                  >
                    {metaChips.model}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {run.error ? (
          <View
            style={{
              backgroundColor: `${theme.colors.error}12`,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: `${theme.colors.error}40`,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: "Poppins",
                fontSize: 13,
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Error
            </Text>
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: "Poppins",
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {run.error}
            </Text>
          </View>
        ) : null}

        {/* Primary: Results */}
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: run.resultText ? 12 : 0,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: theme.colors.textTertiary,
                fontFamily: "Poppins",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Results
            </Text>
            {run.resultText ? (
              <TouchableOpacity
                onPress={() => copyText("Results", run.resultText || "")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Copy results"
              >
                <Icon
                  name="content-copy"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          {run.resultText ? (
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: "Poppins",
                fontSize: 16,
                lineHeight: 24,
              }}
              selectable
            >
              {run.resultText}
            </Text>
          ) : (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {run.status === "running" || run.status === "pending_analysis"
                ? "Still working — results will appear here when ready."
                : "No results for this run."}
            </Text>
          )}
        </View>

        {/* Secondary: Source / fetched text */}
        {(run.sourceUrl || run.fetchedText) && (
          <CollapsibleSection
            title={run.sourceUrl ? "Source" : "Fetched text"}
            subtitle={
              run.sourceUrl
                ? run.sourceUrl
                : fetchedPreview || "Page text from this run"
            }
            open={sourceOpen}
            onToggle={() => setSourceOpen((v) => !v)}
            colors={theme.colors}
            trailing={
              run.fetchedText ? (
                <TouchableOpacity
                  onPress={() => copyText("Fetched text", run.fetchedText || "")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Copy fetched text"
                >
                  <Icon
                    name="content-copy"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              ) : undefined
            }
          >
            {run.sourceUrl ? (
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: "Poppins",
                  fontSize: 13,
                  marginBottom: run.fetchedText ? 12 : 0,
                }}
                selectable
              >
                {run.sourceUrl}
              </Text>
            ) : null}
            {run.fetchedText ? (
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
            ) : (
              <Text
                style={{
                  color: theme.colors.textTertiary,
                  fontFamily: "Poppins",
                  fontSize: 13,
                }}
              >
                No page text was stored for this run.
              </Text>
            )}
          </CollapsibleSection>
        )}

        {/* Logs */}
        <CollapsibleSection
          title="Logs"
          subtitle={
            logCount > 0
              ? `${logCount} entr${logCount === 1 ? "y" : "ies"}`
              : "No entries"
          }
          open={logsOpen}
          onToggle={() => setLogsOpen((v) => !v)}
          colors={theme.colors}
          trailing={
            logCount > 0 ? (
              <TouchableOpacity
                onPress={() =>
                  copyText("Logs", formatLogsForClipboard(run.logs))
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Copy logs"
              >
                <Icon
                  name="content-copy"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            ) : undefined
          }
        >
          {run.logs && run.logs.length > 0 ? (
            <View>
              {(showFullLogs ? run.logs : run.logs.slice(-6)).map((log, i) => {
                const visibleCount = showFullLogs
                  ? run.logs!.length
                  : Math.min(6, run.logs!.length);
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
                      borderBottomWidth: i < visibleCount - 1 ? 1 : 0,
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
                  style={{ paddingTop: 10, alignItems: "center" }}
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
                      ? "Show recent only"
                      : `View all ${run.logs.length}`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: 13,
                fontFamily: "Poppins",
              }}
            >
              No logs were recorded for this run.
            </Text>
          )}
        </CollapsibleSection>

        {/* Previous runs for this task — always at the bottom */}
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: theme.colors.textSecondary,
              fontFamily: "Poppins",
              marginBottom: 8,
            }}
          >
            Previous runs
          </Text>
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 14,
              overflow: "hidden",
            }}
          >
            {previousRuns.length === 0 ? (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  lineHeight: 19,
                  paddingVertical: 14,
                }}
              >
                No earlier runs for this task yet.
              </Text>
            ) : (
              <>
                {visiblePrevious.map((s, index) => {
                  const color = statusColor(s.status);
                  const isLastVisible = index === visiblePrevious.length - 1;
                  const showMoreRow =
                    previousRuns.length > PREVIOUS_RUNS_PAGE;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        setRun(s);
                        setShowFullLogs(false);
                        setSourceOpen(false);
                        setLogsOpen(false);
                        setShowAllPrevious(false);
                      }}
                      style={{
                        paddingVertical: 12,
                        borderBottomWidth:
                          isLastVisible && !showMoreRow
                            ? 0
                            : StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            width: 7,
                            height: 7,
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
                          {statusLabel(s.status)}
                        </Text>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: theme.colors.textTertiary,
                            fontFamily: "Poppins",
                            textAlign: "right",
                          }}
                          numberOfLines={1}
                        >
                          {formatRunAgo(s.finishedAt || s.startedAt)}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 13,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                          lineHeight: 18,
                          paddingLeft: 15,
                        }}
                        numberOfLines={2}
                      >
                        {previousRunPreview(s)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {previousRuns.length > PREVIOUS_RUNS_PAGE ? (
                  <TouchableOpacity
                    onPress={() => setShowAllPrevious((v) => !v)}
                    activeOpacity={0.85}
                    style={{
                      paddingVertical: 12,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showAllPrevious
                        ? "Show fewer previous runs"
                        : "Show more previous runs"
                    }
                  >
                    <Text
                      style={{
                        color: theme.colors.primary,
                        fontSize: 13,
                        fontWeight: "600",
                        fontFamily: "Poppins",
                      }}
                    >
                      {showAllPrevious
                        ? "Show less"
                        : `Show ${previousRuns.length - PREVIOUS_RUNS_PAGE} more`}
                    </Text>
                    <Icon
                      name={showAllPrevious ? "expand-less" : "expand-more"}
                      size={18}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
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
