import RNFS from "react-native-fs";

export const downloadModel = async (
  modelName: string,
  modelUrl: string,
  onProgress: (progress: number) => void
): Promise<string> => {
  const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
  try {
    const fileExists = await RNFS.exists(destPath);

    // If it exists, delete it
    if (fileExists) {
      await RNFS.unlink(destPath);
      console.log(`Deleted existing file at ${destPath}`);
    }
    console.log("right before download")
    console.log("modelUrl : ", modelUrl)

    const downloadResult = await RNFS.downloadFile({
      fromUrl: modelUrl,
      toFile: destPath,
      progressDivider: 5,
      begin: (res) => {
        console.log("Response begin ===\n\n");
        console.log(res);
      },
      progress: ({ bytesWritten, contentLength }: { bytesWritten: number; contentLength: number }) => {
        console.log("Response written ===\n\n");
        const progress = (bytesWritten / contentLength) * 100;
        console.log("progress : ",progress)
        onProgress(Math.floor(progress));
      },
    }).promise;
    console.log("right after download")
    if (downloadResult.statusCode === 200) {
      return destPath;
    } else {
      throw new Error(`Download failed with status code: ${downloadResult.statusCode}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to download model: ${error.message}`);
    } else {
      throw new Error('Failed to download model: Unknown error');
    }
  }
};


// export const fetchAvailableFormats = async (repo: string): Promise<string[]> => {
//     try {
//       const response = await fetch(
//         `https://huggingface.co/api/repos/${repo}/tree/main`
//       );
  
//       if (!response.ok) {
//         throw new Error(`Failed to fetch formats: ${response.statusText}`);
//       }
  
//       const data = await response.json();
  
//       // Filter files for .gguf extensions
//       return data
//         .filter((file: any) => file.path.endsWith(".gguf"))
//         .map((file: any) => file.path);
//     } catch (error) {
//       if (error instanceof Error) {
//         throw new Error(`Error fetching available formats: ${error.message}`);
//       } else {
//         throw new Error("Unknown error occurred while fetching formats.");
//       }
//     }
//   };

// import RNFetchBlob from 'rn-fetch-blob';

// export const downloadModel = async (
//   modelName: string,
//   modelUrl: string,
//   onProgress: (progress: number) => void
// ): Promise<string> => {
//   const destPath = `${RNFetchBlob.fs.dirs.DocumentDir}/${modelName}.gguf`;
  
//   try {
//     const downloadResult = await RNFetchBlob.config({
//       path: destPath,
//       fileCache: true,
//     })
//       .fetch('GET', modelUrl, {})
//       .progress((received: number, total: number) => {
//         const progress = (received / total) * 100;
//         onProgress(Math.floor(progress));
//       });

//     // Check if the download was successful
//     if (downloadResult.respInfo.status === 200) {
//       return destPath;
//     } else {
//       throw new Error(`Download failed with status code: ${downloadResult.respInfo.status}`);
//     }
//   } catch (error) {
//     if (error instanceof Error) {
//       throw new Error(`Failed to download model: ${error.message}`);
//     } else {
//       throw new Error('Failed to download model: Unknown error');
//     }
//   }
// };