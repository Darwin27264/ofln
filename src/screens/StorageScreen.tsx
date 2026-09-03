/**
 * Storage manager — list on-device GGUF sizes; delete with confirm.
 * Active model is unloaded by the parent before unlink when needed.
 * Also clears all saved chat history (separate section).
 * Backup export/import: chats JSON or full ZIP + model re-download queue.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import { BottomSheet } from '../components/BottomSheet';
import { useFloatingBackBottom, useScrollPadForFloatingBack } from '../utils/layoutInsets';
import { formatBytesShort } from '../utils/diskPreflight';
import {
  deleteStoredGgufFile,
  getDeviceFreeSpaceBytes,
  listStoredGgufModels,
  type StoredModelFile,
} from '../services/modelStorageService';
import { sumStoredModelBytes } from '../utils/modelStorageHelpers';
import { chatHistoryService } from '../services/chatHistoryService';
import {
  exportChatsBackup,
  exportFullBackup,
  importBackup,
  formatImportSummary,
} from '../services/backupService';
import type { BackupImportMode } from '../utils/backupSchema';

export type StorageScreenProps = {
  onBack: () => void;
  activeModelFileName: string | null;
  onUnloadIfActive: (fileName: string) => Promise<void>;
  onModelsChanged?: () => void | Promise<void>;
  onChatHistoryCleared?: () => void;
  onBackupImported?: (info: {
    mode: BackupImportMode;
    themeMode?: 'light' | 'dark' | null;
  }) => void | Promise<void>;
};

function SectionHeader({
  title,
  subtitle,
  colors,
}: {
  title: string;
  subtitle?: string;
  colors: { text: string; textSecondary: string; textTertiary: string };
}) {
  return (
    <View style={{ marginBottom: 10, paddingHorizontal: 2 }}>
      <Text
        style={{
          fontFamily: 'Poppins',
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: 0.4,
          color: colors.textSecondary,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: 'Poppins',
            fontSize: 13,
            color: colors.textTertiary,
            lineHeight: 18,
            marginTop: 4,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function SectionCard({
  children,
  colors,
  style,
}: {
  children: React.ReactNode;
  colors: { card: string; border: string };
  style?: object;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function CardDivider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginHorizontal: 16 }} />;
}

function BackupActionButton({
  label,
  onPress,
  disabled,
  busy,
  colors,
  variant = 'default',
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  colors: {
    text: string;
    error: string;
    primary: string;
    primaryText: string;
    border: string;
    surface: string;
  };
  variant?: 'default' | 'primary' | 'danger';
  compact?: boolean;
}) {
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.error + '18'
        : colors.surface;
  const fg =
    variant === 'primary'
      ? colors.primaryText
      : variant === 'danger'
        ? colors.error
        : colors.text;
  const bordered = variant === 'default';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      style={{
        flex: compact ? 1 : undefined,
        paddingVertical: compact ? 12 : 13,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: bg,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? colors.border : 'transparent',
        opacity: disabled || busy ? 0.45 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text
          style={{
            fontFamily: 'Poppins',
            fontSize: compact ? 13 : 14,
            fontWeight: '600',
            color: fg,
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function StorageScreen({
  onBack,
  activeModelFileName,
  onUnloadIfActive,
  onModelsChanged,
  onChatHistoryCleared,
  onBackupImported,
}: StorageScreenProps) {
  const { theme, setThemeMode } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [models, setModels] = useState<StoredModelFile[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [chatCount, setChatCount] = useState(0);
  const [chatCountLoading, setChatCountLoading] = useState(true);
  const [clearingChats, setClearingChats] = useState(false);
  const [exportBusy, setExportBusy] = useState<'chats' | 'full' | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [clearHistorySheetOpen, setClearHistorySheetOpen] = useState(false);

  const loadChatStats = useCallback(async () => {
    try {
      const chats = await chatHistoryService.getAllChats();
      setChatCount(chats.length);
    } catch {
      setChatCount(0);
    } finally {
      setChatCountLoading(false);
    }
  }, []);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    try {
      const [listed, free] = await Promise.all([
        listStoredGgufModels(),
        getDeviceFreeSpaceBytes(),
      ]);
      setModels(listed);
      setFreeBytes(free);
    } catch {
      setModels([]);
      showAlert(
        'Couldn’t read storage',
        'Model files couldn’t be listed. Try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    await loadChatStats();
  }, [loadChatStats]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = useCallback(
    (file: StoredModelFile) => {
      const isActive = activeModelFileName === file.fileName;
      const sizeLabel = formatBytesShort(file.sizeBytes);
      showAlert(
        'Delete model?',
        isActive
          ? `${file.fileName} (${sizeLabel}) is currently loaded. It will be unloaded, then deleted. This cannot be undone.`
          : `Delete ${file.fileName} (${sizeLabel})? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setBusyFile(file.fileName);
              try {
                if (isActive) {
                  await onUnloadIfActive(file.fileName);
                }
                await deleteStoredGgufFile(file.fileName);
                await onModelsChanged?.();
                await load({ soft: true });
              } catch {
                showAlert(
                  'Delete failed',
                  'The model file could not be removed. Try again.',
                  [{ text: 'OK' }],
                );
              } finally {
                setBusyFile(null);
              }
            },
          },
        ],
        { textAlign: 'left' },
      );
    },
    [activeModelFileName, load, onModelsChanged, onUnloadIfActive],
  );

  const openClearHistorySheet = useCallback(() => {
    if (chatCount === 0 || clearingChats) return;
    setClearHistorySheetOpen(true);
  }, [chatCount, clearingChats]);

  const closeClearHistorySheet = useCallback(() => {
    setClearHistorySheetOpen(false);
  }, []);

  const handleClearAllChats = useCallback(async () => {
    closeClearHistorySheet();
    setClearingChats(true);
    try {
      const ok = await chatHistoryService.clearAllChats();
      if (!ok) {
        throw new Error('clearAllChats returned false');
      }
      setChatCount(0);
      onChatHistoryCleared?.();
    } catch {
      showAlert(
        'Clear failed',
        'Chat history could not be cleared. Try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setClearingChats(false);
    }
  }, [closeClearHistorySheet, onChatHistoryCleared]);

  const clearHistoryCountLabel =
    chatCount === 1 ? '1 saved conversation' : `${chatCount} saved conversations`;

  const runExport = useCallback(
    async (kind: 'chats' | 'full') => {
      if (exportBusy || importBusy) return;
      setExportBusy(kind);
      try {
        const result =
          kind === 'chats' ? await exportChatsBackup() : await exportFullBackup();
        showAlert(
          'Exported',
          kind === 'chats'
            ? `Saved ${result.chatCount} conversation${result.chatCount === 1 ? '' : 's'} as ${result.fileName}.`
            : `Saved full backup as ${result.fileName}. Model files aren’t included — they’ll download again on import.`,
          [{ text: 'OK' }],
          { textAlign: 'left' },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'EXPORT_CANCELLED') return;
        showAlert(
          'Export failed',
          msg || 'Could not create the backup. Try again.',
          [{ text: 'OK' }],
        );
      } finally {
        setExportBusy(null);
      }
    },
    [exportBusy, importBusy],
  );

  const performImport = useCallback(
    async (mode: BackupImportMode) => {
      if (exportBusy || importBusy) return;
      setImportBusy(true);
      setImportStatus('Reading backup…');
      try {
        const result = await importBackup({
          mode,
          downloadModels: true,
          onProgress: (p) => {
            if (p.stage === 'reading') setImportStatus('Reading backup…');
            else if (p.stage === 'applying') setImportStatus('Applying data…');
            else if (p.stage === 'models') {
              const name = p.progress.fileName;
              const pct = p.progress.progress;
              const phase = p.progress.phase;
              if (phase === 'downloading' && pct >= 0) {
                setImportStatus(
                  `Downloading models (${p.progress.index + 1}/${p.progress.total}): ${name} ${pct}%`,
                );
              } else if (phase === 'queued') {
                setImportStatus(
                  `Queued models (${p.progress.index + 1}/${p.progress.total}): ${name}`,
                );
              } else {
                setImportStatus(
                  `Models (${p.progress.index + 1}/${p.progress.total}): ${name}`,
                );
              }
            } else if (p.stage === 'done') {
              setImportStatus(null);
            }
          },
        });

        if (result.themeMode) {
          setThemeMode(result.themeMode);
        }

        await onModelsChanged?.();
        await onBackupImported?.({
          mode: result.mode,
          themeMode: result.themeMode,
        });
        if (mode === 'replace') {
          onChatHistoryCleared?.();
        }
        await load({ soft: true });

        showAlert(
          'Import complete',
          formatImportSummary(result),
          [{ text: 'OK' }],
          { textAlign: 'left' },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'IMPORT_CANCELLED') return;
        showAlert(
          'Import failed',
          msg || 'The backup could not be restored.',
          [{ text: 'OK' }],
        );
      } finally {
        setImportBusy(false);
        setImportStatus(null);
      }
    },
    [
      exportBusy,
      importBusy,
      load,
      onBackupImported,
      onChatHistoryCleared,
      onModelsChanged,
      setThemeMode,
    ],
  );

  const openImportSheet = useCallback(() => {
    if (exportBusy || importBusy) return;
    setImportSheetOpen(true);
  }, [exportBusy, importBusy]);

  const closeImportSheet = useCallback(() => {
    setImportSheetOpen(false);
  }, []);

  const handleImportMode = useCallback(
    (mode: BackupImportMode) => {
      closeImportSheet();
      void performImport(mode);
    },
    [closeImportSheet, performImport],
  );

  const totalBytes = sumStoredModelBytes(models);
  const canClearChats = chatCount > 0 && !clearingChats && !chatCountLoading;
  const backupLocked = Boolean(exportBusy || importBusy);

  return (
    <View
      style={[
        styles.container,
        { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
      ]}
    >
      <Text style={[styles.settingsTitle, { marginBottom: 6 }]}>Storage</Text>
      <Text
        style={{
          fontFamily: 'Poppins',
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: 24,
          lineHeight: 20,
        }}
      >
        Manage models and chats. Export a backup before clearing data.
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ soft: true });
            }}
            tintColor={theme.colors.text}
            colors={[theme.colors.text]}
          />
        }
      >
        {/* —— Models —— */}
        <SectionHeader
          title="Models"
          subtitle="Downloaded GGUF files on this device"
          colors={theme.colors}
        />
        <SectionCard colors={theme.colors} style={{ marginBottom: 32 }}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Poppins',
                    fontSize: 28,
                    fontWeight: '600',
                    color: theme.colors.text,
                    letterSpacing: -0.5,
                  }}
                >
                  {loading ? '…' : formatBytesShort(totalBytes)}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Poppins',
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  {loading
                    ? 'Calculating…'
                    : models.length === 0
                      ? 'No model files'
                      : `${models.length} file${models.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              {freeBytes != null && !loading && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontFamily: 'Poppins',
                      fontSize: 12,
                      color: theme.colors.textTertiary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                    }}
                  >
                    Free space
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Poppins',
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.text,
                      marginTop: 2,
                    }}
                  >
                    {formatBytesShort(freeBytes)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.text} />
            </View>
          ) : models.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text
                style={{
                  fontFamily: 'Poppins',
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  lineHeight: 20,
                }}
              >
                No model files yet. Download one from Models.
              </Text>
            </View>
          ) : (
            <>
              <CardDivider color={theme.colors.border} />
              {models.map((file, index) => {
                const isActive = activeModelFileName === file.fileName;
                const busy = busyFile === file.fileName;
                const isLast = index === models.length - 1;
                return (
                  <View
                    key={file.fileName}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: 'Poppins',
                            fontSize: 14,
                            fontWeight: '600',
                            color: theme.colors.text,
                          }}
                          numberOfLines={2}
                        >
                          {file.fileName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                          <Text
                            style={{
                              fontFamily: 'Poppins',
                              fontSize: 13,
                              color: theme.colors.textSecondary,
                            }}
                          >
                            {formatBytesShort(file.sizeBytes)}
                          </Text>
                          {isActive && (
                            <View
                              style={{
                                backgroundColor: theme.colors.primary + '22',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: 'Poppins',
                                  fontSize: 11,
                                  fontWeight: '600',
                                  color: theme.colors.text,
                                }}
                              >
                                Loaded
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => confirmDelete(file)}
                        disabled={busy || backupLocked}
                        accessibilityLabel={`Delete ${file.fileName}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: theme.colors.error + '14',
                          opacity: busy || backupLocked ? 0.5 : 1,
                        }}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={theme.colors.error} />
                        ) : (
                          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </SectionCard>

        {/* —— Chat history —— */}
        <SectionHeader
          title="Chat history"
          subtitle="Saved on this device only"
          colors={theme.colors}
        />
        <SectionCard colors={theme.colors} style={{ marginBottom: 32 }}>
          <View style={{ padding: 16 }}>
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 22,
                fontWeight: '600',
                color: theme.colors.text,
              }}
            >
              {chatCountLoading
                ? '…'
                : chatCount === 0
                  ? 'None'
                  : `${chatCount}`}
            </Text>
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 14,
                color: theme.colors.textSecondary,
                marginTop: 2,
              }}
            >
              {chatCountLoading
                ? 'Loading…'
                : chatCount === 0
                  ? 'No saved conversations'
                  : `conversation${chatCount === 1 ? '' : 's'}`}
            </Text>
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 13,
                color: theme.colors.textTertiary,
                lineHeight: 18,
                marginTop: 10,
              }}
            >
              Export a backup below before clearing.
            </Text>
            <TouchableOpacity
              onPress={openClearHistorySheet}
              disabled={!canClearChats || backupLocked}
              accessibilityLabel="Clear all chat history"
              style={{
                marginTop: 16,
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: theme.colors.error + '14',
                opacity: canClearChats && !backupLocked ? 1 : 0.45,
              }}
            >
              {clearingChats ? (
                <ActivityIndicator size="small" color={theme.colors.error} />
              ) : (
                <>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={theme.colors.error}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontFamily: 'Poppins',
                      fontSize: 14,
                      fontWeight: '600',
                      color: theme.colors.error,
                    }}
                  >
                    Clear all history
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* —— Backup —— */}
        <SectionHeader
          title="Backup & restore"
          subtitle="Model files re-download on restore; tokens are never included"
          colors={theme.colors}
        />
        <SectionCard colors={theme.colors}>
          <View style={{ padding: 16 }}>
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 13,
                fontWeight: '600',
                color: theme.colors.textSecondary,
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              Export
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <BackupActionButton
                label="Chats only"
                onPress={() => void runExport('chats')}
                busy={exportBusy === 'chats'}
                disabled={backupLocked && exportBusy !== 'chats'}
                colors={theme.colors}
                variant="default"
                compact
              />
              <BackupActionButton
                label="Full backup"
                onPress={() => void runExport('full')}
                busy={exportBusy === 'full'}
                disabled={backupLocked && exportBusy !== 'full'}
                colors={theme.colors}
                variant="default"
                compact
              />
            </View>
          </View>

          <CardDivider color={theme.colors.border} />

          <View style={{ padding: 16 }}>
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 13,
                fontWeight: '600',
                color: theme.colors.textSecondary,
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              Import
            </Text>
            <BackupActionButton
              label="Import backup"
              onPress={openImportSheet}
              busy={importBusy}
              disabled={backupLocked}
              colors={theme.colors}
              variant="primary"
            />
            {importStatus ? (
              <Text
                style={{
                  fontFamily: 'Poppins',
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: 12,
                  lineHeight: 17,
                }}
              >
                {importStatus}
              </Text>
            ) : null}
          </View>
        </SectionCard>
      </ScrollView>

      <BottomSheet
        visible={importSheetOpen}
        onClose={closeImportSheet}
        title="Import backup"
        subtitle="Choose how to apply the file"
        fitContent
      >
        <Text
          style={{
            fontFamily: 'Poppins',
            fontSize: 14,
            color: theme.colors.textSecondary,
            lineHeight: 21,
            marginBottom: 16,
          }}
        >
          Merge keeps your data and updates matching items.{'\n'}
          Replace overwrites chats and personas from the file.
        </Text>
        <TouchableOpacity
          onPress={() => handleImportMode('merge')}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 15,
              fontWeight: '600',
              color: theme.colors.primaryText,
            }}
          >
            Merge
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleImportMode('replace')}
          style={{
            backgroundColor: theme.colors.error + '18',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.error + '40',
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 15,
              fontWeight: '600',
              color: theme.colors.error,
            }}
          >
            Replace
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={closeImportSheet}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 15,
              fontWeight: '600',
              color: theme.colors.text,
            }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet
        visible={clearHistorySheetOpen}
        onClose={closeClearHistorySheet}
        title="Clear all history"
        subtitle="Permanent deletion"
        fitContent
      >
        <Text
          style={{
            fontFamily: 'Poppins',
            fontSize: 14,
            color: theme.colors.textSecondary,
            lineHeight: 21,
            marginBottom: 16,
          }}
        >
          Permanently delete {clearHistoryCountLabel} from this device. The current
          chat will also be reset. This cannot be undone.
        </Text>
        <TouchableOpacity
          onPress={() => void handleClearAllChats()}
          disabled={clearingChats}
          style={{
            backgroundColor: theme.colors.error + '18',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.error + '40',
            opacity: clearingChats ? 0.45 : 1,
          }}
        >
          {clearingChats ? (
            <ActivityIndicator size="small" color={theme.colors.error} />
          ) : (
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 15,
                fontWeight: '600',
                color: theme.colors.error,
              }}
            >
              Clear all
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={closeClearHistorySheet}
          disabled={clearingChats}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: clearingChats ? 0.45 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 15,
              fontWeight: '600',
              color: theme.colors.text,
            }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </BottomSheet>

      <View
        style={{
          position: 'absolute',
          bottom: backBottom,
          left: 15,
          backgroundColor: 'transparent',
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          disabled={backupLocked}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 30,
            opacity: backupLocked ? 0.5 : 1,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 20,
              fontFamily: 'Poppins',
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
