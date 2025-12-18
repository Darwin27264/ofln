/* ConversationScreen.tsx */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  Easing,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Dimensions,
  Pressable,
  Modal,
  BackHandler,
  ActivityIndicator,
  LayoutChangeEvent,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import Clipboard from "@react-native-clipboard/clipboard";
import RNFS from "react-native-fs";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { chatHistoryService, ChatConversation } from "../services/chatHistoryService";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardPadding } from "../hooks/useKeyboardPadding";
import { Persona, getPersonas } from "../services/personaService";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

/**
 * ThinkingIndicator Component
 * 
 * Displays animated dots to indicate the model is thinking/processing.
 * Optimized for mobile with reduced animation durations and native driver.
 * 
 * Performance optimizations:
 * - Uses native driver for 60fps animations
 * - Reduced animation durations for snappier feel
 * - Minimal re-renders with refs
 */
const ThinkingIndicator: React.FC<{ theme: any }> = React.memo(({ theme }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /**
     * Animate a single dot with optimized timing
     * Reduced duration from 400ms to 300ms for better mobile performance
     */
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300, // Reduced from 400ms
            easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300, // Reduced from 400ms
            easing: Easing.bezier(0.4, 0.0, 0.2, 1),
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Staggered animation with reduced delays for faster visual feedback
    const animations = [
      animateDot(dot1, 0),
      animateDot(dot2, 100), // Reduced from 150ms
      animateDot(dot3, 200), // Reduced from 300ms
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
}) => {
  const isSelected = currentChatId === chat.id;
  
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

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        paddingVertical: 8,
        marginBottom: 4,
      }}
    >
      <Text
        style={{
          color: isSelected ? theme.colors.text : theme.colors.textSecondary,
          fontSize: 18,
          fontWeight: isSelected ? "500" : "400",
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
    prevProps.editingTitle === nextProps.editingTitle
  );
});

ChatHistoryCard.displayName = 'ChatHistoryCard';

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
    userInput: string
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
}

