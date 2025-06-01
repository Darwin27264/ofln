const { exec } = require('child_process');
const os = require('os');

function runCommandInNewWindow(command, windowTitle) {
  const platform = os.platform();

  if (platform === 'win32') {
    // For Windows (using start and cmd)
    exec(`start "${windowTitle}" cmd /k "${command}"`);
  } else if (platform === 'darwin') {
    // For macOS (using Terminal.app)
    exec(`osascript -e 'tell app "Terminal"
        do script "${command}"
      end tell'`);
  } else {
    // For Linux (using gnome-terminal)
    exec(`gnome-terminal -- bash -c '${command}; exec bash'`);
  }
}

// First command
runCommandInNewWindow('npx react-native start --reset-cache', 'Metro Bundler');

// Wait a bit before running the second command (optional, e.g., 5 seconds)
setTimeout(() => {
  runCommandInNewWindow('npm run android', 'React Native Android');
}, 5000); // 5000 ms = 5 seconds
