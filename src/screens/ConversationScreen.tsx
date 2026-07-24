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
 * - Memoized components (ThinkingIndicator, ChatHistoryCard)
 * - Optimized animations with native driver
 * - Efficient scroll handling with throttling
 * - Debounced chat history saves
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
  Pressable,
  BackHandler,
  ActivityIndicator,
  LayoutChangeEvent,
  NativeModules,
  Image,
  PermissionsAndroid,
  StyleSheet,
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

/** Returns false if the image picker native module is not linked (e.g. app not rebuilt after install). */
function isImagePickerAvailable(): boolean {
  try {
    const mod = NativeModules.ImagePicker;
    return mod != null && typeof mod.launchImageLibrary === "function";
  } catch {
    return false;
  }
}
import Ionicons from "react-native-vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import Clipboard from "@react-native-clipboard/clipboard";
import RNFS from "react-native-fs";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from "react-native-svg";
import { createStyles, INPUT_FADE_HEIGHT, TOP_FADE_HEIGHT } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { chatHistoryService, ChatConversation } from "../services/chatHistoryService";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { FrostedGlass } from "../components/FrostedGlass";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardPadding } from "../hooks/useKeyboardPadding";
import { Persona, getPersonas } from "../services/personaService";
import { ANIMATION_CONFIG, EASING, ANIMATION_DURATIONS } from "../utils/animationConfig";
import { extractTextFromImage } from "../services/ocrService";
import { IMAGE_PICKER_OPTIONS, cleanupStaleMediaTemps } from "../services/mediaNormalizeService";
import { useAIChat } from "../hooks/useAIChat";
import { llamaProvider } from "../providers/llamaProvider";
import { tokensPerSecondFromMessages } from "../services/performanceTracking";

type MessageAttachment = {
  type: "image";
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
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
 * ThinkingIndicator Component
 * 
 * Displays animated dots to indicate the model is thinking/processing.
 * Uses optimized animations with native driver for smooth 60fps performance.
 * 
 * Performance optimizations:
 * - Native driver for UI thread execution
 * - Staggered animations for visual appeal
 * - Memoized to prevent unnecessary re-renders
 */
const ThinkingIndicator: React.FC<{ theme: any }> = React.memo(({ theme }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /**
     * Animate a single dot with optimized timing
     * Uses centralized animation configuration for consistency
     */
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: ANIMATION_DURATIONS.SLOW,
            easing: EASING.STANDARD,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: ANIMATION_DURATIONS.SLOW,
            easing: EASING.STANDARD,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Staggered animation with optimized delays for visual feedback
    const animations = [
      animateDot(dot1, 0),
      animateDot(dot2, 100),
      animateDot(dot3, 200),
    ];

    animations.forEach(anim => anim.start());

    return () => {
      animations.forEach(anim => anim.stop());
    };
  }, [dot1, dot2, dot3]);

  const dotSize = 8;
  const dotSpacing = 6;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 4,
    }}>
      <Animated.View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: theme.colors.textSecondary,
          marginRight: dotSpacing,
          opacity: dot1.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          transform: [{
            scale: dot1.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.2],
            }),
          }],
        }}
      />
      <Animated.View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: theme.colors.textSecondary,
          marginRight: dotSpacing,
          opacity: dot2.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          transform: [{
            scale: dot2.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.2],
            }),
          }],
        }}
      />
      <Animated.View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: theme.colors.textSecondary,
          opacity: dot3.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          transform: [{
            scale: dot3.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.2],
            }),
          }],
        }}
      />
    </View>
  );
});

ThinkingIndicator.displayName = 'ThinkingIndicator';

/**
 * ChatHistoryCard Component
 * 
 * Displays a single chat history item in the side panel.
 * Supports editing mode for renaming chats.
 * 
 * Performance optimizations:
 * - Memoized to prevent unnecessary re-renders
 * - Efficient selection state checking
 */
interface ChatHistoryCardProps {
  chat: ChatConversation;
  currentChatId: string | null;
  theme: any;
  onPress: () => void;
  onLongPress: (event: any) => void;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (title: string) => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;
  isMultiselectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

const ChatHistoryCard: React.FC<ChatHistoryCardProps> = React.memo(({
  chat,
  currentChatId,
  theme,
  onPress,
  onLongPress,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onRenameSave,
  onRenameCancel,
  isMultiselectMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const isCurrentChat = currentChatId === chat.id;
  
  if (isEditing) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={{
          paddingVertical: 8,
          marginBottom: 4,
        }}
      >
        <TextInput
          value={editingTitle}
          onChangeText={onEditingTitleChange}
          onBlur={onRenameSave}
          onSubmitEditing={onRenameSave}
          style={{
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: "400",
            fontFamily: "Poppins",
          }}
          autoFocus
          selectTextOnFocus
        />
      </Pressable>
    );
  }

  if (isMultiselectMode) {
    return (
      <Pressable
        onPress={onToggleSelect}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginBottom: 4,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 8,
          backgroundColor: isCurrentChat ? (theme.colors.primary + '15') : 'transparent',
        }}
      >
        <View style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
          backgroundColor: isSelected ? theme.colors.primary : 'transparent',
          marginRight: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={theme.colors.primaryText} />
          )}
        </View>
        <Text
          style={{
            color: isCurrentChat ? theme.colors.text : theme.colors.textSecondary,
            fontSize: 18,
            fontWeight: isCurrentChat ? "500" : "400",
            fontFamily: "Poppins",
            flex: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {chat.title}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 4,
        borderRadius: 8,
        backgroundColor: isCurrentChat ? (theme.colors.primary + '15') : 'transparent',
      }}
    >
      <Text
        style={{
          color: isCurrentChat ? theme.colors.text : theme.colors.textSecondary,
          fontSize: 18,
          fontWeight: isCurrentChat ? "500" : "400",
          fontFamily: "Poppins",
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {chat.title}
      </Text>
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memoization - only re-render if relevant props change
  return (
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.currentChatId === nextProps.currentChatId &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.editingTitle === nextProps.editingTitle &&
    prevProps.isMultiselectMode === nextProps.isMultiselectMode &&
    prevProps.isSelected === nextProps.isSelected
  );
});

ChatHistoryCard.displayName = 'ChatHistoryCard';

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

/**
 * AnimatedHistoryItemWrapper Component
 * 
 * Wraps history items with fade-in and slide animations for fluid appearance.
 * Uses staggered delays for a cascading effect when panel opens.
 */
const AnimatedHistoryItemWrapper: React.FC<{
  children: React.ReactNode;
  index: number;
  isVisible: boolean;
}> = React.memo(({ children, index, isVisible }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (isVisible) {
      const delay = Math.min(index * 20, 200); // Staggered delay, max 200ms
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(10);
    }
  }, [isVisible, index, opacity, translateY]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
      }}
    >
      {children}
    </Animated.View>
  );
});