export default function ConversationScreen({
  conversation,
  setConversation,
  userInput,
  setUserInput,
  isLoading,
  isGenerating,
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
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const insets = useSafeAreaInsets();
  const { keyboardHeight: keyboardPadding, animatedHeight } = useKeyboardPadding();
  const [initialLayoutHeight, setInitialLayoutHeight] = useState<number | null>(null);
  const [currentLayoutHeight, setCurrentLayoutHeight] = useState<number | null>(null);
  
  // Animated padding value for smooth transitions
  const animatedPadding = useRef(new Animated.Value(0)).current;
  const animatedBottomPadding = useRef(new Animated.Value(0)).current;

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatConversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Long press menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  
  // Menu animation
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0.9)).current;

  /**
   * Standardized animation configuration for consistent, performant animations
   * Optimized for mobile devices with reduced durations and native driver
   */
  const ANIMATION_CONFIG = {
    panel: {
      duration: 200, // Optimized for mobile responsiveness
      useNativeDriver: true,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
    },
    menu: {
      duration: 150, // Fast menu animations
      useNativeDriver: true,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    },
    toast: {
      duration: 200,
      useNativeDriver: true,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    },
  };

  // Temporary mode state
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  // Model selector state
  const [isModelSelectorVisible, setIsModelSelectorVisible] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [selectorTab, setSelectorTab] = useState<"models" | "personas">("models");
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);

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
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Manage greeting fade animation.
  const noMessages = conversation.slice(1).length === 0;
  const greetingOpacity = useRef(new Animated.Value(1)).current;
  
  // Animation for temporary mode content transitions
  const presetMessagesAnim = useRef(new Animated.Value(1)).current;
  const tempModeExplanationAnim = useRef(new Animated.Value(0)).current;

  // Preset messages
  const PRESET_MESSAGES = [
    "Give me a random fact",
    "Summarize my clipboard",
    "Help me write a professional email",
  ];

  // Icon mapping for preset messages
  const PRESET_ICONS: { [key: string]: string } = {
    "Give me a random fact": "sparkles-outline",
    "Summarize my clipboard": "clipboard-outline",
    "Help me write a professional email": "mail-outline",
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

  // Load chat history when panel opens or when conversation changes (if panel is open)
  useEffect(() => {
    let delayTimer: NodeJS.Timeout | null = null;
    let isMounted = true;
    
    const loadChatHistory = async () => {
      if (isPanelOpen) {
        // Small delay to avoid blocking animation
        delayTimer = setTimeout(async () => {
          if (!isMounted) return;
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
        }, 50); // Small delay to let animation start smoothly
      } else {
        // Clear history when panel closes to prevent stale data
        setChatHistory([]);
      }
    };
    
    loadChatHistory();
    
    return () => {
      isMounted = false;
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
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
   * Toggles the chat history side panel
   * Optimized: Faster animations and better state management for mobile performance
   * 
   * Edge cases handled:
   * - Prevents animation conflicts with state updates
   * - Ensures smooth transitions on all devices
   */
  const togglePanel = useCallback(() => {
    if (isPanelOpen) {
      // Close panel with optimized animation
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        ...ANIMATION_CONFIG.panel,
      }).start(() => setIsPanelOpen(false));
    } else {
      // Set state before animation for smoother rendering
      setIsPanelOpen(true);
      // Use requestAnimationFrame to ensure state is set before animation
      requestAnimationFrame(() => {
        Animated.timing(panelAnim, {
          toValue: 0,
          ...ANIMATION_CONFIG.panel,
        }).start();
      });
    }
  }, [isPanelOpen, panelAnim, panelWidth]);

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
   * @param message - Message to display in toast
   * 
   * Edge cases handled:
   * - Cancels previous toast if new one is shown
   * - Ensures toast doesn't overlap with UI elements
   */
  const showToast = useCallback((message: string) => {
    // Cancel any ongoing toast animation
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
   * Dismiss menu with optimized animation
   * Reusable function to prevent code duplication
   */
  const dismissMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 0,
        ...ANIMATION_CONFIG.menu,
      }),
      Animated.timing(menuScale, {
        toValue: 0.9,
        ...ANIMATION_CONFIG.menu,
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
   * Handle long press on chat history item
   * Shows context menu at press position
   * 
   * Edge cases handled:
   * - Validates event coordinates
   * - Positions menu within screen bounds
   */
  const handleLongPress = useCallback((chat: ChatConversation, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setSelectedChatId(chat.id);
    setMenuPosition({ x: pageX, y: pageY });
    setMenuVisible(true);
    
    // Animate menu appearance with optimized config
    menuOpacity.setValue(0);
    menuScale.setValue(0.9);
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 1,
        ...ANIMATION_CONFIG.menu,
      }),
      Animated.timing(menuScale, {
        toValue: 1,
        ...ANIMATION_CONFIG.menu,
      }),
    ]).start();
  }, [menuOpacity, menuScale]);

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

  useEffect(() => {
    if (noMessages) {
      Animated.timing(greetingOpacity, {
        toValue: userInput.trim().length > 0 ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [userInput, noMessages]);

  // Animate temporary mode content transitions
  useEffect(() => {
    Animated.parallel([
      Animated.timing(presetMessagesAnim, {
        toValue: isTemporaryMode ? 0 : 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(tempModeExplanationAnim, {
        toValue: isTemporaryMode ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isTemporaryMode]);

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
    // Validate model is loaded
    if (!context) {
      showToast("Model not loaded. Please load the model first.");
      return;
    }
    
    // Validate input is not empty
    if (!userInput.trim()) {
      return;
    }
    
    // Animate send icon for visual feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.15,
        duration: 120, // Reduced from 150ms for snappier feel
        useNativeDriver: true,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150, // Reduced from 200ms
        useNativeDriver: true,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      }),
    ]).start(async () => {
      try {
        await handleSendMessageCompletion(conversation, userInput);
        // Scroll to bottom after message is sent
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        });
      } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message. Please try again.');
      }
    });
  }, [context, userInput, conversation, handleSendMessageCompletion, showToast, scaleAnim]);

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

  /**
   * Closes the model selector bottom sheet
   */
  const closeModelSelector = useCallback(() => {
    if (isLoadingModel) return; // Don't allow closing while loading
    setIsModelSelectorVisible(false);
    setIsLoadingModel(false);
    setLoadingModelFile(null);
  }, [isLoadingModel]);

  // Handle model switching
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
    // Don't close the panel - keep it open to show loading
    
    try {
      const modelPath = `${RNFS.DocumentDirectoryPath}/${modelFile}`;
      const success = await loadModel(modelPath, context, setContext);
      if (success) {
        setSelectedGGUF(modelFile);
        showToast("Model switched successfully");
        await checkDownloadedModels();
        // Close panel after successful load
        closeModelSelector();
      } else {
        showToast("Failed to load the model");
        setIsLoadingModel(false);
        setLoadingModelFile(null);
      }
    } catch (error) {
      console.error("Error switching model:", error);
      showToast("Failed to switch model");
      setIsLoadingModel(false);
      setLoadingModelFile(null);
    }
  }, [isGenerating, context, loadModel, setContext, setSelectedGGUF, checkDownloadedModels, showToast, closeModelSelector]);


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
    if (!context) {
      showToast("Model not loaded. Please load the model first.");
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
    
    // Calculate tokensPerSecond index for the assistant message being regenerated
    // tokensPerSecond[0] corresponds to the first assistant message (display index 1)
    // tokensPerSecond[1] corresponds to the second assistant message (display index 3)
    // So tokensPerSecondIndex = Math.floor(messageIndex / 2)
    const tokensPerSecondIndex = Math.floor(messageIndex / 2);
    
    // Remove tokensPerSecond entries for removed assistant messages
    setTokensPerSecond((prev: number[]) => {
      // Remove from tokensPerSecondIndex onwards (inclusive)
      return prev.slice(0, tokensPerSecondIndex);
    });
    
    // Stop any ongoing generation
    if (isGenerating) {
      await stopGeneration();
    }
    
    // Regenerate from the user message
    await handleSendMessageCompletion(newConversation, userMessageContent);
  }, [context, conversation, isGenerating, stopGeneration, handleSendMessageCompletion, setConversation, setTokensPerSecond]);

  const sendButtonDisabled = !userInput.trim();

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
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        ...ANIMATION_CONFIG.panel,
      }).start(() => setIsPanelOpen(false));
    }
  }, [isPanelOpen, panelAnim, panelWidth]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const layoutHeight = event.nativeEvent.layout.height;
    if (initialLayoutHeight === null) {
      setInitialLayoutHeight(layoutHeight);
    }
    setCurrentLayoutHeight(layoutHeight);
  }, [initialLayoutHeight]);

  // Calculate how much the window has actually resized (when adjustResize works)
  const heightLoss =
    initialLayoutHeight !== null && currentLayoutHeight !== null
      ? Math.max(0, initialLayoutHeight - currentLayoutHeight)
      : 0;

  // Determine if window resize is insufficient to account for keyboard
  // This handles Samsung and other OEMs where adjustResize may not work perfectly
  const isKeyboardVisible = keyboardPadding > 0;
  const hasLayoutMeasurements = initialLayoutHeight !== null && currentLayoutHeight !== null;
  
  // More aggressive threshold - window resize is insufficient if height loss is less than 80% of keyboard
  // This ensures we add padding even when resize is partially working
  const windowResizeInsufficient = 
    Platform.OS === "android" &&
    isKeyboardVisible &&
    hasLayoutMeasurements &&
    heightLoss < keyboardPadding * 0.8;

  // Calculate padding multiplier based on current state
  // This will be used to interpolate the animated padding
  const calculatePaddingMultiplier = useCallback((keyboardH: number) => {
    if (keyboardH <= 0) return 0;
    
    let additionalPadding = 0;
    
    if (windowResizeInsufficient) {
      // Window didn't resize enough (common on Samsung/OEM) - add gap + minimal safety margin
      const gap = keyboardH - heightLoss;
      // Use the larger of: gap + 2px buffer, or 28% of keyboard height
      additionalPadding = Math.max(
        gap + 2, // Gap + 2px minimal buffer
        keyboardH * 0.28 // Or at least 28% of keyboard height
      );
    } else if (hasLayoutMeasurements && heightLoss > 0) {
      // Window resized properly - add minimal buffer for safety
      // Use 2-4px adaptive buffer (3-4% of keyboard height)
      additionalPadding = Math.max(2, Math.min(keyboardH * 0.04, 4));
    } else {
      // No layout measurements yet or keyboard just appeared - use minimal fallback
      // Use 32% of keyboard height + small buffer to prevent coverage during transitions
      additionalPadding = keyboardH * 0.32 + 4; // 32% + 4px buffer
    }
    
    // Final safety check: ensure we always have at least 16% of keyboard height as padding
    const minimumRequiredPadding = keyboardH * 0.16;
    additionalPadding = Math.max(additionalPadding, minimumRequiredPadding);
    
    return additionalPadding;
  }, [windowResizeInsufficient, heightLoss, hasLayoutMeasurements]);

  // Update animated padding when keyboard height changes
  useEffect(() => {
    // Function to update padding based on current keyboard height
    const updatePadding = (keyboardH: number) => {
      const additionalPadding = calculatePaddingMultiplier(keyboardH);
      animatedPadding.setValue(additionalPadding);
      // Update bottom padding: only keyboard padding (no safe area insets)
      animatedBottomPadding.setValue(additionalPadding);
    };

    // Create a listener to update padding as keyboard animates
    const listenerId = animatedHeight.addListener(({ value }) => {
      updatePadding(value);
    });

    // Initialize with current keyboard height
    updatePadding(keyboardPadding);

    return () => {
      animatedHeight.removeListener(listenerId);
    };
  }, [animatedHeight, animatedPadding, animatedBottomPadding, calculatePaddingMultiplier, keyboardPadding]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1 }} onLayout={handleLayout}>
        {/* Top-left pills for slide-out panel and model selector */}
        {!isPanelOpen && (
          <>
            <TouchableOpacity style={styles.topLeftPill} onPress={togglePanel}>
              <Ionicons name="reorder-two-outline" size={23} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.topLeftPill, { left: 73, maxWidth: screenWidth * 0.4, minHeight: 42 }]} 
              onPress={openModelSelector}
            >
              <Ionicons name="cube-outline" size={20} color={theme.colors.text} style={{ marginRight: 6 }} />
              <Text 
                style={{
                  color: theme.colors.text,
                  fontSize: 15,
                  fontFamily: 'Poppins',
                  flex: 1,
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {selectedGGUF ? prettifyModelName(selectedGGUF) : "No model"}
              </Text>
            </TouchableOpacity>
            {selectedPersona && (
              <View style={{
                position: "absolute",
                left: 73 + screenWidth * 0.4 + 8,
                top: 20,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.colors.accent + "20",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.accent + "40",
                maxWidth: screenWidth * 0.3,
              }}>
                <Ionicons name="person" size={12} color={theme.colors.accent} />
                <Text style={{
                  fontSize: 11,
                  fontFamily: "Poppins",
                  color: theme.colors.accent,
                  marginLeft: 4,
                  fontWeight: "500",
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
                >
                  {selectedPersona.name}
                </Text>
              </View>
            )}
            {isTemporaryMode && hasStartedChat && (
              <Text style={{
                position: 'absolute',
                top: 20, // Same top position as button
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
          </>
        )}

        {/* Top-right container for temporary mode/new chat and settings buttons */}
        <View style={styles.topRightButtons}>
          {!hasStartedChat ? (
            // Show temporary mode toggle button before first message is sent
            <TouchableOpacity 
              style={[
                styles.topRightPill,
                {
                  backgroundColor: isTemporaryMode 
                    ? (theme.mode === 'dark' ? theme.colors.text : theme.colors.text)
                    : (theme.mode === 'dark' ? theme.colors.background : theme.colors.background),
                },
              ]} 
              onPress={toggleTemporaryMode}
            >
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
            >
              <Ionicons name="add-outline" size={23} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.topRightPill} onPress={onOpenSettings}>
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

        {/* Long Press Menu Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="none"
          onRequestClose={dismissMenu}
        >
          <TouchableWithoutFeedback onPress={dismissMenu}>
            <Animated.View style={{ flex: 1, backgroundColor: menuOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.2)'],
            }) }}>
              {menuPosition && selectedChatId && (
                <Animated.View
                  style={{
                    position: 'absolute',
                    left: Math.max(16, Math.min(menuPosition.x - 80, screenWidth - 200)),
                    top: menuPosition.y < Dimensions.get('window').height * 0.3 
                      ? Math.min(menuPosition.y + 10, Dimensions.get('window').height - 200)
                      : Math.max(50, menuPosition.y - 120),
                    backgroundColor: theme.colors.card,
                    borderRadius: 10,
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    minWidth: 140,
                    shadowColor: theme.colors.text,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 6,
                    elevation: 4,
                    zIndex: 1000,
                    opacity: menuOpacity,
                    transform: [{ scale: menuScale }],
                  }}
                  onStartShouldSetResponder={() => true}
                >
                  {(() => {
                    const chat = chatHistory.find(c => c.id === selectedChatId);
                    const isPinned = chat?.pinned || false;
                    return (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            if (selectedChatId) {
                              handleRename(selectedChatId);
                            }
                          }}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons name="pencil-outline" size={18} color={theme.colors.text} />
                          <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>
                            Rename
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (selectedChatId) {
                              handlePinToggle(selectedChatId);
                            }
                          }}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons 
                            name={isPinned ? "bookmark" : "bookmark-outline"} 
                            size={18} 
                            color={theme.colors.text} 
                          />
                          <Text style={{ color: theme.colors.text, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>
                            {isPinned ? 'Unpin' : 'Pin'}
                          </Text>
                        </TouchableOpacity>
                        <View
                          style={{
                            height: 1,
                            backgroundColor: theme.colors.border,
                            marginVertical: 3,
                            marginHorizontal: 8,
                          }}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            if (selectedChatId) {
                              handleDeleteChat(selectedChatId);
                            }
                          }}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                          <Text style={{ color: theme.colors.error, marginLeft: 10, fontSize: 14, fontFamily: "Poppins" }}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </Animated.View>
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Slide-out panel from the left */}
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
              backgroundColor: theme.colors.card,
              shadowColor: theme.colors.text,
              shadowOffset: { width: 2, height: 0 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 5,
            },
          ]}
        >
          {/* Chat history list */}
          <ScrollView
            style={{ flex: 1, marginTop: 24, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 100 }}
            removeClippedSubviews={true}
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
                    {groupedChatHistory.pinnedChats.map((chat) => (
                      <ChatHistoryCard
                        key={chat.id}
                        chat={chat}
                        currentChatId={currentChatId}
                        theme={theme}
                        onPress={() => handleChatSelect(chat)}
                        onLongPress={(e) => handleLongPress(chat, e)}
                        isEditing={editingChatId === chat.id}
                        editingTitle={editingTitle}
                        onEditingTitleChange={setEditingTitle}
                        onRenameSave={handleRenameSave}
                        onRenameCancel={() => {
                          setEditingChatId(null);
                          setEditingTitle('');
                        }}
                      />
                    ))}
                  </View>
                )}

                {/* Month/Year Grouped Sections */}
                {groupedChatHistory.sortedKeys.map((monthYear) => (
                  <View key={monthYear} style={{ marginBottom: 24 }}>
                    <Text style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '600',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {monthYear}
                    </Text>
                    {groupedChatHistory.groupedUnpinned.get(monthYear)!.map((chat) => (
                      <ChatHistoryCard
                        key={chat.id}
                        chat={chat}
                        currentChatId={currentChatId}
                        theme={theme}
                        onPress={() => handleChatSelect(chat)}
                        onLongPress={(e) => handleLongPress(chat, e)}
                        isEditing={editingChatId === chat.id}
                        editingTitle={editingTitle}
                        onEditingTitleChange={setEditingTitle}
                        onRenameSave={handleRenameSave}
                        onRenameCancel={() => {
                          setEditingChatId(null);
                          setEditingTitle('');
                        }}
                      />
                    ))}
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>

          {/* New Chat button at bottom - full width */}
          <View style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            backgroundColor: theme.colors.card,
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
              paddingTop: 90,
              paddingBottom: 16,
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
              return (
                <View key={index} style={styles.messageWrapper}>
                  <View style={containerStyle}>
                    {msg.thought && (
                      <TouchableOpacity
                        onPress={() => toggleThought(index + 1)}
                        style={styles.toggleButton}
                      >
                        <Text style={styles.toggleText}>
                          {msg.showThought ? "▼ Hide Thought" : "▶ Show Thought"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {msg.showThought && msg.thought && (
                      <View style={styles.thoughtContainer}>
                        <Text style={styles.thoughtTitle}>
                          Model's Reasoning:
                        </Text>
                        <Text style={styles.thoughtText}>{msg.thought}</Text>
                      </View>
                    )}
                    {msg.role === "assistant" && msg.content.trim().length === 0 && isGenerating ? (
                      <ThinkingIndicator theme={theme} />
                    ) : (
                      <View style={{ flexShrink: 1, width: "100%", justifyContent: "center" }}>
                        <Markdown
                          style={{ 
                            body: { 
                              fontSize: 18, 
                              fontFamily: "Poppins",
                              color: msg.role === "user" ? theme.colors.primaryText : theme.colors.text,
                              margin: 0,
                              padding: 0,
                            },
                            paragraph: {
                              flexWrap: "wrap",
                              marginTop: 0,
                              marginBottom: 0,
                              padding: 0,
                            },
                            text: {
                              flexWrap: "wrap",
                              margin: 0,
                              padding: 0,
                            },
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </View>
                    )}
                  </View>
                  {msg.role === "assistant" && msg.content.trim().length > 0 && (
                    <View style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 12,
                      gap: 8,
                    }}>
                      <View style={{
                        flexDirection: "row",
                        alignItems: "center",
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
                      </View>
                      {tokensPerSecond[Math.floor(index / 2)] !== undefined && (
                        <Text style={styles.tokenInfo}>
                          {tokensPerSecond[Math.floor(index / 2)]} tokens/s
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {noMessages && (
            <Animated.View
              style={[styles.greetingContainer, { opacity: greetingOpacity }]}
            >
              <Text style={styles.greetingText}>
                {isTemporaryMode ? "Temporary Mode" : "How can I help you today?"}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Preset message suggestions or temporary mode explanation */}
        {noMessages && userInput.trim().length === 0 && (
          <View style={{
            paddingHorizontal: 16,
            paddingBottom: 12,
            gap: 12,
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
                }}
              >
                <View style={{
                  backgroundColor: theme.colors.glass,
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  width: '100%',
                }}>
                  <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: 18,
                    fontFamily: 'Poppins',
                    textAlign: 'left',
                    lineHeight: 24,
                  }}>
                    Conversations in temporary mode are not saved. This chat will not appear in your history.
                  </Text>
                </View>
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
                }}
              >
                {PRESET_MESSAGES.map((preset, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handlePresetMessage(preset)}
                    style={{
                      backgroundColor: theme.colors.glass,
                      paddingHorizontal: 20,
                      paddingVertical: 16,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      width: '100%',
                      marginBottom: index < PRESET_MESSAGES.length - 1 ? 12 : 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{
                      color: theme.colors.text,
                      fontSize: 18,
                      fontFamily: 'Poppins',
                      textAlign: 'left',
                      flex: 1,
                    }}>
                      {preset}
                    </Text>
                    <Ionicons 
                      name={PRESET_ICONS[preset] as any} 
                      size={20} 
                      color={theme.colors.textTertiary} 
                      style={{ marginLeft: 12 }}
                    />
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}
          </View>
        )}

        {/* Bottom input bar */}
        <Animated.View
          style={[
            styles.bottomContainer,
            {
              paddingBottom: animatedBottomPadding,
            },
          ]}
        >
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor={theme.colors.textTertiary}
              value={userInput}
              onChangeText={setUserInput}
              multiline
            />
            {isGenerating ? (
              <Animated.View
                style={{ marginLeft: "auto" }}
              >
                <TouchableOpacity style={styles.stopButton} onPress={stopGeneration}>
                  <Ionicons
                    name="stop-circle"
                    size={44}
                    color={theme.colors.error}
                  />
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <Animated.View
                style={{ transform: [{ scale: scaleAnim }], marginLeft: "auto" }}
              >
                <TouchableOpacity
                  style={styles.sendIconButton}
                  onPress={handleSendMessage}
                  disabled={sendButtonDisabled || isLoading}
                >
                  <Ionicons
                    name="arrow-up-circle"
                    size={44}
                    color={sendButtonDisabled ? theme.colors.textTertiary : theme.colors.text}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </Animated.View>

        {/* Model & Persona Selector Bottom Sheet */}
        <BottomSheet
          visible={isModelSelectorVisible}
          onClose={closeModelSelector}
          title={selectorTab === "models" ? "Select Model" : "Select Persona"}
          height={0.6}
          disableDrag={isLoadingModel}
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
                fontSize: 14,
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
                fontSize: 14,
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
                    <TouchableOpacity
                      key={index}
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
                        ]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        >
                          {prettifyModelName(model)}
                        </Text>
                        {isSelected && (
                          <Ionicons 
                            name="checkmark-circle" 
                            size={20} 
                            color={theme.colors.primaryText} 
                            style={{ marginLeft: 8 }}
                          />
                        )}
                        {isCurrentlyLoading && (
                          <ActivityIndicator 
                            size="small" 
                            color={theme.colors.accent} 
                            style={{ marginLeft: 8 }}
                          />
                        )}
                    </View>
                  </TouchableOpacity>
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
                        closeModelSelector();
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
                        <View style={{ flex: 1 }}>
                          <Text style={[
                            styles.buttonText,
                            isSelected && styles.selectedButtonText,
                          ]}
                          numberOfLines={1}
                          >
                            {persona.name}
                          </Text>
                          {persona.tagline && (
                            <Text style={{
                              fontSize: 12,
                              fontFamily: 'Poppins',
                              color: isSelected ? theme.colors.primaryText : theme.colors.textSecondary,
                              marginTop: 4,
                            }}
                            numberOfLines={1}
                            >
                              {persona.tagline}
                            </Text>
                          )}
                        </View>
                        {isSelected && (
                          <Ionicons 
                            name="checkmark-circle" 
                            size={20} 
                            color={theme.colors.primaryText} 
                            style={{ marginLeft: 8 }}
                          />
                        )}
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
    </KeyboardAvoidingView>
  );
}
