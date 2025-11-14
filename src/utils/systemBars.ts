// systemBars.ts
import { NativeModules, Platform } from 'react-native';

// @ts-ignore - Native module may not be available during development
const { SystemBars } = NativeModules as { 
  SystemBars?: { 
    setSystemBarColors: (status: string, nav: string, darkIcons: boolean) => void 
  } 
};

function isColorLight(hex: string): boolean {
  // hex -> luminance (naive)
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 180; // tweak threshold if needed
}

/** Apply colors to status + navigation bar. */
export function applySystemBarTheme({
  statusBarColor,
  navBarColor,
}: {
  statusBarColor: string; // e.g. '#000000'
  navBarColor: string;    // e.g. '#000000'
}) {
  if (Platform.OS !== 'android' || !SystemBars) {
    return; // Only works on Android
  }

  const darkIcons = isColorLight(statusBarColor) && isColorLight(navBarColor);
  SystemBars.setSystemBarColors(statusBarColor, navBarColor, darkIcons);
}

