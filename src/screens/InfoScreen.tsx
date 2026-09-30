// InfoScreen.tsx — in-app About page (app info + quick-start guide)
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { FloatingBackButton } from "../components/FloatingBackButton";
import { FrostedPanel, SETTINGS_BLOCK } from "../components/FrostedGlass";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";

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
  let llamaRn = pin("llama.rn", "0.13.0-rc.3");
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
  /** Re-open the first-run onboarding steps (review mode). */
  onReviewOnboarding: () => void;
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
      "1. Open Models → Start here and pick a Q4_0 model.\n" +
      "2. Download, then tap the card to load.\n" +
      "3. Chat stays on-device. Wi‑Fi is only for downloads.",
  },
  {
    title: "Choosing a model",
    icon: "cube-outline",
    body:
      "Available Models lists phone-friendly picks. Smaller models run faster; larger ones give better answers.",
  },
  {
    title: "Quick actions",
    icon: "albums-outline",
    body:
      "Downloaded → Quick actions is always there — even before you have a small model. Downloaded picks sit at the top; gray cards are ones you can still download. Expand the list to browse them.",
  },
  {
    title: "Share default",
    icon: "share-outline",
    body:
      "Star a downloaded model to make it the Android Share default (summarize, rephrase, key points) so the overlay can run beside Chrome.",
  },
  {
    title: "RAM & acceleration",
    icon: "speedometer-outline",
    body:
      "Tap a model’s RAM-fit dot to check your phone. On Android, Q4_0 and Q6_K can use GPU or NPU when supported.",
  },
  {
    title: "Chat, photos & OCR",
    icon: "chatbubbles-outline",
    body:
      "Attach a photo — text is read on-device and added to your message.\n" +
      "Temporary Mode skips saving the chat to history.",
  },
  {
    title: "Speed & memory",
    icon: "flash-outline",
    body:
      "Default context (2048) is the safe Android setting.\n" +
      "Use smaller models on mid-range phones.\n" +
      "Close other apps when loading large GGUF files.",
  },
  {
    title: "Privacy",
    icon: "shield-checkmark-outline",
    body:
      "Chats, personas, and models stay on your device. Hugging Face is used only when you browse or download. No cloud LLM is used for replies.",
  },
];

function GuideCard({
  section,
  colors,
  width,
  minHeight,
  onHeight,
}: {
  section: GuideSection;
  colors: { border: string; text: string; textSecondary: string };
  width: number;
  minHeight?: number;
  onHeight?: (height: number) => void;
}) {
  return (
    <View
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={{ width, minHeight }}
    >
      <FrostedPanel
        style={{
          padding: SETTINGS_BLOCK.padding,
          minHeight,
          flex: 1,
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
      </FrostedPanel>
    </View>
  );
}

function GuideCarousel({
  colors,
}: {
  colors: {
    border: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    primary: string;
  };
}) {
  const { width: windowWidth } = useWindowDimensions();
  // InfoScreen container padding is 20 on each side.
  const cardWidth = Math.max(260, windowWidth - 40);
  const [page, setPage] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);

  const onHeight = useCallback((height: number) => {
    setCardHeight((prev) => (height > prev ? height : prev));
  }, []);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / cardWidth);
      setPage(Math.max(0, Math.min(GUIDE_SECTIONS.length - 1, next)));
    },
    [cardWidth],
  );

  const dots = useMemo(
    () =>
      GUIDE_SECTIONS.map((section, index) => (
        <View
          key={section.title}
          style={{
            width: index === page ? 16 : 7,
            height: 7,
            borderRadius: 4,
            marginHorizontal: 3,
            backgroundColor:
              index === page ? colors.primary : colors.textTertiary,
            opacity: index === page ? 1 : 0.45,
          }}
        />
      )),
    [page, colors.primary, colors.textTertiary],
  );

  return (
    <View style={{ marginBottom: SETTINGS_BLOCK.gap }}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollEnd}
        style={cardHeight > 0 ? { height: cardHeight } : undefined}
        accessibilityLabel="How to use guide"
        accessibilityHint="Swipe left or right to see the next tip"
      >
        {GUIDE_SECTIONS.map((section) => (
          <GuideCard
            key={section.title}
            section={section}
            colors={colors}
            width={cardWidth}
            minHeight={cardHeight > 0 ? cardHeight : undefined}
            onHeight={onHeight}
          />
        ))}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 12,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {dots}
      </View>
    </View>
  );
}

export default function InfoScreen({ onBack, onReviewOnboarding }: Props) {
  const { theme, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const appName = packageJson.name || "ofln";
  const appVersion = packageJson.version || "1.1";

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
      <Text style={styles.settingsTitle}>About</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
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
            marginBottom: 20,
            fontFamily: "Poppins",
          }}
        >
          Run GGUF chat models on your phone. Download once, then chat without the cloud.
        </Text>

        <TouchableOpacity
          onPress={onReviewOnboarding}
          accessibilityLabel="Review onboarding"
          accessibilityHint="Opens the first-run guide again"
          activeOpacity={0.85}
          style={{ marginBottom: 28 }}
        >
          <FrostedPanel
            style={{
              paddingVertical: 14,
              paddingHorizontal: SETTINGS_BLOCK.padding,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="map-outline"
              size={22}
              color={theme.colors.text}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                  color: theme.colors.text,
                  marginBottom: 2,
                }}
              >
                Review onboarding
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins",
                  color: theme.colors.textSecondary,
                  lineHeight: 18,
                }}
              >
                Replay the first-run guide.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </FrostedPanel>
        </TouchableOpacity>

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

        <GuideCarousel colors={theme.colors} />

        <FrostedPanel
          style={{
            padding: SETTINGS_BLOCK.padding,
            marginTop: 16,
            marginBottom: 24,
            borderColor: theme.colors.warning,
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
            Smaller models can ramble, repeat, or invent details — normal for on-device AI, not a
            network error. Try rephrasing, regenerating, or a larger model when quality matters.
          </Text>
        </FrostedPanel>

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
        <FrostedPanel
          style={{
            paddingHorizontal: SETTINGS_BLOCK.padding,
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
        </FrostedPanel>
      </ScrollView>

      <View style={{ position: "absolute", bottom: backBottom, left: 15, backgroundColor: "transparent" }}>
        <FloatingBackButton onPress={onBack} />
      </View>
    </View>
  );
}
