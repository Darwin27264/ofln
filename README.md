# OFLN - Offline LLM Mobile Application

A React Native mobile application for running Large Language Models (LLMs) offline on mobile devices. The app enables users to download, manage, and interact with AI models locally without requiring an internet connection after initial setup.

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Data Flow](#data-flow)
- [Installation & Setup](#installation--setup)
- [Development Commands](#development-commands)
- [Testing](#testing)
- [Performance Optimizations](#performance-optimizations)
- [Special Considerations](#special-considerations)
- [Troubleshooting](#troubleshooting)

## Architecture

### High-Level Overview

OFLN follows a modular architecture with clear separation of concerns:

- **Screens**: Main UI components representing different app sections
- **Components**: Reusable UI components with optimized rendering
- **Services**: Business logic and data management
- **Hooks**: Custom React hooks for shared logic
- **Utils**: Utility functions for common operations
- **Context**: Global state management (Theme, Alerts)

### Core Technologies

- **React Native 0.78.1**: Mobile framework
- **TypeScript**: Type safety
- **llama.rn**: Native LLM inference engine
- **AsyncStorage**: Persistent local storage
- **React Native FS**: File system operations
- **Axios**: HTTP client for model downloads

### State Management

The application uses a combination of:
- **React Context API**: For theme and global alert management
- **Local State**: Component-level state with `useState`
- **Refs**: For values that don't trigger re-renders (animation state, tracking)
- **AsyncStorage**: For persistent data (chat history, model settings, local models)

## Project Structure

```
src/
├── api/              # API client functions
├── components/       # Reusable UI components
│   ├── CustomAlert.tsx
│   ├── ModelCard.tsx
│   └── ProgressBar.tsx
├── context/          # React Context providers
│   └── ThemeContext.tsx
├── hooks/            # Custom React hooks
│   ├── useHuggingFaceModels.ts
│   └── useModelFilter.ts
├── screens/           # Main screen components
│   ├── ConversationScreen.tsx
│   ├── ModelSelectionScreen.tsx
│   ├── SettingsScreen.tsx
│   └── StagesScreen.tsx
├── services/         # Business logic services
│   ├── chatHistoryService.ts
│   ├── llamaService.ts
│   ├── localModelService.ts
│   ├── modelSettingsService.ts
│   └── usageTracker.ts
├── styles/           # Style definitions
│   └── styles.ts
└── utils/            # Utility functions
    └── modelUtils.ts
```

## Key Features

### Model Management
- Browse models from HuggingFace
- Download GGUF models optimized for mobile
- Manage local models (add, delete, validate)
- Model-specific settings (temperature, context window, etc.)
- Support for multiple quantization formats

### Chat Interface
- Persistent chat history
- Multiple conversation management
- Pin/unpin conversations
- Custom conversation titles
- Real-time token streaming
- Performance metrics tracking

### Performance Tracking
- Tokens per second monitoring
- Inference time tracking
- Performance level classification (High/Medium/Low)
- Usage logs for analysis

### Theme Support
- Light and dark themes
- Persistent theme preference
- Smooth theme transitions

## Data Flow

### Model Download Flow

1. User selects a model from the model selection screen
2. App checks if model already exists locally
3. If not, initiates download with progress tracking
4. Download progress updates UI in real-time
5. On completion, model is validated and added to local models list
6. Model can be loaded into memory for inference

### Chat Flow

1. User sends a message
2. Message is added to conversation array
3. System prompt is updated with model-specific settings
4. LLM inference begins with streaming tokens
5. Tokens are accumulated and displayed in real-time
6. On completion, conversation is saved to AsyncStorage
7. Performance metrics are recorded

### Model Loading Flow

1. User selects a downloaded model
2. App loads model-specific settings from AsyncStorage
3. Model file path is validated
4. llama.rn initializes model with settings
5. Context is created and stored
6. User can begin chatting

## Installation & Setup

### Prerequisites

- Node.js >= 18
- React Native development environment
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)
- CocoaPods (for iOS dependencies)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ofln
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **iOS Setup (macOS only)**
   ```bash
   cd ios
   bundle install
   bundle exec pod install
   cd ..
   ```

4. **Start Metro bundler**
   ```bash
   npm start
   npx react-native start --reset-cache
   # or
   yarn start
   ```

5. **Run on device/emulator**
   ```bash
   # Android
   npm run android
   
   # iOS
   npm run ios
   ```

## Development Commands

### Available Scripts

- `npm start`: Start Metro bundler
- `npm run android`: Build and run on Android
- `npm run ios`: Build and run on iOS
- `npm test`: Run Jest tests
- `npm run lint`: Run ESLint

### Metro Bundler Options

- `npm start -- --reset-cache`: Clear Metro cache and restart
- `npm start -- --port 8081`: Start on custom port

### Android Specific

- `cd android && ./gradlew clean`: Clean Android build
- `cd android && ./gradlew assembleDebug`: Build debug APK

### iOS Specific

- `cd ios && pod install`: Reinstall CocoaPods dependencies
- `cd ios && pod update`: Update CocoaPods dependencies

## Testing

### Unit Testing

The project uses Jest for unit testing. Test files are located alongside source files with `.test.ts` or `.test.tsx` extensions.

```bash
npm test
```

### Test Coverage

```bash
npm test -- --coverage
```

### Manual Testing Checklist

- [ ] Model download and cancellation
- [ ] Model loading and unloading
- [ ] Chat message sending and receiving
- [ ] Chat history persistence
- [ ] Theme switching
- [ ] Model settings configuration
- [ ] Local model management
- [ ] Error handling and recovery

## Performance Optimizations

### Rendering Optimizations

- **React.memo**: ModelCard component is memoized to prevent unnecessary re-renders
- **useMemo**: Filtered models list is memoized to avoid recalculation
- **useCallback**: Event handlers are memoized to prevent child re-renders
- **Lazy Loading**: Models are loaded on-demand, not all at once

### Animation Optimizations

- **Native Driver**: All animations use `useNativeDriver: true` for 60fps performance
- **Single Animation Phase**: Animations only play once on initial mount
- **Staggered Animations**: Card animations are staggered to reduce initial load

### Memory Management

- **Model Context Release**: Previous models are released before loading new ones
- **Cache Management**: Utility functions use caches to avoid repeated operations
- **Refs for Tracking**: Animation state uses refs to avoid re-renders

### Network Optimizations

- **Request Cancellation**: Download requests can be cancelled
- **Progress Tracking**: Efficient progress updates without blocking UI
- **Error Recovery**: Network errors are handled gracefully with retry options

## Special Considerations

### Model File Sizes

- Models can be several GB in size
- Ensure sufficient storage space before downloading
- Consider device storage limitations
- Models are stored in app's document directory

### Memory Constraints

- Large models may require significant RAM
- Context window size affects memory usage
- GPU layers can help but may not be available on all devices
- Monitor memory usage during inference

### Network Requirements

- Initial model download requires stable internet connection
- Large models may take significant time to download
- Consider Wi-Fi for large downloads
- Download progress is tracked but may not be 100% accurate

### Platform Differences

#### Android
- File system access requires proper permissions
- Storage location: `RNFS.DocumentDirectoryPath`
- Models are accessible after app restart

#### iOS
- File system access is sandboxed
- Storage location: App's document directory
- Models persist across app updates

### Error Handling

The application handles various error scenarios:

- **Network Errors**: Download failures are caught and displayed to user
- **File System Errors**: File operations are wrapped in try-catch blocks
- **Model Loading Errors**: Invalid models are detected and reported
- **Storage Errors**: AsyncStorage failures are handled gracefully

### Edge Cases

- **Concurrent Downloads**: Only one download at a time is supported
- **Model Deletion During Use**: Active models cannot be deleted
- **Storage Full**: Download fails gracefully when storage is full
- **Invalid Model Files**: Corrupted files are detected and removed
- **App Backgrounding**: Downloads pause when app goes to background

## Troubleshooting

### Common Issues

#### Metro Bundler Won't Start
- Clear cache: `npm start -- --reset-cache`
- Delete `node_modules` and reinstall
- Check port 8081 is not in use

#### Android Build Fails
- Clean build: `cd android && ./gradlew clean`
- Check Android SDK is properly configured
- Verify Java version compatibility

#### iOS Build Fails
- Run `pod install` in `ios` directory
- Clean Xcode build folder
- Check CocoaPods version compatibility

#### Models Won't Load
- Verify model file exists and is not corrupted
- Check file permissions
- Ensure sufficient memory available
- Review model settings (context window, GPU layers)

#### Downloads Fail
- Check internet connection
- Verify sufficient storage space
- Check file system permissions
- Review error logs for specific error messages

#### Performance Issues
- Reduce context window size
- Lower GPU layers if available
- Close other apps to free memory
- Use smaller quantization models

### Debug Mode

Enable debug logging by checking console output. The app logs:
- Model loading progress
- Download progress
- Inference metrics
- Error details

### Getting Help

1. Check console logs for error messages
2. Review error handling in relevant service files
3. Verify model file integrity
4. Check device storage and memory
5. Review network connectivity

## License

[Add your license information here]

## Contributing

[Add contributing guidelines here]
