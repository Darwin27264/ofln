// ModelSelectionScreen.tsx

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
  Pressable,
  BackHandler,
  Easing,
  ScrollView,
} from "react-native";
import RNFS from "react-native-fs";
import axios from "axios";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import ProgressBar from "../components/ProgressBar";

interface ModelFormat {
  label: string;
}

interface ModelSelectionScreenProps {
  modelFormats: ModelFormat[];
  selectedModelFormat: string;
  setSelectedModelFormat: (format: string) => void;
  availableGGUFs: string[];
  setAvailableGGUFs: (ggufs: string[]) => void;
  selectedGGUF: string | null;
  setSelectedGGUF: (gguf: string | null) => void;
  isFetching: boolean;
  setIsFetching: (fetching: boolean) => void;
  downloadedModels: string[];
  handleDownloadModel: (file: string, onProgress: (progress: number) => void) => Promise<void>;
  loadModel: (path: string, context: any, setContext: (context: any) => void) => Promise<boolean>;
  context: any;
  setContext: (context: any) => void;
  setCurrentPage: (page: "modelSelection" | "conversation" | "settings" | "stages") => void;
  HF_TO_GGUF: { [key: string]: string };
  checkDownloadedModels: () => Promise<void>;
}

// Helper function to prettify the model file name
function prettifyModelName(fileName: string): string {
  // Remove extension (e.g., ".gguf") and replace hyphens with spaces
  let cleaned = fileName.replace(/\.[^.]+$/, "");
  cleaned = cleaned.replace(/-/g, " ");
  return cleaned.trim();
}

