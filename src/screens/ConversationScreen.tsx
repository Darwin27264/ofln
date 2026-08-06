/**
 * ConversationScreen Component
 * 
 * Main chat interface for interacting with AI models.
 * Handles message display, input, history management, and model/persona selection.
 * 
 * Key features:
 * - Real-time message streaming with token-by-token updates
 * - Chat history with pinning, renaming, and multiselect
 * - Model and persona switching during conversations
 * - Temporary mode for unsaved conversations
 * - Optimized animations for smooth mobile performance
 * 
 * Performance optimizations:
 * - History / composer / messages extracted (HistoryDrawer, ChatComposer, MessageList)
 * - Optimized animations with native driver
 * - Efficient scroll handling with throttling
 * - Debounced chat history saves
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  BackHandler,
  ActivityIndicator,
  LayoutChangeEvent,
  NativeModules,
  PermissionsAndroid,
  StyleSheet,
  Share,
} from "react-native";
import { launchImageLibrary, launchCamera } from "react-native-image-picker";

/** Empty-chat hero lines — one is picked at random per empty session. */
const GREETING_LINES = ["How can I help?", "Let's chat!"] as const;

function pickGreetingLine(): (typeof GREETING_LINES)[number] {
  return GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
}

/** Survives ConversationScreen remounts so returning from Settings doesn't swap copy. */
let persistedGreetingLine: (typeof GREETING_LINES)[number] = pickGreetingLine();

/** Bottom edge of the top pill row (top: 8 + minHeight 42), plus a little breathing room. */
const TOP_CHROME_BOTTOM = 8 + 42 + 8;

/** Midpoint `top` for the empty-state hero between top pills and the composer. */
function computeGreetingTop(layoutHeight: number, overlayHeight: number): number {
  const bandTop = TOP_CHROME_BOTTOM;
  const bandBottom = layoutHeight - overlayHeight;
  const mid = (bandTop + bandBottom) / 2;
  return Math.max(bandTop, mid - 70);
}

import Ionicons from "react-native-vector-icons/Ionicons";
import Clipboard from "@react-native-clipboard/clipboard";
import { HistoryDrawer } from "../components/HistoryDrawer";
import { ChatComposer } from "../components/ChatComposer";
import { MessageList } from "../components/MessageList";
import { ContextFullnessBanner } from "../components/ContextFullnessBanner";
import { ContextFullnessRing } from "../components/ContextFullnessRing";
import { StaggerFadeIn } from "../components/StaggerFadeIn";
import RNFS from "react-native-fs";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from "react-native-svg";
import { createStyles, INPUT_FADE_HEIGHT, TOP_FADE_HEIGHT } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { chatHistoryService, ChatConversation } from "../services/chatHistoryService";
import { filterChatsBySearchQuery } from "../services/chatHistoryHelpers";
import { modelFileNameFromPath } from "../utils/modelSelectionRehydrate";
import {
  estimateContextFullness,
  shouldShowContextFullnessBanner,
} from "../utils/contextFullness";
import { getModelSettings, DEFAULT_SETTINGS } from "../services/modelSettingsService";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { FrostedGlass } from "../components/FrostedGlass";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardPadding } from "../hooks/useKeyboardPadding";
import { Persona, getPersonas } from "../services/personaService";
import { ANIMATION_CONFIG, EASING, ANIMATION_DURATIONS } from "../utils/animationConfig";
import { extractTextFromImage } from "../services/ocrService";
import {
  extractTextFromAttachment,
} from "../services/documentParsingService";
import { IMAGE_PICKER_OPTIONS, cleanupStaleMediaTemps } from "../services/mediaNormalizeService";
import {
  documentInjectCharBudget,
  buildAttachmentTextForPrompt,
  sanitizeChatDocumentFileName,
  isLikelyPdfMeta,
} from "../utils/documentHelpers";
import {
  pick,
  keepLocalCopy,
  isErrorWithCode,
  errorCodes,
  types as documentPickerTypes,
} from "@react-native-documents/picker";
import { useAIChat } from "../hooks/useAIChat";
import { llamaProvider } from "../providers/llamaProvider";
import { toUserFacingLoadError } from "../utils/userFacingErrors";
import { showLoadFailureAlert } from "../utils/loadFailureAlert";
import {
  buildChatMarkdown,
  isExportableMessage,
} from "../utils/chatMarkdownExport";
import { logError } from "../utils/errorLogger";
import { getAccelerationStatusSnapshot } from "../services/accelerationCapabilityService";
import { formatAccelLogDisplay } from "../utils/accelChipDisplay";
import {
  speakText,
  stopSpeaking,
  setSpeechStatusListener,
} from "../services/ttsService";

type MessageAttachment = {
  type: "image" | "pdf";
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
  tokensPerSecond?: number;
  attachments?: MessageAttachment[];
};


/**
 * AnimatedCheckmark Component
 * 
 * Displays a checkmark icon with fade-in animation.
 * Always renders to maintain layout, but fades in/out based on visibility.
 */
