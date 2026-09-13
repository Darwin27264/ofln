import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { verifyAndActivate } from '../src/api/model';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  moveFile: jest.fn(),
  read: jest.fn(),
}));

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      hash: jest.fn(),
    },
  },
}));

describe('verifyAndActivate download integrity (SHA-256 & GGUF validation)', () => {
  const partialPath = '/mock/docs/model.gguf.partial';
  const destPath = '/mock/docs/model.gguf';
  const validSha256 = '444406ddd926550c724ec18d5120a9d40ded44908a063b0e66e9a7e5464c652c';

  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
    (RNFS.read as jest.Mock).mockResolvedValue('GGUF');
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.unlink as jest.Mock).mockResolvedValue(true);
    (RNFS.moveFile as jest.Mock).mockResolvedValue(true);
    (ReactNativeBlobUtil.fs.hash as jest.Mock).mockResolvedValue(validSha256);
  });

  it('activates file when hash is omitted and size matches', async () => {
    const res = await verifyAndActivate(partialPath, destPath, 1024 * 1024);
    expect(res).toBe(destPath);
    expect(RNFS.moveFile).toHaveBeenCalledWith(partialPath, destPath);
    expect(ReactNativeBlobUtil.fs.hash).not.toHaveBeenCalled();
  });

  it('activates file when SHA-256 matches (case-insensitive)', async () => {
    const uppercaseSha = validSha256.toUpperCase();
    const res = await verifyAndActivate(
      partialPath,
      destPath,
      1024 * 1024,
      uppercaseSha,
    );
    expect(res).toBe(destPath);
    expect(ReactNativeBlobUtil.fs.hash).toHaveBeenCalledWith(partialPath, 'sha256');
    expect(RNFS.moveFile).toHaveBeenCalledWith(partialPath, destPath);
  });

  it('activates file when SHA-256 matches even if expectedBytes was an estimate', async () => {
    // Stat size is 1MB, but estimated display size was ~7.4% off (e.g., 547MB vs 507MB)
    const impreciseExpectedBytes = Math.floor(1024 * 1024 * 1.08);
    const res = await verifyAndActivate(
      partialPath,
      destPath,
      impreciseExpectedBytes,
      validSha256,
    );
    expect(res).toBe(destPath);
    expect(ReactNativeBlobUtil.fs.hash).toHaveBeenCalledWith(partialPath, 'sha256');
    expect(RNFS.moveFile).toHaveBeenCalledWith(partialPath, destPath);
  });

  it('unlinks existing destination before moving', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    await verifyAndActivate(partialPath, destPath, null);
    expect(RNFS.unlink).toHaveBeenCalledWith(destPath);
    expect(RNFS.moveFile).toHaveBeenCalledWith(partialPath, destPath);
  });

  it('fails closed when SHA-256 does not match', async () => {
    const mismatchedSha = '0000000000000000000000000000000000000000000000000000000000000000';
    await expect(
      verifyAndActivate(partialPath, destPath, 1024 * 1024, mismatchedSha),
    ).rejects.toThrow(/SHA-256 mismatch/i);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it('fails closed when size does not match expected size', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValue({ size: 500 });
    await expect(
      verifyAndActivate(partialPath, destPath, 1024 * 1024),
    ).rejects.toThrow(/Download size mismatch/i);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(ReactNativeBlobUtil.fs.hash).not.toHaveBeenCalled();
  });

  it('fails closed when file does not have GGUF magic header', async () => {
    (RNFS.read as jest.Mock).mockResolvedValue('<!DO');
    await expect(
      verifyAndActivate(partialPath, destPath, 1024 * 1024),
    ).rejects.toThrow(/Download is not a valid GGUF/i);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it('refuses to activate when destPath ends in .partial', async () => {
    await expect(
      verifyAndActivate(partialPath, '/mock/docs/bad.partial', null),
    ).rejects.toThrow(/Refusing to activate a \.partial model file/i);
    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });
});
