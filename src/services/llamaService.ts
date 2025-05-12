// llamaservice.ts
import { Alert } from "react-native";
import RNFS from "react-native-fs";
import { initLlama } from "llama.rn";
import { recordUsage, getPerformanceLevel } from "./usageTracker";

// Types
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

/**
 * Check if a file exists in RNFS
 */
export const checkFileExists = async (filePath: string) => {
  try {
    const fileExists = await RNFS.exists(filePath);
    return fileExists;
  } catch (error) {
    console.error("Error checking file existence:", error);
    return false;
  }
};

/**
 * Load the model from local path
 */
export const loadModel = async (
  filePath: string,
  context: any,
  setContext: React.Dispatch<React.SetStateAction<any>>
): Promise<boolean> => {
  try {
    if (context) {
      // release old context
      // but you can also call releaseAllLlama() if you want
      context.release();
      setContext(null);
    }
    const llamaContext = await initLlama({
      model: filePath,
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: 1,
    });
    setContext(llamaContext);
    Alert.alert("Model Loaded", "The model was successfully loaded.");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    Alert.alert("Error Loading Model", errorMessage);
    return false;
  }
};

/**
 * Stop generation
 */
export const stopGeneration = async (
  context: any,
  setIsGenerating: (val: boolean) => void,
  setIsLoading: (val: boolean) => void,
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>
) => {
  try {
    await context.stopCompletion();
    setIsGenerating(false);
    setIsLoading(false);
    setConversation((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage.role === "assistant") {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + "\n\n*Generation stopped by user*",
          },
        ];
      }
      return prev;
    });
  } catch (error) {
    console.error("Error stopping completion:", error);
  }
};

/**
 * Handle sending a message and streaming the completion tokens
 */
export const handleSendMessageCompletion = async (
  conversation: Message[],
  userInput: string,
  context: any,
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>,
  setUserInput: (val: string) => void,
  setIsLoading: (val: boolean) => void,
  setIsGenerating: (val: boolean) => void,
  setAutoScrollEnabled: (val: boolean) => void,
  tokensPerSecond: number[],
  setTokensPerSecond: React.Dispatch<React.SetStateAction<number[]>>,
  scrollViewRef: React.RefObject<any>,
  selectedModel: string
) => {
  if (!context) {
    Alert.alert("Model Not Loaded", "Please load the model first.");
    return;
  }
  if (!userInput.trim()) {
    Alert.alert("Input Error", "Please enter a message.");
    return;
  }

  const newConversation: Message[] = [
    ...conversation,
    { role: "user", content: userInput },
  ];
  setConversation(newConversation);
  setUserInput("");
  setIsLoading(true);
  setIsGenerating(true);
  setAutoScrollEnabled(true);

  // Start tracking inference time
  const startTime = Date.now();

  try {
    const stopWords = [
      "</s>",
      "<|end|>",
      "user:",
      "assistant:",
      "<|im_end|>",
      "<|eot_id|>",
      "<|end▁of▁sentence|>",
      "<|end_of_text|>",
      "<｜end▁of▁sentence｜>",
    ];

    // Placeholder for assistant's response
    setConversation((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        thought: undefined,
        showThought: false,
      },
    ]);
    let currentAssistantMessage = "";
    let currentThought = "";
    let inThinkBlock = false;

    interface CompletionData {
      token: string;
    }
    interface CompletionResult {
      timings: {
        predicted_per_second: number;
      };
    }

    const result: CompletionResult = await context.completion(
      {
        messages: newConversation,
        n_predict: 10000,
        stop: stopWords,
      },
      (data: CompletionData) => {
        const token = data.token;
        currentAssistantMessage += token;

        if (token.includes("<think>")) {
          inThinkBlock = true;
          currentThought = token.replace("<think>", "");
        } else if (token.includes("</think>")) {
          inThinkBlock = false;
          const finalThought = currentThought.replace("</think>", "").trim();

          setConversation((prev) => {
            const lastIndex = prev.length - 1;
            const updated = [...prev];
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content.replace(
                `<think>${finalThought}</think>`,
                ""
              ),
              thought: finalThought,
            };
            return updated;
          });

          currentThought = "";
        } else if (inThinkBlock) {
          currentThought += token;
        }

        const visibleContent = currentAssistantMessage
          .replace(/<think>.*?<\/think>/gs, "")
          .trim();

        setConversation((prev) => {
          const lastIndex = prev.length - 1;
          const updated = [...prev];
          updated[lastIndex].content = visibleContent;
          return updated;
        });

        if (scrollViewRef.current) {
          requestAnimationFrame(() => {
            scrollViewRef.current.scrollToEnd({ animated: false });
          });
        }
      }
    );

    // Calculate metrics after completion
    const endTime = Date.now();
    const inferenceTime = endTime - startTime; // in milliseconds
    const finalVisibleContent = currentAssistantMessage
      .replace(/<think>.*?<\/think>/gs, "")
      .trim();
    const tokenCount = finalVisibleContent
      .split(" ")
      .filter((t) => t.length > 0).length;
    const tps = result.timings.predicted_per_second;
    const performanceLevel = getPerformanceLevel(tps);

    // Save tokens per second metric for UI display
    setTokensPerSecond((prev) => [...prev, parseFloat(tps.toFixed(2))]);

    // Record usage metrics – note the new "model" property being added
    recordUsage({
      timestamp: Date.now(),
      inferenceTime,
      tokenCount,
      tokensPerSecond: tps,
      performanceLevel,
      model: selectedModel,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    Alert.alert("Error During Inference", errorMessage);
  } finally {
    setIsLoading(false);
    setIsGenerating(false);
  }
};
