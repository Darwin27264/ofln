// InfoScreen.tsx — in-app About page (app info + quick-start guide)
import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";

const packageJson = require("../../package.json");

function libraryVersionsFromDeps(): Array<{ name: string; version: string }> {
  const deps = (packageJson.dependencies || {}) as Record<string, string>;
  const pin = (name: string, fallback: string): string => {
    const declared = deps[name];
    if (typeof declared === "string" && declared.length > 0) {
      return declared.replace(/^[\^~]/, "");
    }
    return fallback;
  };

  // Static requires only — Metro cannot resolve `require(\`${name}/package.json\`)`.
  let llamaRn = pin("llama.rn", "0.12.6");
  let rnAiLlama = pin("@react-native-ai/llama", "0.12.0");
  let aiSdk = pin("ai", "6.0.225");
  let mlKitOcr = pin("@react-native-ml-kit/text-recognition", "2.0.0");
  let reactNative = pin("react-native", "0.78.1");
  let react = pin("react", "19.0.0");

  try {
    llamaRn = require("llama.rn/package.json").version || llamaRn;
  } catch {
    /* keep pinned */
  }
  try {
    rnAiLlama = require("@react-native-ai/llama/package.json").version || rnAiLlama;
  } catch {
    /* keep pinned */
  }
  try {
    aiSdk = require("ai/package.json").version || aiSdk;
  } catch {
    /* keep pinned */
  }
  try {
    mlKitOcr =
      require("@react-native-ml-kit/text-recognition/package.json").version || mlKitOcr;
  } catch {
    /* keep pinned */
  }
  try {
    reactNative = require("react-native/package.json").version || reactNative;
  } catch {
    /* keep pinned */
  }
  try {
    react = require("react/package.json").version || react;
  } catch {
    /* keep pinned */
  }

  return [
    { name: "llama.rn", version: llamaRn },
    { name: "@react-native-ai/llama", version: rnAiLlama },
    { name: "ai (Vercel AI SDK)", version: aiSdk },
    { name: "@react-native-ml-kit/text-recognition", version: mlKitOcr },
    { name: "react-native", version: reactNative },
    { name: "react", version: react },
  ];
}

interface Props {
  onBack: () => void;
}

type GuideSection = {
  title: string;
  icon: string;
  body: string;
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "Getting started",
    icon: "rocket-outline",
    body:
      "1. Open Models and pick a Popular model (Q4_0 preferred).\n" +
      "2. Wait for the download, then tap the card to load it.\n" +
      "3. Chat runs fully on-device — no account and no cloud AI.\n" +
      "4. Wi‑Fi is only needed to download models from HuggingFace.",
  },
  {
    title: "Choosing a model",
    icon: "cube-outline",
    body:
      "Popular picks (smallest → strongest):\n" +
      "• Qwen3.5 0.8B — ultra-light (~0.5 GB), low-RAM phones\n" +
      "• Qwen3.5 2B — balanced daily driver\n" +
      "• SmolLM3 3B — compact, multilingual\n" +
      "• Phi-4 Mini — stronger math / logic\n" +
      "• Gemma 4 E2B — general-purpose flagship\n" +
      "• Qwen3.5 4B — best thinking / code quality in this list\n\n" +
      "Prefer Q4_0 or Q6_K on Android if you want GPU/NPU offload. Other quants still run on CPU.\n" +
      "On emulators, start with 0.8B / 2B — 4B+ often needs 6GB+ AVD RAM.",
  },
  {
    title: "Chat, photos & OCR",
    icon: "chatbubbles-outline",
    body:
      "• Attach a photo or take one — images are resized before OCR so phones stay stable.\n" +
      "• On-device ML Kit reads text from the image and adds it to your prompt.\n" +
      "• True pixel vision (mmproj projector files) is not auto-downloaded yet; text models use OCR.\n" +
      "• Temporary Mode skips saving the conversation to history.",
  },
  {
    title: "Speed & memory tips",
    icon: "flash-outline",
    body:
      "• Start with smaller models on mid-range devices.\n" +
      "• Context size (n_ctx) at 2048 is the safe Android default — higher uses more RAM.\n" +
      "• GPU Layers > 0 only helps on supported Android chips with Q4_0 / Q6_K models.\n" +
      "• Emulators run CPU-only. Close other apps when loading large GGUFs.\n" +
      "• The engine uses flash-attn auto and quantized KV caches where supported (llama.rn).",
  },
  {
    title: "Privacy",
    icon: "shield-checkmark-outline",
    body:
      "Models, chats, personas, and OCR all stay on your device. HuggingFace is contacted only when you browse or download a model. No cloud LLM API is used for replies.",
  },
];

function GuideCard({
  section,
  colors,
}: {
  section: GuideSection;
  colors: { card: string; border: string; text: string; textSecondary: string };
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Ionicons name={section.icon as any} size={22} color={colors.text} style={{ marginRight: 10 }} />
        <Text
          style={{
            fontSize: 17,
            fontWeight: "600",
            color: colors.text,
            fontFamily: "Poppins",
          }}
        >
          {section.title}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 22,
          fontFamily: "Poppins",
        }}
      >
        {section.body}
      </Text>
    </View>
  );
}

export default function InfoScreen({ onBack }: Props) {
  const { theme, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);

  const appName = packageJson.name || "ofln";
  const appVersion = packageJson.version || "0.1.1";

  const libraryVersions = libraryVersionsFromDeps();

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
      <Text style={[styles.settingsTitle, { marginBottom: 24 }]}>About</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontSize: 36,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
            }}
          >
            {appName}
          </Text>
          <Text
            style={{
              fontSize: 18,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontWeight: "500",
              marginLeft: 16,
            }}
          >
            v{appVersion}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 16,
            color: theme.colors.text,
            lineHeight: 24,
            marginBottom: 24,
            fontFamily: "Poppins",
          }}
        >
          Run GGUF language models offline on your phone. Download once, then chat without the cloud.
        </Text>

        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: theme.colors.text,
            fontFamily: "Poppins",
            marginBottom: 12,
          }}
        >
          How to use
        </Text>

        {GUIDE_SECTIONS.map((section) => (
          <GuideCard key={section.title} section={section} colors={theme.colors} />
        ))}

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.warning,
            padding: 16,
            marginTop: 12,
            marginBottom: 24,
          }}
          accessibilityRole="summary"
          accessibilityLabel="On-device model limitations"
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons
              name="warning-outline"
              size={22}
              color={theme.colors.warning}
              style={{ marginRight: 10 }}
            />
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                flex: 1,
              }}
            >
              On-device models aren’t perfect
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              lineHeight: 22,
              fontFamily: "Poppins",
            }}
          >
            Replies are generated entirely on your phone. Smaller and more compressed
            models (especially 0.8B–2B and Q4 quants) can occasionally ramble, repeat
            phrases, invent details, or give uneven answers. That comes with running AI
            offline — it’s normal, not a connection error. Try regenerating, rephrasing
            the prompt, or switching to a larger model when quality matters more.
          </Text>
        </View>

        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: theme.colors.text,
            fontFamily: "Poppins",
            marginBottom: 12,
          }}
        >
          Library versions
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: 16,
            paddingVertical: 8,
            marginBottom: 24,
          }}
        >
          {libraryVersions.map((lib, index) => (
            <View
              key={lib.name}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  flex: 1,
                  paddingRight: 12,
                }}
              >
                {lib.name}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontWeight: "600",
                }}
              >
                {lib.version}
              </Text>
            </View>
          ))}
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
    </View>
  );
}
