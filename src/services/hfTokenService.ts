/**
 * Hugging Face access token (Keychain) — S08.
 * Bearer is attached only for huggingface.co hosts.
 */

import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

const SERVICE = 'ofln.huggingface.token';
const USERNAME = 'hf_token';

/** Native module missing until a full rebuild after adding react-native-keychain. */
export function isHfKeychainAvailable(): boolean {
  return NativeModules?.RNKeychainManager != null;
}

export class HfKeychainUnavailableError extends Error {
  constructor() {
    super(
      'Secure storage is not available yet. Rebuild the app (not just Reload) after installing react-native-keychain.',
    );
    this.name = 'HfKeychainUnavailableError';
  }
}

function assertKeychainAvailable(): void {
  if (!isHfKeychainAvailable()) {
    throw new HfKeychainUnavailableError();
  }
}

export function isHuggingFaceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'huggingface.co' || host.endsWith('.huggingface.co');
  } catch {
    return /https?:\/\/([^/]*\.)?huggingface\.co([/:?]|$)/i.test(url);
  }
}

export async function getHfToken(): Promise<string | null> {
  if (!isHfKeychainAvailable()) {
    // Expected until native rebuild — stay quiet (no console.warn spam).
    return null;
  }
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    if (!creds || !creds.password) return null;
    const token = creds.password.trim();
    return token.length > 0 ? token : null;
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to read HF token from Keychain', e);
    }
    return null;
  }
}

export async function hasHfToken(): Promise<boolean> {
  return (await getHfToken()) != null;
}

export async function setHfToken(token: string): Promise<void> {
  assertKeychainAvailable();
  const trimmed = token.trim();
  if (!trimmed) {
    await clearHfToken();
    return;
  }
  await Keychain.setGenericPassword(USERNAME, trimmed, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearHfToken(): Promise<void> {
  if (!isHfKeychainAvailable()) return;
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch (e) {
    if (__DEV__) {
      console.warn('Failed to clear HF token', e);
    }
  }
}

/** Auth headers only when URL is Hugging Face and a token is stored. */
export async function hfAuthHeaders(url: string): Promise<Record<string, string>> {
  if (!isHuggingFaceUrl(url)) return {};
  const token = await getHfToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** axios.get with HF Bearer when applicable. */
export async function hfAxiosGet<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  const auth = await hfAuthHeaders(url);
  return axios.get<T>(url, {
    ...config,
    headers: {
      ...(config?.headers as Record<string, string> | undefined),
      ...auth,
    },
  });
}
