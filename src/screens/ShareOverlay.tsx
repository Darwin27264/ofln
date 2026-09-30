/**
 * ShareOverlay — Floating frosted bottom card for Android Share Sheet targets
 * and ACTION_PROCESS_TEXT text selection actions.
 *
 * Designed to strictly adhere to DESIGN.md:
 * - Floating rounded card (SIDE_INSET margins, clearing the Android navigation bar)
 * - Frosted glass backing with calm monochrome palette and subtle lava gold accent
 * - Poppins typography across all labels and content
 * - Monochromatic line icons (no emojis)
 * - Strong visual hierarchy with filled primary CTA
 * - Guaranteed clearance above Android gesture navigation and home buttons
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  BackHandler,
  TextInput,
  Dimensions,
  Keyboard,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';
import RNFS from 'react-native-fs';

import '../utils/textEncodingPolyfill';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { FrostedGlass } from '../components/FrostedGlass';
import { useFloatingBackBottom } from '../utils/layoutInsets';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';
import {
  getSharedPayload,
  closeOverlay,
  returnProcessedText,
  openInFullApp,
  type SharedPayload,
} from '../services/shareReceiverService';
import { extractTextFromImage } from '../services/ocrService';
import { fetchSourceText } from '../services/sourceFetchService';
import { llamaProvider } from '../providers/llamaProvider';
import { validateLocalModels } from '../services/localModelService';
import { streamChat, nativeCompletion } from '../services/aiChatService';
import { getModelSettings, DEFAULT_SETTINGS } from '../services/modelSettingsService';
import { MessageMarkdown } from '../components/MessageMarkdown';
import { chatHistoryService, type Message } from '../services/chatHistoryService';
import { prettifyModelName } from '../utils/modelUtils';
import { getQuickActionsDefaultModel } from '../services/quickActionsDefaultService';
import {
  isShareSheetModelFile,
  pickQuickActionsModelFile,
} from '../services/starterModels';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SIDE_INSET = 14;

type ActionType = 'summarize' | 'rephrase' | 'key_points' | 'simplify' | 'custom';

interface ActionPillConfig {
  id: ActionType;
  label: string;
  icon: string;
}

const ACTION_PILLS: ActionPillConfig[] = [
  { id: 'summarize', label: 'Summarize', icon: 'sparkles-outline' },
  { id: 'rephrase', label: 'Rephrase', icon: 'sync-outline' },
  { id: 'key_points', label: 'Key Points', icon: 'bulb-outline' },
  { id: 'simplify', label: 'Simplify', icon: 'reader-outline' },
  { id: 'custom', label: 'Ask...', icon: 'chatbubble-ellipses-outline' },
];

if (Platform.OS === 'android' && typeof UIManager?.setLayoutAnimationEnabledExperimental === 'function') {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Smooth, subtle layout animation for the entire panel when children expand or shrink */
function animatePanelLayout(duration = 240) {
  try {
    if (typeof LayoutAnimation?.configureNext === 'function') {
      LayoutAnimation.configureNext({
        duration,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
    }
  } catch (_e) {
    // Graceful fallback in environments without LayoutAnimation
  }
}

// Helper to discover all user models (both in app Documents dir and imported)
async function getAvailableModelsList(): Promise<{ fileName: string; filePath: string }[]> {
  const list: { fileName: string; filePath: string }[] = [];
  const seenPaths = new Set<string>();

  // 1. Scan DocumentDirectoryPath for downloaded GGUF models
  try {
    const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
    for (const f of files) {
      const n = f.name.toLowerCase();
      if (n.endsWith('.gguf') && !n.endsWith('.partial') && !n.endsWith('.chunk')) {
        list.push({ fileName: f.name, filePath: f.path });
        seenPaths.add(f.path);
      }
    }
  } catch (err) {
    console.warn('[ShareOverlay] Error reading DocumentDirectoryPath', err);
  }

  // 2. Scan validated local imported models
  try {
    const locals = await validateLocalModels();
    for (const m of locals) {
      if (!seenPaths.has(m.filePath)) {
        list.push({ fileName: m.fileName, filePath: m.filePath });
        seenPaths.add(m.filePath);
      }
    }
  } catch (err) {
    console.warn('[ShareOverlay] Error scanning local models', err);
  }

  return list.filter((m) => isShareSheetModelFile(m.fileName));
}

function pickOverlayModel(
  models: { fileName: string; filePath: string }[],
  preferred: string | null | undefined,
): { fileName: string; filePath: string } | undefined {
  const name = pickQuickActionsModelFile(
    models.map((m) => m.fileName),
    preferred,
  );
  if (!name) return undefined;
  return models.find((m) => m.fileName === name) ?? models[0];
}

function extractUrlFromText(text: string): string | null {
  const match = (text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function isBareUrl(text: string): boolean {
  const trimmed = (text || '').trim();
  return (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.includes(' ') &&
    !trimmed.includes('\n')
  );
}

const SHARE_SYSTEM_PROMPT =
  'You are ofln, an expert on-device text processing assistant. ' +
  'Directly perform the requested transformation (summarize, rephrase, extract key points, or simplify) ' +
  'on the provided source text. Output the result directly without conversational preamble, pleasantries, ' +
  'or asking for confirmation.';

function buildPromptText(action: ActionType, sourceText: string, custom?: string): string {
  const trimmed = sourceText.trim();
  switch (action) {
    case 'summarize':
      return `Summarize the following content into concise, clear bullet points:\n\n"""\n${trimmed}\n"""\n\nKey Summary:`;
    case 'rephrase':
      return `Rewrite the following text to be polished, clear, and natural while preserving its original meaning:\n\n"""\n${trimmed}\n"""\n\nPolished Version:`;
    case 'key_points':
      return `Extract the key takeaways, core facts, and action items from the following content:\n\n"""\n${trimmed}\n"""\n\nKey Takeaways:`;
    case 'simplify':
      return `Explain the following content in simple, easy-to-understand terms:\n\n"""\n${trimmed}\n"""\n\nSimplified Explanation:`;
    case 'custom':
      return `${(custom || '').trim()}\n\nSource Content:\n"""\n${trimmed}\n"""`;
  }
}

function ShareOverlayContent() {
  const { theme, isDark } = useTheme();
  const colors = theme.colors;
  const bottomClearance = useFloatingBackBottom();

  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [extractedText, setExtractedText] = useState('');
  const [ocrRunning, setOcrRunning] = useState(false);
  const [webFetching, setWebFetching] = useState(false);
  const [webFetchError, setWebFetchError] = useState<string | null>(null);

  // Prompt & Generation state
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<{ fileName: string; filePath: string }[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const [isExpandedPreview, setIsExpandedPreview] = useState(false);

  const abortRef = useRef<(() => void) | null>(null);
  const savedChatIdRef = useRef<string | null>(null);
  const sessionMessagesRef = useRef<Message[]>([]);
  const availableModelsRef = useRef<{ fileName: string; filePath: string }[]>([]);
  const lastStreamedTextRef = useRef<string>('');
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  const translateYAnim = useRef(new Animated.Value(24)).current;
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modelLoadSeqRef = useRef<number>(0);
  const activeLoadPromiseRef = useRef<Promise<boolean> | null>(null);

  // Micro-interaction animated values for subtle sub-element motion
  const pickerAnim = useRef(new Animated.Value(0)).current;
  const responseAnim = useRef(new Animated.Value(0)).current;
  const customInputAnim = useRef(new Animated.Value(0)).current;

  const [toastMounted, setToastMounted] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;

  availableModelsRef.current = availableModels;

  const hasResponse = Boolean(streamedText || isGenerating);

  // Guarantee LayoutAnimation is enabled on Android on mount
  useEffect(() => {
    if (Platform.OS === 'android' && typeof UIManager?.setLayoutAnimationEnabledExperimental === 'function') {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch (_e) {}
    }
  }, []);

  // Animate toast overlay
  useEffect(() => {
    if (toastMessage) {
      setToastMounted(true);
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 160,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 140,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setToastMounted(false);
      });
    }
  }, [toastMessage, toastAnim]);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const handleDismiss = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 180,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 18,
        duration: 180,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(() => {
      closeOverlay();
    });
  }, [opacityAnim, scaleAnim, translateYAnim]);

  // Clean up timers and ongoing generation on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }
    };
  }, []);

  // Handle hardware Back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismiss();
      return true;
    });
    return () => sub.remove();
  }, [handleDismiss]);

  // Animate floating card in on mount (soft fade + subtle rise + gentle scale expansion, per DESIGN.md)
  useEffect(() => {
    opacityAnim.setValue(0);
    scaleAnim.setValue(0.96);
    translateYAnim.setValue(24);

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 240,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 260,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 260,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacityAnim, scaleAnim, translateYAnim]);

  // Load payload from Native Intent
  useEffect(() => {
    let isMounted = true;
    let autoRunTimeout: NodeJS.Timeout | null = null;

    async function loadPayload() {
      try {
        const data = await getSharedPayload();
        if (!isMounted) return;

        setPayload(data);
        setContentLoading(false);

        if (!data) return;

        const rawText = data.text || '';
        const detectedUrl = data.url || extractUrlFromText(rawText);

        // 1. Image OCR extraction
        if ((data.type === 'image' || data.type === 'multiple_images') && data.uris && data.uris.length > 0) {
          setOcrRunning(true);
          try {
            const ocr = await extractTextFromImage(data.uris[0]);
            if (isMounted) {
              const textResult = ocr.trim() || rawText;
              setExtractedText(textResult);
              if (data.quickAction === 'summarize' && textResult) {
                autoRunTimeout = setTimeout(() => {
                  if (isMounted) executePrompt('summarize', textResult);
                }, 300);
              } else if (data.quickAction === 'rephrase' && textResult) {
                autoRunTimeout = setTimeout(() => {
                  if (isMounted) executePrompt('rephrase', textResult);
                }, 300);
              }
            }
          } catch (e) {
            console.warn('[ShareOverlay] OCR error', e);
            if (isMounted) setExtractedText(rawText);
          } finally {
            if (isMounted) setOcrRunning(false);
          }
        }
        // 2. Web link extraction (e.g. from Chrome, Twitter, Reddit, or shared URL)
        else if (data.type === 'link' || detectedUrl) {
          const targetUrl = detectedUrl || rawText.trim();
          setExtractedText(rawText || targetUrl);

          if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
            setWebFetching(true);
            setWebFetchError(null);
            try {
              const fetchRes = await fetchSourceText(targetUrl);
              if (isMounted && fetchRes?.text && fetchRes.text.trim()) {
                const articleText = fetchRes.text.trim();
                setExtractedText(articleText);
                if (data.quickAction === 'summarize') {
                  autoRunTimeout = setTimeout(() => {
                    if (isMounted) executePrompt('summarize', articleText);
                  }, 300);
                } else if (data.quickAction === 'rephrase') {
                  autoRunTimeout = setTimeout(() => {
                    if (isMounted) executePrompt('rephrase', articleText);
                  }, 300);
                }
              } else {
                if (isMounted) {
                  setWebFetchError('Could not extract readable article text.');
                }
              }
            } catch (err: any) {
              console.warn('[ShareOverlay] Web fetch error', err);
              if (isMounted) {
                setWebFetchError('Could not fetch webpage content (offline or site protected).');
              }
            } finally {
              if (isMounted) setWebFetching(false);
            }
          }
        }
        // 3. Plain text / text selection
        else {
          setExtractedText(rawText);
          if (data.quickAction === 'summarize' && rawText.trim()) {
            autoRunTimeout = setTimeout(() => {
              if (isMounted) executePrompt('summarize', rawText);
            }, 300);
          } else if (data.quickAction === 'rephrase' && rawText.trim()) {
            autoRunTimeout = setTimeout(() => {
              if (isMounted) executePrompt('rephrase', rawText);
            }, 300);
          }
        }
      } catch (err) {
        console.warn('[ShareOverlay] Error loading payload', err);
        if (isMounted) setContentLoading(false);
      }
    }

    loadPayload();
    return () => {
      isMounted = false;
      if (autoRunTimeout) clearTimeout(autoRunTimeout);
    };
  }, []);

  // Autoload the first model in the user's model list on mount
  useEffect(() => {
    let isMounted = true;

    async function autoloadFirstModel() {
      try {
        const models = await getAvailableModelsList();
        if (!isMounted) return;
        setAvailableModels(models);

        if (llamaProvider.isReady()) {
          const status = llamaProvider.getStatus();
          const name = status.modelPath
            ? status.modelPath.split(/[/\\]/).pop()
            : null;
          if (name && isShareSheetModelFile(name)) {
            if (isMounted) setModelName(name);
            return;
          }
        }

        if (models.length === 0) {
          return;
        }

        const seq = ++modelLoadSeqRef.current;
        setModelLoading(true);
        const preferred = await getQuickActionsDefaultModel();
        const target = pickOverlayModel(models, preferred);
        if (!target || !isMounted || modelLoadSeqRef.current !== seq) {
          if (isMounted && modelLoadSeqRef.current === seq) {
            animatePanelLayout(200);
            setModelLoading(false);
          }
          return;
        }
        if (isMounted) setModelName(target.fileName);

        const loadPromise = llamaProvider.loadModel({ modelPath: target.filePath });
        activeLoadPromiseRef.current = loadPromise;
        const ok = await loadPromise;

        if (isMounted && modelLoadSeqRef.current === seq) {
          activeLoadPromiseRef.current = null;
          animatePanelLayout(200);
          setModelLoading(false);
          if (ok) {
            setModelName(target.fileName);
          }
        }
      } catch (err) {
        console.warn('[ShareOverlay] Autoload first model failed', err);
        if (isMounted) {
          activeLoadPromiseRef.current = null;
          animatePanelLayout(200);
          setModelLoading(false);
        }
      }
    }

    autoloadFirstModel();
    return () => {
      isMounted = false;
    };
  }, []);

  // Ensure local model is resident in RAM
  const ensureModelLoaded = async (): Promise<string | null> => {
    if (activeLoadPromiseRef.current) {
      await activeLoadPromiseRef.current;
    }

    if (llamaProvider.isReady()) {
      const status = llamaProvider.getStatus();
      const name = status.modelPath
        ? status.modelPath.split(/[/\\]/).pop()
        : modelName;
      if (name && isShareSheetModelFile(name)) {
        setModelName(name);
        return name;
      }
    }

    const seq = ++modelLoadSeqRef.current;
    animatePanelLayout(200);
    setModelLoading(true);

    try {
      const validModels =
        availableModelsRef.current.length > 0
          ? availableModelsRef.current
          : await getAvailableModelsList();
      if (availableModelsRef.current.length === 0) {
        setAvailableModels(validModels);
      }
      if (validModels.length === 0) {
        showToast('No Quick actions models found. Open ofln and download a small pick.');
        animatePanelLayout(200);
        setModelLoading(false);
        return null;
      }

      let target = validModels.find((m) => m.fileName === modelName);
      if (!target) {
        const preferred = await getQuickActionsDefaultModel();
        target = pickOverlayModel(validModels, preferred) ?? validModels[0];
      }

      setModelName(target.fileName);
      const loadPromise = llamaProvider.loadModel({ modelPath: target.filePath });
      activeLoadPromiseRef.current = loadPromise;
      const ok = await loadPromise;

      if (modelLoadSeqRef.current !== seq) return null;
      activeLoadPromiseRef.current = null;
      animatePanelLayout(200);
      setModelLoading(false);

      if (ok) {
        setModelName(target.fileName);
        return target.fileName;
      } else {
        showToast('Failed to warm up local model.');
        return null;
      }
    } catch (e) {
      console.warn('[ShareOverlay] Model load failed', e);
      if (modelLoadSeqRef.current === seq) {
        activeLoadPromiseRef.current = null;
        animatePanelLayout(200);
        setModelLoading(false);
      }
      showToast('Model loading error.');
      return null;
    }
  };

  const handleToggleModelPicker = () => {
    animatePanelLayout(240);
    const nextOpen = !showModelPicker;
    setShowModelPicker(nextOpen);
    Animated.timing(pickerAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: 240,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();

    if (nextOpen && availableModels.length === 0) {
      getAvailableModelsList().then(setAvailableModels).catch(() => {});
    }
  };

  const handleSelectModel = async (item: { fileName: string; filePath: string }) => {
    animatePanelLayout(240);
    setShowModelPicker(false);
    Animated.timing(pickerAnim, {
      toValue: 0,
      duration: 200,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();

    if (item.fileName === modelName && llamaProvider.isReady()) {
      return;
    }
    if (isGenerating && abortRef.current) {
      abortRef.current();
    }

    const seq = ++modelLoadSeqRef.current;
    animatePanelLayout(200);
    setModelLoading(true);
    setModelName(item.fileName);

    try {
      const loadPromise = llamaProvider.loadModel({ modelPath: item.filePath });
      activeLoadPromiseRef.current = loadPromise;
      const ok = await loadPromise;

      if (modelLoadSeqRef.current !== seq) return;
      activeLoadPromiseRef.current = null;
      animatePanelLayout(200);
      setModelLoading(false);

      if (ok) {
        setModelName(item.fileName);
        showToast(`Switched to ${prettifyModelName(item.fileName)}`);
      } else {
        showToast('Failed to load model.');
      }
    } catch (err) {
      console.warn('[ShareOverlay] Error switching model', err);
      if (modelLoadSeqRef.current === seq) {
        activeLoadPromiseRef.current = null;
        animatePanelLayout(200);
        setModelLoading(false);
      }
      showToast('Model loading error.');
    }
  };

  const persistGeneratedToHistory = async (
    promptText: string,
    resultText: string,
    tpsValue?: number,
  ) => {
    const trimmed = resultText.trim();
    if (!trimmed) return;
    const userMsg: Message = {
      role: 'user',
      content: promptText,
      attachments:
        payload?.uris && payload.uris.length > 0
          ? [{ type: 'image', uri: payload.uris[0] }]
          : undefined,
    };
    const assistantMsg: Message = {
      role: 'assistant',
      content: trimmed,
      tokensPerSecond: tpsValue || undefined,
    };

    const updatedMessages = [...sessionMessagesRef.current, userMsg, assistantMsg];
    sessionMessagesRef.current = updatedMessages;

    try {
      const savedId = await chatHistoryService.saveChat(
        updatedMessages,
        savedChatIdRef.current || null,
      );
      savedChatIdRef.current = savedId;
    } catch (err) {
      console.warn('[ShareOverlay] Failed to save chat history', err);
    }
  };

  const executePrompt = async (action: ActionType, textOverride?: string) => {
    Keyboard.dismiss();
    const textToProcess = (textOverride !== undefined ? textOverride : extractedText).trim();
    if (!textToProcess) {
      showToast('No text available to process.');
      return;
    }

    if (isBareUrl(textToProcess)) {
      showToast('Cannot summarize a link without content. Please copy the article text directly.');
      return;
    }

    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }

    animatePanelLayout(260);
    setActiveAction(action);
    setStreamedText('');
    lastStreamedTextRef.current = '';
    setTps(null);
    setIsGenerating(true);
    Animated.timing(responseAnim, {
      toValue: 1,
      duration: 260,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();

    const loadedName = await ensureModelLoaded();
    if (!loadedName) {
      animatePanelLayout(240);
      setIsGenerating(false);
      return;
    }

    const fullPrompt = buildPromptText(action, textToProcess, customPrompt);
    const nativeContext = llamaProvider.getNativeContext();

    if (nativeContext) {
      // Primary: Native C++/llama.rn completion (exact engine used by main chat)
      const settings = await getModelSettings(loadedName).catch(() => DEFAULT_SETTINGS);
      const abortController = new AbortController();
      abortRef.current = () => {
        abortController.abort();
        if (typeof nativeContext.stopCompletion === 'function') {
          Promise.resolve(nativeContext.stopCompletion()).catch(() => {});
        }
      };

      try {
        await nativeCompletion(
          nativeContext,
          [
            {
              role: 'system',
              content: SHARE_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: fullPrompt,
            },
          ],
          loadedName,
          settings,
          {
            onToken: (token) => {
              lastStreamedTextRef.current = token;
              setStreamedText(token);
            },
            onFinish: async (res) => {
              setIsGenerating(false);
              if (res.tokensPerSecond) {
                setTps(res.tokensPerSecond);
              }
              const finalText = res.text || lastStreamedTextRef.current;
              await persistGeneratedToHistory(fullPrompt, finalText, res.tokensPerSecond);
            },
            onError: (err) => {
              console.warn('[ShareOverlay] Stream error', err);
              setIsGenerating(false);
              showToast('Generation interrupted.');
            },
          },
          abortController.signal,
        );
      } catch (err) {
        console.warn('[ShareOverlay] Native completion failed', err);
        setIsGenerating(false);
      }
    } else {
      // Fallback: streamChat with polyfilled TextDecoder
      try {
        const { result, abort } = streamChat(
          {
            messages: [
              {
                role: 'system',
                content: SHARE_SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: fullPrompt,
              },
            ],
            userInput: fullPrompt,
            modelName: loadedName,
            persona: null,
          },
          {
            onToken: (token) => {
              lastStreamedTextRef.current = token;
              setStreamedText(token);
            },
            onFinish: async (res) => {
              setIsGenerating(false);
              if (res.tokensPerSecond) {
                setTps(res.tokensPerSecond);
              }
              const finalText = res.text || lastStreamedTextRef.current;
              await persistGeneratedToHistory(fullPrompt, finalText, res.tokensPerSecond);
            },
            onError: (err) => {
              console.warn('[ShareOverlay] Stream error', err);
              setIsGenerating(false);
              showToast('Generation interrupted.');
            },
          },
        );

        abortRef.current = abort;
        await result;
      } catch (err) {
        console.warn('[ShareOverlay] Completion failed', err);
        setIsGenerating(false);
      }
    }
  };

  const handleCopy = () => {
    const target = streamedText || extractedText;
    if (!target) return;
    Clipboard.setString(target);
    showToast('Copied to clipboard');
  };

  const handleReplace = async () => {
    if (!streamedText) return;
    const ok = await returnProcessedText(streamedText);
    if (!ok) {
      showToast('Cannot replace text in this context');
    }
  };

  const handleOpenInApp = async () => {
    const prompt = buildPromptText(activeAction || 'summarize', extractedText, customPrompt);
    await openInFullApp(prompt, streamedText, savedChatIdRef.current || undefined);
  };

  return (
    <View style={styles.rootContainer} pointerEvents="box-none">
      {/* Background Dim Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleDismiss}
        />
      </Animated.View>

      {/* Floating Frosted Card (Floating above the system home bar) */}
      <Animated.View
        style={[
          styles.floatingPanel,
          {
            bottom: Math.max(SIDE_INSET, bottomClearance),
            opacity: opacityAnim,
            transform: [
              { translateY: translateYAnim },
              { scale: scaleAnim },
            ],
            borderColor: colors.border,
            backgroundColor: isDark ? 'rgba(24, 24, 24, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          },
        ]}
      >
        {/* Native blur layer */}
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <FrostedGlass variant="panel" style={StyleSheet.absoluteFillObject} />
        </View>

        {/* Card Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[
                styles.modelSelectorPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: showModelPicker ? colors.accent : colors.border,
                },
              ]}
              onPress={handleToggleModelPicker}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select AI Model"
            >
              <Ionicons
                name="cube-outline"
                size={14}
                color={colors.text}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.modelSelectorText, { color: colors.text }]}
                numberOfLines={1}
              >
                {modelName ? prettifyModelName(modelName) : 'Select Model'}
              </Text>
              <Animated.View
                style={{
                  marginLeft: 5,
                  transform: [
                    {
                      rotate: pickerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '180deg'],
                      }),
                    },
                  ],
                }}
              >
                <Ionicons
                  name="chevron-down"
                  size={13}
                  color={colors.textSecondary}
                />
              </Animated.View>
            </TouchableOpacity>

            {modelLoading && (
              <View
                style={[
                  styles.loadingPill,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ActivityIndicator
                  size="small"
                  color={colors.accent}
                  style={{ marginRight: 5, transform: [{ scale: 0.7 }] }}
                />
                <Text style={[styles.loadingPillText, { color: colors.textSecondary }]}>
                  Loading...
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
            accessibilityLabel="Close overlay"
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Model Picker Drawer/Dropdown (Subtle animated slide, scale & fade) */}
        {showModelPicker && (
          <Animated.View
            style={[
              styles.modelPickerCard,
              {
                backgroundColor: isDark ? 'rgba(32, 32, 32, 0.98)' : 'rgba(246, 246, 246, 0.98)',
                borderColor: colors.border,
                opacity: pickerAnim,
                transform: [
                  {
                    translateY: pickerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                  {
                    scale: pickerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.modelPickerHeader}>
              <Text style={[styles.modelPickerSectionTitle, { color: colors.textSecondary }]}>
                ACTIVE MODEL
              </Text>
              <Text style={[styles.modelPickerCount, { color: colors.textTertiary }]}>
                {availableModels.length} {availableModels.length === 1 ? 'model' : 'models'}
              </Text>
            </View>

            <ScrollView
              style={styles.modelPickerScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {availableModels.length === 0 ? (
                <View style={styles.emptyModelContainer}>
                  <Text style={[styles.emptyModelText, { color: colors.textSecondary }]}>
                    No Quick actions models found
                  </Text>
                  <Text style={[styles.emptyModelSubtext, { color: colors.textTertiary }]}>
                    Download a small 0.8B–2B pick in ofln → Models.
                  </Text>
                </View>
              ) : (
                availableModels.map((item) => {
                  const isSelected = item.fileName === modelName;
                  return (
                    <TouchableOpacity
                      key={item.filePath}
                      style={[
                        styles.modelPickerRow,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(255, 255, 255, 0.08)'
                              : 'rgba(0, 0, 0, 0.05)'
                            : 'transparent',
                        },
                      ]}
                      onPress={() => handleSelectModel(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modelPickerRowLeft}>
                        <Ionicons
                          name="cube-outline"
                          size={15}
                          color={isSelected ? colors.accent : colors.textSecondary}
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.modelPickerItemName,
                              {
                                color: isSelected ? colors.accent : colors.text,
                                fontWeight: isSelected ? '600' : '400',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {prettifyModelName(item.fileName)}
                          </Text>
                          <Text
                            style={[styles.modelPickerItemFile, { color: colors.textTertiary }]}
                            numberOfLines={1}
                          >
                            {item.fileName}
                          </Text>
                        </View>
                      </View>
                      {isSelected && (
                        modelLoading ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : (
                          <Ionicons name="checkmark" size={16} color={colors.accent} />
                        )
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        )}

        {/* Scrollable Content Body */}
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Loading Indicator for incoming shared intent */}
          {contentLoading && (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={[styles.loadingHint, { color: colors.textSecondary }]}>Loading shared data...</Text>
            </View>
          )}

          {/* Source Quote Box */}
          {!contentLoading && (
            <View style={[styles.sourceQuoteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Photo Preview & OCR status */}
              {payload?.uris && payload.uris.length > 0 && (
                <View style={styles.imageThumbContainer}>
                  <Image source={{ uri: payload.uris[0] }} style={styles.imageThumbnail} resizeMode="cover" />
                  {ocrRunning ? (
                    <View style={styles.ocrStatusRow}>
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.ocrStatusText, { color: colors.textSecondary }]}>
                        Reading text on-device...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.ocrStatusRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.accent} style={{ marginRight: 4 }} />
                      <Text style={[styles.ocrStatusText, { color: colors.textSecondary }]}>
                        {extractedText ? 'Text extracted via ML Kit' : 'No legible text found'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Web Link Preview & Web Fetch status */}
              {(payload?.type === 'link' || payload?.url || (payload?.text && extractUrlFromText(payload.text))) && (
                <View style={{ marginBottom: 6 }}>
                  <View style={styles.linkPreviewRow}>
                    <Ionicons name="globe-outline" size={14} color={colors.accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.linkPreviewText, { color: colors.text }]} numberOfLines={1}>
                      {payload.url || (payload.text ? extractUrlFromText(payload.text) : '')}
                    </Text>
                  </View>
                  {webFetching ? (
                    <View style={styles.ocrStatusRow}>
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.ocrStatusText, { color: colors.textSecondary }]}>
                        Extracting webpage content...
                      </Text>
                    </View>
                  ) : webFetchError ? (
                    <View style={styles.ocrStatusRow}>
                      <Ionicons name="alert-circle-outline" size={13} color={colors.textTertiary} style={{ marginRight: 4 }} />
                      <Text style={[styles.ocrStatusText, { color: colors.textTertiary }]}>
                        {webFetchError}
                      </Text>
                    </View>
                  ) : extractedText && !isBareUrl(extractedText) ? (
                    <View style={styles.ocrStatusRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.accent} style={{ marginRight: 4 }} />
                      <Text style={[styles.ocrStatusText, { color: colors.textSecondary }]}>
                        Webpage content ready
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Extracted text snippet */}
              {extractedText ? (
                <View>
                  <Text
                    style={[styles.sourceSnippetText, { color: colors.text }]}
                    numberOfLines={isExpandedPreview ? undefined : 3}
                  >
                    {extractedText}
                  </Text>
                  {extractedText.length > 130 && (
                    <TouchableOpacity
                      onPress={() => {
                        animatePanelLayout();
                        setIsExpandedPreview(!isExpandedPreview);
                      }}
                      style={styles.expandToggle}
                    >
                      <Text style={[styles.expandToggleText, { color: colors.textTertiary }]}>
                        {isExpandedPreview ? 'Show less' : `Show all (${extractedText.length} chars)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : !ocrRunning ? (
                <Text style={[styles.emptyPreviewText, { color: colors.textTertiary }]}>No text content</Text>
              ) : null}
            </View>
          )}

          {/* Quick Action Pills (Clean monochrome line icons, no emojis) */}
          <View style={styles.actionPillsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScrollInner}>
              {ACTION_PILLS.map((pill) => {
                const isActive = activeAction === pill.id;
                const isPillDisabled = isGenerating || ocrRunning || webFetching;

                return (
                  <TouchableOpacity
                    key={pill.id}
                    style={[
                      styles.actionCapsule,
                      {
                        backgroundColor: isActive ? colors.surface : colors.card,
                        borderColor: isActive ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (pill.id === 'custom') {
                        animatePanelLayout(240);
                        const nextCustom = !showCustomInput;
                        setShowCustomInput(nextCustom);
                        Animated.timing(customInputAnim, {
                          toValue: nextCustom ? 1 : 0,
                          duration: 220,
                          easing: EASING.STANDARD,
                          useNativeDriver: true,
                        }).start();
                      } else {
                        if (showCustomInput) {
                          animatePanelLayout(240);
                          setShowCustomInput(false);
                          Animated.timing(customInputAnim, {
                            toValue: 0,
                            duration: 180,
                            easing: EASING.STANDARD,
                            useNativeDriver: true,
                          }).start();
                        }
                        executePrompt(pill.id);
                      }
                    }}
                    disabled={isPillDisabled}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={pill.icon}
                      size={13}
                      color={isActive ? colors.accent : colors.text}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.actionCapsuleText,
                        { color: isActive ? colors.accent : colors.text },
                      ]}
                    >
                      {pill.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Inline Ask Input (Subtle animated slide, scale & fade) */}
          {showCustomInput && (
            <Animated.View
              style={[
                styles.customInputContainer,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: customInputAnim,
                  transform: [
                    {
                      translateY: customInputAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                    {
                      scale: customInputAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.985, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TextInput
                style={[styles.customInputField, { color: colors.text }]}
                placeholder="Ask anything about this text..."
                placeholderTextColor={colors.textTertiary}
                value={customPrompt}
                onChangeText={setCustomPrompt}
                onSubmitEditing={() => executePrompt('custom')}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.customSubmitButton, { backgroundColor: colors.primary }]}
                onPress={() => executePrompt('custom')}
                disabled={!customPrompt.trim() || isGenerating}
              >
                <Ionicons name="arrow-up" size={16} color={colors.primaryText} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Streaming Result Container (Subtle animated rise, scale & fade) */}
          {hasResponse && (
            <Animated.View
              style={[
                styles.resultCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: responseAnim,
                  transform: [
                    {
                      translateY: responseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0],
                      }),
                    },
                    {
                      scale: responseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.985, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.resultHeader}>
                <View style={styles.resultHeaderLeft}>
                  {isGenerating ? (
                    <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="sparkles" size={13} color={colors.accent} style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.resultActionLabel, { color: colors.textSecondary }]}>
                    {activeAction ? activeAction.replace('_', ' ').toUpperCase() : 'RESULT'}
                  </Text>
                </View>

                {tps !== null && !isGenerating && (
                  <Text style={[styles.tpsBadge, { color: colors.textTertiary }]}>{tps.toFixed(1)} t/s</Text>
                )}
              </View>

              <MessageMarkdown
                content={streamedText || (modelLoading ? 'Warming up model...' : 'Thinking...')}
                color={colors.text}
                fontSize={14}
                lineHeight={21}
              />
            </Animated.View>
          )}
        </ScrollView>

        {/* Toast Overlay (Subtle animated drop & fade) */}
        {toastMounted && (
          <Animated.View
            style={[
              styles.toastPill,
              {
                backgroundColor: colors.text,
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                  {
                    scale: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={[styles.toastLabel, { color: colors.background }]}>{toastMessage}</Text>
          </Animated.View>
        )}

        {/* Bottom Action Row (Clear hierarchy & ample padding above navigation) */}
        <View style={[styles.actionFooter, { borderTopColor: colors.border }]}>
          {/* Copy Button */}
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleCopy}
            disabled={!streamedText && !extractedText}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={15} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Copy</Text>
          </TouchableOpacity>

          {/* Replace Button (For editable PROCESS_TEXT) */}
          {payload?.action === 'PROCESS_TEXT' && payload.isReadOnly === false && (
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.accent }]}
              onPress={handleReplace}
              disabled={!streamedText || isGenerating}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={15} color={colors.accent} style={{ marginRight: 6 }} />
              <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>Replace</Text>
            </TouchableOpacity>
          )}

          {/* Open in ofln CTA */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleOpenInApp}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.primaryText} style={{ marginRight: 6 }} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Open in ofln</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

export function ShareOverlay() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ShareOverlayContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  floatingPanel: {
    position: 'absolute',
    left: SIDE_INSET,
    right: SIDE_INSET,
    maxHeight: SCREEN_HEIGHT * 0.82,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modelSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '72%',
    flexShrink: 1,
  },
  modelSelectorText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
  },
  loadingPillText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  modelPickerCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxHeight: 200,
  },
  modelPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  modelPickerSectionTitle: {
    fontSize: 10.5,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modelPickerCount: {
    fontSize: 10.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  modelPickerScroll: {
    maxHeight: 150,
    marginTop: 4,
  },
  modelPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  modelPickerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  modelPickerItemName: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
  },
  modelPickerItemFile: {
    fontSize: 10,
    fontFamily: 'Poppins',
  },
  emptyModelContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyModelText: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  emptyModelSubtext: {
    fontSize: 11,
    fontFamily: 'Poppins',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentScroll: {
    maxHeight: SCREEN_HEIGHT * 0.58,
    paddingHorizontal: 14,
  },
  contentScrollInner: {
    paddingBottom: 10,
  },
  centerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingHint: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
    marginTop: 6,
  },
  sourceQuoteCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    borderLeftColor: '#E5A93C', // warm lava gold accent hairline
    padding: 12,
    marginBottom: 10,
  },
  imageThumbContainer: {
    marginBottom: 8,
  },
  imageThumbnail: {
    width: '100%',
    height: 110,
    borderRadius: 8,
    marginBottom: 6,
  },
  ocrStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ocrStatusText: {
    fontSize: 11.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  linkPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  linkPreviewText: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
    flex: 1,
  },
  sourceSnippetText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    lineHeight: 18.5,
  },
  emptyPreviewText: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
    fontStyle: 'italic',
  },
  expandToggle: {
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 11.5,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  actionPillsRow: {
    marginBottom: 10,
  },
  pillsScrollInner: {
    gap: 7,
  },
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionCapsuleText: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 48,
    marginBottom: 10,
  },
  customInputField: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Poppins',
    paddingVertical: 6,
  },
  customSubmitButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  resultCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
    minHeight: 100,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  resultHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultActionLabel: {
    fontSize: 10.5,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  tpsBadge: {
    fontSize: 10.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  toastPill: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    elevation: 8,
  },
  toastLabel: {
    fontSize: 11.5,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  actionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  secondaryButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 12.5,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
});
