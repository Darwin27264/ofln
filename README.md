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

- **Screens**: Main UI components representing different app sections (ModelSelection, Conversation, Settings, Stages)
- **Components**: Reusable UI components with optimized rendering (ModelCard, CustomAlert, ProgressBar)
- **Services**: Business logic and data management (llamaService, chatHistoryService, localModelService)
- **Hooks**: Custom React hooks for shared logic (useHuggingFaceModels, useModelFilter)
- **Utils**: Utility functions for common operations (modelUtils)
- **Context**: Global state management (Theme, Alerts)

### Core Technologies

- **React Native 0.78.1**: Mobile framework for cross-platform development
- **TypeScript**: Type safety and improved developer experience
- **llama.rn**: Native LLM inference engine for on-device model execution
- **AsyncStorage**: Persistent local storage for chat history and settings
- **React Native FS**: File system operations for model file management
- **Axios**: HTTP client for model downloads from HuggingFace

### State Management

The application uses a combination of:

- **React Context API**: For theme and global alert management (ThemeContext, CustomAlertProvider)
- **Local State**: Component-level state with `useState` for UI state
- **Refs**: For values that don't trigger re-renders (animation state, scroll tracking)
- **AsyncStorage**: For persistent data (chat history, model settings, local models metadata)

### Design Principles

The codebase follows these principles:

- **Single Responsibility Principle (SRP)**: Each component/service has one clear purpose
- **Don't Repeat Yourself (DRY)**: Shared logic extracted to hooks and utilities
- **Keep It Simple Stupid (KISS)**: Simple, readable code over complex abstractions
- **Performance First**: Optimized for mobile devices with 60fps animations and efficient rendering

## Project Structure

```
src/
├── api/              # API client functions
│   └── model.ts      # HuggingFace model download API
├── components/       # Reusable UI components
│   ├── CustomAlert.tsx    # Custom alert dialog component
│   ├── ModelCard.tsx      # Model card with animations (memoized)
│   └── ProgressBar.tsx    # Download progress indicator
├── context/          # React Context providers
│   └── ThemeContext.tsx   # Theme management (light/dark mode)
├── hooks/            # Custom React hooks
│   ├── useHuggingFaceModels.ts  # HuggingFace API integration
│   └── useModelFilter.ts        # Model filtering logic
├── screens/          # Main screen components
│   ├── ConversationScreen.tsx   # Chat interface with history
│   ├── ModelSelectionScreen.tsx # Model browser and management
│   ├── SettingsScreen.tsx       # App settings and navigation
│   └── StagesScreen.tsx         # Performance analytics
├── services/         # Business logic services
│   ├── chatHistoryService.ts    # Chat persistence and management
│   ├── llamaService.ts          # Model loading and inference
│   ├── localModelService.ts     # Local model file management
│   ├── modelSettingsService.ts  # Per-model configuration
│   └── usageTracker.ts          # Performance metrics tracking
├── styles/           # Style definitions
│   └── styles.ts     # Theme-aware style factory
└── utils/            # Utility functions
    └── modelUtils.ts # Model name formatting, quantization extraction
```

## Key Features

### Model Management

- **Browse Models**: Browse models from HuggingFace with filtering by author and type
- **Download Models**: Download GGUF models optimized for mobile devices
- **Local Models**: Add models from device storage via file picker
- **Model Settings**: Per-model configuration (temperature, context window, GPU layers)
- **Quantization Support**: Support for multiple quantization formats (Q2_K, Q4_K_M, Q5_K_M, etc.)

### Chat Interface

- **Persistent History**: Chat history saved to AsyncStorage
- **Multiple Conversations**: Manage multiple chat sessions
- **Pin/Unpin**: Pin important conversations for quick access
- **Custom Titles**: Rename conversations with custom titles
- **Real-time Streaming**: Tokens streamed in real-time as they're generated
- **Performance Metrics**: Track tokens per second for each response
- **Temporary Mode**: Conversations that aren't saved to history

