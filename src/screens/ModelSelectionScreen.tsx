// ModelSelectionScreen.tsx

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
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
} from "react-native";
import RNFS from "react-native-fs";
import axios from "axios";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { styles } from "../styles/styles";

// Helper function to prettify the model file name
function prettifyModelName(fileName: string): string {
  // Remove extension (e.g., ".gguf") and replace hyphens with spaces
  let cleaned = fileName.replace(/\.[^.]+$/, "");
  cleaned = cleaned.replace(/-/g, " ");
  return cleaned.trim();
}

export default function ModelSelectionScreen(props) {
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
  } = props;

  // New state for model loading
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadingModelFile, setLoadingModelFile] = useState(null);

  const [isPanelOpen, setIsPanelOpen] = useState(false);

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
            await handleDownloadModel(file);
            setCurrentPage("conversation");
          },
        },
      ],
      { cancelable: false }
    );
  }

  return (
    <View style={[styles.container, { padding: 20, flex: 1 }]}>
      {/* Title changed to "Models" */}
      <Text style={styles.settingsTitle}>Models</Text>

      {/* Display the currently selected model in the top right as a minimal indicator
          with a green dot and the prettified model text (multiline) */}
      <View
        style={{
          position: "absolute",
          top: 32,
          right: 20,
          flexDirection: "row",
          alignItems: "center",
          maxWidth: screenWidth * 0.2,
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
            color: "#000",
            fontFamily: "Poppins",
            textAlign: "left",
            flexWrap: "wrap",
          }}
          // Allow wrapping to multiple lines without splitting words
          numberOfLines={0}
        >
          {selectedGGUF ? prettifyModelName(selectedGGUF) : "No model selected"}
        </Text>
      </View>

      {/* Updated grid container with explicit row layout */}
      <View
        style={[
          styles.modelFormatGrid,
          {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            marginTop: 20,
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
                height: boxWidth,
                borderWidth: 0,
                borderColor: "transparent",
                borderRadius: 24,
                padding: 20,
                marginBottom: 10,
              },
            ]}
            onPress={() => handleFormatSelection(format.label)}
          >
            <Text
              style={[
                styles.modelFormatBoxText,
                { flexWrap: "wrap", textAlign: "center" },
              ]}
            >
              {format.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* The slide-out panel */}
      {isPanelOpen && (
        <Pressable
          onPress={closePanel}
          style={[
            styles.overlay,
            {
              backgroundColor: "rgba(0, 0, 0, 0.1)",
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
              {isFetching && <ActivityIndicator size="small" color="#2563EB" />}

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
                      onPress={() =>
                        isDownloaded
                          ? (() => {
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
                          {isDownloaded ? (
                            <View style={styles.downloadedIndicator}>
                              <Icon
                                name="check-circle"
                                size={20}
                                color="#2563EB"
                              />
                            </View>
                          ) : (
                            <View style={styles.notDownloadedIndicator}>
                              <Icon
                                name="hourglass-empty"
                                size={20}
                                color="#2563EB"
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.buttonTextGGUF,
                              selectedGGUF === file && styles.selectedButtonText,
                              isDownloaded && styles.downloadedText,
                              { flexWrap: "wrap", textAlign: "center" },
                            ]}
                          >
                            {file.split("-").pop()}
                          </Text>
                        </View>
                        {isDownloaded ? (
                          isLoadingModel && loadingModelFile === file ? (
                            <ActivityIndicator size="small" color="#2563EB" />
                          ) : (
                            <Icon
                              name="play-circle-outline"
                              size={24}
                              color="#2563EB"
                            />
                          )
                        ) : (
                          <Icon
                            name="file-download"
                            size={24}
                            color="#2563EB"
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
            backgroundColor: "#000000",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
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