const AnimatedCheckmark: React.FC<{
  visible: boolean;
  size?: number;
  color: string;
  containerStyle?: any;
}> = React.memo(({ visible, size = 20, color, containerStyle }) => {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: ANIMATION_DURATIONS.STANDARD,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View 
      style={{ 
        opacity,
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      pointerEvents="none"
    >
      <Ionicons 
        name="checkmark-circle" 
        size={size} 
        color={color}
      />
    </Animated.View>
  );
});

AnimatedCheckmark.displayName = 'AnimatedCheckmark';

interface Props {
  conversation: Message[];
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>;
  userInput: string;
  setUserInput: (val: string) => void;
  scrollViewRef: React.RefObject<ScrollView>;
  scrollPositionRef: React.MutableRefObject<number>;
  contentHeightRef: React.MutableRefObject<number>;
  autoScrollEnabled: boolean;
  setAutoScrollEnabled: (val: boolean) => void;
  context: any;
  currentChatId: string | null;
  onChatIdChange: (id: string | null) => void;
  onLoadChat: (chatId: string, messages: Message[]) => void;
  onNewChat: () => void;
  onBackToModelSelection: () => void;
  /** Open Models page without unloading the current model or clearing chat. */
  onGoToModelSelection: () => void;
  assistantDisplayMode: "bubble" | "direct";
  onOpenSettings: () => void;
  selectedGGUF: string | null;
  setSelectedGGUF: (gguf: string | null) => void;
  downloadedModels: string[];
  setContext: (context: any) => void;
  checkDownloadedModels: () => Promise<void>;
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;
  /** Fired when frosted chrome (history drawer or quick model panel) opens/closes so status/nav bars match. */
  onHistoryPanelChange?: (open: boolean) => void;
  /**
   * Live shell color from App (status/nav + SafeArea). Chat canvas must use this
   * exact value so history + quick panel stay uniform with the system bars.
   */
  shellBackground: string;
}

export default function ConversationScreen({
  conversation: conversationProp,
  setConversation,
  userInput,
  setUserInput,
  scrollViewRef,
  scrollPositionRef,
  contentHeightRef,
  autoScrollEnabled,
  setAutoScrollEnabled,
  context,
  currentChatId,
  onChatIdChange,
  onLoadChat,
  onNewChat,
  onBackToModelSelection,
  onGoToModelSelection,
  assistantDisplayMode,
  onOpenSettings,
  selectedGGUF,
  setSelectedGGUF,
  downloadedModels,
  setContext,
  checkDownloadedModels,
  selectedPersona,
  setSelectedPersona,
  onHistoryPanelChange,
  shellBackground,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const insets = useSafeAreaInsets();
  // Soft inset rows that sit calmly on the frosted selector panel.
  const selectorFrost = useMemo(() => {
    const dark = theme.mode === 'dark';
    return {
      chrome: dark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(15, 23, 42, 0.06)',
      row: dark ? 'rgba(0, 0, 0, 0.38)' : 'rgba(15, 23, 42, 0.07)',
      rowBorder: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
      outline: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)',
    };
  }, [theme.mode]);
  /** Shared chrome metrics so tab bar + sticky footers align (same padding all around). */
  const selectorChromeOuter = useMemo(
    () => ({
      borderRadius: 12,
      padding: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: selectorFrost.rowBorder,
      backgroundColor: selectorFrost.chrome,
    }),
    [selectorFrost.rowBorder, selectorFrost.chrome],
  );
  const selectorChromeInner = useMemo(
    () => ({
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    }),
    [],
  );
  const selectorChromeLabel = useMemo(
    () => ({
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600" as const,
      fontFamily: "Poppins",
    }),
    [],
  );
  /** Gap between list and tab/footer chrome (symmetric top/bottom of the list). */
  const SELECTOR_LIST_GAP = 16;
  const { keyboardHeight: keyboardPadding, syncKeyboardState } = useKeyboardPadding();
  // Layout measurements live in refs (not state) because they're read inside the
  // keyboard-padding animated listener on every frame of the keyboard animation.
  // Storing them in state would force a re-render on every layout tick during
  // keyboard open/close, which cascades through the animated padding effect and
  // can trigger React's "Maximum update depth exceeded" guard.
  const initialLayoutHeightRef = useRef<number | null>(null);
  const currentLayoutHeightRef = useRef<number | null>(null);
  /** Tallest chat layout — used so hero midpoint never tracks a keyboard-shrunk window. */
  const fullLayoutHeightRef = useRef(0);
  /** Ignore composer onLayout while keyboard padding is animating. */
  const suppressComposerMeasureRef = useRef(false);

  /** Scroll list to latest message after layout commits (keyboard / new bubble). */
  const scrollChatToEnd = useCallback(
    (animated = false) => {
      const run = () => {
        scrollViewRef.current?.scrollToEnd({ animated });
      };
      requestAnimationFrame(() => {
        run();
        requestAnimationFrame(run);
      });
    },
    [scrollViewRef],
  );
  
  // Detect Samsung devices for keyboard padding adjustments
  // Samsung devices often have different keyboard behavior that requires extra padding
  const [isSamsungDevice, setIsSamsungDevice] = useState<boolean>(false);
  
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        // Try to detect Samsung device via Platform constants
        // React Native's Platform.constants may have device info on some versions
        const platformConstants = Platform.constants || {};
        const brand = (platformConstants.Brand || '').toLowerCase();
        const manufacturer = (platformConstants.Manufacturer || '').toLowerCase();
        const model = (platformConstants.Model || '').toLowerCase();
        
        // Also try NativeModules as fallback
        let nativeBrand = '';
        let nativeManufacturer = '';
        let nativeModel = '';
        try {
          const deviceInfo = NativeModules.PlatformConstants || {};
          nativeBrand = (deviceInfo.Brand || '').toLowerCase();
          nativeManufacturer = (deviceInfo.Manufacturer || '').toLowerCase();
          nativeModel = (deviceInfo.Model || '').toLowerCase();
        } catch (e) {
          // NativeModules might not be available, that's okay
        }
        
        // Check if device is Samsung based on brand/manufacturer/model
        // Samsung devices often have model numbers starting with "SM-"
        const isSamsung = 
          brand.includes('samsung') ||
          manufacturer.includes('samsung') ||
          model.includes('samsung') ||
          model.includes('sm-') || // Samsung model prefix (e.g., SM-G998B)
          nativeBrand.includes('samsung') ||
          nativeManufacturer.includes('samsung') ||
          nativeModel.includes('samsung') ||
          nativeModel.includes('sm-');
        
        setIsSamsungDevice(isSamsung);
        
        if (isSamsung) {
          console.log('Samsung device detected - applying extra keyboard padding');
        }
      } catch (error) {
        // If detection fails, we'll use windowResizeInsufficient as fallback
        // This is fine - the windowResizeInsufficient flag already catches Samsung-like behavior
        console.warn('Could not detect device manufacturer, will use behavior-based detection:', error);
      }
    }
  }, []);
  
  // Animated padding value for smooth transitions above the keyboard.
  // Initialize with 12px (no keyboard state) to prevent jump on first render.
  const animatedBottomPadding = useRef(new Animated.Value(12)).current;
  // Measured height of the floating input overlay so messages can scroll under the fade.
  // Only updated while the keyboard is closed — live updates during padding animation
  // re-render the tree every frame and make the hero jitter.
  const [inputOverlayHeight, setInputOverlayHeight] = useState(INPUT_FADE_HEIGHT + 72);
  // Estimate from window − safe area so remounts don't flash at a hardcoded 180 then jump.
  const initialGreetingTop = computeGreetingTop(
    Dimensions.get("window").height - insets.top - insets.bottom,
    INPUT_FADE_HEIGHT + 72
  );
  /** Fixed pixel top for the empty-state hero (midpoint), frozen while keyboard is up. */
  const [greetingTop, setGreetingTop] = useState(initialGreetingTop);
  const greetingTopRef = useRef(initialGreetingTop);

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatConversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [contextNCtx, setContextNCtx] = useState<number>(DEFAULT_SETTINGS.n_ctx);
  const [contextBannerDismissed, setContextBannerDismissed] = useState(false);

  // Long press menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  // Multiselect state
  const [isMultiselectMode, setIsMultiselectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  
  // Multiselect header animation
  const multiselectHeaderHeight = useRef(new Animated.Value(0)).current;
  const multiselectHeaderOpacity = useRef(new Animated.Value(0)).current;
  
  // Menu animation
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0.9)).current;
  const menuItem0Opacity = useRef(new Animated.Value(0)).current;
  const menuItem0Translate = useRef(new Animated.Value(8)).current;
  const menuItem1Opacity = useRef(new Animated.Value(0)).current;
  const menuItem1Translate = useRef(new Animated.Value(8)).current;
  const menuItem2Opacity = useRef(new Animated.Value(0)).current;
  const menuItem2Translate = useRef(new Animated.Value(8)).current;
  const menuItem3Opacity = useRef(new Animated.Value(0)).current;
  const menuItem3Translate = useRef(new Animated.Value(8)).current;
  const menuItem4Opacity = useRef(new Animated.Value(0)).current;
  const menuItem4Translate = useRef(new Animated.Value(8)).current;

  // Attach image popup menu (above add button)
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [attachMenuAnchor, setAttachMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const attachMenuOpacity = useRef(new Animated.Value(0)).current;
  const attachMenuScale = useRef(new Animated.Value(0.9)).current;
  const attachItem0Opacity = useRef(new Animated.Value(0)).current;
  const attachItem0Translate = useRef(new Animated.Value(8)).current;
  const attachItem1Opacity = useRef(new Animated.Value(0)).current;
  const attachItem1Translate = useRef(new Animated.Value(8)).current;
  const attachItem2Opacity = useRef(new Animated.Value(0)).current;
  const attachItem2Translate = useRef(new Animated.Value(8)).current;
  const addButtonRef = useRef<View>(null);

  // Animation configurations are imported from centralized config
  // This ensures consistency across the application

  // Temporary mode (only before the first user message).
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);

  // Model selector — `chromeOpen` stays true through the exit fade (like isPanelOpen).
  const [isModelSelectorVisible, setIsModelSelectorVisible] = useState(false);
  const [isModelSelectorChromeOpen, setIsModelSelectorChromeOpen] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [selectorTab, setSelectorTab] = useState<"models" | "personas">("models");
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);
  /** Short accel tag (CPU/GPU/NPU) for selected model in the quick panel. */
  const [selectedAccelLabel, setSelectedAccelLabel] = useState<string | null>(null);
  const [selectedAccelDetail, setSelectedAccelDetail] = useState<string | null>(null);

  const warnModelNotLoaded = useCallback(() => {
    showAlert(
      'No model loaded',
      'Select and load a model before sending messages. Tap the model name at the top of the chat to choose one.',
      [{ text: 'OK' }],
    );
  }, []);

  // New backend: useAIChat + llamaProvider (on-device streaming).
  // The hook owns the live transcript. Parent `conversationProp` is only a
  // seed for new-chat / load-chat (via chatId sync) and a remount snapshot.
  const aiChat = useAIChat({
    initialMessages: conversationProp as any,
    modelName: selectedGGUF || "unknown",
    persona: selectedPersona,
    chatId: currentChatId,
    onChatIdChange,
    scrollViewRef,
    // Prefer the native completion path for best parity with the legacy flow
    // (thinking/reasoning params, stopCompletion behavior).
    useNativeCompletion: true,
    onModelNotReady: warnModelNotLoaded,
    disablePersistence: isTemporaryMode,
  });

  // Single source of truth for rendering — never mirror into parent on every token.
  const conversation = aiChat.messages as Message[];
  const isGenerating = aiChat.isGenerating;
  const isLoading = aiChat.isLoading;
  const tokensPerSecond = aiChat.tokensPerSecond;
  const hasStartedChat = conversation.some((m) => m.role === 'user');

  // Snapshot transcript to App when a turn settles (remount seed only).
  const wasGeneratingRef = useRef(false);
  const liveMessagesRef = useRef(aiChat.messages);
  liveMessagesRef.current = aiChat.messages;

  useEffect(() => {
    if (aiChat.isGenerating) {
      wasGeneratingRef.current = true;
      return;
    }
    if (!wasGeneratingRef.current) return;
    wasGeneratingRef.current = false;
    setConversation(liveMessagesRef.current as Message[]);
  }, [aiChat.isGenerating, setConversation]);

  // One-way: controlled TextInput → hook input.
  useEffect(() => {
    if (userInput !== aiChat.input) {
      aiChat.setInput(userInput);
    }
  }, [userInput, aiChat.input, aiChat.setInput]);

  // Load via llamaProvider when the selected model file changes.
  // IMPORTANT: do NOT depend on modelStatus / legacy context — those change
  // during loadModel and previously caused an infinite unload→reload loop
  // that froze the UI right after the "Model loaded" toast.
  const autoLoadInFlightRef = useRef<string | null>(null);
  const lastAutoLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedGGUF) return;

    const modelPath = `${RNFS.DocumentDirectoryPath}/${selectedGGUF}`;
    const status = llamaProvider.getStatus();
    const nativeCtx = llamaProvider.getNativeContext();
    // Skip only when provider is actually ready with a live native context.
    // Stale "ready" after a legacy release would otherwise leave chat broken.
    const providerReadyForPath =
      llamaProvider.isReady() &&
      !!nativeCtx &&
      (status.modelPath === modelPath || lastAutoLoadedRef.current === modelPath);
    if (providerReadyForPath) {
      lastAutoLoadedRef.current = modelPath;
      // Remount / brief background can clear React `context` while provider stays ready.
      setContext(nativeCtx);
      return;
    }
    if (autoLoadInFlightRef.current === modelPath) {
      return;
    }

    let cancelled = false;
    autoLoadInFlightRef.current = modelPath;

    (async () => {
      try {
        setIsLoadingModel(true);
        setLoadingModelFile(selectedGGUF);

        // Drop any leftover legacy llama.rn context so we don't hold two models.
        // Read via provider / prop snapshot — do not put `context` in effect deps.
        const legacy = context;
        if (legacy && typeof legacy.release === "function") {
          try {
            legacy.release();
          } catch {
            // Ignore: legacy context release can fail on some devices
          }
          if (!cancelled) setContext(null);
        }

        const ok = await llamaProvider.loadModel({ modelPath });
        if (cancelled) return;

        if (ok) {
          lastAutoLoadedRef.current = modelPath;
          // Keep legacy `context` prop in sync for send-guards that still check it.
          setContext(llamaProvider.getNativeContext());
        }
      } finally {
        if (autoLoadInFlightRef.current === modelPath) {
          autoLoadInFlightRef.current = null;
        }
        if (!cancelled) {
          setIsLoadingModel(false);
          setLoadingModelFile(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only selectedGGUF should (re)load
  }, [selectedGGUF]);

  // Pending attachment (local state only until send) — image OCR or PDF extract
  type PendingAttachment = {
    uri: string;
    fileName?: string;
    type?: string;
    kind: "image" | "pdf";
    width?: number;
    height?: number;
  };
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  /** Blocks double-send while extract / animation is in flight (before isGenerating). */
  const sendPrepareRef = useRef(false);

  // Helper function to prettify model name
  const prettifyModelName = (fileName: string): string => {
    let cleaned = fileName.replace(/\.[^.]+$/, "");
    cleaned = cleaned.replace(/-/g, " ");
    return cleaned.trim();
  };


  // Slide-out panel logic - declared early so it can be used in useEffects
  // Full-width history page that still slides in from the left
  const screenWidth = Dimensions.get('window').width;
  const panelWidth = screenWidth;
  const panelAnim = useRef(new Animated.Value(-panelWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const panelWantOpenRef = useRef(false);

  useEffect(() => {
    if (!isPanelOpen && isMultiselectMode) {
      multiselectHeaderHeight.setValue(0);
      multiselectHeaderOpacity.setValue(0);
    }
  }, [isPanelOpen, isMultiselectMode, multiselectHeaderHeight, multiselectHeaderOpacity]);

  // Frosted shell/system bars follow both panels through their full close.
  useEffect(() => {
    onHistoryPanelChange?.(isPanelOpen || isModelSelectorChromeOpen);
  }, [isPanelOpen, isModelSelectorChromeOpen, onHistoryPanelChange]);

  // Always restore system bars if this screen unmounts while frosted chrome was up
  useEffect(() => {
    return () => {
      onHistoryPanelChange?.(false);
    };
  }, [onHistoryPanelChange]);

  // Manage greeting fade + keyboard lift.
  const noMessages = conversation.slice(1).length === 0;
  // Match typed-input visibility on remount so we don't flash the hero then fade it out.
  const greetingOpacity = useRef(
    new Animated.Value(userInput.trim().length > 0 ? 0 : 1)
  ).current;
  const greetingOpacityReadyRef = useRef(false);
  /** Shifts the empty-state hero up with the keyboard so it stays in the visible band. */
  const greetingKeyboardShift = useRef(new Animated.Value(0)).current;
  /** Quick actions fade out while the keyboard is up so they never sit under the composer. */
  const quickActionsOpacity = useRef(
    new Animated.Value(keyboardPadding > 0 ? 0 : 1)
  ).current;
  const quickActionsOpacityReadyRef = useRef(false);
  const [greetingLine, setGreetingLine] = useState(persistedGreetingLine);
  const hadMessagesRef = useRef(!noMessages);

  // Re-roll greeting copy whenever we return to an empty chat (new chat / clear).
  useEffect(() => {
    if (noMessages && hadMessagesRef.current) {
      const next = pickGreetingLine();
      persistedGreetingLine = next;
      setGreetingLine(next);
    }
    hadMessagesRef.current = !noMessages;
  }, [noMessages]);
  
  // Animation for temporary mode content transitions
  const presetMessagesAnim = useRef(new Animated.Value(1)).current;
  const tempModeExplanationAnim = useRef(new Animated.Value(0)).current;
  const tempModeAnimReadyRef = useRef(false);

  // Persona indicator animation
  const personaIndicatorOpacity = useRef(new Animated.Value(selectedPersona ? 1 : 0)).current;
  const contextRingOpacity = useRef(new Animated.Value(0)).current;
  const [contextRingMounted, setContextRingMounted] = useState(false);

  // Preset messages
  const PRESET_MESSAGES = [
    "Give me a random fact",
    "Summarize my clipboard",
    "Help me draft an email",
  ];

  // Icon mapping for preset messages
  const PRESET_ICONS: { [key: string]: string } = {
    "Give me a random fact": "sparkles-outline",
    "Summarize my clipboard": "clipboard-outline",
    "Help me draft an email": "mail-outline",
  };

  // Reset context-banner dismiss when switching chats.
  useEffect(() => {
    setContextBannerDismissed(false);
  }, [currentChatId]);

  // Resolve n_ctx for the active model (for fullness estimate only — no reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedGGUF) {
        if (!cancelled) setContextNCtx(DEFAULT_SETTINGS.n_ctx);
        return;
      }
      try {
        const settings = await getModelSettings(selectedGGUF);
        if (!cancelled) setContextNCtx(settings.n_ctx || DEFAULT_SETTINGS.n_ctx);
      } catch {
        if (!cancelled) setContextNCtx(DEFAULT_SETTINGS.n_ctx);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGGUF]);

  // Initialize chat history service
  useEffect(() => {
    chatHistoryService.initialize();
  }, []);

  // If provider still has a live model but UI selection was wiped (e.g. remount),
  // Conversation relies on App.tsx rehydrate; keep this as a narrow fallback.
  useEffect(() => {
    if (selectedGGUF) return;
    if (!llamaProvider.isReady()) return;
    const nativeCtx = llamaProvider.getNativeContext();
    const status = llamaProvider.getStatus();
    if (!nativeCtx || !status.modelPath) return;
    const fileName = modelFileNameFromPath(status.modelPath);
    if (!fileName) return;
    setSelectedGGUF(fileName);
    setContext(nativeCtx);
  }, [selectedGGUF, setSelectedGGUF, setContext]);

  // Reset temporary mode when returning to an empty new chat.
  useEffect(() => {
    if (!hasStartedChat && !currentChatId) {
      setIsTemporaryMode(false);
    }
  }, [hasStartedChat, currentChatId]);

  /**
   * Animate persona indicator fade in/out
   * Provides visual feedback when persona is selected or cleared
   */
  useEffect(() => {
    Animated.timing(personaIndicatorOpacity, {
      toValue: selectedPersona ? 1 : 0,
      duration: ANIMATION_DURATIONS.STANDARD,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [selectedPersona, personaIndicatorOpacity]);

  // Context ring: fade in after first user message; fade out on new chat.
  useEffect(() => {
    const shouldShow = hasStartedChat && !!selectedGGUF;
    if (shouldShow) {
      setContextRingMounted(true);
      Animated.timing(contextRingOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATIONS.STANDARD,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(contextRingOpacity, {
      toValue: 0,
      duration: ANIMATION_DURATIONS.STANDARD,
      easing: EASING.EASE_IN,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setContextRingMounted(false);
    });
  }, [hasStartedChat, selectedGGUF, contextRingOpacity]);

  // Load chat history when the drawer opens or the active chat id changes.
  useEffect(() => {
    let isMounted = true;
    
    const loadChatHistory = async () => {
      if (isPanelOpen) {
        // Load immediately without delay for instant responsiveness
        setIsLoadingHistory(true);
        try {
          const chats = await chatHistoryService.getAllChats();
          if (isMounted) {
            setChatHistory(chats);
          }
        } catch (error) {
          console.error('Error loading chat history:', error);
        } finally {
          if (isMounted) {
            setIsLoadingHistory(false);
          }
        }
      } else {
        // Clear history when panel closes to prevent stale data
        setChatHistory([]);
      }
    };
    
    loadChatHistory();
    
    return () => {
      isMounted = false;
    };
  }, [isPanelOpen, currentChatId]);

  // Refresh open drawer after a turn settles (title/preview), without re-saving.
  useEffect(() => {
    if (isGenerating || !isPanelOpen || isTemporaryMode || !hasStartedChat) {
      return undefined;
    }
    const timer = setTimeout(() => {
      chatHistoryService
        .getAllChats()
        .then(setChatHistory)
        .catch((error) => {
          console.error('Error refreshing chat history:', error);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [isGenerating, isPanelOpen, isTemporaryMode, hasStartedChat, conversation.length]);

  /**
   * Exit multiselect mode
   */
  const exitMultiselectMode = useCallback(() => {
    Animated.parallel([
      Animated.timing(multiselectHeaderHeight, {
        toValue: 0,
        duration: ANIMATION_DURATIONS.STANDARD,
        easing: EASING.STANDARD,
        useNativeDriver: false,
      }),
      Animated.timing(multiselectHeaderOpacity, {
        toValue: 0,
        duration: ANIMATION_DURATIONS.STANDARD,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsMultiselectMode(false);
      setSelectedChatIds(new Set());
    });
  }, [multiselectHeaderHeight, multiselectHeaderOpacity]);
  
  // Animate multiselect header when entering multiselect mode
  useEffect(() => {
    if (isMultiselectMode) {
      Animated.parallel([
        Animated.spring(multiselectHeaderHeight, {
          toValue: 1,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(multiselectHeaderOpacity, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isMultiselectMode, multiselectHeaderHeight, multiselectHeaderOpacity]);

  const togglePanel = useCallback(() => {
    panelAnimationRef.current?.stop();

    const opening = !panelWantOpenRef.current;
    panelWantOpenRef.current = opening;

    if (opening) {
      setIsPanelOpen(true);
      const anim = Animated.parallel([
        Animated.spring(panelAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 14,
          overshootClamping: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 100,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
      ]);
      panelAnimationRef.current = anim;
      anim.start(({ finished }) => {
        if (!finished || !panelWantOpenRef.current) return;
        panelAnim.setValue(0);
        backdropOpacity.setValue(1);
        panelAnimationRef.current = null;
      });
      return;
    }

    const anim = Animated.parallel([
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        duration: 200,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]);
    panelAnimationRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished || panelWantOpenRef.current) return;
      panelAnim.setValue(-panelWidth);
      backdropOpacity.setValue(0);
      panelAnimationRef.current = null;
      setIsPanelOpen(false);
      setHistorySearchQuery('');
      if (isMultiselectMode) exitMultiselectMode();
    });
  }, [panelAnim, panelWidth, backdropOpacity, isMultiselectMode, exitMultiselectMode]);

  // Handle chat selection
  const handleChatSelect = useCallback(async (chat: ChatConversation) => {
    onLoadChat(chat.id, chat.messages);
    togglePanel();
  }, [onLoadChat, togglePanel]);

  // Helper function to format month/year
  const formatMonthYear = (timestamp: number): string => {
    const date = new Date(timestamp);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Helper function to group chats by month/year (preserves order)
  const groupChatsByMonth = (chats: ChatConversation[]): Map<string, ChatConversation[]> => {
    const grouped = new Map<string, ChatConversation[]>();
    // Maintain the order from the input array
    chats.forEach(chat => {
      // Use createdAt for grouping to maintain consistent month/year grouping
      const key = formatMonthYear(chat.createdAt);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(chat);
    });
    return grouped;
  };

  // Toast notification state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;

  /**
   * Show toast notification with optimized animation
   * 
   * Displays a temporary message overlay with fade in/out animation.
   * Automatically dismisses after 2 seconds.
   * 
   * @param message - Message to display in toast
   * 
   * Edge cases handled:
   * - Cancels previous toast if new one is shown
   * - Ensures toast doesn't overlap with UI elements
   * - Handles animation completion properly
   */
  const showToast = useCallback((message: string) => {
    // Cancel any ongoing toast animation to prevent conflicts
    toastOpacity.stopAnimation();
    
    setToastMessage(message);
    setToastVisible(true);
    
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        ...ANIMATION_CONFIG.toast,
      }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        ...ANIMATION_CONFIG.toast,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToastVisible(false);
      }
    });
  }, [toastOpacity]);

  /**
   * Dismiss context menu with optimized animation
   * 
   * Fades out and scales down the menu smoothly.
   * Reusable function to prevent code duplication (DRY principle).
   */
  const dismissMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 0.92,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(() => setMenuVisible(false));
  }, [menuOpacity, menuScale]);

  const handleNewChatPress = useCallback(() => {
    // Clear App identity/seed first so the next render never pairs a stale
    // currentChatId with the emptied hook transcript (that reloads old chat).
    setContextBannerDismissed(false);
    onNewChat();
    aiChat.newChat();
  }, [aiChat.newChat, onNewChat]);

  /**
   * Handle chat deletion
   * 
   * Edge cases handled:
   * - Validates chat exists before deletion
   * - Handles deletion of currently active chat
   * - Shows error toast on failure
   */
  const handleDeleteChat = useCallback(async (chatId: string) => {
    // Animate menu dismissal
    dismissMenu();
    
    showAlert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatHistoryService.deleteChat(chatId);
              const chats = await chatHistoryService.getAllChats();
              setChatHistory(chats);
              if (currentChatId === chatId) {
                handleNewChatPress();
              }
            } catch (error) {
              console.error('Error deleting chat:', error);
              showToast('Failed to delete chat');
            }
          },
        },
      ]
    );
  }, [currentChatId, handleNewChatPress, dismissMenu, showToast]);

  /**
   * Toggle selection of a chat in multiselect mode
   */
  const toggleChatSelection = useCallback((chatId: string) => {
    setSelectedChatIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  }, []);

  /**
   * Handle long press on chat history item
   * Shows context menu at press position or enters multiselect mode
   * 
   * Edge cases handled:
   * - Validates event coordinates
   * - Positions menu within screen bounds
   */
  const handleLongPress = useCallback((chat: ChatConversation, event: any) => {
    if (isMultiselectMode) {
      toggleChatSelection(chat.id);
    } else {
      const { pageX, pageY } = event.nativeEvent;
      setSelectedChatId(chat.id);
      setMenuPosition({ x: pageX, y: pageY });
      setMenuVisible(true);

      menuOpacity.setValue(0);
      menuScale.setValue(0.92);
      [menuItem0Opacity, menuItem1Opacity, menuItem2Opacity, menuItem3Opacity, menuItem4Opacity].forEach((v) => v.setValue(0));
      [menuItem0Translate, menuItem1Translate, menuItem2Translate, menuItem3Translate, menuItem4Translate].forEach((v) => v.setValue(6));

      const itemAnim = (opacity: Animated.Value, translate: Animated.Value, delay: number) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 100, delay, easing: EASING.EASE_OUT, useNativeDriver: true }),
          Animated.timing(translate, { toValue: 0, duration: 100, delay, easing: EASING.EASE_OUT, useNativeDriver: true }),
        ]);

      Animated.parallel([
        Animated.timing(menuOpacity, { toValue: 1, duration: 80, easing: EASING.EASE_OUT, useNativeDriver: true }),
        Animated.spring(menuScale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 22, overshootClamping: true }),
        itemAnim(menuItem0Opacity, menuItem0Translate, 25),
        itemAnim(menuItem1Opacity, menuItem1Translate, 50),
        itemAnim(menuItem2Opacity, menuItem2Translate, 75),
        itemAnim(menuItem3Opacity, menuItem3Translate, 100),
        itemAnim(menuItem4Opacity, menuItem4Translate, 125),
      ]).start();
    }
  }, [isMultiselectMode, toggleChatSelection, menuOpacity, menuScale, menuItem0Opacity, menuItem0Translate, menuItem1Opacity, menuItem1Translate, menuItem2Opacity, menuItem2Translate, menuItem3Opacity, menuItem3Translate, menuItem4Opacity, menuItem4Translate]);

  /**
   * Handle rename chat
   * 
   * Edge cases handled:
   * - Validates chat exists before entering edit mode
   * - Preserves original title if rename is cancelled
   */
  const handleRename = useCallback(async (chatId: string) => {
    // Animate menu dismissal
    dismissMenu();
    
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setEditingChatId(chatId);
      setEditingTitle(chat.title);
    }
  }, [chatHistory, dismissMenu]);

  // Handle rename save
  const handleRenameSave = useCallback(async () => {
    if (editingChatId && editingTitle.trim()) {
      try {
        await chatHistoryService.renameChat(editingChatId, editingTitle.trim());
        const chats = await chatHistoryService.getAllChats();
        setChatHistory(chats);
        setEditingChatId(null);
        setEditingTitle('');
      } catch (error) {
        console.error('Error renaming chat:', error);
        showToast('Failed to rename chat');
      }
    } else {
      setEditingChatId(null);
      setEditingTitle('');
    }
  }, [editingChatId, editingTitle, showToast]);

  /**
   * Handle pin/unpin chat
   * 
   * Edge cases handled:
   * - Handles service errors gracefully
   * - Updates UI immediately on success
   */
  const handlePinToggle = useCallback(async (chatId: string) => {
    // Animate menu dismissal
    dismissMenu();
    
    try {
      await chatHistoryService.togglePinChat(chatId);
      const chats = await chatHistoryService.getAllChats();
      setChatHistory(chats);
    } catch (error) {
      console.error('Error toggling pin:', error);
      showToast('Failed to pin/unpin chat');
    }
  }, [dismissMenu, showToast]);

  /** Export chat as Markdown via the system share sheet (S18). */
  const handleExportChat = useCallback(
    async (chatId: string) => {
      dismissMenu();
      try {
        const listed = chatHistory.find((c) => c.id === chatId);
        let title = listed?.customTitle || listed?.title || 'Chat';
        let messages =
          chatId === currentChatId
            ? (conversation as { role: string; content: string; thought?: string }[])
            : null;

        if (!messages || !messages.some(isExportableMessage)) {
          const chat = await chatHistoryService.getChat(chatId);
          if (!chat) {
            showToast('Chat not found');
            return;
          }
          title = chat.customTitle || chat.title || title;
          messages = chat.messages;
        }

        if (!messages.some(isExportableMessage)) {
          showToast('Nothing to export yet');
          return;
        }

        const markdown = buildChatMarkdown(messages, {
          title,
          exportedAt: new Date().toLocaleString(),
        });

        await Share.share({
          message: markdown,
          title,
        });
      } catch (error) {
        void logError('ChatExport', 'Export Markdown failed', error, { chatId });
        showToast('Could not export chat');
      }
    },
    [chatHistory, conversation, currentChatId, dismissMenu, showToast],
  );

  /**
   * Enter multiselect mode
   * Initializes with the first chat selected
   */
  const enterMultiselectMode = useCallback((initialChatId?: string) => {
    setIsMultiselectMode(true);
    if (initialChatId) {
      setSelectedChatIds(new Set([initialChatId]));
    } else {
      setSelectedChatIds(new Set());
    }
    dismissMenu();
  }, [dismissMenu]);

  /**
   * Select all chats
   */
  const selectAllChats = useCallback(() => {
    const allChatIds = chatHistory.map(chat => chat.id);
    setSelectedChatIds(new Set(allChatIds));
  }, [chatHistory]);

  /**
   * Deselect all chats
   */
  const deselectAllChats = useCallback(() => {
    setSelectedChatIds(new Set());
  }, []);

  /**
   * Delete selected chats
   */
  const deleteSelectedChats = useCallback(async () => {
    if (selectedChatIds.size === 0) return;

    const chatIdsArray = Array.from(selectedChatIds);
    
    // If current chat is being deleted, switch to new chat
    if (currentChatId && selectedChatIds.has(currentChatId)) {
      handleNewChatPress();
    }

    try {
      const success = await chatHistoryService.deleteMultipleChats(chatIdsArray);
      if (success) {
        const chats = await chatHistoryService.getAllChats();
        setChatHistory(chats);
        showToast(`Deleted ${chatIdsArray.length} chat${chatIdsArray.length > 1 ? 's' : ''}`);
        exitMultiselectMode();
      } else {
        showToast('Failed to delete chats');
      }
    } catch (error) {
      console.error('Error deleting chats:', error);
      showToast('Failed to delete chats');
    }
  }, [selectedChatIds, currentChatId, handleNewChatPress, exitMultiselectMode, showToast]);

  /**
   * Animate greeting fade based on user input
   * Hides greeting when user starts typing
   */
  useEffect(() => {
    if (!noMessages) return;
    const target = userInput.trim().length > 0 ? 0 : 1;
    // First run after mount: snap (value already initialized). Animating 1→1
    // during PageFadeIn still schedules work that can hitch the enter transition.
    if (!greetingOpacityReadyRef.current) {
      greetingOpacityReadyRef.current = true;
      greetingOpacity.setValue(target);
      return;
    }
    Animated.timing(greetingOpacity, {
      toValue: target,
      duration: ANIMATION_DURATIONS.SLOW,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [userInput, noMessages, greetingOpacity]);

  /**
   * Fade quick actions when the keyboard is active so they don't sit behind the input bar.
   * Greeting text stays visible until the user starts typing.
   */
  useEffect(() => {
    if (!noMessages) return;
    const target = keyboardPadding > 0 ? 0 : 1;
    if (!quickActionsOpacityReadyRef.current) {
      quickActionsOpacityReadyRef.current = true;
      quickActionsOpacity.setValue(target);
      return;
    }
    Animated.timing(quickActionsOpacity, {
      toValue: target,
      duration: ANIMATION_DURATIONS.SLOW,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [keyboardPadding, noMessages, quickActionsOpacity]);

  /**
   * Animate temporary mode content transitions
   * Smoothly transitions between preset messages and temporary mode explanation
   */
  useEffect(() => {
    const presetTarget = isTemporaryMode ? 0 : 1;
    const explanationTarget = isTemporaryMode ? 1 : 0;
    // Snap on remount so PageFadeIn isn't competing with a no-op 250ms timing.
    if (!tempModeAnimReadyRef.current) {
      tempModeAnimReadyRef.current = true;
      presetMessagesAnim.setValue(presetTarget);
      tempModeExplanationAnim.setValue(explanationTarget);
      return;
    }
    Animated.parallel([
      Animated.timing(presetMessagesAnim, {
        toValue: presetTarget,
        duration: ANIMATION_DURATIONS.PAGE,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(tempModeExplanationAnim, {
        toValue: explanationTarget,
        duration: ANIMATION_DURATIONS.PAGE,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isTemporaryMode, presetMessagesAnim, tempModeExplanationAnim]);

  // Toggle temporary mode (only available before chat starts)
  const toggleTemporaryMode = useCallback(() => {
    if (!hasStartedChat) {
      setIsTemporaryMode(prev => !prev);
    }
  }, [hasStartedChat]);

  /**
   * Scale animation for the send icon
   * Provides visual feedback when message is sent
   */
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  /**
   * Handle sending a message
   * 
   * Validates input and context before sending.
   * Provides visual feedback with icon animation.
   * 
   * Edge cases handled:
   * - Missing model context
   * - Empty input validation
   * - Scroll to bottom after sending
   */
  const handleSendMessage = useCallback(async () => {
    if (sendPrepareRef.current || isOcrRunning || isGenerating || isLoading) {
      return;
    }
    if (!llamaProvider.isReady() || !selectedGGUF) {
      warnModelNotLoaded();
      return;
    }

    const displayContent = userInput.trim();
    // Snapshot — UI may clear while the send animation runs.
    const attachment = pendingAttachment;
    if (!displayContent && !attachment) {
      return;
    }

    sendPrepareRef.current = true;
    if (attachment) {
      setIsOcrRunning(true);
    }

    // Animate send icon for visual feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.15,
        duration: ANIMATION_DURATIONS.FAST,
        useNativeDriver: true,
        easing: EASING.STANDARD,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION_DURATIONS.STANDARD,
        useNativeDriver: true,
        easing: EASING.STANDARD,
      }),
    ]).start(async () => {
      try {
        if (!llamaProvider.isReady() || !selectedGGUF) {
          warnModelNotLoaded();
          return;
        }

        let sendOptions: {
          text: string;
          textForPrompt?: string;
          attachments?: MessageAttachment[];
        } = { text: displayContent };

        if (attachment) {
          try {
            const settings = await getModelSettings(selectedGGUF).catch(
              () => DEFAULT_SETTINGS,
            );
            if (attachment.kind === "pdf") {
              const safeName = sanitizeChatDocumentFileName(attachment.fileName);
              const docText = await extractTextFromAttachment(
                {
                  type: "pdf",
                  uri: attachment.uri,
                  fileName: safeName,
                  mimeType: attachment.type || "application/pdf",
                },
                {
                  n_ctx: settings.n_ctx,
                  n_predict: settings.n_predict,
                },
              );
              if (!docText && __DEV__) {
                console.log("[ConversationScreen] PDF extract returned no text");
              }
              const textForPrompt = buildAttachmentTextForPrompt(
                "pdf",
                docText,
                displayContent,
              );
              sendOptions = {
                text: displayContent,
                textForPrompt,
                attachments: [
                  {
                    type: "pdf",
                    uri: attachment.uri,
                    fileName: safeName,
                    mimeType: attachment.type || "application/pdf",
                  },
                ],
              };
            } else {
              const injectBudget = documentInjectCharBudget(
                settings.n_ctx,
                settings.n_predict,
              );
              const ocrText = await extractTextFromImage(
                attachment.uri,
                injectBudget,
              );
              if (ocrText === "" && __DEV__) {
                console.log("[ConversationScreen] OCR returned no text");
              }
              const textForPrompt = buildAttachmentTextForPrompt(
                "image",
                ocrText,
                displayContent,
              );
              const attachments: MessageAttachment[] = [
                {
                  type: "image",
                  uri: attachment.uri,
                  width: attachment.width,
                  height: attachment.height,
                  fileName: attachment.fileName,
                },
              ];
              sendOptions = { text: displayContent, textForPrompt, attachments };
            }
          } catch (extractErr) {
            if (__DEV__) console.warn("Attachment extract error:", extractErr);
            if (attachment.kind === "pdf") {
              const safeName = sanitizeChatDocumentFileName(attachment.fileName);
              showToast("Could not read the PDF. Sending with a limitation note.");
              sendOptions = {
                text: displayContent,
                textForPrompt: buildAttachmentTextForPrompt(
                  "pdf",
                  "",
                  displayContent,
                ),
                attachments: [
                  {
                    type: "pdf",
                    uri: attachment.uri,
                    fileName: safeName,
                    mimeType: attachment.type || "application/pdf",
                  },
                ],
              };
            } else {
              showToast("Could not read text from image. Sending image anyway.");
              sendOptions = {
                text: displayContent,
                textForPrompt: buildAttachmentTextForPrompt(
                  "image",
                  "",
                  displayContent,
                ),
                attachments: [
                  {
                    type: "image",
                    uri: attachment.uri,
                    width: attachment.width,
                    height: attachment.height,
                    fileName: attachment.fileName,
                  },
                ],
              };
            }
          }
        }

        // Re-check readiness after async OCR/PDF extract (model can unload mid-flight).
        if (!llamaProvider.isReady() || !selectedGGUF) {
          warnModelNotLoaded();
          return;
        }

        // Clear composer only once we are ready to hand off to the chat hook.
        setPendingAttachment(null);
        setUserInput("");
        aiChat.setInput("");
        setAutoScrollEnabled(true);
        await aiChat.handleSubmit(sendOptions);
        scrollChatToEnd(true);
        setTimeout(() => scrollChatToEnd(false), 100);
        setTimeout(() => scrollChatToEnd(false), 320);
      } catch (error) {
        console.error("Error sending message:", error);
        showToast("Failed to send message. Please try again.");
      } finally {
        setIsOcrRunning(false);
        sendPrepareRef.current = false;
      }
    });
  }, [
    selectedGGUF,
    userInput,
    pendingAttachment,
    isOcrRunning,
    isGenerating,
    isLoading,
    showToast,
    warnModelNotLoaded,
    scaleAnim,
    aiChat.handleSubmit,
    aiChat.setInput,
    setUserInput,
    setAutoScrollEnabled,
    scrollChatToEnd,
  ]);

  /**
   * Handle scroll events to determine if auto-scroll should be enabled
   * 
   * Auto-scroll is disabled when user manually scrolls up.
   * Re-enabled when user scrolls near bottom (within 100px).
   * 
   * Optimized with throttling via scrollEventThrottle prop on ScrollView
   */
  const handleScroll = useCallback((event: any) => {
    const currentPosition = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    
    // Update refs for external access
    scrollPositionRef.current = currentPosition;
    contentHeightRef.current = contentHeight;
    
    // Calculate distance from bottom
    const distanceFromBottom = contentHeight - scrollViewHeight - currentPosition;
    
    // Enable auto-scroll if within 100px of bottom
    setAutoScrollEnabled(distanceFromBottom < 100);
  }, []);

  /**
   * Toggle visibility of thought/reasoning block
   * 
   * Used for reasoning models that show their thinking process
   * 
   * @param messageIndex - Index of message in conversation array
   */
  const toggleThought = useCallback((messageIndex: number) => {
    aiChat.setMessages((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, showThought: !msg.showThought } : msg
      )
    );
  }, [aiChat.setMessages]);

  // Handle preset message selection
  const handlePresetMessage = useCallback(async (message: string) => {
    if (message === "Summarize my clipboard") {
      try {
        const clipboardContent = await Clipboard.getString();
        if (clipboardContent.trim()) {
          setUserInput(`Please summarize the following content:\n\n${clipboardContent}`);
        } else {
          showToast("Clipboard is empty");
        }
      } catch (error) {
        console.error("Error reading clipboard:", error);
        showToast("Failed to read clipboard");
      }
    } else {
      setUserInput(message);
    }
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [setUserInput, scrollViewRef, showToast]);

  // Copy message to clipboard
  const handleCopyMessage = useCallback((content: string) => {
    Clipboard.setString(content);
    showToast("Message copied to clipboard");
  }, [showToast]);

  const [speakingVisibleIndex, setSpeakingVisibleIndex] = useState<number | null>(null);

  useEffect(() => {
    setSpeechStatusListener((status) => {
      if (!status.speaking) {
        setSpeakingVisibleIndex(null);
      }
    });
    return () => {
      setSpeechStatusListener(null);
      void stopSpeaking();
    };
  }, []);

  /** Play / stop OS TTS for an assistant bubble (S29). */
  const handleSpeakMessage = useCallback(
    async (content: string, visibleIndex: number) => {
      if (speakingVisibleIndex === visibleIndex) {
        await stopSpeaking();
        setSpeakingVisibleIndex(null);
        return;
      }
      const result = await speakText(content);
      if (!result.ok) {
        if (result.reason === 'unavailable') {
          showToast(
            'Speech not linked. Rebuild the app (e.g. npm run android) and try again.',
          );
        } else if (result.reason === 'empty') {
          showToast('Nothing to speak in this reply.');
        } else {
          showToast('Could not speak this reply.');
        }
        setSpeakingVisibleIndex(null);
        return;
      }
      setSpeakingVisibleIndex(visibleIndex);
    },
    [speakingVisibleIndex, showToast],
  );

  /**
   * Opens the floating model / persona selector
   */
  const openModelSelector = useCallback(async () => {
    setIsModelSelectorVisible(true);
    setIsModelSelectorChromeOpen(true);
    try {
      const personas = await getPersonas();
      setAvailablePersonas(personas);
    } catch (error) {
      console.error("Error loading personas:", error);
    }
  }, []);

  // Refresh accel status for the selected row when the quick panel is open.
  useEffect(() => {
    if (!isModelSelectorVisible || !selectedGGUF) {
      setSelectedAccelLabel(null);
      setSelectedAccelDetail(null);
      return;
    }
    let cancelled = false;
    const modelLoaded = Boolean(context) || llamaProvider.isReady();
    (async () => {
      try {
        const snap = await getAccelerationStatusSnapshot(modelLoaded);
        if (cancelled) return;
        const display = formatAccelLogDisplay(snap);
        if (display.shortLabel === "none") {
          setSelectedAccelLabel(null);
          setSelectedAccelDetail(display.message);
          return;
        }
        setSelectedAccelLabel(display.shortLabel);
        setSelectedAccelDetail(display.message);
      } catch {
        if (!cancelled) {
          setSelectedAccelLabel(null);
          setSelectedAccelDetail(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModelSelectorVisible, selectedGGUF, context, isLoadingModel]);

  const showSelectedAccelInfo = useCallback(() => {
    if (!selectedAccelDetail) return;
    showAlert(
      "Acceleration",
      selectedAccelDetail,
      [{ text: "OK" }],
      { textAlign: "left" },
    );
  }, [selectedAccelDetail]);

  /** Dismiss the attach image popup with animation; optional onComplete runs after close */
  const dismissAttachMenu = useCallback((onComplete?: () => void) => {
    Animated.parallel([
      Animated.timing(attachMenuOpacity, {
        toValue: 0,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(attachMenuScale, {
        toValue: 0.92,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAttachMenuVisible(false);
      setAttachMenuAnchor(null);
      onComplete?.();
    });
  }, [attachMenuOpacity, attachMenuScale]);

  /** Open image library and set pendingAttachment */
  const choosePhoto = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        ...IMAGE_PICKER_OPTIONS,
        selectionLimit: 1,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri ?? asset.fileName;
      if (!uri) return;
      setPendingAttachment({
        uri,
        fileName: asset.fileName,
        type: asset.type || 'image/jpeg',
        kind: 'image',
        width: asset.width,
        height: asset.height,
      });
      void cleanupStaleMediaTemps();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const needsRebuild = /null|not found|undefined/i.test(msg);
      if (__DEV__) console.warn("Image picker error:", err);
      showToast(
        needsRebuild
          ? "Image picker not linked. Rebuild the app (e.g. npm run android) and try again."
          : "Could not open photo library"
      );
    }
  }, [showToast]);

  /** Take photo with camera and set pendingAttachment */
  const takePhoto = useCallback(async () => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera permission",
            message: "This app needs camera access to take a photo for the chat.",
            buttonNeutral: "Ask later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showToast("Camera permission is required to take a photo.");
          return;
        }
      }
      const result = await launchCamera({
        ...IMAGE_PICKER_OPTIONS,
        saveToPhotos: false,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri ?? asset.fileName;
      if (!uri) return;
      setPendingAttachment({
        uri,
        fileName: asset.fileName,
        type: asset.type || 'image/jpeg',
        kind: 'image',
        width: asset.width,
        height: asset.height,
      });
      void cleanupStaleMediaTemps();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const needsRebuild = /null|not found|undefined/i.test(msg);
      if (__DEV__) console.warn("Camera error:", err);
      showToast(
        needsRebuild
          ? "Image picker not linked. Rebuild the app (e.g. npm run android) and try again."
          : "Could not open camera"
      );
    }
  }, [showToast]);

  /** Open document picker for a PDF and set pendingAttachment (S27b). */
  const chooseDocument = useCallback(async () => {
    try {
      if (sendPrepareRef.current || isOcrRunning) {
        return;
      }
      if (!pick || typeof pick !== "function") {
        showToast(
          "Document picker not linked. Rebuild the app (e.g. npm run android) and try again.",
        );
        return;
      }
      const result = await pick({
        type: [documentPickerTypes.pdf, "application/pdf"],
        allowMultiSelection: false,
      });
      const picked = Array.isArray(result) ? result[0] : result;
      if (!picked?.uri || typeof picked.uri !== "string") {
        return;
      }

      const rawName = (picked.name || "document.pdf").trim() || "document.pdf";
      const mime = typeof picked.type === "string" ? picked.type : "";
      if (!isLikelyPdfMeta(rawName, mime)) {
        showToast("Please select a PDF file.");
        return;
      }

      const safeName = sanitizeChatDocumentFileName(rawName);
      let uri = String(picked.uri).trim();
      if (!uri) {
        showToast("Could not access the selected file.");
        return;
      }

      try {
        const copies = await keepLocalCopy({
          files: [{ uri, fileName: safeName }],
          destination: "cachesDirectory",
        });
        const first = Array.isArray(copies) ? copies[0] : copies;
        if (first?.status === "success" && first.localUri) {
          uri = String(first.localUri);
        } else if (first?.status === "error" && __DEV__) {
          console.warn("keepLocalCopy failed", first.copyError);
        }
      } catch (copyErr) {
        // content:// may still work later via normalizeMediaToFile on send
        if (__DEV__) console.warn("keepLocalCopy error:", copyErr);
      }

      setPendingAttachment({
        uri,
        fileName: safeName,
        type: "application/pdf",
        kind: "pdf",
      });
      void cleanupStaleMediaTemps();
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const needsRebuild = /null|not found|undefined/i.test(msg);
      if (__DEV__) console.warn("Document picker error:", err);
      showToast(
        needsRebuild
          ? "Document picker not linked. Rebuild the app (e.g. npm run android) and try again."
          : "Could not open document picker",
      );
    }
  }, [showToast, isOcrRunning]);

  /** Show attach popup above the add button */
  const openAttachMenu = useCallback(() => {
    if (sendPrepareRef.current || isOcrRunning || isGenerating) {
      return;
    }
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setAttachMenuAnchor({ x, y, width, height });
      setAttachMenuVisible(true);
      attachMenuOpacity.setValue(0);
      attachMenuScale.setValue(0.92);
      attachItem0Opacity.setValue(0);
      attachItem0Translate.setValue(6);
      attachItem1Opacity.setValue(0);
      attachItem1Translate.setValue(6);
      attachItem2Opacity.setValue(0);
      attachItem2Translate.setValue(6);
      Animated.parallel([
        Animated.timing(attachMenuOpacity, {
          toValue: 1,
          duration: 80,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.spring(attachMenuScale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 22, overshootClamping: true }),
        Animated.timing(attachItem0Opacity, {
          toValue: 1,
          duration: 100,
          delay: 25,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(attachItem0Translate, {
          toValue: 0,
          duration: 100,
          delay: 25,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(attachItem1Opacity, {
          toValue: 1,
          duration: 100,
          delay: 50,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(attachItem1Translate, {
          toValue: 0,
          duration: 100,
          delay: 50,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(attachItem2Opacity, {
          toValue: 1,
          duration: 100,
          delay: 75,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(attachItem2Translate, {
          toValue: 0,
          duration: 100,
          delay: 75,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    isOcrRunning,
    isGenerating,
    attachMenuOpacity,
    attachMenuScale,
    attachItem0Opacity,
    attachItem0Translate,
    attachItem1Opacity,
    attachItem1Translate,
    attachItem2Opacity,
    attachItem2Translate,
  ]);

  /**
   * Closes the floating model / persona selector
   */
  const closeModelSelector = useCallback(() => {
    if (isLoadingModel) return;
    setIsModelSelectorVisible(false);
    setIsLoadingModel(false);
    setLoadingModelFile(null);
  }, [isLoadingModel]);

  const handleModelSelectorCloseComplete = useCallback(() => {
    setIsModelSelectorChromeOpen(false);
  }, []);

  // Handle model switching — single path through llamaProvider (no legacy+provider double load).
  const handleModelSwitch = useCallback(async (modelFile: string) => {
    if (isGenerating) {
      showAlert(
        "Please wait",
        "Generation is in progress. Please stop generation before switching models.",
        [{ text: 'OK' }]
      );
      return;
    }

    const attemptLoad = async () => {
      setIsLoadingModel(true);
      setLoadingModelFile(modelFile);

      try {
        const modelPath = `${RNFS.DocumentDirectoryPath}/${modelFile}`;
        const success = await llamaProvider.loadModel({ modelPath });
        if (success) {
          lastAutoLoadedRef.current = modelPath;
          setSelectedGGUF(modelFile);
          setContext(llamaProvider.getNativeContext());
          showToast("Model loaded");
          await checkDownloadedModels();
        } else {
          const uf = toUserFacingLoadError(null, llamaProvider.getStatus().error);
          showLoadFailureAlert(uf, {
            modelFileName: modelFile,
            onRetry: () => {
              void attemptLoad();
            },
            onModels: onGoToModelSelection,
          });
        }
      } catch (error) {
        console.error("Error switching model:", error);
        const uf = toUserFacingLoadError(error, llamaProvider.getStatus().error);
        showLoadFailureAlert(uf, {
          modelFileName: modelFile,
          onRetry: () => {
            void attemptLoad();
          },
          onModels: onGoToModelSelection,
        });
      } finally {
        setIsLoadingModel(false);
        setLoadingModelFile(null);
      }
    };

    await attemptLoad();
  }, [isGenerating, setContext, setSelectedGGUF, checkDownloadedModels, showToast, onGoToModelSelection]);


  // Handle Android back button
  useEffect(() => {
    const handleBackPress = () => {
      if (isModelSelectorVisible && !isLoadingModel) {
        closeModelSelector();
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
    return () => subscription.remove();
  }, [isModelSelectorVisible, isLoadingModel, closeModelSelector]);

  // Regenerate assistant message (ChatGPT / Claude / Gemini pattern):
  // keep the prompting user turn + prior context, drop that reply and anything
  // after it, then auto-query the model. Never stage text in the composer.
  const handleRegenerateMessage = useCallback(async (messageIndex: number) => {
    if (!llamaProvider.isReady() || !selectedGGUF) {
      warnModelNotLoaded();
      return;
    }

    if (isGenerating) {
      showToast("Generation is already in progress.");
      return;
    }

    // messageIndex is from conversation.slice(1); absolute index includes system.
    const absoluteIndex = messageIndex + 1;
    if (conversation[absoluteIndex]?.role !== "assistant") {
      showToast("Could not find the reply to regenerate.");
      return;
    }

    await aiChat.regenerate(absoluteIndex);
  }, [
    conversation,
    isGenerating,
    aiChat.regenerate,
    selectedGGUF,
    warnModelNotLoaded,
    showToast,
  ]);

  /** Edit user turn (S26): truncate after it and regenerate. */
  const handleEditUserMessage = useCallback(
    async (messageIndex: number, newContent: string) => {
      if (!llamaProvider.isReady() || !selectedGGUF) {
        warnModelNotLoaded();
        return;
      }

      if (isGenerating) {
        showToast("Generation is already in progress.");
        return;
      }

      const absoluteIndex = messageIndex + 1;
      if (conversation[absoluteIndex]?.role !== "user") {
        showToast("Could not find the message to edit.");
        return;
      }

      await aiChat.editUserAndRegenerate(absoluteIndex, newContent);
    },
    [
      conversation,
      isGenerating,
      aiChat.editUserAndRegenerate,
      selectedGGUF,
      warnModelNotLoaded,
      showToast,
    ],
  );

  const sendButtonDisabled =
    isOcrRunning ||
    (!userInput.trim() && !pendingAttachment);

  // Memoize grouped chat history for performance (respects drawer search)
  const groupedChatHistory = useMemo(() => {
    const visible = filterChatsBySearchQuery(chatHistory, historySearchQuery);
    if (visible.length === 0) return null;
    
    const pinnedChats = visible.filter(chat => chat.pinned);
    const unpinnedChats = visible.filter(chat => !chat.pinned);
    const groupedUnpinned = groupChatsByMonth(unpinnedChats);
    
    const sortedKeys = Array.from(groupedUnpinned.keys()).sort((a, b) => {
      const dateA = unpinnedChats.find(c => formatMonthYear(c.createdAt) === a)?.createdAt || 0;
      const dateB = unpinnedChats.find(c => formatMonthYear(c.createdAt) === b)?.createdAt || 0;
      return dateB - dateA;
    });
    
    return { pinnedChats, unpinnedChats, groupedUnpinned, sortedKeys };
  }, [chatHistory, historySearchQuery]);

  const contextFullness = useMemo(
    () => estimateContextFullness(conversation, contextNCtx),
    [conversation, contextNCtx],
  );

  const showContextBanner = shouldShowContextFullnessBanner({
    isHigh: contextFullness.isHigh,
    dismissed: contextBannerDismissed,
    hasUserMessages: hasStartedChat,
  });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (initialLayoutHeightRef.current === null) initialLayoutHeightRef.current = height;
    currentLayoutHeightRef.current = height;

    // Remember the tallest layout as "keyboard closed". Android often resizes the
    // window *before* keyboardDidShow, so keyboardPadding is still 0 here — if we
    // recomputed greetingTop from the shrunk height we'd get a one-frame jump.
    if (height > (fullLayoutHeightRef.current || 0)) {
      fullLayoutHeightRef.current = height;
    }
    const fullH = fullLayoutHeightRef.current;
    if (fullH > 0 && height < fullH - 8) {
      return;
    }

    const nextTop = computeGreetingTop(fullH, inputOverlayHeight);
    if (Math.abs(nextTop - greetingTopRef.current) > 1) {
      greetingTopRef.current = nextTop;
      setGreetingTop(nextTop);
    }
  }, [inputOverlayHeight]);

  // Recompute midpoint when composer chrome is measured (full-height only).
  useEffect(() => {
    const fullH = fullLayoutHeightRef.current;
    if (fullH <= 0) return;
    const nextTop = computeGreetingTop(fullH, inputOverlayHeight);
    if (Math.abs(nextTop - greetingTopRef.current) > 1) {
      greetingTopRef.current = nextTop;
      setGreetingTop(nextTop);
    }
  }, [inputOverlayHeight]);

  const NO_KEYBOARD_PADDING = 12;
  const MIN_PADDING_RATIO = 0.20; // Raised from 0.10 so we always push at least 20% of keyboard when visible
  // Stable callback: reads layout measurements from refs each call so the value
  // stays current without invalidating its identity (and therefore without
  // re-running the keyboard padding effect every time the window resizes).
  const calculatePaddingMultiplier = useCallback((keyboardH: number) => {
    if (keyboardH <= 0) return NO_KEYBOARD_PADDING;

    const initialH = initialLayoutHeightRef.current;
    const currentH = currentLayoutHeightRef.current;
    const hasLayoutMeasurements = initialH !== null && currentH !== null;
    const heightLoss = hasLayoutMeasurements ? Math.max(0, initialH - currentH) : 0;
    const isKeyboardVisible = keyboardH > 0;

    // Stricter threshold: only treat resize as sufficient when window actually
    // shrank by at least the full keyboard height. Otherwise the input bar may
    // sit behind the keyboard.
    const windowResizeSufficient =
      Platform.OS === "android" && hasLayoutMeasurements && heightLoss >= keyboardH;
    const windowResizeInsufficient =
      Platform.OS === "android" &&
      isKeyboardVisible &&
      (!hasLayoutMeasurements || heightLoss < keyboardH);

    let padding: number;
    if (windowResizeInsufficient) {
      const gap = keyboardH - heightLoss;
      padding = Math.max(gap + 10, keyboardH * 0.25);
    } else if (windowResizeSufficient && hasLayoutMeasurements && heightLoss > 0) {
      // Window resized; use minimal padding but ensure we still cover any gap
      const gap = Math.max(0, keyboardH - heightLoss);
      padding = Math.max(12, gap + 8);
    } else {
      padding = keyboardH * 0.25 + 10;
    }

    padding = Math.max(padding, keyboardH * 0.17);
    padding += 12;

    if (Platform.OS === "android" && (isSamsungDevice || windowResizeInsufficient)) {
      padding -= Math.max(16, keyboardH * 0.05);
    }
    // When keyboard is visible on Android, never use less than MIN_PADDING_RATIO so input stays above keyboard
    const result = Math.max(padding, keyboardH * MIN_PADDING_RATIO);
    return Math.max(result, NO_KEYBOARD_PADDING);
  }, [isSamsungDevice]);

  // Matches the composer's animated paddingBottom so message list clears the
  // lifted input + keyboard instead of scrolling underneath them.
  const composerBottomPadding = useMemo(
    () => calculatePaddingMultiplier(keyboardPadding),
    [calculatePaddingMultiplier, keyboardPadding],
  );
  const scrollBottomPadding = useMemo(() => {
    const keyboardLift = Math.max(0, composerBottomPadding - NO_KEYBOARD_PADDING);
    // `inputOverlayHeight` includes the translucent fade above the bar. Messages
    // should tuck into that fade and only clear the solid composer — otherwise
    // the gap under the last bubble looks oversized.
    const solidClearance = Math.max(
      72,
      inputOverlayHeight - INPUT_FADE_HEIGHT + 4,
    );
    return solidClearance + keyboardLift;
  }, [inputOverlayHeight, composerBottomPadding]);

  // Composer padding: one timing per show/hide (layout prop, JS driver).
  useEffect(() => {
    // Block composer onLayout → setState while padding is in flight (avoids a
    // one-shot greetingTop jump when the keyboard has already reported closed).
    suppressComposerMeasureRef.current = true;
    const settleTimer = setTimeout(() => {
      suppressComposerMeasureRef.current = false;
    }, 320);

    const target = composerBottomPadding;
    const anim = Animated.timing(animatedBottomPadding, {
      toValue: target,
      duration: keyboardPadding > 0 ? 250 : 200,
      easing: EASING.EASE_OUT,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      clearTimeout(settleTimer);
      anim.stop();
    };
  }, [keyboardPadding, composerBottomPadding, animatedBottomPadding]);

  // Keep the latest turn visible above the rising composer when the keyboard opens.
  useEffect(() => {
    if (keyboardPadding <= 0 || !autoScrollEnabled) return;
    scrollChatToEnd(false);
    const t = setTimeout(() => scrollChatToEnd(false), 280);
    return () => clearTimeout(t);
  }, [keyboardPadding, autoScrollEnabled, scrollBottomPadding, scrollChatToEnd]);

  // Hero lift: native translateY only. Midpoint `top` stays frozen at full-window
  // layout so Android's early resize cannot nudge it before this runs.
  useEffect(() => {
    // Aim for the visual midpoint between top pills and the raised composer.
    // ~half the keyboard intrusion, capped so it doesn't tuck under the pills.
    const lift =
      keyboardPadding > 0 ? Math.min(keyboardPadding * 0.42, 200) : 0;

    const anim = Animated.timing(greetingKeyboardShift, {
      toValue: -lift,
      duration: keyboardPadding > 0 ? 250 : 200,
      easing: EASING.EASE_OUT,
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [keyboardPadding, greetingKeyboardShift]);

  // Single source of truth with App: shellBackground is what status/nav bars
  // and SafeArea already use. Paint the chat canvas with that exact hex so
  // history + quick panel stay uniform (no second local frost animation).

  return (
    <View style={{ flex: 1, backgroundColor: shellBackground }}>
      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={handleLayout}>
        {/* Soft fade under top pills — never fully opaque */}
        <View style={styles.topFade} pointerEvents="none">
          <Svg
            width={Dimensions.get("window").width}
            height={TOP_FADE_HEIGHT}
            preserveAspectRatio="none"
          >
            <Defs>
              <SvgLinearGradient id="chatTopFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={shellBackground} stopOpacity="0.75" />
                <Stop offset="0.3" stopColor={shellBackground} stopOpacity="0.45" />
                <Stop offset="0.65" stopColor={shellBackground} stopOpacity="0.25" />
                <Stop offset="1" stopColor={shellBackground} stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={Dimensions.get("window").width}
              height={TOP_FADE_HEIGHT}
              fill="url(#chatTopFade)"
            />
          </Svg>
        </View>

        {/* Top-left pills for slide-out panel and model selector */}
        {/* Keep buttons mounted but behind panel when open */}
        <View style={{ zIndex: 10, pointerEvents: isPanelOpen ? 'none' : 'auto' }}>
          <TouchableOpacity style={styles.topLeftPill} onPress={togglePanel} activeOpacity={0.85}>
            <FrostedGlass style={StyleSheet.absoluteFillObject} />
            <Ionicons name="reorder-two-outline" size={23} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.topLeftPill,
              {
                left: 73,
                maxWidth: screenWidth * 0.45,
                minHeight: 42,
                paddingRight: selectedPersona || contextRingMounted ? 8 : 12,
              },
            ]} 
            onPress={openModelSelector}
            activeOpacity={0.85}
          >
            <FrostedGlass style={StyleSheet.absoluteFillObject} />
            <Ionicons name="cube-outline" size={20} color={theme.colors.text} style={{ marginRight: 6 }} />
            <Text 
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontFamily: 'Poppins',
                flex: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {selectedGGUF ? prettifyModelName(selectedGGUF) : "No model"}
            </Text>
            {selectedPersona && (
              <Animated.View 
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#007AFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 8,
                  opacity: personaIndicatorOpacity,
                }}
                collapsable={false}
              >
                <Ionicons name="person" size={14} color="#FFFFFF" />
              </Animated.View>
            )}
            {contextRingMounted && (
              <Animated.View
                style={{ marginLeft: 8, opacity: contextRingOpacity }}
                pointerEvents={hasStartedChat ? 'auto' : 'none'}
                collapsable={false}
              >
                <TouchableOpacity
                  onPress={(e) => {
                    // Don't open the model sheet when tapping the ring.
                    e?.stopPropagation?.();
                    showAlert(
                      `Context ~${contextFullness.percent}%`,
                      contextFullness.isHigh
                        ? "This chat is using most of the model’s context window. Older turns may be trimmed soon. Start a new chat for a fresh window."
                        : "Estimated share of the model’s context window used by this chat. It isn’t an exact tokenizer count.",
                      contextFullness.isHigh
                        ? [
                            { text: "New chat", onPress: () => handleNewChatPress() },
                            { text: "OK", style: "cancel" },
                          ]
                        : [{ text: "OK" }],
                      { textAlign: "left" },
                    );
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel={`Context about ${contextFullness.percent} percent full`}
                >
                  <ContextFullnessRing
                    ratio={contextFullness.ratio}
                    isHigh={contextFullness.isHigh}
                    percent={contextFullness.percent}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}
          </TouchableOpacity>
          {isTemporaryMode && hasStartedChat && (
            <Text style={{
              position: 'absolute',
              top: 8, // Same top position as button
              left: 73 + screenWidth * 0.4 + 8, // Position right of model selector
              zIndex: 10,
              color: theme.colors.textTertiary,
              fontSize: 18,
              fontFamily: 'Poppins',
              lineHeight: 39, // Match button height (8 padding + 23 icon + 8 padding)
            }}>
              Temporary Mode
            </Text>
          )}
        </View>

        {/* Top-right container for temporary mode/new chat and settings buttons */}
        {/* Keep buttons mounted but behind panel when open */}
        <View style={[styles.topRightButtons, { pointerEvents: isPanelOpen ? 'none' : 'auto' }]}>
          {!hasStartedChat ? (
            // Show temporary mode toggle button before first message is sent
            <TouchableOpacity 
              style={styles.topRightPill}
              onPress={toggleTemporaryMode}
              activeOpacity={0.85}
            >
              {isTemporaryMode ? (
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: theme.colors.primary, borderRadius: 999 },
                  ]}
                />
              ) : (
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
              )}
              <Ionicons 
                name={isTemporaryMode ? "flash" : "flash-outline"} 
                size={23} 
                color={isTemporaryMode ? theme.colors.primaryText : theme.colors.text} 
              />
            </TouchableOpacity>
          ) : (
            // Show new chat button after first message is sent
            <TouchableOpacity 
              style={styles.topRightPill} 
              onPress={() => {
                handleNewChatPress();
              }}
              activeOpacity={0.85}
            >
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <Ionicons name="add-outline" size={23} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.topRightPill} onPress={onOpenSettings} activeOpacity={0.85}>
            <FrostedGlass style={StyleSheet.absoluteFillObject} />
            <Ionicons name="settings-outline" size={23} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <HistoryDrawer
          isPanelOpen={isPanelOpen}
          panelWidth={panelWidth}
          panelAnim={panelAnim}
          backdropOpacity={backdropOpacity}
          panelStyle={styles.slideOutPanel}
          topInset={insets.top}
          bottomInset={insets.bottom}
          chatHistory={chatHistory}
          groupedChatHistory={groupedChatHistory}
          historySearchQuery={historySearchQuery}
          onHistorySearchQueryChange={setHistorySearchQuery}
          isLoadingHistory={isLoadingHistory}
          currentChatId={currentChatId}
          isMultiselectMode={isMultiselectMode}
          selectedChatIds={selectedChatIds}
          multiselectHeaderHeight={multiselectHeaderHeight}
          multiselectHeaderOpacity={multiselectHeaderOpacity}
          onSelectAll={selectAllChats}
          onDeselectAll={deselectAllChats}
          onDeleteSelected={deleteSelectedChats}
          onExitMultiselect={exitMultiselectMode}
          onToggleSelect={toggleChatSelection}
          editingChatId={editingChatId}
          editingTitle={editingTitle}
          onEditingTitleChange={setEditingTitle}
          onRenameSave={handleRenameSave}
          onRenameCancel={() => {
            setEditingChatId(null);
            setEditingTitle('');
          }}
          onClose={togglePanel}
          onChatPress={handleChatSelect}
          onChatLongPress={handleLongPress}
          onNewChat={handleNewChatPress}
          menuVisible={menuVisible}
          menuPosition={menuPosition}
          selectedMenuChatId={selectedChatId}
          menuOpacity={menuOpacity}
          menuScale={menuScale}
          menuItem0Opacity={menuItem0Opacity}
          menuItem0Translate={menuItem0Translate}
          menuItem1Opacity={menuItem1Opacity}
          menuItem1Translate={menuItem1Translate}
          menuItem2Opacity={menuItem2Opacity}
          menuItem2Translate={menuItem2Translate}
          menuItem3Opacity={menuItem3Opacity}
          menuItem3Translate={menuItem3Translate}
          menuItem4Opacity={menuItem4Opacity}
          menuItem4Translate={menuItem4Translate}
          onDismissMenu={dismissMenu}
          onRename={handleRename}
          onPinToggle={handlePinToggle}
          onExportChat={handleExportChat}
          onEnterMultiselect={enterMultiselectMode}
          onDeleteChat={handleDeleteChat}
        />

        {showContextBanner && (
          <ContextFullnessBanner
            percent={contextFullness.percent}
            onDismiss={() => setContextBannerDismissed(true)}
            onNewChat={handleNewChatPress}
          />
        )}

        <MessageList
          conversation={conversation}
          scrollViewRef={scrollViewRef}
          scrollBottomPadding={scrollBottomPadding}
          autoScrollEnabled={autoScrollEnabled}
          isGenerating={isGenerating}
          keyboardPadding={keyboardPadding}
          onScroll={handleScroll}
          onScrollChatToEnd={scrollChatToEnd}
          assistantDisplayMode={assistantDisplayMode}
          tokensPerSecond={tokensPerSecond}
          onToggleThought={toggleThought}
          onCopyMessage={handleCopyMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onSpeakMessage={handleSpeakMessage}
          speakingVisibleIndex={speakingVisibleIndex}
          onEditUserMessage={handleEditUserMessage}
          noMessages={noMessages}
          isTemporaryMode={isTemporaryMode}
          greetingLine={greetingLine}
          greetingTop={greetingTop}
          greetingOpacity={greetingOpacity}
          greetingKeyboardShift={greetingKeyboardShift}
          quickActionsOpacity={quickActionsOpacity}
          tempModeExplanationAnim={tempModeExplanationAnim}
          presetMessagesAnim={presetMessagesAnim}
          presetMessages={PRESET_MESSAGES}
          presetIcons={PRESET_ICONS}
          onPresetMessage={handlePresetMessage}
          showTrimNotice={aiChat.showTrimNotice}
        />


        <ChatComposer
          shellBackground={shellBackground}
          animatedBottomPadding={animatedBottomPadding}
          scaleAnim={scaleAnim}
          inputOverlayHeight={inputOverlayHeight}
          onOverlayLayout={(h) => {
            if (suppressComposerMeasureRef.current || keyboardPadding > 0) return;
            if (h > 0 && Math.abs(h - inputOverlayHeight) > 1) {
              setInputOverlayHeight(h);
            }
          }}
          userInput={userInput}
          onChangeText={setUserInput}
          onInputFocus={() => {
            syncKeyboardState();
            setTimeout(syncKeyboardState, 100);
            setTimeout(syncKeyboardState, 300);
          }}
          pendingAttachment={pendingAttachment}
          isOcrRunning={isOcrRunning}
          onClearAttachment={() => setPendingAttachment(null)}
          isGenerating={isGenerating}
          isLoading={isLoading}
          sendDisabled={sendButtonDisabled}
          onSend={handleSendMessage}
          onStop={aiChat.stop}
          addButtonRef={addButtonRef}
          onOpenAttachMenu={openAttachMenu}
          attachMenuVisible={attachMenuVisible}
          attachMenuAnchor={attachMenuAnchor}
          attachMenuOpacity={attachMenuOpacity}
          attachMenuScale={attachMenuScale}
          attachItem0Opacity={attachItem0Opacity}
          attachItem0Translate={attachItem0Translate}
          attachItem1Opacity={attachItem1Opacity}
          attachItem1Translate={attachItem1Translate}
          attachItem2Opacity={attachItem2Opacity}
          attachItem2Translate={attachItem2Translate}
          onDismissAttachMenu={dismissAttachMenu}
          onTakePhoto={takePhoto}
          onChoosePhoto={choosePhoto}
          onChooseDocument={chooseDocument}
        />


        {/* Floating model & persona selector */}
        <BottomSheet
          visible={isModelSelectorVisible}
          onClose={closeModelSelector}
          onCloseComplete={handleModelSelectorCloseComplete}
          height={0.55}
        >
          <View style={{ flex: 1 }}>
            {/* Tab bar — fixed at top; padding matches sticky footers */}
            <View style={[
              selectorChromeOuter,
              {
                flexDirection: "row",
                marginBottom: SELECTOR_LIST_GAP,
                flexShrink: 0,
              },
            ]}>
              <TouchableOpacity
                onPress={() => setSelectorTab("models")}
                style={[
                  selectorChromeInner,
                  {
                    flex: 1,
                    backgroundColor: selectorTab === "models" ? theme.colors.primary : "transparent",
                  },
                ]}
              >
                <Text style={[
                  selectorChromeLabel,
                  {
                    color: selectorTab === "models" ? theme.colors.primaryText : theme.colors.text,
                  },
                ]}>
                  Models
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSelectorTab("personas")}
                style={[
                  selectorChromeInner,
                  {
                    flex: 1,
                    backgroundColor: selectorTab === "personas" ? theme.colors.primary : "transparent",
                  },
                ]}
              >
                <Text style={[
                  selectorChromeLabel,
                  {
                    color: selectorTab === "personas" ? theme.colors.primaryText : theme.colors.text,
                  },
                ]}>
                  Personas
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 0 }}
            >
              {selectorTab === "models" ? (
                downloadedModels.length === 0 ? (
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 40,
                  }}>
                    <Text style={{
                      fontSize: 16,
                      fontFamily: 'Poppins',
                      color: theme.colors.textSecondary,
                      textAlign: 'center',
                    }}>
                      No models downloaded
                    </Text>
                  </View>
                ) : (
                  downloadedModels.map((model, index) => {
                    const isSelected = selectedGGUF === model;
                    const isCurrentlyLoading = isLoadingModel && loadingModelFile === model;
                    return (
                      <StaggerFadeIn
                        key={`${model}-${index}`}
                        index={index}
                        active={isModelSelectorVisible && selectorTab === "models"}
                        offset={6}
                        staggerMs={16}
                        maxDelay={140}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            if (isSelected) {
                              showSelectedAccelInfo();
                              return;
                            }
                            handleModelSwitch(model);
                          }}
                          disabled={isLoadingModel}
                          style={[
                            styles.modelButton,
                            {
                              marginVertical: 5,
                              borderRadius: 12,
                              backgroundColor: isSelected
                                ? theme.colors.primary
                                : selectorFrost.row,
                              borderColor: isSelected
                                ? theme.colors.primary
                                : selectorFrost.rowBorder,
                              opacity: isLoadingModel && !isSelected && !isCurrentlyLoading ? 0.5 : 1,
                            },
                          ]}
                        >
                          <View style={styles.modelButtonContent}>
                            <Text style={[
                              styles.buttonText,
                              isSelected && styles.selectedButtonText,
                              {
                                flex: 1,
                                minWidth: 0,
                                marginRight: 12,
                                textAlign: 'left',
                              },
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            >
                              {prettifyModelName(model)}
                            </Text>
                            {/* Accel tag (selected only) + checkmark / spinner */}
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                flexShrink: 0,
                              }}
                            >
                              {isSelected &&
                                !isCurrentlyLoading &&
                                selectedAccelLabel != null && (
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontFamily: "Poppins",
                                      fontWeight: "500",
                                      color: theme.colors.primaryText,
                                      opacity: 0.8,
                                      letterSpacing: 0.3,
                                      marginRight: 6,
                                    }}
                                    accessibilityLabel={`Acceleration ${selectedAccelLabel}`}
                                  >
                                    {selectedAccelLabel}
                                  </Text>
                                )}
                              <View
                                style={{
                                  width: 32,
                                  height: 24,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  position: "relative",
                                  flexShrink: 0,
                                }}
                              >
                                {isCurrentlyLoading && (
                                  <View
                                    style={{
                                      position: "absolute",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <ActivityIndicator
                                      size="small"
                                      color={
                                        isSelected
                                          ? theme.colors.primaryText
                                          : theme.colors.text
                                      }
                                    />
                                  </View>
                                )}
                                <AnimatedCheckmark
                                  visible={isSelected && !isCurrentlyLoading}
                                  size={20}
                                  color={theme.colors.primaryText}
                                />
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </StaggerFadeIn>
                    );
                  })
                )
              ) : (
                // Personas tab list only
                availablePersonas.length === 0 ? (
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 40,
                  }}>
                    <Text style={{
                      fontSize: 16,
                      fontFamily: 'Poppins',
                      color: theme.colors.textSecondary,
                      textAlign: 'center',
                      marginBottom: 20,
                    }}>
                      No personas created
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        closeModelSelector();
                        onOpenSettings();
                      }}
                      style={{
                        backgroundColor: theme.colors.primary,
                        paddingVertical: 12,
                        paddingHorizontal: 24,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{
                        fontSize: 16,
                        fontFamily: 'Poppins',
                        color: theme.colors.primaryText,
                        fontWeight: '600',
                      }}>
                        Go to Personas
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  availablePersonas.map((persona, index) => {
                    const isSelected = selectedPersona?.id === persona.id;
                    return (
                      <StaggerFadeIn
                        key={persona.id}
                        index={index}
                        active={isModelSelectorVisible && selectorTab === "personas"}
                        offset={6}
                        staggerMs={16}
                        maxDelay={140}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedPersona(persona);
                            showToast(`Persona "${persona.name}" selected`);
                          }}
                          disabled={isSelected}
                          style={[
                            styles.modelButton,
                            {
                              marginVertical: 5,
                              borderRadius: 12,
                              backgroundColor: isSelected
                                ? theme.colors.primary
                                : selectorFrost.row,
                              borderColor: isSelected
                                ? theme.colors.primary
                                : selectorFrost.rowBorder,
                            },
                          ]}
                        >
                          <View style={styles.modelButtonContent}>
                            <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                              <Text style={[
                                styles.buttonText,
                                isSelected && styles.selectedButtonText,
                                { textAlign: 'left' },
                              ]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                              >
                                {persona.name}
                              </Text>
                              {persona.tagline && (
                                <Text style={{
                                  fontSize: 12,
                                  fontFamily: 'Poppins',
                                  color: isSelected ? theme.colors.primaryText : theme.colors.textSecondary,
                                  marginTop: 4,
                                  textAlign: 'left',
                                }}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                >
                                  {persona.tagline}
                                </Text>
                              )}
                            </View>
                            <View style={{
                              width: 32,
                              height: 24,
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              flexShrink: 0,
                            }}>
                              <AnimatedCheckmark
                                visible={isSelected}
                                size={20}
                                color={theme.colors.primaryText}
                              />
                            </View>
                          </View>
                        </TouchableOpacity>
                      </StaggerFadeIn>
                    );
                  })
                )
              )}
            </ScrollView>

            {/* Sticky footers — same outer/inner padding as Models/Personas bar */}
            {selectorTab === "models" ? (
              <TouchableOpacity
                onPress={() => {
                  closeModelSelector();
                  onGoToModelSelection();
                }}
                disabled={isLoadingModel}
                style={[
                  selectorChromeOuter,
                  {
                    flexShrink: 0,
                    marginTop: SELECTOR_LIST_GAP,
                    opacity: isLoadingModel ? 0.5 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Browse models"
              >
                <View style={[selectorChromeInner, { flexDirection: "row" }]}>
                  <Ionicons
                    name="cube-outline"
                    size={18}
                    color={theme.colors.text}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[selectorChromeLabel, { color: theme.colors.text }]}>
                    Browse models
                  </Text>
                </View>
              </TouchableOpacity>
            ) : selectedPersona ? (
              <TouchableOpacity
                onPress={() => {
                  setSelectedPersona(null);
                  showToast('Persona cleared');
                }}
                style={[
                  selectorChromeOuter,
                  {
                    flexShrink: 0,
                    marginTop: SELECTOR_LIST_GAP,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Clear selected persona"
              >
                <View style={[selectorChromeInner, { flexDirection: "row" }]}>
                  <Ionicons
                    name="person"
                    size={18}
                    color={theme.colors.error}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[selectorChromeLabel, { color: theme.colors.text }]}>
                    Clear persona
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </BottomSheet>

        {/* Toast notification */}
        {toastVisible && (
          <Animated.View
            style={{
              position: "absolute",
              bottom: 100,
              left: "50%",
              marginLeft: -100,
              width: 200,
              backgroundColor: theme.mode === 'dark' ? '#FFFFFF' : '#000000',
              borderRadius: 20,
              paddingVertical: 12,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              opacity: toastOpacity,
            }}
            pointerEvents="none"
          >
            <Text
              style={{
                color: theme.mode === 'dark' ? '#000000' : '#FFFFFF',
                fontSize: 14,
                fontFamily: "Poppins",
                textAlign: "center",
              }}
            >
              {toastMessage}
            </Text>
          </Animated.View>
        )}

      </View>
    </View>
  );
}
