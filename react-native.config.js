/**
 * React Native CLI Configuration
 *
 * Supports pure FOSS builds (e.g. for official F-Droid inclusion)
 * by omitting proprietary Google ML Kit text recognition binary blobs
 * when OFLN_BUILD_FOSS=1 or BUILD_FOSS=true.
 */

const fs = require('fs');
const path = require('path');

const fossMarker = path.resolve(__dirname, 'android', '.foss');
const isFoss =
  process.env.OFLN_BUILD_FOSS === '1' ||
  process.env.BUILD_FOSS === 'true' ||
  process.env.FLAVOR === 'foss' ||
  fs.existsSync(fossMarker);

module.exports = {
  dependencies: {
    ...(isFoss
      ? {
          '@react-native-ml-kit/text-recognition': {
            platforms: {
              android: null, // Disables Android autolinking for pure FOSS builds
            },
          },
        }
      : {}),
  },
};
