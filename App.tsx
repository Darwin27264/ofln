/* App.tsx */
import React, { useState, useRef, useEffect } from "react";
import { SafeAreaView, ScrollView, Alert, ActivityIndicator } from "react-native";

import { styles } from "./src/styles/styles";
import { downloadModel } from "./src/api/model";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

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

export default function App(): React.JSX.Element {
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
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<
    "modelSelection" | "conversation" | "settings"
  >("conversation");
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  const [assistantDisplayMode, setAssistantDisplayMode] = useState<"bubble" | "direct">(
    "bubble"
  );

  const HF_TO_GGUF = {
    "Llama-3.2-1B-Instruct": "medmekk/Llama-3.2-1B-Instruct.GGUF",
    "DeepSeek-R1-Distill-Qwen-1.5B": "medmekk/DeepSeek-R1-Distill-Qwen-1.5B.GGUF",
    "Qwen2-0.5B-Instruct": "medmekk/Qwen2.5-0.5B-Instruct.GGUF",
    "SmolLM2-1.7B-Instruct": "medmekk/SmolLM2-1.7B-Instruct.GGUF",
  };

  const modelFormats = [
    { label: "Llama-3.2-1B-Instruct" },
    { label: "Qwen2-0.5B-Instruct" },
    { label: "DeepSeek-R1-Distill-Qwen-1.5B" },
    { label: "SmolLM2-1.7B-Instruct" },
  ];

  const scrollViewRef = useRef<ScrollView>(null);
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
    setCurrentPage("modelSelection");
  };

  const handleDownloadModel = async (file: string) => {
    const downloadUrl = `https://huggingface.co/${
      HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
    }/resolve/main/${file}`;
    setIsDownloading(true);
    setProgress(0);

    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    if (await checkFileExists(destPath)) {
      const success = await loadModel(destPath, context, setContext);
      if (success) {
        Alert.alert("Info", `File ${destPath} already exists, we'll load it directly.`);
        setIsDownloading(false);
        return;
      }
    }
    try {
      await downloadModel(file, downloadUrl, (prog) => setProgress(prog));
      Alert.alert("Success", `Model downloaded to: ${destPath}`);
      await loadModel(destPath, context, setContext);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Download failed: ${errorMessage}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {currentPage === "modelSelection" && !isDownloading && (
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
        />
      )}

      {currentPage === "conversation" && !isDownloading && (
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
              scrollViewRef
            )
          }
          assistantDisplayMode={assistantDisplayMode}
          onOpenSettings={() => setCurrentPage("settings")}
        />
      )}

      {currentPage === "settings" && (
        <SettingsScreen
          assistantDisplayMode={assistantDisplayMode}
          setAssistantDisplayMode={setAssistantDisplayMode}
          onBackToConversation={() => setCurrentPage("conversation")}
        />
      )}

      {isDownloading && (
        <ScrollView style={styles.scrollView}>
          <ActivityIndicator size="large" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
