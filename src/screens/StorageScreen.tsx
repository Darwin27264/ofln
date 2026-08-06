/**
 * Storage manager (S19) — list on-device GGUF sizes; delete with confirm.
 * Active model is unloaded by the parent before unlink when needed.
 * Also clears all saved chat history (separate section).
 * S32: Backup export/import (chats JSON or full ZIP + model re-download queue).
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

function BackupActionButton({
  label,
  onPress,
  disabled,
  busy,
  colors,
  variant = 'default',
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
  };
  variant?: 'default' | 'primary' | 'danger';
}) {
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.error + '18'
        : colors.border + '55';
  const fg =
    variant === 'primary'
      ? colors.primaryText
      : variant === 'danger'
        ? colors.error
        : colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: bg,
        opacity: disabled || busy ? 0.45 : 1,
        marginBottom: 8,
        alignItems: 'center',
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text
          style={{
            fontFamily: 'Poppins',
            fontSize: 14,
            fontWeight: '600',
            color: fg,
          }}
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

  const confirmClearChatHistory = useCallback(() => {
    if (chatCount === 0 || clearingChats) return;

    const countLabel =
      chatCount === 1 ? '1 saved conversation' : `${chatCount} saved conversations`;

    showAlert(
      'Clear all chat history?',
      `Permanently delete ${countLabel} from this device. The current chat will also be reset. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ],
      { textAlign: 'left' },
    );
  }, [chatCount, clearingChats, onChatHistoryCleared]);

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
            ? `Saved ${result.chatCount} conversation${result.chatCount === 1 ? '' : 's'} as ${result.fileName}.\n\nChoose a safe place (Files, Drive, etc.) — never share raw chat backups.`
            : `Saved full backup (${result.chatCount} chat${result.chatCount === 1 ? '' : 's'}, ${result.modelCount} model catalog entr${result.modelCount === 1 ? 'y' : 'ies'}) as ${result.fileName}.\n\nModels are re-downloaded on import (not embedded). HF tokens are never exported.`,
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

  const confirmImport = useCallback(() => {
    if (exportBusy || importBusy) return;
    showAlert(
      'Import backup',
      'Choose how to apply the selected backup.\n\nMerge keeps your current data and updates matching items.\nReplace overwrites chats and personas from the file (local-only items may be lost).',
      [
        {
          text: 'Merge',
          style: 'default',
          onPress: () => {
            void performImport('merge');
          },
        },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            void performImport('replace');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { textAlign: 'left' },
    );
  }, [exportBusy, importBusy, performImport]);

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
      <Text style={[styles.settingsTitle, { marginBottom: 8 }]}>Storage</Text>
      <Text
        style={{
          fontFamily: 'Poppins',
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: 20,
          lineHeight: 20,
        }}
      >
        Manage models and chat data on this device. Export backups to move to another phone.
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
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
        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.6,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Models on device
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 16,
              color: theme.colors.text,
            }}
          >
            {loading ? '…' : formatBytesShort(totalBytes)}
            {!loading && models.length > 0
              ? ` · ${models.length} file${models.length === 1 ? '' : 's'}`
              : null}
          </Text>
          {freeBytes != null && (
            <Text
              style={{
                fontFamily: 'Poppins',
                fontSize: 13,
                color: theme.colors.textTertiary,
                marginTop: 4,
              }}
            >
              {formatBytesShort(freeBytes)} free
            </Text>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        ) : models.length === 0 ? (
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 14,
              color: theme.colors.textSecondary,
              marginBottom: 8,
            }}
          >
            No model files yet. Download one from Models.
          </Text>
        ) : (
          models.map((file) => {
            const isActive = activeModelFileName === file.fileName;
            const busy = busyFile === file.fileName;
            return (
              <View
                key={file.fileName}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text
                      style={{
                        fontFamily: 'Poppins',
                        fontSize: 15,
                        fontWeight: '600',
                        color: theme.colors.text,
                      }}
                      numberOfLines={2}
                    >
                      {file.fileName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Poppins',
                        fontSize: 13,
                        color: theme.colors.textSecondary,
                        marginTop: 4,
                      }}
                    >
                      {formatBytesShort(file.sizeBytes)}
                      {isActive ? ' · Loaded' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete(file)}
                    disabled={busy || backupLocked}
                    accessibilityLabel={`Delete ${file.fileName}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: theme.colors.error + '18',
                      opacity: busy || backupLocked ? 0.5 : 1,
                    }}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={theme.colors.error} />
                    ) : (
                      <Text
                        style={{
                          fontFamily: 'Poppins',
                          fontSize: 14,
                          fontWeight: '600',
                          color: theme.colors.error,
                        }}
                      >
                        Delete
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View
          style={{
            marginTop: 24,
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.6,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Chat history
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 16,
              color: theme.colors.text,
              marginBottom: 4,
            }}
          >
            {chatCountLoading
              ? '…'
              : chatCount === 0
                ? 'No saved conversations'
                : `${chatCount} conversation${chatCount === 1 ? '' : 's'}`}
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 13,
              color: theme.colors.textTertiary,
              lineHeight: 18,
              marginBottom: 14,
            }}
          >
            Saved chats stay on this device only. Clearing removes every conversation
            permanently. Use Backup & restore below to keep a copy first.
          </Text>
          <TouchableOpacity
            onPress={confirmClearChatHistory}
            disabled={!canClearChats || backupLocked}
            accessibilityLabel="Clear all chat history"
            style={{
              alignSelf: 'flex-end',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: theme.colors.error + '18',
              opacity: canClearChats && !backupLocked ? 1 : 0.45,
            }}
          >
            {clearingChats ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Text
                style={{
                  fontFamily: 'Poppins',
                  fontSize: 14,
                  fontWeight: '600',
                  color: theme.colors.error,
                }}
              >
                Clear all
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View
          style={{
            marginTop: 24,
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.6,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Backup & restore
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 13,
              color: theme.colors.textTertiary,
              lineHeight: 18,
              marginBottom: 14,
            }}
          >
            Export chats only, or everything (chats, personas, settings, model
            catalog). Full backups use a ZIP with versioned JSON — GGUF files
            re-download on import (smallest first, max 2 at a time). Hugging Face
            tokens are never exported. You’ll pick where to save with the system
            file picker.
          </Text>

          <BackupActionButton
            label="Export chat history"
            onPress={() => void runExport('chats')}
            busy={exportBusy === 'chats'}
            disabled={backupLocked && exportBusy !== 'chats'}
            colors={theme.colors}
            variant="default"
          />
          <BackupActionButton
            label="Export full backup (ZIP)"
            onPress={() => void runExport('full')}
            busy={exportBusy === 'full'}
            disabled={backupLocked && exportBusy !== 'full'}
            colors={theme.colors}
            variant="default"
          />

          <View style={{ height: 8 }} />

          <BackupActionButton
            label="Import backup"
            onPress={confirmImport}
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
                marginTop: 8,
                lineHeight: 17,
              }}
            >
              {importStatus}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 20,
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
