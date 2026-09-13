jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  setGenericPassword: jest.fn(async () => ({ service: 'ofln.huggingface.token', storage: 'AES' })),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import axios from 'axios';
import {
  clearHfToken,
  getHfToken,
  hfAuthHeaders,
  hfAxiosGet,
  isHfKeychainAvailable,
  isHuggingFaceUrl,
  setHfToken,
} from '../src/services/hfTokenService';

beforeAll(() => {
  // Simulate linked native module (missing until full Android rebuild on device).
  (NativeModules as any).RNKeychainManager = {
    getGenericPasswordForOptions: jest.fn(),
    setGenericPasswordForOptions: jest.fn(),
    resetGenericPasswordForOptions: jest.fn(),
  };
});

describe('isHuggingFaceUrl', () => {
  it('allows huggingface.co only (not CDN subdomains)', () => {
    expect(isHuggingFaceUrl('https://huggingface.co/foo/bar')).toBe(true);
    expect(isHuggingFaceUrl('https://cdn-lfs.huggingface.co/x')).toBe(false);
    expect(isHuggingFaceUrl('https://evil.com/huggingface.co')).toBe(false);
    expect(isHuggingFaceUrl('https://example.com')).toBe(false);
  });
});

describe('isHfKeychainAvailable', () => {
  it('is true when RNKeychainManager is present', () => {
    expect(isHfKeychainAvailable()).toBe(true);
  });
});

describe('hfAuthHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NativeModules as any).RNKeychainManager = {
      getGenericPasswordForOptions: jest.fn(),
    };
  });

  it('returns Bearer only for HF URLs when a token exists', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
      username: 'hf_token',
      password: ' hf_abc ',
      service: 'ofln.huggingface.token',
      storage: 'AES',
    });
    expect(await hfAuthHeaders('https://huggingface.co/x')).toEqual({
      Authorization: 'Bearer hf_abc',
    });
    expect(await hfAuthHeaders('https://example.com/x')).toEqual({});
  });

  it('returns empty when no token', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);
    expect(await hfAuthHeaders('https://huggingface.co/x')).toEqual({});
  });

  it('returns empty when native module is missing', async () => {
    (NativeModules as any).RNKeychainManager = null;
    expect(await hfAuthHeaders('https://huggingface.co/x')).toEqual({});
  });
});

describe('set/get/clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NativeModules as any).RNKeychainManager = {
      getGenericPasswordForOptions: jest.fn(),
      setGenericPasswordForOptions: jest.fn(),
      resetGenericPasswordForOptions: jest.fn(),
    };
  });

  it('stores and clears via Keychain service', async () => {
    await setHfToken('hf_test');
    expect(Keychain.setGenericPassword).toHaveBeenCalled();

    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
      username: 'hf_token',
      password: 'hf_test',
      service: 'ofln.huggingface.token',
      storage: 'AES',
    });
    expect(await getHfToken()).toBe('hf_test');

    await clearHfToken();
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  });
});

describe('hfAxiosGet', () => {
  beforeEach(() => {
    (NativeModules as any).RNKeychainManager = {
      getGenericPasswordForOptions: jest.fn(),
    };
  });

  it('merges Authorization for HF hosts', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
      username: 'hf_token',
      password: 'tok',
      service: 'ofln.huggingface.token',
      storage: 'AES',
    });
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: [], status: 200 });
    await hfAxiosGet('https://huggingface.co/api/models', { timeout: 1000 });
    expect(axios.get).toHaveBeenCalledWith(
      'https://huggingface.co/api/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });
});