export default function ModelSelectionScreen(props: ModelSelectionScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  
  const {
    modelFormats,
    selectedModelFormat,
    setSelectedModelFormat,
    availableGGUFs,
    setAvailableGGUFs,
    selectedGGUF,
    setSelectedGGUF,
    isFetching,
    setIsFetching,
    downloadedModels,
    handleDownloadModel,
    loadModel,
    context,
    setContext,
    setCurrentPage,
    HF_TO_GGUF,
    checkDownloadedModels,
  } = props;

  // State declarations
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [downloadCancellationTokens, setDownloadCancellationTokens] = useState<{ [key: string]: () => void }>({});

  const handleCancelDownload = (file: string) => {
    const cancelDownload = downloadCancellationTokens[file];
    if (cancelDownload) {
      cancelDownload();
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file];
        return newProgress;
      });
      setDownloadCancellationTokens(prev => {
        const newTokens = { ...prev };
        delete newTokens[file];
        return newTokens;
      });
      setSelectedGGUF(null);
    }
  };

  const handleDeleteModel = async (file: string) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete ${file}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const filePath = `${RNFS.DocumentDirectoryPath}/${file}`;
              if (selectedGGUF === file) {
                setSelectedGGUF(null);
              }
              await RNFS.unlink(filePath);
              await checkDownloadedModels(); // Refresh the list
            } catch (error) {
              console.error('Error deleting model:', error);
              Alert.alert("Error", "Failed to delete the model file.");
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  // For the bottom sheet
  const screenHeight = Dimensions.get("window").height;
  const screenWidth = Dimensions.get("window").width;
  // Calculate available width for two boxes:
  // Container has horizontal padding 20 on each side = 40 total.
  // Also leave a gap between boxes (10).
  const boxWidth = (screenWidth - 40 - 10) / 2;
  const panelHeight = screenHeight * 0.6; // 60% screen
  const animatedValue = useRef(new Animated.Value(0)).current; // 0 => closed, 1 => open

  // Overlay's opacity interpolates from 0..1 => 0..0.1 alpha
  const overlayOpacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.1],
  });

  // PanResponder for drag-down close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const { dy } = gestureState;
        if (dy > 0) {
          animatedValue.setValue(1 - dy / panelHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy } = gestureState;
        // Close if dragged >30% of panel
        if (dy > panelHeight * 0.3) {
          closePanel();
        } else {
          Animated.spring(animatedValue, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
            tension: 40,
          }).start();
        }
      },
    })
  ).current;

  // Android hardware back handling
  const handleBackPress = useCallback(() => {
    if (isPanelOpen) {
      closePanel();
      return true;
    }
    return false;
  }, [isPanelOpen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => subscription.remove();
  }, [handleBackPress]);

  function openPanel() {
    setIsPanelOpen(true);
    Animated.spring(animatedValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }

  function closePanel() {
    // We do a relatively quick "timing" on close so the overlay doesn't linger
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 200, // short close
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    }).start(() => {
      setIsPanelOpen(false);
    });
  }

  // Fetch .gguf on selecting format
  async function handleFormatSelection(format: string) {
    setSelectedModelFormat(format);
    setAvailableGGUFs([]);
    setIsFetching(true);

    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${HF_TO_GGUF[format]}`
      );
      const files = response.data.siblings.filter((f: any) =>
        f.rfilename.endsWith(".gguf")
      );
      setAvailableGGUFs(files.map((f: any) => f.rfilename));
    } catch {
      Alert.alert("Error", "Failed to fetch .gguf files from Hugging Face API.");
    } finally {
      setIsFetching(false);
    }

    openPanel();
  }

  function handleGGUFSelection(file: string) {
    setSelectedGGUF(file);
    Alert.alert(
      "Confirm Download",
      `Do you want to download ${file}?`,
      [
        {
          text: "No",
          style: "cancel",
          onPress: () => setSelectedGGUF(null),
        },
        {
          text: "Yes",
          onPress: async () => {
            try {
              console.log(`Starting download for ${file}`);
              setDownloadProgress(prev => ({ ...prev, [file]: 0 }));
              
              // Create an AbortController for this download
              const controller = new AbortController();
              setDownloadCancellationTokens(prev => ({
                ...prev,
                [file]: () => controller.abort()
              }));

              await handleDownloadModel(file, (progress) => {
                console.log(`Download progress for ${file}: ${progress}%`);
                setDownloadProgress(prev => ({ ...prev, [file]: progress }));
              });

              // Clean up cancellation token after successful download
              setDownloadCancellationTokens(prev => {
                const newTokens = { ...prev };
                delete newTokens[file];
                return newTokens;
              });
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                console.log(`Download cancelled for ${file}`);
              } else {
                setSelectedGGUF(null); // Reset selection on error
                setDownloadProgress(prev => {
                  const newProgress = { ...prev };
                  delete newProgress[file];
                  return newProgress;
                });
              }
            }
          },
        },
      ],
      { cancelable: false }
    );
  }

  return (
    <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background }]}>
      {/* Header container with fixed position */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: theme.colors.background,
        zIndex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 0,
      }}>
        <Text style={styles.settingsTitle}>Models</Text>

        {/* Selected model indicator */}
        <View
          style={{
            position: "absolute",
            top: 32,
            right: 40, // Increased to match the model grid's right padding
            flexDirection: "row",
            alignItems: "center",
            maxWidth: screenWidth * 0.3,
          }}
        >
          {selectedGGUF && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "green",
                marginRight: 10,
              }}
            />
          )}
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.text,
              fontFamily: "Poppins",
              textAlign: "left",
              flexWrap: "wrap",
            }}
            numberOfLines={0}
          >
            {selectedGGUF ? prettifyModelName(selectedGGUF) : "No model selected"}
          </Text>
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView 
        style={{ 
          marginTop: 55, // Adjusted space for header
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Grid container */}
        <View
          style={[
            styles.modelFormatGrid,
            {
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              paddingBottom: 80, // Space for back button
            },
          ]}
        >
          {modelFormats.map((format, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.modelFormatBox,
                {
                  width: boxWidth,
                  height: boxWidth * 0.7, // Reduced height
                  borderRadius: 20,
                  padding: 15,
                  marginBottom: 10,
                },
              ]}
              onPress={() => handleFormatSelection(format.label)}
            >
              <Animated.Text
                style={[
                  styles.modelFormatBoxText,
                  { 
                    flexWrap: "wrap", 
                    textAlign: "center",
                    fontSize: 14, // Slightly smaller text
                  },
                ]}
              >
                {format.label}
              </Animated.Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* The slide-out panel */}
      {isPanelOpen && (
        <Pressable
          onPress={closePanel}
          style={[
            styles.overlay,
            {
              backgroundColor: theme.colors.overlay,
            },
          ]}
        >
          <Animated.View
            style={{
              flex: 1,
              opacity: overlayOpacity,
            }}
          />
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.bottomSheetContainer,
              {
                transform: [
                  {
                    translateY: animatedValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [panelHeight, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={styles.bottomSheetInner}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.bottomSheetTitle}>Avaliable GGUF Files</Text>
              {isFetching && <ActivityIndicator size="small" color={theme.colors.accent} />}

              <Animated.ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
              >
                {availableGGUFs.map((file, index) => {
                  const isDownloaded = downloadedModels.includes(file);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.modelButton,
                        selectedGGUF === file && styles.selectedButton,
                        isDownloaded && styles.downloadedModelButton,
                        { marginVertical: 6 },
                      ]}
                      onPress={(e) =>
                        isDownloaded
                          ? (() => {
                              // Don't trigger model loading if clicking delete button
                              const target = e.target as any;
                              if (target && target.props && target.props.name === "delete") {
                                return;
                              }
                              setIsLoadingModel(true);
                              setLoadingModelFile(file);
                              loadModel(
                                `${RNFS.DocumentDirectoryPath}/${file}`,
                                context,
                                setContext
                              ).then((success) => {
                                setIsLoadingModel(false);
                                setLoadingModelFile(null);
                                if (success) setCurrentPage("conversation");
                                setSelectedGGUF(file);
                              });
                            })()
                          : handleGGUFSelection(file)
                      }
                    >
                      <View style={styles.modelButtonContent}>
                        <View style={styles.modelStatusContainer}>
                          {isDownloaded && (
                            <View style={styles.downloadedIndicator}>
                              <Icon
                                name="check-circle"
                                size={20}
                                color={theme.colors.accent}
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.buttonTextGGUF,
                              selectedGGUF === file && styles.selectedButtonText,
                              isDownloaded && styles.downloadedText,
                              { flexWrap: "wrap", textAlign: "left", flex: 1 },
                            ]}
                          >
                            {file.split("-").pop()}
                          </Text>
                        </View>
                        {isDownloaded ? (
                          <View style={styles.modelActions}>
                            <TouchableOpacity
                              onPress={() => handleDeleteModel(file)}
                              style={styles.deleteButton}
                            >
                              <Icon
                                name="delete"
                                size={22}
                                color={theme.colors.error}
                              />
                            </TouchableOpacity>
                              {isLoadingModel && loadingModelFile === file ? (
                              <ActivityIndicator size="small" color={theme.colors.accent} />
                            ) : (
                              <Icon
                                name="play-circle-outline"
                                size={24}
                                color={theme.colors.accent}
                              />
                            )}
                          </View>
                        ) : downloadProgress[file] !== undefined ? (
                          <View style={styles.downloadProgressContainer}>
                            <View style={{ width: 100 }}>
                              <ProgressBar progress={downloadProgress[file]} />
                            </View>
                            <TouchableOpacity
                              onPress={() => handleCancelDownload(file)}
                              style={styles.cancelButton}
                            >
                              <Icon
                                name="cancel"
                                size={20}
                                color={theme.colors.error}
                              />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Icon
                            name="file-download"
                            size={24}
                            color={theme.colors.accent}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </Animated.ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* Back button: Black pill at bottom left that goes back to Settings */}
      <View style={{ position: "absolute", bottom: 20, left: 15 }}>
        <TouchableOpacity
          onPress={() => setCurrentPage("settings")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 20,
              fontFamily: "Poppins",
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