### Performance Tracking

- **Tokens Per Second**: Real-time monitoring of generation speed
- **Inference Time**: Track time taken for each inference
- **Performance Levels**: Automatic classification (High/Medium/Low)
- **Usage Logs**: Detailed logs for performance analysis
- **Visual Analytics**: Charts and graphs in Stages screen

### Theme Support

- **Light/Dark Themes**: System-aware theme switching
- **Persistent Preference**: Theme choice saved across app restarts
- **Smooth Transitions**: Animated theme transitions

## Data Flow

### Model Download Flow

1. User selects a model from ModelSelectionScreen
2. App checks if model already exists locally (via RNFS)
3. If not, initiates download with progress tracking
4. Download progress updates UI in real-time via callback
5. On completion, model is validated and added to downloaded models list
6. Model can be loaded into memory for inference

**Error Handling**: Network failures, storage full, and file corruption are handled gracefully with user-friendly error messages.

### Chat Flow

1. User sends a message via ConversationScreen
2. Message is added to conversation array (with system message)
3. System prompt is updated with model-specific settings
4. LLM inference begins with streaming tokens
5. Tokens are accumulated and displayed in real-time
6. Thinking blocks (for reasoning models) are parsed and displayed separately
7. On completion, conversation is saved to AsyncStorage (debounced)
8. Performance metrics are recorded to usage_log.json

**Edge Cases**: Empty messages, missing context, generation errors, and stop word handling are all managed.

### Model Loading Flow

1. User selects a downloaded model
2. App loads model-specific settings from AsyncStorage
3. Model file path is validated (file exists check)
4. Previous model context is released (if any) to prevent memory leaks
5. llama.rn initializes model with settings (n_ctx, n_gpu_layers)
6. Context is created and stored in App state
7. User can begin chatting

**Memory Management**: Previous models are always released before loading new ones to prevent memory leaks on mobile devices.

### Chat History Flow

1. Conversations are automatically saved when messages change (debounced 500ms)
2. Chat history is loaded when side panel opens
3. Conversations are grouped by month/year for organization
4. Pinned conversations appear at the top
5. Long-press menu allows rename, pin/unpin, and delete operations

**Performance**: History loading is deferred until panel opens, and grouping is memoized for efficiency.

## Installation & Setup

### Prerequisites

- **Node.js >= 18**: Required for React Native development
- **React Native CLI**: For running and building the app
- **Android Studio**: For Android development (with Android SDK)
- **Xcode**: For iOS development (macOS only, with CocoaPods)
- **Java Development Kit**: For Android builds

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

### Environment Configuration

No environment variables are required. The app uses:
- Default React Native configuration
- AsyncStorage for local persistence
- RNFS DocumentDirectoryPath for model storage

## Development Commands

### Available Scripts

- `npm start`: Start Metro bundler
- `npm run android`: Build and run on Android device/emulator
- `npm run ios`: Build and run on iOS simulator/device
- `npm test`: Run Jest unit tests
- `npm run lint`: Run ESLint for code quality checks

### Metro Bundler Options

- `npm start -- --reset-cache`: Clear Metro cache and restart (use when experiencing build issues)
- `npm start -- --port 8081`: Start on custom port (if default port is in use)

### Android Specific

- `cd android && ./gradlew clean`: Clean Android build artifacts
- `cd android && ./gradlew assembleDebug`: Build debug APK without installing
- `cd android && ./gradlew installDebug`: Install debug APK on connected device

### iOS Specific

- `cd ios && pod install`: Reinstall CocoaPods dependencies
- `cd ios && pod update`: Update CocoaPods dependencies to latest versions
- `cd ios && xcodebuild clean`: Clean Xcode build folder

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
- [ ] Chat history persistence across app restarts
- [ ] Theme switching (light/dark)
- [ ] Model settings configuration and persistence
- [ ] Local model file picker and management
- [ ] Error handling (network failures, file errors)
- [ ] Performance metrics tracking
- [ ] Temporary mode functionality
- [ ] Chat pinning and renaming
- [ ] Model switching during active conversation

