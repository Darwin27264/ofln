/* ConversationScreen.tsx */
import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import { styles } from "../styles/styles";

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
  onBackToModelSelection,
  stopGeneration,
  handleSendMessageCompletion,
  assistantDisplayMode,
  onOpenSettings,
}: Props) {
  // Manage greeting fade animation.
  const noMessages = conversation.slice(1).length === 0;
  const greetingOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noMessages) {
      Animated.timing(greetingOpacity, {
        toValue: userInput.trim().length > 0 ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [userInput, noMessages]);

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
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
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

  // Mock chat history for UI
  const [chatHistory] = useState([
    { id: 1, title: "Mock Chat 1", preview: "Hello, how can I help you?" },
    { id: 2, title: "Mock Chat 2", preview: "What is the weather today?" },
  ]);

  // Slide-out panel logic.
  const panelWidth = 280;
  const panelAnim = useRef(new Animated.Value(-panelWidth)).current;
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const togglePanel = () => {
    const animationConfig = {
      duration: 220,
      useNativeDriver: true,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material-like curve for subtle, non-linear feel
    };
    if (isPanelOpen) {
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        ...animationConfig,
      }).start(() => setIsPanelOpen(false));
    } else {
      Animated.timing(panelAnim, {
        toValue: 0,
        ...animationConfig,
      }).start(() => setIsPanelOpen(true));
    }
  };

  // Close panel when overlay is pressed
  const handleOverlayPress = () => {
    if (isPanelOpen) {
      Animated.timing(panelAnim, {
        toValue: -panelWidth,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      }).start(() => setIsPanelOpen(false));
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        {/* Top-left pill for slide-out panel */}
        {!isPanelOpen && (
          <TouchableOpacity style={styles.topLeftPill} onPress={togglePanel}>
            <Ionicons name="reorder-two-outline" size={23} color="#000" />
          </TouchableOpacity>
        )}

        {/* Top-right container for settings pill ONLY (model button removed) */}
        <View style={styles.topRightButtons}>
          {/* Removed the model-selection button */}
          <TouchableOpacity style={styles.topRightPill} onPress={onOpenSettings}>
            <Ionicons name="settings-outline" size={23} color="#000" />
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
              outputRange: ["rgba(0,0,0,0)", "rgba(0,0,0,0.2)"],
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
              backgroundColor: "#fff",
              shadowColor: "#000",
              shadowOffset: { width: 2, height: 0 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 5,
            },
          ]}
        >
          {/* Back button at the top left, now using back icon */}
          <TouchableOpacity
            style={[styles.topLeftPill, { left: 14 }]}
            onPress={togglePanel}
          >
            <Ionicons name="arrow-back" size={23} color="#000" />
          </TouchableOpacity>
          {/* "History" title at the top right, aligned with back button */}
          <Text
            style={{
              position: "absolute",
              top: 24,
              right: 22,
              fontSize: 22,
              fontWeight: "500",
              color: "#000000",
              fontFamily: "Poppins",
            }}
          >
           Chats
          </Text>
          {/* Chat history list, now scrollable and lowered to avoid overlap with back button */}
          <ScrollView
            style={{ flex: 1, marginTop: 80, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 28 }}
          >
            {chatHistory.map((chat) => (
              <View
                key={chat.id}
                style={{
                  backgroundColor: "#F1F5F9",
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 16,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                <Text
                  style={{
                    fontWeight: "bold",
                    fontSize: 16,
                    marginBottom: 5,
                  }}
                >
                  {chat.title}
                </Text>
                <Text style={{ color: "#64748B", fontSize: 14 }}>{chat.preview}</Text>
              </View>
            ))}
          </ScrollView>
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
                        style={{ body: { fontSize: 18, fontFamily: "Poppins" } }}
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
                How can I help you today?
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Bottom input bar */}
        <View style={styles.bottomContainer}>
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor="#94A3B8"
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
                    color={sendButtonDisabled ? "#AAAAAA" : "#000000"}
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
