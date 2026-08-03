/**
 * Hugging Face access token sub-page (S08).
 * Opened from Settings — keeps the token form off the main Settings grid.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  clearHfToken,
  hasHfToken,
  HfKeychainUnavailableError,
  isHfKeychainAvailable,
  setHfToken,
} from "../services/hfTokenService";

interface Props {
  onBack: () => void;
}

export default function HfTokenScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [hfTokenDraft, setHfTokenDraft] = useState("");
  const [hfTokenSaved, setHfTokenSaved] = useState(false);
  const [hfBusy, setHfBusy] = useState(false);
  const [nativeReady, setNativeReady] = useState(isHfKeychainAvailable());

  useEffect(() => {
    let cancelled = false;
    setNativeReady(isHfKeychainAvailable());
    (async () => {
      const present = await hasHfToken();
      if (!cancelled) setHfTokenSaved(present);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveHfToken = useCallback(async () => {
    const trimmed = hfTokenDraft.trim();
    if (!trimmed) {
      showAlert("Token required", "Paste a Hugging Face access token, then tap Save.", [
        { text: "OK" },
      ]);
      return;
    }
    setHfBusy(true);
    try {
      await setHfToken(trimmed);
      setHfTokenDraft("");
      setHfTokenSaved(true);
      setNativeReady(true);
      showAlert("Token saved", "Gated Hugging Face downloads can use this token.", [
        { text: "OK" },
      ]);
    } catch (e) {
      if (e instanceof HfKeychainUnavailableError) {
        setNativeReady(false);
        showAlert("Rebuild required", e.message, [{ text: "OK" }]);
      } else {
        console.warn("Failed to save HF token", e);
        showAlert("Couldn't save token", "Try again. The token stays on this device only.", [
          { text: "OK" },
        ]);
      }
    } finally {
      setHfBusy(false);
    }
  }, [hfTokenDraft]);

  const removeHfToken = useCallback(async () => {
    setHfBusy(true);
    try {
      await clearHfToken();
      setHfTokenDraft("");
      setHfTokenSaved(false);
    } catch (e) {
      console.warn("Failed to clear HF token", e);
    } finally {
      setHfBusy(false);
    }
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          padding: 20,
          flex: 1,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <Text style={[styles.settingsTitle, { marginBottom: 24 }]}>Hugging Face</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
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
          Add an access token for gated models. Stored on this device and sent only to
          huggingface.co.
        </Text>

        {!nativeReady && (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.glass,
              borderRadius: 14,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Poppins",
                color: theme.colors.textSecondary,
                lineHeight: 20,
              }}
            >
              Secure storage isn’t linked in this build yet. Do a full native rebuild
              (not Metro Reload), then reopen this page.
            </Text>
          </View>
        )}

        <View style={styles.settingsRow}>
          <Text style={[styles.settingsLabel, { flex: 1, fontSize: 15 }]}>Access token</Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Poppins",
              color: hfTokenSaved ? theme.colors.success : theme.colors.textTertiary,
            }}
          >
            {hfTokenSaved ? "Saved" : "Not set"}
          </Text>
        </View>

        <TextInput
          value={hfTokenDraft}
          onChangeText={setHfTokenDraft}
          placeholder={hfTokenSaved ? "Enter new token to replace" : "hf_…"}
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!hfBusy && nativeReady}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.glass,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: "Poppins",
            fontSize: 15,
            color: theme.colors.text,
            marginBottom: 12,
            opacity: nativeReady ? 1 : 0.55,
          }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={saveHfToken}
            disabled={hfBusy || !nativeReady}
            style={{
              flex: 1,
              backgroundColor: theme.colors.primary,
              borderRadius: 20,
              paddingVertical: 10,
              alignItems: "center",
              opacity: hfBusy || !nativeReady ? 0.6 : 1,
            }}
          >
            {hfBusy ? (
              <ActivityIndicator color={theme.colors.primaryText} />
            ) : (
              <Text
                style={{
                  color: theme.colors.primaryText,
                  fontFamily: "Poppins",
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
          {hfTokenSaved && (
            <TouchableOpacity
              onPress={removeHfToken}
              disabled={hfBusy || !nativeReady}
              style={{
                paddingHorizontal: 18,
                borderRadius: 20,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: !nativeReady ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  fontSize: 15,
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          bottom: 20,
          left: 15,
          right: 15,
          backgroundColor: "transparent",
          flexDirection: "row",
          justifyContent: "flex-start",
        }}
      >
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
    </View>
  );
}