AnimatedHistoryItemWrapper.displayName = 'AnimatedHistoryItemWrapper';

/**
 * Staggered fade-in wrapper for model selector list items (matches history panel feel).
 */
const AnimatedModelItemWrapper: React.FC<{
  children: React.ReactNode;
  index: number;
  isVisible: boolean;
}> = React.memo(({ children, index, isVisible }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (isVisible) {
      const delay = Math.min(index * 20, 200);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(10);
    }
  }, [isVisible, index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});
AnimatedModelItemWrapper.displayName = 'AnimatedModelItemWrapper';

interface Props {
  conversation: Message[];
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>;
  userInput: string;
  setUserInput: (val: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  isGenerating: boolean;
  setIsGenerating: (val: boolean) => void;
  tokensPerSecond: number[];
  setTokensPerSecond: React.Dispatch<React.SetStateAction<number[]>>;
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
  stopGeneration: () => void;
  handleSendMessageCompletion: (
    conversation: Message[],
    userInput: string,
    sendOptions?: { textForPrompt?: string; attachments?: MessageAttachment[] }
  ) => Promise<void>;
  assistantDisplayMode: "bubble" | "direct";
  onOpenSettings: () => void;
  selectedGGUF: string | null;
  setSelectedGGUF: (gguf: string | null) => void;
  downloadedModels: string[];
  loadModel: (path: string, context: any, setContext: (context: any) => void) => Promise<boolean>;
  setContext: (context: any) => void;
  checkDownloadedModels: () => Promise<void>;
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;
  /** Fired when the history drawer opens/closes so the shell can match system bars. */
  onHistoryPanelChange?: (open: boolean) => void;
}

export default function ConversationScreen({
  conversation,
  setConversation,
  userInput,
  setUserInput,
  isLoading,
  setIsLoading,
  isGenerating,
  setIsGenerating,
  tokensPerSecond,
  setTokensPerSecond,
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
  stopGeneration,
  handleSendMessageCompletion,
  assistantDisplayMode,
  onOpenSettings,
  selectedGGUF,
  setSelectedGGUF,
  downloadedModels,
  loadModel,
  setContext,
  checkDownloadedModels,
  selectedPersona,
  setSelectedPersona,
  onHistoryPanelChange,
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const insets = useSafeAreaInsets();
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

  // Attach image popup menu (above add button)
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [attachMenuAnchor, setAttachMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const attachMenuOpacity = useRef(new Animated.Value(0)).current;
  const attachMenuScale = useRef(new Animated.Value(0.9)).current;
  const attachItem0Opacity = useRef(new Animated.Value(0)).current;
  const attachItem0Translate = useRef(new Animated.Value(8)).current;
  const attachItem1Opacity = useRef(new Animated.Value(0)).current;
  const attachItem1Translate = useRef(new Animated.Value(8)).current;
  const addButtonRef = useRef<View>(null);

  // Animation configurations are imported from centralized config
  // This ensures consistency across the application

  // Temporary mode state
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  // Model selector state
  const [isModelSelectorVisible, setIsModelSelectorVisible] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [selectorTab, setSelectorTab] = useState<"models" | "personas">("models");
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);

  const warnModelNotLoaded = useCallback(() => {
    showAlert(
      'No model loaded',
      'Select and load a model before sending messages. Tap the model name at the top of the chat to choose one.',
      [{ text: 'OK' }],
    );
  }, []);

  // New backend: useAIChat + llamaProvider (on-device streaming).
  // We keep the UI state props as-is and sync them to the hook so the rest
  // of this screen can remain largely unchanged.
  const aiChat = useAIChat({
    initialMessages: conversation as any,
    modelName: selectedGGUF || "unknown",
    persona: selectedPersona,
    chatId: currentChatId,
    onChatIdChange: (id) => onChatIdChange(id),
    scrollViewRef,
    // Prefer the native completion path for best parity with the legacy flow
    // (thinking/reasoning params, stopCompletion behavior).
    useNativeCompletion: true,
    onModelNotReady: warnModelNotLoaded,
  });

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
    if (
      (lastAutoLoadedRef.current === modelPath && llamaProvider.isReady()) ||
      (status.state === "ready" && status.modelPath === modelPath)
    ) {
      lastAutoLoadedRef.current = modelPath;
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

  // Sync hook state back into the legacy props so existing UI logic keeps working.
  useEffect(() => {
    setConversation(aiChat.messages as any);
    const fromMessages = tokensPerSecondFromMessages(aiChat.messages as Message[]);
    if (fromMessages.length > 0) {
      setTokensPerSecond(fromMessages);
    }
  }, [aiChat.messages, setConversation, setTokensPerSecond]);

  useEffect(() => {
    if (userInput !== aiChat.input) {
      aiChat.setInput(userInput);
    }
  }, [userInput, aiChat.input, aiChat.setInput]);

  useEffect(() => {
    setIsLoading(aiChat.isLoading);
  }, [aiChat.isLoading, setIsLoading]);

  useEffect(() => {
    setIsGenerating(aiChat.isGenerating);
  }, [aiChat.isGenerating, setIsGenerating]);

  // Pending image attachment (local state only until send)
  type PendingAttachment = {
    uri: string;
    fileName?: string;
    type?: string;
    width?: number;
    height?: number;
  };
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  // Helper function to prettify model name
  const prettifyModelName = (fileName: string): string => {
    let cleaned = fileName.replace(/\.[^.]+$/, "");
    cleaned = cleaned.replace(/-/g, " ");
    return cleaned.trim();
  };


  // Slide-out panel logic - declared early so it can be used in useEffects
  // Panel width is 80% of screen width
  const screenWidth = Dimensions.get('window').width;
  const panelWidth = screenWidth * 0.80;
  const panelAnim = useRef(new Animated.Value(-panelWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Reset multiselect header animation when panel closes
  useEffect(() => {
    if (!isPanelOpen && isMultiselectMode) {
      multiselectHeaderHeight.setValue(0);
      multiselectHeaderOpacity.setValue(0);
    }
  }, [isPanelOpen, isMultiselectMode, multiselectHeaderHeight, multiselectHeaderOpacity]);

  // Always restore system bars if this screen unmounts while the panel was open
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

  // Initialize chat history service
  useEffect(() => {
    chatHistoryService.initialize();
  }, []);

  // Detect current model if context exists but selectedGGUF is null
  // This is a fallback for cases where the app was reloaded or state was lost
  useEffect(() => {
    if (context && !selectedGGUF && downloadedModels.length > 0) {
      // If there's only one model downloaded, assume it's the loaded one
      if (downloadedModels.length === 1) {
        setSelectedGGUF(downloadedModels[0]);
      }
      // Note: If multiple models exist, we can't reliably determine which is loaded
      // The user will need to switch models or reload from model selection screen
    }
  }, [context, selectedGGUF, downloadedModels, setSelectedGGUF]);

  // Reset temporary mode when starting a new chat
  useEffect(() => {
    if (noMessages && !currentChatId) {
      setIsTemporaryMode(false);
      setHasStartedChat(false);
    }
  }, [noMessages, currentChatId]);

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

  // Load chat history when panel opens or when conversation changes (if panel is open)
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
  }, [isPanelOpen, currentChatId]); // Also reload when chatId changes

  // Track when chat has started (first user message sent)
  useEffect(() => {
    const userMessages = conversation.filter(m => m.role === 'user');
    if (userMessages.length > 0 && !hasStartedChat) {
      setHasStartedChat(true);
    }
  }, [conversation, hasStartedChat]);

  // Save conversation when it changes (debounced) - skip if in temporary mode
  useEffect(() => {
    // Only save if there are actual user/assistant messages (excluding system message)
    // Skip saving if in temporary mode
    const userMessages = conversation.filter(m => m.role === 'user' || m.role === 'assistant');
    if (userMessages.length > 0 && !isGenerating && !isTemporaryMode) {
      const saveTimer = setTimeout(async () => {
        try {
          const chatId = await chatHistoryService.saveChat(conversation, currentChatId);
          if (chatId !== currentChatId) {
            onChatIdChange(chatId);
          }
          // Refresh history if panel is open to show the new chat immediately
          if (isPanelOpen) {
            const chats = await chatHistoryService.getAllChats();
            setChatHistory(chats);
          }
        } catch (error) {
          console.error('Error saving chat:', error);
        }
      }, 500); // Reduced debounce to 500ms for faster feedback

      return () => clearTimeout(saveTimer);
    }
    return undefined;
  }, [conversation, currentChatId, isGenerating, onChatIdChange, isPanelOpen, isTemporaryMode]);

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

  /**
   * Toggles the chat history side panel
   * Optimized: Fast animations with immediate state updates for rapid toggling
   * Enhanced with animation cancellation to prevent conflicts
   * 
   * Edge cases handled:
   * - Cancels ongoing animations and sets final value directly
   * - Immediate state updates for instant responsiveness
   * - Ensures panel fully closes by setting value directly if animation interrupted
   */
  const togglePanel = useCallback(() => {
    // Cancel any ongoing animation and ensure correct final position
    if (panelAnimationRef.current) {
      panelAnimationRef.current.stop();
      panelAnimationRef.current = null;
    }

    if (isPanelOpen) {
      // Fade system bars with the close motion (don't wait until slide ends)
      onHistoryPanelChange?.(false);

      // Close panel with fast slide animation
      // Keep panel visible during animation by not updating state yet
      panelAnimationRef.current = Animated.parallel([
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
      
      panelAnimationRef.current.start(({ finished }) => {
        // Update state after animation completes to keep panel visible during slide
        setIsPanelOpen(false);
        // Always ensure panel is fully closed
        panelAnim.setValue(-panelWidth);
        backdropOpacity.setValue(0);
        panelAnimationRef.current = null;
        // Exit multiselect mode when panel closes
        if (isMultiselectMode) {
          exitMultiselectMode();
        }
      });
    } else {
      // Soften system bars as the frosted panel slides in
      onHistoryPanelChange?.(true);
      // Update state immediately for instant responsiveness
      setIsPanelOpen(true);
      
      // Open panel with fast animation
      panelAnimationRef.current = Animated.parallel([
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
      
      panelAnimationRef.current.start(({ finished }) => {
        // Always ensure panel is fully open
        if (finished) {
          panelAnim.setValue(0);
          backdropOpacity.setValue(1);
        }
        panelAnimationRef.current = null;
      });
    }
  }, [isPanelOpen, panelAnim, panelWidth, backdropOpacity, isMultiselectMode, exitMultiselectMode, onHistoryPanelChange]);

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
                onNewChat();
              }
            } catch (error) {
              console.error('Error deleting chat:', error);
              showToast('Failed to delete chat');
            }
          },
        },
      ]
    );
  }, [currentChatId, onNewChat, dismissMenu, showToast]);

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
      [menuItem0Opacity, menuItem1Opacity, menuItem2Opacity, menuItem3Opacity].forEach((v) => v.setValue(0));
      [menuItem0Translate, menuItem1Translate, menuItem2Translate, menuItem3Translate].forEach((v) => v.setValue(6));

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
      ]).start();
    }
  }, [isMultiselectMode, toggleChatSelection, menuOpacity, menuScale, menuItem0Opacity, menuItem0Translate, menuItem1Opacity, menuItem1Translate, menuItem2Opacity, menuItem2Translate, menuItem3Opacity, menuItem3Translate]);

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
      onNewChat();
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
  }, [selectedChatIds, currentChatId, onNewChat, exitMultiselectMode, showToast]);

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
    if (!hasStartedChat && noMessages) {
      setIsTemporaryMode(prev => !prev);
    }
  }, [hasStartedChat, noMessages]);

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
    if (!llamaProvider.isReady() || !selectedGGUF) {
      warnModelNotLoaded();
      return;
    }

    const displayContent = userInput.trim();
    // Validate: need either text or an attachment
    if (!displayContent && !pendingAttachment) {
      return;
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
      if (!llamaProvider.isReady() || !selectedGGUF) {
        warnModelNotLoaded();
        return;
      }

      try {
        let sendOptions: {
          text: string;
          textForPrompt?: string;
          attachments?: MessageAttachment[];
        } = { text: displayContent };

        if (pendingAttachment) {
          setIsOcrRunning(true);
          try {
            const ocrText = await extractTextFromImage(pendingAttachment.uri);
            if (ocrText === "" && __DEV__) {
              console.log("[ConversationScreen] OCR returned no text");
            }
            const textForPrompt =
              "[Attached Image OCR]\n" +
              (ocrText || "(No text detected.)") +
              "\n\n[User]\n" +
              (displayContent || "(No additional text)");
            const attachments: MessageAttachment[] = [
              {
                type: "image",
                uri: pendingAttachment.uri,
                width: pendingAttachment.width,
                height: pendingAttachment.height,
                fileName: pendingAttachment.fileName,
              },
            ];
            sendOptions = { text: displayContent, textForPrompt, attachments };
          } catch (ocrErr) {
            if (__DEV__) console.warn("OCR error:", ocrErr);
            showToast("Could not read text from image. Sending image anyway.");
            sendOptions = {
              text: displayContent,
              textForPrompt:
                "[Attached Image]\n(No text detected.)\n\n[User]\n" +
                (displayContent || "(No additional text)"),
              attachments: [
                {
                  type: "image",
                  uri: pendingAttachment.uri,
                  width: pendingAttachment.width,
                  height: pendingAttachment.height,
                  fileName: pendingAttachment.fileName,
                },
              ],
            };
          } finally {
            setIsOcrRunning(false);
          }
          setPendingAttachment(null);
        }

        // Clear the input bar immediately; pass text explicitly so submit
        // does not depend on async aiChat.setInput (that race was a silent no-op).
        setUserInput("");
        aiChat.setInput("");
        await aiChat.handleSubmit(sendOptions);
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        });
      } catch (error) {
        console.error("Error sending message:", error);
        showToast("Failed to send message. Please try again.");
      }
    });
  }, [
    selectedGGUF,
    userInput,
    pendingAttachment,
    showToast,
    warnModelNotLoaded,
    scaleAnim,
    aiChat.handleSubmit,
    aiChat.setInput,
    setUserInput,
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
    setConversation((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, showThought: !msg.showThought } : msg
      )
    );
  }, []);

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

  /**
   * Opens the model selector bottom sheet
   */
  const openModelSelector = useCallback(async () => {
    setIsModelSelectorVisible(true);
    // Load personas when opening selector
    try {
      const personas = await getPersonas();
      setAvailablePersonas(personas);
    } catch (error) {
      console.error("Error loading personas:", error);
    }
  }, []);

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

  /** Show attach popup above the add button */
  const openAttachMenu = useCallback(() => {
    if (!isImagePickerAvailable()) {
      showToast("Image picker not available. Rebuild the app (e.g. npm run android) and try again.");
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
      ]).start();
    });
  }, [showToast, attachMenuOpacity, attachMenuScale, attachItem0Opacity, attachItem0Translate, attachItem1Opacity, attachItem1Translate]);

  /**
   * Closes the model selector bottom sheet
   */
  const closeModelSelector = useCallback(() => {
    if (isLoadingModel) return; // Don't allow closing while loading
    setIsModelSelectorVisible(false);
    setIsLoadingModel(false);
    setLoadingModelFile(null);
  }, [isLoadingModel]);

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
        showToast("Failed to load the model");
      }
    } catch (error) {
      console.error("Error switching model:", error);
      showToast("Failed to switch model");
    } finally {
      setIsLoadingModel(false);
      setLoadingModelFile(null);
    }
  }, [isGenerating, setContext, setSelectedGGUF, checkDownloadedModels, showToast]);


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

  // Regenerate assistant message
  const handleRegenerateMessage = useCallback(async (messageIndex: number) => {
    if (!llamaProvider.isReady() || !selectedGGUF) {
      warnModelNotLoaded();
      return;
    }

    if (isGenerating) {
      showToast("Generation is already in progress.");
      return;
    }

    // Find the actual index in the full conversation (accounting for system message)
    // messageIndex is from conversation.slice(1), so actualIndex = messageIndex + 1
    const actualIndex = messageIndex + 1;
    
    // Find the user message that precedes this assistant message
    let userMessageIndex = -1;
    let userMessageContent = "";
    
    // Look backwards from the assistant message to find the preceding user message
    for (let i = actualIndex - 1; i >= 0; i--) {
      if (conversation[i].role === "user") {
        userMessageIndex = i;
        userMessageContent = conversation[i].content;
        break;
      }
    }

    if (userMessageIndex === -1) {
      showToast("Could not find the user message to regenerate from.");
      return;
    }

    // Calculate how many assistant messages will be removed (including the one being regenerated)
    // Count assistant messages from actualIndex to the end
    let assistantMessagesToRemove = 0;
    for (let i = actualIndex; i < conversation.length; i++) {
      if (conversation[i].role === "assistant") {
        assistantMessagesToRemove++;
      }
    }

    // Remove the assistant message and all subsequent messages
    const newConversation = conversation.slice(0, actualIndex);
    
    // Update conversation state
    setConversation(newConversation);
    
    // Stop any ongoing generation
    if (isGenerating) {
      aiChat.stop();
    }

    // Regenerate by re-submitting the user message content.
    // Note: This re-adds the user message as the last turn (same visible UX),
    // and then streams a fresh assistant response.
    setConversation(newConversation.slice(0, userMessageIndex));
    setUserInput(userMessageContent);
    aiChat.setInput(userMessageContent);
    await aiChat.handleSubmit();
  }, [
    conversation,
    isGenerating,
    aiChat,
    setConversation,
    setUserInput,
    selectedGGUF,
    warnModelNotLoaded,
    showToast,
  ]);

  const sendButtonDisabled = !userInput.trim() && !pendingAttachment;

  // Memoize grouped chat history for performance
  const groupedChatHistory = useMemo(() => {
    if (chatHistory.length === 0) return null;
    
    const pinnedChats = chatHistory.filter(chat => chat.pinned);
    const unpinnedChats = chatHistory.filter(chat => !chat.pinned);
    const groupedUnpinned = groupChatsByMonth(unpinnedChats);
    
    const sortedKeys = Array.from(groupedUnpinned.keys()).sort((a, b) => {
      const dateA = unpinnedChats.find(c => formatMonthYear(c.createdAt) === a)?.createdAt || 0;
      const dateB = unpinnedChats.find(c => formatMonthYear(c.createdAt) === b)?.createdAt || 0;
      return dateB - dateA;
    });
    
    return { pinnedChats, unpinnedChats, groupedUnpinned, sortedKeys };
  }, [chatHistory]);

  /**
   * Close panel when overlay is pressed
   * Uses same animation config as togglePanel for consistency
   */
  const handleOverlayPress = useCallback(() => {
    if (isPanelOpen) {
      onHistoryPanelChange?.(false);
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        ...ANIMATION_CONFIG.panel,
      }).start(() => setIsPanelOpen(false));
    }
  }, [isPanelOpen, panelAnim, panelWidth, onHistoryPanelChange]);

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

  // Composer padding: one timing per show/hide (layout prop, JS driver).
  useEffect(() => {
    // Block composer onLayout → setState while padding is in flight (avoids a
    // one-shot greetingTop jump when the keyboard has already reported closed).
    suppressComposerMeasureRef.current = true;
    const settleTimer = setTimeout(() => {
      suppressComposerMeasureRef.current = false;
    }, 320);

    const target = calculatePaddingMultiplier(keyboardPadding);
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
  }, [keyboardPadding, animatedBottomPadding, calculatePaddingMultiplier]);

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

  return (
    <View style={{ flex: 1 }}>
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
                <Stop offset="0" stopColor={theme.colors.background} stopOpacity="0.75" />
                <Stop offset="0.3" stopColor={theme.colors.background} stopOpacity="0.45" />
                <Stop offset="0.65" stopColor={theme.colors.background} stopOpacity="0.25" />
                <Stop offset="1" stopColor={theme.colors.background} stopOpacity="0" />
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
            style={[styles.topLeftPill, { left: 73, maxWidth: screenWidth * 0.4, minHeight: 42, paddingRight: selectedPersona ? 8 : 12 }]} 
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
              <FrostedGlass style={StyleSheet.absoluteFillObject} inverted={isTemporaryMode} />
              <Ionicons 
                name={isTemporaryMode ? "flash" : "flash-outline"} 
                size={23} 
                color={isTemporaryMode 
                  ? (theme.mode === 'dark' ? theme.colors.primaryText : theme.colors.primaryText)
                  : (theme.mode === 'dark' ? theme.colors.text : theme.colors.text)
                } 
              />
            </TouchableOpacity>
          ) : (
            // Show new chat button after first message is sent
            <TouchableOpacity 
              style={styles.topRightPill} 
              onPress={() => {
                onNewChat();
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

        {/* Overlay for closing the panel when clicking outside */}
        <Animated.View
          pointerEvents={isPanelOpen ? "auto" : "none"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: panelAnim.interpolate({
              inputRange: [-panelWidth, 0],
              outputRange: [theme.colors.transparent, theme.colors.overlay],
            }),
            zIndex: 10,
            opacity: panelAnim.interpolate({
              inputRange: [-panelWidth, 0],
              outputRange: [0, 1],
            }),
          }}
        >
          <TouchableWithoutFeedback onPress={handleOverlayPress}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
        </Animated.View>

        {/* Long press menu — absolute overlay, not RN Modal */}
        {menuVisible && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10000,
              elevation: 10000,
            }}
            pointerEvents="box-none"
          >
            <TouchableWithoutFeedback onPress={dismissMenu}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  opacity: menuOpacity,
                }}
              />
            </TouchableWithoutFeedback>
            {menuPosition && selectedChatId && (() => {
              const chat = chatHistory.find(c => c.id === selectedChatId);
              const isPinned = chat?.pinned || false;
              const menuBlockStyle = {
                backgroundColor: 'transparent' as const,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden' as const,
              };
              return (
                <Animated.View
                  style={{
                    position: 'absolute',
                    left: Math.max(16, Math.min(menuPosition.x - 80, screenWidth - 200)),
                    top: menuPosition.y < Dimensions.get('window').height * 0.3
                      ? Math.min(menuPosition.y + 10, Dimensions.get('window').height - 220)
                      : Math.max(50, menuPosition.y - 220),
                    minWidth: 140,
                    opacity: menuOpacity,
                    transform: [{ scale: menuScale }],
                  }}
                  onStartShouldSetResponder={() => true}
                >
                  <Animated.View style={{ opacity: menuItem0Opacity, transform: [{ translateY: menuItem0Translate }], marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={() => selectedChatId && handleRename(selectedChatId)}
                      style={menuBlockStyle}
                      activeOpacity={0.85}
                    >
                      <FrostedGlass style={StyleSheet.absoluteFillObject} />
                      <Ionicons name="pencil-outline" size={18} color={theme.colors.text} />
                      <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>Rename</Text>
                    </TouchableOpacity>
                  </Animated.View>
                  <Animated.View style={{ opacity: menuItem1Opacity, transform: [{ translateY: menuItem1Translate }], marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={() => selectedChatId && handlePinToggle(selectedChatId)}
                      style={menuBlockStyle}
                      activeOpacity={0.85}
                    >
                      <FrostedGlass style={StyleSheet.absoluteFillObject} />
                      <Ionicons name={isPinned ? "bookmark" : "bookmark-outline"} size={18} color={theme.colors.text} />
                      <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>{isPinned ? 'Unpin' : 'Pin'}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                  <Animated.View style={{ opacity: menuItem2Opacity, transform: [{ translateY: menuItem2Translate }], marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={() => selectedChatId && enterMultiselectMode(selectedChatId)}
                      style={menuBlockStyle}
                      activeOpacity={0.85}
                    >
                      <FrostedGlass style={StyleSheet.absoluteFillObject} />
                      <Ionicons name="checkbox-outline" size={18} color={theme.colors.text} />
                      <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>Select Multiple</Text>
                    </TouchableOpacity>
                  </Animated.View>
                  <Animated.View style={{ opacity: menuItem3Opacity, transform: [{ translateY: menuItem3Translate }] }}>
                    <TouchableOpacity
                      onPress={() => selectedChatId && handleDeleteChat(selectedChatId)}
                      style={menuBlockStyle}
                      activeOpacity={0.85}
                    >
                      <FrostedGlass style={StyleSheet.absoluteFillObject} />
                      <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      <Text style={{ color: theme.colors.error, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>Delete</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>
              );
            })()}
          </View>
        )}

        {/* Attach image popup (above add button) — absolute overlay, not RN Modal */}
        {attachMenuVisible && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10000,
              elevation: 10000,
            }}
            pointerEvents="box-none"
          >
            <TouchableWithoutFeedback onPress={() => dismissAttachMenu()}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  opacity: attachMenuOpacity,
                }}
              />
            </TouchableWithoutFeedback>
            {attachMenuAnchor && (
              <Animated.View
                style={{
                  position: 'absolute',
                  left: Math.max(
                    16,
                    Math.min(
                      attachMenuAnchor.x + attachMenuAnchor.width / 2 - 90,
                      screenWidth - 196,
                    ),
                  ),
                  top: Math.max(8, attachMenuAnchor.y - 116),
                  minWidth: 180,
                  opacity: attachMenuOpacity,
                  transform: [{ scale: attachMenuScale }],
                }}
                onStartShouldSetResponder={() => true}
              >
                <Animated.View
                  style={{
                    opacity: attachItem0Opacity,
                    transform: [{ translateY: attachItem0Translate }],
                    marginBottom: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => dismissAttachMenu(takePhoto)}
                    style={{
                      backgroundColor: 'transparent',
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      overflow: 'hidden',
                    }}
                    activeOpacity={0.85}
                  >
                    <FrostedGlass style={StyleSheet.absoluteFillObject} />
                    <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                    <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>
                      Take photo (OCR)
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View
                  style={{
                    opacity: attachItem1Opacity,
                    transform: [{ translateY: attachItem1Translate }],
                  }}
                >
                  <TouchableOpacity
                    onPress={() => dismissAttachMenu(choosePhoto)}
                    style={{
                      backgroundColor: 'transparent',
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      overflow: 'hidden',
                    }}
                    activeOpacity={0.85}
                  >
                    <FrostedGlass style={StyleSheet.absoluteFillObject} />
                    <Ionicons name="image-outline" size={18} color={theme.colors.text} />
                    <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>
                      Gallery (OCR text)
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>
            )}
          </View>
        )}

        {/* Backdrop overlay */}
        {isPanelOpen && (
          <TouchableWithoutFeedback onPress={togglePanel}>
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                opacity: backdropOpacity,
                zIndex: 15,
              }}
            />
          </TouchableWithoutFeedback>
        )}

        {/* Slide-out panel from the left — frosted glass, matches chat chrome */}
        <Animated.View
          style={[
            styles.slideOutPanel,
            {
              transform: [{ translateX: panelAnim }],
              zIndex: 20,
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: panelWidth,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 20,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 20,
              overflow: 'hidden',
            },
          ]}
          pointerEvents={isPanelOpen ? 'auto' : 'none'}
        >
          <FrostedGlass
            variant="panel"
            style={StyleSheet.absoluteFillObject}
          />
          {/* Multiselect header: height and opacity split so native driver only sees opacity (height is not supported by native driver) */}
          <Animated.View
            style={{
              overflow: 'hidden',
              height: multiselectHeaderHeight.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 60],
              }),
            }}
          >
            <Animated.View style={{ opacity: multiselectHeaderOpacity }}>
            {isMultiselectMode && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                backgroundColor: 'transparent',
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{
                  color: theme.colors.text,
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: 'Poppins',
                  marginRight: 16,
                }}>
                  {selectedChatIds.size} selected
                </Text>
                <TouchableOpacity
                  onPress={selectedChatIds.size === chatHistory.length ? deselectAllChats : selectAllChats}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons 
                    name={selectedChatIds.size === chatHistory.length ? "square-outline" : "checkbox"} 
                    size={20} 
                    color={theme.colors.text} 
                  />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {selectedChatIds.size > 0 && (
                  <TouchableOpacity
                    onPress={deleteSelectedChats}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.error,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash" size={20} color={theme.colors.primaryText} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={exitMultiselectMode}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            )}
            </Animated.View>
          </Animated.View>

          {/* Chat history list - removeClippedSubviews=false to avoid Fabric "Unable to find viewState for tag" when selection state updates */}
          <ScrollView
            style={{ flex: 1, marginTop: isMultiselectMode ? 0 : 24, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 100 }}
            removeClippedSubviews={false}
          >
            {isLoadingHistory ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 18, fontFamily: "Poppins" }}>Loading...</Text>
              </View>
            ) : chatHistory.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 18, fontFamily: "Poppins" }}>No chats yet</Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: 14, marginTop: 8, fontFamily: "Poppins" }}>
                  Start a conversation to see it here
                </Text>
              </View>
            ) : groupedChatHistory ? (
              <>
                {/* Pinned Section */}
                {groupedChatHistory.pinnedChats.length > 0 && (
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '600',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      Pinned
                    </Text>
                    {groupedChatHistory.pinnedChats.map((chat, index) => (
                      <AnimatedHistoryItemWrapper
                        key={chat.id}
                        index={index}
                        isVisible={isPanelOpen && !isLoadingHistory}
                      >
                        <ChatHistoryCard
                          chat={chat}
                          currentChatId={currentChatId}
                          theme={theme}
                          onPress={() => isMultiselectMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}
                          onLongPress={(e) => handleLongPress(chat, e)}
                          isEditing={editingChatId === chat.id}
                          editingTitle={editingTitle}
                          onEditingTitleChange={setEditingTitle}
                          onRenameSave={handleRenameSave}
                          onRenameCancel={() => {
                            setEditingChatId(null);
                            setEditingTitle('');
                          }}
                          isMultiselectMode={isMultiselectMode}
                          isSelected={selectedChatIds.has(chat.id)}
                          onToggleSelect={() => toggleChatSelection(chat.id)}
                        />
                      </AnimatedHistoryItemWrapper>
                    ))}
                  </View>
                )}

                {/* Month/Year Grouped Sections */}
                {groupedChatHistory.sortedKeys.map((monthYear) => (
                  <View key={monthYear} style={{ marginBottom: 24 }}>
                    <Text style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: 'bold',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {monthYear}
                    </Text>
                    {groupedChatHistory.groupedUnpinned.get(monthYear)!.map((chat, chatIndex) => {
                      // Calculate global index for staggered animation
                      const globalIndex = groupedChatHistory.pinnedChats.length + 
                        groupedChatHistory.sortedKeys.slice(0, groupedChatHistory.sortedKeys.indexOf(monthYear))
                          .reduce((sum, key) => sum + (groupedChatHistory.groupedUnpinned.get(key)?.length || 0), 0) + 
                        chatIndex;
                      return (
                        <AnimatedHistoryItemWrapper
                          key={chat.id}
                          index={globalIndex}
                          isVisible={isPanelOpen && !isLoadingHistory}
                        >
                          <ChatHistoryCard
                            chat={chat}
                            currentChatId={currentChatId}
                            theme={theme}
                            onPress={() => isMultiselectMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}
                            onLongPress={(e) => handleLongPress(chat, e)}
                            isEditing={editingChatId === chat.id}
                            editingTitle={editingTitle}
                            onEditingTitleChange={setEditingTitle}
                            onRenameSave={handleRenameSave}
                            onRenameCancel={() => {
                              setEditingChatId(null);
                              setEditingTitle('');
                            }}
                            isMultiselectMode={isMultiselectMode}
                            isSelected={selectedChatIds.has(chat.id)}
                            onToggleSelect={() => toggleChatSelection(chat.id)}
                          />
                        </AnimatedHistoryItemWrapper>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>

          {/* New Chat — sits on the panel frost (no separate frosted footer) */}
          <View style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(16, insets.bottom + 8),
            backgroundColor: 'transparent',
          }}>
            <TouchableOpacity
              onPress={() => {
                onNewChat();
                togglePanel();
              }}
              style={{
                backgroundColor: theme.colors.primary,
                paddingVertical: 16,
                paddingHorizontal: 20,
                borderRadius: 30,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
              }}
            >
              <Ionicons name="add" size={22} color={theme.colors.primaryText} />
              <Text
                style={{
                  color: theme.colors.primaryText,
                  fontSize: 18,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                  marginLeft: 8,
                }}
              >
                New Chat
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Chat area container */}
        <View style={{ flex: 1, position: "relative" }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "flex-end",
              paddingHorizontal: Math.max(16, Dimensions.get("window").width * 0.04),
              paddingTop: 60,
              // Room for the floating fade + input so the last messages clear the bar
              paddingBottom: inputOverlayHeight,
            }}
            ref={scrollViewRef}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {conversation.slice(1).map((msg, index) => {
              const isAssistantDirect =
                msg.role === "assistant" && assistantDisplayMode === "direct";
              let containerStyle = [];
              if (msg.role === "user") {
                containerStyle.push(styles.messageBubble, styles.userBubble);
              } else if (msg.role === "assistant" && !isAssistantDirect) {
                containerStyle.push(styles.messageBubble, styles.llamaBubble);
              } else if (isAssistantDirect) {
                // Add width constraints for direct mode to prevent overflow
                containerStyle.push(styles.messageDirect);
              }
              // Only render the bubble shell when there is something to show
              // inside it (attachments, content, or a loading indicator).
              // The thinking toggle lives outside the bubble so it never
              // causes the bubble to render as a lone dark pill.
              const hasBubbleContent =
                (msg.role === "user" && msg.attachments && msg.attachments.length > 0) ||
                (msg.content && msg.content.trim().length > 0) ||
                (msg.role === "assistant" &&
                  (!msg.content || msg.content.trim().length === 0) &&
                  isGenerating &&
                  index === conversation.slice(1).length - 1) ||
                (msg.role === "assistant" &&
                  !!msg.thought &&
                  (!msg.content || msg.content.trim().length === 0) &&
                  !isGenerating);

              return (
                <View key={index} style={styles.messageWrapper}>
                  {hasBubbleContent && (
                  <View style={[containerStyle, isAssistantDirect ? { maxWidth: "100%" } : {}]}>
                    {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8, gap: 6 }}>
                        {msg.attachments.map((att, i) =>
                          att.type === "image" ? (
                            <Image
                              key={i}
                              source={{ uri: att.uri }}
                              style={{ width: 64, height: 64, borderRadius: 8 }}
                              resizeMode="cover"
                            />
                          ) : null
                        )}
                      </View>
                    )}
                    {msg.role === "assistant" && (!msg.content || msg.content.trim().length === 0) && isGenerating && index === conversation.slice(1).length - 1 ? (
                      <ThinkingIndicator theme={theme} />
                    ) : msg.role === "assistant" && (!msg.content || msg.content.trim().length === 0) && msg.thought ? (
                      <Text style={{ 
                        fontSize: 14, 
                        fontFamily: "Poppins",
                        color: theme.colors.textTertiary,
                        fontStyle: "italic",
                      }}>
                        Reasoning complete — expand Thinking below for details, or regenerate for a shorter answer.
                      </Text>
                    ) : msg.content ? (
                      <View style={{ 
                        flexShrink: 1, 
                        width: "100%", 
                        maxWidth: "100%",
                        // overflow:hidden removed — causes height collapse on
                        // Android when Markdown renders long content inside a
                        // constrained flex container.
                      }}>
                        <Markdown
                          style={{ 
                            body: { 
                              fontSize: 16, 
                              fontFamily: "Poppins",
                              color: msg.role === "user" ? theme.colors.primaryText : theme.colors.text,
                              lineHeight: 24,
                              margin: 0,
                              padding: 0,
                            },
                            paragraph: {
                              marginTop: 0,
                              marginBottom: 0,
                              padding: 0,
                            },
                            text: {
                              lineHeight: 24,
                              margin: 0,
                              padding: 0,
                            },
                            code_inline: {
                              margin: 0,
                              padding: 0,
                            },
                            code_block: {
                              margin: 0,
                              padding: 0,
                            },
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </View>
                    ) : null}
                  </View>
                  )}
                  {/* Thinking toggle sits OUTSIDE the bubble so it never
                      renders as a lone dark pill when there is no content. */}
                  {msg.thought && msg.role === "assistant" && (
                    <TouchableOpacity
                      onPress={() => toggleThought(index + 1)}
                      style={styles.toggleButton}
                    >
                      <Text style={styles.toggleText}>
                        {msg.showThought ? "▼ Hide Thinking" : "▶ Show Thinking"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {msg.showThought && msg.thought && (
                    <View style={styles.thoughtContainer}>
                      <Text style={styles.thoughtTitle}>Thinking Process:</Text>
                      <Text style={styles.thoughtText}>{msg.thought}</Text>
                    </View>
                  )}
                  {msg.role === "assistant" && msg.content.trim().length > 0 && (
                    <View style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 12,
                      gap: 8,
                    }}>
                      <TouchableOpacity
                        onPress={() => handleCopyMessage(msg.content)}
                        style={{
                          padding: 6,
                          borderRadius: 16,
                          backgroundColor: theme.colors.glass,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons 
                          name="copy-outline" 
                          size={16} 
                          color={theme.colors.text} 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRegenerateMessage(index)}
                        disabled={isGenerating}
                        style={{
                          padding: 6,
                          borderRadius: 16,
                          backgroundColor: theme.colors.glass,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          opacity: isGenerating ? 0.5 : 1,
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons 
                          name="refresh-outline" 
                          size={16} 
                          color={theme.colors.text} 
                        />
                      </TouchableOpacity>
                      {(() => {
                        const assistantTurnIndex =
                          conversation
                            .slice(1, index + 2)
                            .filter((m) => m.role === "assistant").length - 1;
                        const turnTps =
                          typeof msg.tokensPerSecond === "number"
                            ? msg.tokensPerSecond
                            : assistantTurnIndex >= 0
                              ? tokensPerSecond[assistantTurnIndex]
                              : undefined;
                        return typeof turnTps === "number" && turnTps > 0 ? (
                          <Text style={[styles.tokenInfo, { marginTop: 0 }]}>
                            {turnTps} tokens/s
                          </Text>
                        ) : null;
                      })()}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {noMessages && (
            <Animated.View
              style={[
                styles.greetingContainer,
                {
                  top: greetingTop,
                  opacity: greetingOpacity,
                  transform: [{ translateY: greetingKeyboardShift }],
                },
              ]}
              pointerEvents="box-none"
            >
              {isTemporaryMode && (
                <Ionicons
                  name="flash"
                  size={36}
                  color={theme.colors.text}
                  style={{ marginBottom: 12 }}
                />
              )}
              <Text style={styles.greetingText}>
                {isTemporaryMode ? "Temporary Mode" : greetingLine}
              </Text>
              
              {/* Preset message suggestions or temporary mode explanation */}
              {userInput.trim().length === 0 && (
                <View style={{
                  marginTop: 20,
                  alignItems: 'center',
                  width: '100%',
                }}>
                  {isTemporaryMode ? (
                    <Animated.View
                      style={{
                        opacity: tempModeExplanationAnim,
                        transform: [{
                          translateY: tempModeExplanationAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                          }),
                        }],
                        width: '100%',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{
                        color: theme.colors.text,
                        fontSize: 18,
                        fontFamily: 'Poppins',
                        textAlign: 'center',
                        lineHeight: 24,
                        paddingHorizontal: 20,
                      }}>
                        Conversations in temporary mode are not saved. This chat will not appear in history. Photos still run on-device OCR before the model sees them.
                      </Text>
                    </Animated.View>
                  ) : (
                    <Animated.View
                      style={{
                        opacity: presetMessagesAnim,
                        transform: [{
                          translateY: presetMessagesAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                          }),
                        }],
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      {PRESET_MESSAGES.map((preset, index) => (
                        <TouchableOpacity
                          key={index}
                          onPress={() => handlePresetMessage(preset)}
                          style={{
                            backgroundColor: 'transparent',
                            paddingHorizontal: 20,
                            paddingVertical: 12,
                            borderRadius: 30,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            marginBottom: index < PRESET_MESSAGES.length - 1 ? 8 : 0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 200,
                          }}
                        >
                          <Ionicons 
                            name={PRESET_ICONS[preset] as any} 
                            size={20} 
                            color={theme.colors.text} 
                            style={{ marginRight: 8 }}
                          />
                          <Text style={{
                            color: theme.colors.text,
                            fontSize: 16,
                            fontFamily: 'Poppins',
                            textAlign: 'center',
                          }}>
                            {preset}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </Animated.View>
                  )}
                </View>
              )}
            </Animated.View>
          )}
        </View>

        {/* Floating input — soft fade only, never a solid bar */}
        <View
          style={styles.bottomContainer}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (suppressComposerMeasureRef.current || keyboardPadding > 0) return;
            if (h > 0 && Math.abs(h - inputOverlayHeight) > 1) {
              setInputOverlayHeight(h);
            }
          }}
          pointerEvents="box-none"
        >
          <View style={styles.inputFade} pointerEvents="none">
            <Svg
              width={Dimensions.get("window").width}
              height={inputOverlayHeight}
              preserveAspectRatio="none"
            >
              <Defs>
                <SvgLinearGradient id="chatInputFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={theme.colors.background} stopOpacity="0" />
                  <Stop offset="0.35" stopColor={theme.colors.background} stopOpacity="0.35" />
                  <Stop offset="0.7" stopColor={theme.colors.background} stopOpacity="0.6" />
                  <Stop offset="1" stopColor={theme.colors.background} stopOpacity="0.75" />
                </SvgLinearGradient>
              </Defs>
              <Rect
                x="0"
                y="0"
                width={Dimensions.get("window").width}
                height={inputOverlayHeight}
                fill="url(#chatInputFade)"
              />
            </Svg>
          </View>
          <Animated.View
            style={[
              styles.inputBarArea,
              {
                paddingBottom: animatedBottomPadding,
              },
            ]}
            pointerEvents="box-none"
          >
            {pendingAttachment && (
              <View style={styles.attachmentPreviewRow}>
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Image
                  source={{ uri: pendingAttachment.uri }}
                  style={styles.attachmentThumb}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attachmentLabel} numberOfLines={1}>
                    {pendingAttachment.fileName || "Image ready"}
                  </Text>
                  {isOcrRunning && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 }}>
                      <ActivityIndicator size="small" color={theme.colors.text} />
                      <Text style={[styles.attachmentLabel, { fontSize: 12 }]}>Extracting text on-device…</Text>
                    </View>
                  )}
                  {!isOcrRunning && (
                    <Text style={[styles.attachmentLabel, { fontSize: 12, marginTop: 2 }]}>
                      Text will be read with OCR when you send
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.attachmentRemove, { backgroundColor: theme.colors.surface }]}
                  onPress={() => setPendingAttachment(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={isOcrRunning}
                >
                  <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRowWrapper}>
              <View ref={addButtonRef} collapsable={false}>
                <TouchableOpacity
                  style={styles.addButtonOutside}
                  onPress={openAttachMenu}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="add" size={28} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.inputBar, styles.inputBarInRow]}>
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor={theme.colors.textTertiary}
                  value={userInput}
                  onChangeText={setUserInput}
                  multiline
                  onFocus={() => {
                    syncKeyboardState();
                    setTimeout(syncKeyboardState, 100);
                    setTimeout(syncKeyboardState, 300);
                  }}
                />
                {isGenerating ? (
                  <Animated.View style={{ marginLeft: "auto" }}>
                    <TouchableOpacity style={styles.stopButton} onPress={stopGeneration}>
                      <Ionicons name="stop-circle" size={40} color={theme.colors.error} />
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
                  <Animated.View style={{ transform: [{ scale: scaleAnim }], marginLeft: "auto" }}>
                    <TouchableOpacity
                      style={styles.sendIconButton}
                      onPress={handleSendMessage}
                      disabled={sendButtonDisabled || isLoading}
                    >
                      <Ionicons
                        name="arrow-up-circle"
                        size={40}
                        color={sendButtonDisabled ? theme.colors.textTertiary : theme.colors.text}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Model & Persona Selector Bottom Sheet */}
        <BottomSheet
          visible={isModelSelectorVisible}
          onClose={closeModelSelector}
          title={selectorTab === "models" ? "Select Model" : "Select Persona"}
          height={0.65}
          disableDrag={isLoadingModel}
          headerRight={
            selectorTab === "personas" && selectedPersona ? (
              <TouchableOpacity
                onPress={() => {
                  setSelectedPersona(null);
                  showToast('Persona cleared');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{
                  fontSize: 14,
                  fontFamily: 'Poppins',
                  color: theme.colors.textSecondary,
                  fontWeight: '400',
                }}>
                  Clear
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
        >
          {/* Tab Selector */}
          <View style={{
            flexDirection: "row",
            marginBottom: 16,
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 4,
          }}>
            <TouchableOpacity
              onPress={() => setSelectorTab("models")}
              style={{
                flex: 1,
                backgroundColor: selectorTab === "models" ? theme.colors.primary : "transparent",
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
                color: selectorTab === "models" ? theme.colors.primaryText : theme.colors.text,
              }}>
                Models
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectorTab("personas")}
              style={{
                flex: 1,
                backgroundColor: selectorTab === "personas" ? theme.colors.primary : "transparent",
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
                color: selectorTab === "personas" ? theme.colors.primaryText : theme.colors.text,
              }}>
                Personas
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={{ paddingBottom: 32 }}
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
                    marginBottom: 20,
                  }}>
                    No models downloaded
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      closeModelSelector();
                      onBackToModelSelection();
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
                      Go to Model Selection
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                downloadedModels.map((model, index) => {
                  const isSelected = selectedGGUF === model;
                  const isCurrentlyLoading = isLoadingModel && loadingModelFile === model;
                  return (
                    <AnimatedModelItemWrapper
                      key={index}
                      index={index}
                      isVisible={isModelSelectorVisible && selectorTab === "models"}
                    >
                      <TouchableOpacity
                        onPress={() => handleModelSwitch(model)}
                        disabled={isLoadingModel || isSelected}
                        style={[
                          styles.modelButton,
                          isSelected && styles.selectedButton,
                          {
                            marginVertical: 6,
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
                          {/* Fixed-width container for checkmark so name truncates before it */}
                          <View style={{ 
                            width: 32, 
                            height: 24, 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            position: 'relative',
                            flexShrink: 0,
                          }}>
                            {isCurrentlyLoading && (
                              <View style={{
                                position: 'absolute',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <ActivityIndicator 
                                  size="small" 
                                  color={isSelected ? theme.colors.primaryText : theme.colors.text}
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
                      </TouchableOpacity>
                    </AnimatedModelItemWrapper>
                  );
                })
              )
            ) : (
              // Personas tab
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
                    <TouchableOpacity
                      key={persona.id}
                      onPress={() => {
                        setSelectedPersona(persona);
                        showToast(`Persona "${persona.name}" selected`);
                      }}
                      disabled={isSelected}
                      style={[
                        styles.modelButton,
                        isSelected && styles.selectedButton,
                        {
                          marginVertical: 6,
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
                        {/* Fixed-width container for checkmark so name truncates before it */}
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
                  );
                })
              )
            )}
          </ScrollView>
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
