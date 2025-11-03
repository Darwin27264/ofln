/* App.tsx */
import React, { useState, useRef, useEffect } from "react";
import { SafeAreaView, ScrollView, Alert, ActivityIndicator, Animated, Easing } from "react-native";

import { createStyles } from "./src/styles/styles";
import { downloadModel } from "./src/api/model";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Theme
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StagesScreen from "./src/screens/StagesScreen";

// Services
import {
  loadModel,
  stopGeneration,
  handleSendMessageCompletion,
  checkFileExists,
} from "./src/services/llamaService";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const INITIAL_CONVERSATION: Message[] = [
    {
      role: "system",
      content: "This is a conversation between user and assistant, a friendly chatbot.",
    },
  ];

  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] = useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]);
  type PageType = "modelSelection" | "conversation" | "settings" | "stages";
  const [currentPage, setCurrentPage] = useState<PageType>("conversation");
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [assistantDisplayMode, setAssistantDisplayMode] = useState<"bubble" | "direct">(
    "bubble"
  );

  // Page transition animations
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageTranslateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate page transitions
    pageOpacity.setValue(0);
    pageTranslateX.setValue(20);
    
    Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentPage]);

  // Top 8 best mobile models optimized for speed and quality (2024)
  const HF_TO_GGUF = {
    "Qwen2-0.5B-Instruct": "medmekk/Qwen2.5-0.5B-Instruct.GGUF",           // Best tiny model - excellent quality
    "Llama-3.2-1B-Instruct": "medmekk/Llama-3.2-1B-Instruct.GGUF",         // Meta's latest - great balance
    "SmolLM2-1.7B-Instruct": "medmekk/SmolLM2-1.7B-Instruct.GGUF",         // High quality reasoning
    "DeepSeek-R1-Distill-Qwen-1.5B": "medmekk/DeepSeek-R1-Distill-Qwen-1.5B.GGUF", // Best reasoning model
    "TinyLlama-1.1B-Chat": "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",        // Fast and reliable
    "Phi-2-0.8B": "TheBloke/phi-2-GGUF",                                   // Microsoft's efficient model
    "StableLM-Zephyr-0.8B": "TheBloke/stablelm-zephyr-0.8b-GGUF",          // Stable AI's efficient model
    "Yi-6B-Chat": "TheBloke/Yi-6B-Chat-GGUF"                                // Best quality (larger but worth it)
  };

  const modelFormats = [
    { label: "Qwen2-0.5B-Instruct" },        // Best tiny - excellent chat quality
    { label: "Llama-3.2-1B-Instruct" },      // Meta's latest - great balance
    { label: "SmolLM2-1.7B-Instruct" },      // High quality reasoning
    { label: "DeepSeek-R1-Distill-Qwen-1.5B" }, // Best reasoning model
    { label: "TinyLlama-1.1B-Chat" },        // Fast and reliable
    { label: "Phi-2-0.8B" },                 // Microsoft's efficient model
    { label: "StableLM-Zephyr-0.8B" },       // Stable AI's efficient model
    { label: "Yi-6B-Chat" }                  // Best quality (larger)
  ];

  const scrollViewRef = useRef<ScrollView>(null!) as React.RefObject<ScrollView>;
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);

  useEffect(() => {
    checkDownloadedModels();
  }, [currentPage]);

  const checkDownloadedModels = async () => {
    try {
      const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      const ggufFiles = files.filter((file) => file.name.endsWith(".gguf")).map((f) => f.name);
      setDownloadedModels(ggufFiles);
    } catch (error) {
      console.error("Error checking downloaded models:", error);
    }
  };

  const handleBackToModelSelection = () => {
    setContext(null);
    releaseAllLlama();
    setConversation(INITIAL_CONVERSATION);
    setSelectedGGUF(null);
    setTokensPerSecond([]);
    setCurrentChatId(null);
    setCurrentPage("modelSelection");
  };

  const handleNewChat = () => {
    setConversation(INITIAL_CONVERSATION);
    setCurrentChatId(null);
    setTokensPerSecond([]);
  };

  const handleLoadChat = async (chatId: string, messages: Message[]) => {
    setConversation(messages);
    setCurrentChatId(chatId);
    setTokensPerSecond([]); // Reset tokens per second for new chat
    setCurrentPage("conversation");
  };

  const handleDownloadModel = async (file: string, onProgress: (progress: number) => void) => {
    const downloadUrl = `https://huggingface.co/${
      HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
    }/resolve/main/${file}`;

    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    if (await checkFileExists(destPath)) {
      const success = await loadModel(destPath, context, setContext);
      if (success) {
        Alert.alert("Info", `File ${destPath} already exists, we'll load it directly.`);
        await checkDownloadedModels(); // Refresh downloaded models list
        setCurrentPage("conversation");
        return;
      }
    }
    try {
      await downloadModel(file, downloadUrl, onProgress);
      await checkDownloadedModels(); // Refresh downloaded models list
      const success = await loadModel(destPath, context, setContext);
      if (success) {
        Alert.alert("Success", `Model downloaded to: ${destPath}`);
        setCurrentPage("conversation");
      } else {
        Alert.alert("Error", "Failed to load the downloaded model.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Download failed: ${errorMessage}`);
      setSelectedGGUF(null); // Reset selection on error
    }
  };

  const pageTransitionStyle = {
    opacity: pageOpacity,
    transform: [{ translateX: pageTranslateX }],
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {currentPage === "modelSelection" && (
        <Animated.View style={[{ flex: 1 }, pageTransitionStyle]}>
          <ModelSelectionScreen
          modelFormats={modelFormats}
          selectedModelFormat={selectedModelFormat}
          setSelectedModelFormat={setSelectedModelFormat}
          availableGGUFs={availableGGUFs}
          setAvailableGGUFs={setAvailableGGUFs}
          selectedGGUF={selectedGGUF}
          setSelectedGGUF={setSelectedGGUF}
          isFetching={isFetching}
          setIsFetching={setIsFetching}
          downloadedModels={downloadedModels}
          handleDownloadModel={handleDownloadModel}
          loadModel={loadModel}
          context={context}
          setContext={setContext}
          setCurrentPage={setCurrentPage}
          HF_TO_GGUF={HF_TO_GGUF}
          checkDownloadedModels={checkDownloadedModels}
          />
        </Animated.View>
      )}

      {currentPage === "conversation" && (
        <Animated.View style={[{ flex: 1 }, pageTransitionStyle]}>
          <ConversationScreen
          conversation={conversation}
          setConversation={setConversation}
          userInput={userInput}
          setUserInput={setUserInput}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
          tokensPerSecond={tokensPerSecond}
          setTokensPerSecond={setTokensPerSecond}
          scrollViewRef={scrollViewRef}
          scrollPositionRef={scrollPositionRef}
          contentHeightRef={contentHeightRef}
          autoScrollEnabled={autoScrollEnabled}
          setAutoScrollEnabled={setAutoScrollEnabled}
          context={context}
          currentChatId={currentChatId}
          onChatIdChange={setCurrentChatId}
          onLoadChat={handleLoadChat}
          onNewChat={handleNewChat}
          onBackToModelSelection={handleBackToModelSelection}
          stopGeneration={() =>
            stopGeneration(context, setIsGenerating, setIsLoading, setConversation)
          }
          handleSendMessageCompletion={(messages, userMsg) =>
            handleSendMessageCompletion(
              messages,
              userMsg,
              context,
              setConversation,
              setUserInput,
              setIsLoading,
              setIsGenerating,
              setAutoScrollEnabled,
              tokensPerSecond,
              setTokensPerSecond,
              scrollViewRef,
              selectedGGUF || "unknown"  // Pass the selected model for usage tracking
            )
          }
          assistantDisplayMode={assistantDisplayMode}
          onOpenSettings={() => setCurrentPage("settings")}
          />
        </Animated.View>
      )}

      {currentPage === "settings" && (
        <Animated.View style={[{ flex: 1 }, pageTransitionStyle]}>
          <SettingsScreen
          assistantDisplayMode={assistantDisplayMode}
          setAssistantDisplayMode={setAssistantDisplayMode}
          onBackToConversation={() => setCurrentPage("conversation")}
          // Clicking the stats block navigates to the Stages page.
          onOpenStats={() => setCurrentPage("stages")}
          onGoToModelSelection={() => setCurrentPage("modelSelection")}
          />
        </Animated.View>
      )}

      {currentPage === "stages" && (
        <Animated.View style={[{ flex: 1 }, pageTransitionStyle]}>
          <StagesScreen
            downloadedModels={downloadedModels}
            onBack={() => setCurrentPage("settings")}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
