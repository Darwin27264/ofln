// DiagnosticsScreen.tsx — error logs & environment diagnostics
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Clipboard from "@react-native-clipboard/clipboard";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { getFullLogContent, getErrorLogPath, clearErrorLog } from "../utils/errorLogger";
import { showAlert } from "../components/CustomAlert";

interface Props {
  onBack: () => void;
}

export default function DiagnosticsScreen({ onBack }: Props) {
  const { theme, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);
  const [errorLogVisible, setErrorLogVisible] = useState(false);
  const [errorLogContent, setErrorLogContent] = useState<string>("");

  const handleViewLogs = async () => {
    try {
      const logContent = await getFullLogContent();
      setErrorLogContent(logContent);
      setErrorLogVisible(true);
    } catch {
      showAlert("Error", "Failed to load logs.", [{ text: "OK" }]);
    }
  };

  const handleClearErrorLog = () => {
    showAlert(
      "Clear Error Log",
      "Are you sure you want to clear the error log?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearErrorLog();
              const logContent = await getFullLogContent();
              setErrorLogContent(logContent);
              showAlert("Success", "Error log cleared.", [{ text: "OK" }]);
            } catch {
              showAlert("Error", "Failed to clear error log.", [{ text: "OK" }]);
            }
          },
        },
      ]
    );
  };

  const handleCopyLogContent = () => {
    if (!errorLogContent.trim()) {
      showAlert("Empty", "There is nothing to copy yet.", [{ text: "OK" }]);
      return;
    }
    Clipboard.setString(errorLogContent);
    showAlert("Copied", "Full log copied to clipboard.", [{ text: "OK" }]);
  };

  const handleCopyLogPath = () => {
    const logPath = getErrorLogPath();
    showAlert(
      "Error Log Location",
      `The error log is saved at:\n\n${logPath}\n\nYou can access this file using a file manager app.`,
      [{ text: "OK" }]
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          padding: 20,
          flex: 1,
          backgroundColor: theme.colors.background,
          opacity: isTransitioning ? 0.95 : 1,
        },
      ]}
    >
      <Text style={[styles.settingsTitle, { marginBottom: 24 }]}>Diagnostics</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.textSecondary,
            lineHeight: 24,
            marginBottom: 20,
            fontFamily: "Poppins",
          }}
        >
          View app environment details and error logs when model loading or chat fails.
        </Text>

        <TouchableOpacity
          onPress={handleViewLogs}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons
            name="document-text-outline"
            size={24}
            color={theme.colors.text}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 4,
              }}
            >
              View Logs
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              App environment and error logs
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={handleCopyLogPath}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Ionicons name="folder-outline" size={20} color={theme.colors.text} />
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginTop: 4,
                textAlign: "center",
              }}
            >
              Log Path
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClearErrorLog}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.error,
                fontFamily: "Poppins",
                marginTop: 4,
                textAlign: "center",
              }}
            >
              Clear Log
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", bottom: 20, left: 15, backgroundColor: "transparent" }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 30,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 20,
              fontFamily: "Poppins",
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={errorLogVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setErrorLogVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
              }}
            >
              Logs
            </Text>
            <TouchableOpacity onPress={() => setErrorLogVisible(false)} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }}>
            <TextInput
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: theme.colors.text,
                backgroundColor: theme.colors.surface,
                borderRadius: 8,
                padding: 12,
                minHeight: 400,
                textAlignVertical: "top",
              }}
              value={errorLogContent}
              multiline
              editable={false}
              selectTextOnFocus
            />
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={handleCopyLogContent}
              style={{
                flex: 1,
                backgroundColor: theme.colors.primary + "22",
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="copy-outline" size={20} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.primary,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Copy Log
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCopyLogPath}
              style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="folder-outline" size={20} color={theme.colors.text} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Log Path
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClearErrorLog}
              style={{
                flex: 1,
                backgroundColor: theme.colors.error + "20",
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.error,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Clear Log
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
