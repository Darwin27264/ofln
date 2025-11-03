/* ConversationScreen.tsx */
import React, { useEffect, useRef, useState, useCallback } from "react";
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
  Alert,
  Dimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { chatHistoryService, ChatConversation } from "../services/chatHistoryService";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

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
}

export default function ConversationScreen({
  conversation,
  setConversation,
  userInput,
  setUserInput,
  isLoading,
  isGenerating,
  tokensPerSecond,
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
}: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatConversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Temporary mode state
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  // Slide-out panel logic - declared early so it can be used in useEffects
  // Panel width is 85% of screen width
  const screenWidth = Dimensions.get('window').width;
  const panelWidth = screenWidth * 0.85;
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
    "Explain quantum computing in simple terms",
    "Write a creative short story about AI",
    "Help me plan a productive day",
  ];

  // Initialize chat history service
  useEffect(() => {
    chatHistoryService.initialize();
  }, []);

  // Reset temporary mode when starting a new chat
  useEffect(() => {
    if (noMessages && !currentChatId) {
      setIsTemporaryMode(false);
      setHasStartedChat(false);
    }
  }, [noMessages, currentChatId]);

  // Load chat history when panel opens or when conversation changes (if panel is open)
  useEffect(() => {
    const loadChatHistory = async () => {
      if (isPanelOpen) {
        setIsLoadingHistory(true);
        try {
          const chats = await chatHistoryService.getAllChats();
          setChatHistory(chats);
        } catch (error) {
          console.error('Error loading chat history:', error);
        } finally {
          setIsLoadingHistory(false);
        }
      }
    };
    loadChatHistory();
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

  const togglePanel = useCallback(() => {
    // Faster, smoother animation with subtle easing (no bounce)
    const animationConfig = {
      duration: 200,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic), // Smooth and fast with minimal bounce
    };
    if (isPanelOpen) {
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        ...animationConfig,
      }).start(() => setIsPanelOpen(false));
    } else {
      setIsPanelOpen(true); // Set immediately for better UX
      Animated.timing(panelAnim, {
        toValue: 0,
        ...animationConfig,
      }).start();
    }
  }, [isPanelOpen, panelAnim, panelWidth]);

  // Handle chat selection
  const handleChatSelect = useCallback(async (chat: ChatConversation) => {
    onLoadChat(chat.id, chat.messages);
    togglePanel();
  }, [onLoadChat, togglePanel]);

  // Handle chat deletion
  const handleDeleteChat = useCallback(async (chatId: string, event: any) => {
    event.stopPropagation();
    
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
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
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]
    );
  }, [currentChatId, onNewChat]);

  // Handle preset message selection
  const handlePresetMessage = useCallback((message: string) => {
    setUserInput(message);
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [setUserInput, scrollViewRef]);

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

  // Scale animation for the send icon.
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handleSendMessage = async () => {
    if (!context) {
      alert("Model Not Loaded. Please load the model first.");
      return;
    }
    if (!userInput.trim()) {
      return;
    }
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.15,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start(async () => {
      await handleSendMessageCompletion(conversation, userInput);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  };

  // Auto-scroll handling.
  const handleScroll = (event: any) => {
    const currentPosition = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    scrollPositionRef.current = currentPosition;
    contentHeightRef.current = contentHeight;
    const distanceFromBottom =
      contentHeight - scrollViewHeight - currentPosition;
    setAutoScrollEnabled(distanceFromBottom < 100);
  };

  // Toggle "thought" block.
  const toggleThought = (messageIndex: number) => {
    setConversation((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, showThought: !msg.showThought } : msg
      )
    );
  };

  const sendButtonDisabled = !userInput.trim();

  // Close panel when overlay is pressed
  const handleOverlayPress = useCallback(() => {
    if (isPanelOpen) {
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic), // Consistent with togglePanel
      }).start(() => setIsPanelOpen(false));
    }
  }, [isPanelOpen, panelAnim, panelWidth]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        {/* Top-left pill for slide-out panel */}
        {!isPanelOpen && (
          <>
            <TouchableOpacity style={styles.topLeftPill} onPress={togglePanel}>
              <Ionicons name="reorder-two-outline" size={23} color={theme.colors.text} />
            </TouchableOpacity>
            {isTemporaryMode && hasStartedChat && (
              <Text style={{
                position: 'absolute',
                top: 20, // Same top position as button
                left: 79, // Position right of menu icon with increased spacing (16 left + 12 padding + 23 icon + 12 padding + 16 spacing)
                zIndex: 10,
                color: theme.colors.textTertiary,
                fontSize: 19,
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
                    ? (theme.mode === 'dark' ? theme.colors.text : theme.colors.background)
                    : (theme.mode === 'dark' ? theme.colors.background : theme.colors.text),
                },
              ]} 
              onPress={toggleTemporaryMode}
            >
              <Ionicons 
                name="flash-outline" 
                size={23} 
                color={isTemporaryMode 
                  ? (theme.mode === 'dark' ? theme.colors.primaryText : theme.colors.text)
                  : (theme.mode === 'dark' ? theme.colors.text : theme.colors.primaryText)
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
          >
            {isLoadingHistory ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSecondary }}>Loading...</Text>
              </View>
            ) : chatHistory.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSecondary }}>No chats yet</Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: 12, marginTop: 8 }}>
                  Start a conversation to see it here
                </Text>
              </View>
            ) : (
              chatHistory.map((chat) => (
                <TouchableOpacity
                  key={chat.id}
                  onPress={() => handleChatSelect(chat)}
                  style={{
                    backgroundColor: currentChatId === chat.id ? theme.colors.accent + '20' : theme.colors.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: currentChatId === chat.id ? theme.colors.accent : theme.colors.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "600",
                        fontSize: 16,
                        marginBottom: 4,
                        color: theme.colors.text,
                      }}
                    >
                      {chat.title}
                    </Text>
                    <Text 
                      style={{ color: theme.colors.textSecondary, fontSize: 14 }}
                      numberOfLines={1}
                    >
                      {chat.preview}
                    </Text>
                    <Text style={{ color: theme.colors.textTertiary, fontSize: 12, marginTop: 4 }}>
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => handleDeleteChat(chat.id, e)}
                    style={{ padding: 8, marginLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
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
                  fontSize: 16,
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
              paddingHorizontal: 16,
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
              }
              return (
                <View key={index} style={styles.messageWrapper}>
                  <View style={containerStyle}>
                    <Text
                      style={[
                        styles.messageText,
                        msg.role === "user" && styles.userMessageText,
                      ]}
                    >
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
                      <Markdown
                        style={{ 
                          body: { 
                            fontSize: 18, 
                            fontFamily: "Poppins",
                            color: msg.role === "user" ? theme.colors.primaryText : theme.colors.text 
                          } 
                        }}
                      >
                        {msg.content}
                      </Markdown>
                    </Text>
                  </View>
                  {msg.role === "assistant" && (
                    <Text style={styles.tokenInfo}>
                      {tokensPerSecond[Math.floor(index / 2)]} tokens/s
                    </Text>
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
                    fontSize: 15,
                    fontFamily: 'Poppins',
                    textAlign: 'left',
                    lineHeight: 22,
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
                    }}
                  >
                    <Text style={{
                      color: theme.colors.text,
                      fontSize: 15,
                      fontFamily: 'Poppins',
                      textAlign: 'left',
                    }}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}
          </View>
        )}

        {/* Bottom input bar */}
        <View style={styles.bottomContainer}>
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
              <TouchableOpacity style={styles.stopButton} onPress={stopGeneration}>
                <Text style={styles.sendIconText}>□</Text>
              </TouchableOpacity>
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
                    size={40}
                    color={sendButtonDisabled ? theme.colors.textTertiary : theme.colors.text}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
