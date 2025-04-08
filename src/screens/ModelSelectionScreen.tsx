/* ModelSelectionScreen.tsx */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { styles } from "../styles/styles";

import ProgressBar from "../components/ProgressBar";
import axios from "axios";
import RNFS from "react-native-fs";

interface Props {
  modelFormats: { label: string }[];
  selectedModelFormat: string;
  setSelectedModelFormat: (format: string) => void;
  availableGGUFs: string[];
  setAvailableGGUFs: (files: string[]) => void;
  selectedGGUF: string | null;
  setSelectedGGUF: (file: string | null) => void;
  isFetching: boolean;
  setIsFetching: (val: boolean) => void;
  downloadedModels: string[];
  handleDownloadModel: (file: string) => Promise<void>;
  loadModel: (
    filePath: string,
    context: any,
    setContext: React.Dispatch<React.SetStateAction<any>>
  ) => Promise<boolean>;
  context: any;
  setContext: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<"modelSelection" | "conversation">>;
  HF_TO_GGUF: Record<string, string>;
}

export default function ModelSelectionScreen({
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
}: Props) {
  const handleFormatSelection = (format: string) => {
    setSelectedModelFormat(format);
    setAvailableGGUFs([]);
    fetchAvailableGGUFs(format);
  };

  const fetchAvailableGGUFs = async (modelFormat: string) => {
    setIsFetching(true);
    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]}`
      );
      const files = response.data.siblings.filter((file: any) =>
        file.rfilename.endsWith(".gguf")
      );
      setAvailableGGUFs(files.map((file: any) => file.rfilename));
    } catch (error) {
      Alert.alert("Error", "Failed to fetch .gguf files from Hugging Face API.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleGGUFSelection = (file: string) => {
    setSelectedGGUF(file);
    Alert.alert(
      "Confirm Download",
      `Do you want to download ${file} ?`,
      [
        {
          text: "No",
          onPress: () => setSelectedGGUF(null),
          style: "cancel",
        },
        { text: "Yes", onPress: () => handleDownloadAndNavigate(file) },
      ],
      { cancelable: false }
    );
  };

  const handleDownloadAndNavigate = async (file: string) => {
    await handleDownloadModel(file);
    setCurrentPage("conversation");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Choose a model format</Text>
      {modelFormats.map((format) => (
        <TouchableOpacity
          key={format.label}
          style={[
            styles.button,
            selectedModelFormat === format.label && styles.selectedButton,
          ]}
          onPress={() => handleFormatSelection(format.label)}
        >
          <Text style={styles.buttonText}>{format.label}</Text>
        </TouchableOpacity>
      ))}
      {selectedModelFormat && (
        <View>
          <Text style={styles.subtitle}>Select a .gguf file</Text>
          {isFetching && <ActivityIndicator size="small" color="#2563EB" />}
          {availableGGUFs.map((file, index) => {
            const isDownloaded = downloadedModels.includes(file);
            return (
              <View key={index} style={styles.modelContainer}>
                <TouchableOpacity
                  style={[
                    styles.modelButton,
                    selectedGGUF === file && styles.selectedButton,
                    isDownloaded && styles.downloadedModelButton,
                  ]}
                  onPress={() =>
                    isDownloaded
                      ? (loadModel(
                          `${RNFS.DocumentDirectoryPath}/${file}`,
                          context,
                          setContext
                        ).then((success) => {
                          if (success) setCurrentPage("conversation");
                          setSelectedGGUF(file);
                        }))
                      : handleGGUFSelection(file)
                  }
                >
                  <View style={styles.modelButtonContent}>
                    <View style={styles.modelStatusContainer}>
                      {isDownloaded ? (
                        <View style={styles.downloadedIndicator}>
                          <Text style={styles.downloadedIcon}>▼</Text>
                        </View>
                      ) : (
                        <View style={styles.notDownloadedIndicator}>
                          <Text style={styles.notDownloadedIcon}>▽</Text>
                        </View>
                      )}
                      <Text
                        style={[
                          styles.buttonTextGGUF,
                          selectedGGUF === file && styles.selectedButtonText,
                          isDownloaded && styles.downloadedText,
                        ]}
                      >
                        {file.split("-")[-1] == "imat"
                          ? file
                          : file.split("-").pop()}
                      </Text>
                    </View>
                    {isDownloaded && (
                      <View style={styles.loadModelIndicator}>
                        <Text style={styles.loadModelText}>TAP TO LOAD →</Text>
                      </View>
                    )}
                    {!isDownloaded && (
                      <View style={styles.downloadIndicator}>
                        <Text style={styles.downloadText}>DOWNLOAD →</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