## Performance Optimizations

### Rendering Optimizations

- **React.memo**: ModelCard component is memoized to prevent unnecessary re-renders
- **useMemo**: Filtered models list, grouped chat history, and expensive calculations are memoized
- **useCallback**: Event handlers are memoized to prevent child re-renders
- **Lazy Loading**: Models are loaded on-demand, not all at once
- **Virtualization**: Consider using FlatList for long lists (future optimization)

### Animation Optimizations

- **Native Driver**: All animations use `useNativeDriver: true` for 60fps performance
- **Reduced Durations**: Animation durations optimized for mobile (150-200ms instead of 250-300ms)
- **Single Animation Phase**: Animations only play once on initial mount (prevents lag)
- **Staggered Animations**: Card animations are staggered with capped delays (max 200ms)
- **InteractionManager**: Heavy operations deferred until after animations complete

### Memory Management

- **Model Context Release**: Previous models are released before loading new ones
- **Cache Management**: Utility functions use caches to avoid repeated operations (quantization, date formatting)
- **Refs for Tracking**: Animation state uses refs to avoid re-renders
- **Debounced Saves**: Chat history saves are debounced (500ms) to reduce write operations

### Network Optimizations

- **Request Cancellation**: Download requests can be cancelled via AbortController
- **Progress Tracking**: Efficient progress updates without blocking UI thread
- **Error Recovery**: Network errors are handled gracefully with retry options
- **Timeout Handling**: API requests have appropriate timeouts (8-15 seconds)

### Mobile-Specific Optimizations

- **Reduced Animation Windows**: Initial animation phase reduced from 1500ms to 800ms
- **Capped Animation Delays**: Staggered animations capped at 200ms max delay
- **Faster Close Animations**: Panel close animations reduced to 150ms
- **Optimized Spring Physics**: Model selector uses faster spring (friction: 7, tension: 50)

## Special Considerations

### Model File Sizes

- Models can be several GB in size (typically 0.5GB to 8GB)
- Ensure sufficient storage space before downloading
- Consider device storage limitations (especially on older devices)
- Models are stored in app's document directory (persists across updates)
- Large models may take significant time to download (use Wi-Fi)

### Memory Constraints

- Large models may require significant RAM (2GB-8GB depending on model size)
- Context window size (n_ctx) directly affects memory usage
- GPU layers (n_gpu_layers) can help but may not be available on all devices
- Monitor memory usage during inference (especially on lower-end devices)
- use_mlock: true prevents memory swapping but requires sufficient RAM

### Network Requirements

- Initial model download requires stable internet connection
- Large models may take significant time to download (30 minutes to hours)
- Consider Wi-Fi for large downloads to avoid data charges
- Download progress is tracked but may not be 100% accurate
- Network interruptions are handled with error messages

### Platform Differences

#### Android

- File system access requires proper permissions (handled automatically)
- Storage location: `RNFS.DocumentDirectoryPath` (app-specific directory)
- Models are accessible after app restart
- Background download limitations may apply

#### iOS

- File system access is sandboxed (app-specific directory only)
- Storage location: App's document directory
- Models persist across app updates
- Background download limitations apply (downloads pause when app backgrounds)

### Error Handling

The application handles various error scenarios:

- **Network Errors**: Download failures are caught and displayed to user with retry options
- **File System Errors**: File operations are wrapped in try-catch blocks with validation
- **Model Loading Errors**: Invalid models are detected and reported with helpful messages
- **Storage Errors**: AsyncStorage failures are handled gracefully with fallbacks
- **Context Errors**: Model context errors are caught and context is cleared

### Edge Cases

