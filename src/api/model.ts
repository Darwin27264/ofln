import RNFS from "react-native-fs";

// Track active downloads for cancellation
interface DownloadInfo {
  cancelled: boolean;
  jobId: number;
  destPath: string;
}

const activeDownloads = new Map<string, DownloadInfo>();

export interface DownloadCancellationToken {
  cancel: () => Promise<void>;
  isCancelled: () => boolean;
}

export const downloadModel = async (
  modelName: string,
  modelUrl: string,
  onProgress: (progress: number) => void,
  cancellationToken?: DownloadCancellationToken
): Promise<string> => {
  // Ensure the model name has the correct extension.
  if (!modelName.toLowerCase().endsWith('.gguf')) {
    modelName = modelName + '.gguf';
  }

  const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
  const downloadKey = modelName; // Use model name as key
  
  try {
    // Check if already cancelled before starting
    if (cancellationToken?.isCancelled()) {
      throw new Error("Download was cancelled");
    }

    const fileExists = await RNFS.exists(destPath);

    // If it exists, delete it
    if (fileExists) {
      await RNFS.unlink(destPath);
      console.log(`Deleted existing file at ${destPath}`);
    }
    
    console.log("Starting download:", modelUrl);

    // Create download job
    const downloadJob = RNFS.downloadFile({
      fromUrl: modelUrl,
      toFile: destPath,
      progressDivider: 5,
      begin: (res) => {
        console.log("Download started, jobId:", res.jobId);
        // Store download info for cancellation
        activeDownloads.set(downloadKey, {
          cancelled: false,
          jobId: res.jobId,
          destPath: destPath,
        });
      },
      progress: ({ bytesWritten, contentLength }: { bytesWritten: number; contentLength: number }) => {
        // Check if download was cancelled
        const downloadInfo = activeDownloads.get(downloadKey);
        if (downloadInfo?.cancelled || cancellationToken?.isCancelled()) {
          console.log("Download progress callback ignored - download cancelled");
          return;
        }
        
        const progress = (bytesWritten / contentLength) * 100;
        console.log(`Download progress: ${Math.floor(progress)}%`);
        onProgress(Math.floor(progress));
      },
    });

    // Wait for download to complete
    // Use Promise.race to handle cancellation during download
    let downloadResult: RNFS.DownloadResult;
    try {
      downloadResult = await downloadJob.promise;
    } catch (downloadError) {
      // Check if cancelled during download
      const downloadInfo = activeDownloads.get(downloadKey);
      if (downloadInfo?.cancelled || cancellationToken?.isCancelled()) {
        // Clean up partial file
        try {
          const fileExists = await RNFS.exists(destPath);
          if (fileExists) {
            await RNFS.unlink(destPath);
            console.log(`Deleted partial file after cancellation error: ${destPath}`);
          }
        } catch (unlinkError) {
          console.warn("Failed to delete partial file after cancellation error:", unlinkError);
        }
        activeDownloads.delete(downloadKey);
        throw new Error("Download was cancelled");
      }
      throw downloadError; // Re-throw if not a cancellation
    }
    
    // Check if cancelled after promise resolves (race condition protection)
    const downloadInfo = activeDownloads.get(downloadKey);
    if (downloadInfo?.cancelled || cancellationToken?.isCancelled()) {
      // Clean up partial file if download was cancelled
      try {
        const fileExists = await RNFS.exists(destPath);
        if (fileExists) {
          await RNFS.unlink(destPath);
          console.log(`Deleted partial file after cancellation: ${destPath}`);
        }
      } catch (unlinkError) {
        console.warn("Failed to delete partial file after cancellation:", unlinkError);
      }
      activeDownloads.delete(downloadKey);
      throw new Error("Download was cancelled");
    }
    
    console.log("Download completed, statusCode:", downloadResult.statusCode);
    
    // Clean up
    activeDownloads.delete(downloadKey);
    
    if (downloadResult.statusCode === 200) {
      return destPath;
    } else {
      throw new Error(`Download failed with status code: ${downloadResult.statusCode}`);
    }
  } catch (error) {
    // Clean up on error
    const downloadInfo = activeDownloads.get(downloadKey);
    if (downloadInfo) {
      activeDownloads.delete(downloadKey);
    }
    
    // Check if it's a cancellation error
    if (error instanceof Error && error.message === "Download was cancelled") {
      throw error; // Re-throw cancellation errors
    }
    
    // Delete partial file on error (unless it was a cancellation)
    if (!downloadInfo?.cancelled && !cancellationToken?.isCancelled()) {
      try {
        const fileExists = await RNFS.exists(destPath);
        if (fileExists) {
          await RNFS.unlink(destPath);
          console.log(`Deleted partial file after error: ${destPath}`);
        }
      } catch (unlinkError) {
        console.warn("Failed to delete partial file after error:", unlinkError);
      }
    }
    
    if (error instanceof Error) {
      throw new Error(`Failed to download model: ${error.message}`);
    } else {
      throw new Error("Failed to download model: Unknown error");
    }
  }
};

// Create a cancellation token for a download
export const createCancellationToken = (modelName: string): DownloadCancellationToken => {
  const downloadKey = modelName.toLowerCase().endsWith('.gguf') ? modelName : `${modelName}.gguf`;
  let cancelled = false;

  return {
    cancel: async () => {
      if (cancelled) {
        return; // Already cancelled
      }
      
      cancelled = true;
      const downloadInfo = activeDownloads.get(downloadKey);
      
      if (downloadInfo && !downloadInfo.cancelled) {
        console.log(`Cancelling download jobId: ${downloadInfo.jobId}`);
        downloadInfo.cancelled = true;
        
        try {
          // Try to stop the download using RNFS
          // Note: stopDownload might not be available in all versions, so we wrap in try-catch
          if (RNFS.stopDownload && typeof RNFS.stopDownload === 'function') {
            await RNFS.stopDownload(downloadInfo.jobId);
            console.log(`Download stopped successfully: ${downloadInfo.jobId}`);
          } else {
            // If stopDownload is not available, we still mark as cancelled
            // The progress callbacks will be ignored, and the file will be deleted
            console.log(`stopDownload not available, marking download as cancelled: ${downloadInfo.jobId}`);
          }
        } catch (stopError: any) {
          // stopDownload might not exist or might fail - that's okay
          // We'll still mark as cancelled and clean up
          console.log(`Could not stop download (this is okay): ${stopError?.message || 'stopDownload not available'}`);
        }
        
        // Delete partial file
        try {
          const fileExists = await RNFS.exists(downloadInfo.destPath);
          if (fileExists) {
            await RNFS.unlink(downloadInfo.destPath);
            console.log(`Deleted partial file: ${downloadInfo.destPath}`);
          }
        } catch (unlinkError) {
          console.warn("Failed to delete partial file:", unlinkError);
        }
        
        // Clean up
        activeDownloads.delete(downloadKey);
      }
    },
    isCancelled: () => cancelled,
  };
};