- **Concurrent Downloads**: Only one download at a time is supported (UI prevents multiple)
- **Model Deletion During Use**: Active models cannot be deleted (validation in place)
- **Storage Full**: Download fails gracefully when storage is full (error message shown)
- **Invalid Model Files**: Corrupted files are detected and can be removed
- **App Backgrounding**: Downloads pause when app goes to background (platform limitation)
- **Memory Pressure**: Low memory situations handled with context release
- **Network Interruption**: Download progress saved, can resume (future enhancement)

### Security Considerations

- Models are stored locally on device (no cloud storage)
- Chat history is stored locally (not synced to cloud)
- No user data is transmitted to external servers (except HuggingFace for model downloads)
- File system access is sandboxed per platform requirements

## Troubleshooting

### Common Issues

#### Metro Bundler Won't Start

- Clear cache: `npm start -- --reset-cache`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check port 8081 is not in use: `lsof -i :8081`
- Restart Metro bundler

#### Android Build Fails

- Clean build: `cd android && ./gradlew clean`
- Check Android SDK is properly configured in Android Studio
- Verify Java version compatibility (Java 11+ required)
- Check `android/build.gradle` for version conflicts
- Ensure Android emulator/device is connected: `adb devices`

#### iOS Build Fails

- Run `pod install` in `ios` directory
- Clean Xcode build folder: Product > Clean Build Folder (Cmd+Shift+K)
- Check CocoaPods version compatibility
- Verify Xcode command line tools: `xcode-select --print-path`
- Check iOS deployment target matches requirements

#### Models Won't Load

- Verify model file exists and is not corrupted: Check file size matches expected
- Check file permissions: Ensure app has read access
- Ensure sufficient memory available: Close other apps
- Review model settings: Context window size may be too large
- Check GPU layers setting: Try reducing n_gpu_layers if device doesn't support GPU
- Review console logs for specific error messages

#### Downloads Fail

- Check internet connection: Verify Wi-Fi or cellular data is active
- Verify sufficient storage space: Check available storage in device settings
- Check file system permissions: Ensure app has write permissions
- Review error logs: Check console for specific error messages
- Try downloading smaller model first: Verify download functionality
- Check HuggingFace API status: Service may be temporarily unavailable

#### Performance Issues

- Reduce context window size (n_ctx): Lower values use less memory
- Lower GPU layers if available: Try n_gpu_layers: 0 for CPU-only
- Close other apps: Free up memory for model inference
- Use smaller quantization models: Q2_K or Q3_K_M instead of Q4_K_M
- Reduce n_predict: Limit max tokens generated
- Check device temperature: Overheating can throttle performance

#### Chat History Not Saving

- Check AsyncStorage permissions: Should be automatic
- Verify sufficient storage space: AsyncStorage has size limits
- Check console for errors: Storage errors are logged
- Try clearing app data: Reset may resolve corruption issues

#### Animations Lagging

- Check device performance: Lower-end devices may struggle
- Reduce animation complexity: Already optimized, but can disable if needed
- Close other apps: Free up CPU/GPU resources
- Check React Native performance monitor: Use DevMenu > Show Perf Monitor

### Debug Mode

Enable debug logging by checking console output. The app logs:

- Model loading progress and errors
- Download progress and network errors
- Inference metrics (tokens per second, inference time)
- Error details with stack traces
- Performance warnings

### Getting Help

1. Check console logs for error messages (most issues are logged)
2. Review error handling in relevant service files
3. Verify model file integrity (file size, extension)
4. Check device storage and memory availability
5. Review network connectivity for downloads
6. Check React Native and dependency versions for compatibility

### Performance Monitoring

- Use React Native Performance Monitor (DevMenu > Show Perf Monitor)
- Check memory usage in device settings
- Monitor CPU usage during inference
- Review usage_log.json for performance trends
- Use Stages screen to analyze performance metrics

## License

[Add your license information here]

## Contributing

[Add contributing guidelines here]
