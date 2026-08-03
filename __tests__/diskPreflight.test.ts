jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

import {
  DISK_PREFLIGHT_PAD_BYTES,
  formatBytesShort,
  parseSizeToBytes,
  requiredBytesForDownload,
} from '../src/utils/diskPreflight';

describe('parseSizeToBytes', () => {
  it('parses GB / MB strings and raw bytes', () => {
    expect(parseSizeToBytes(1500)).toBe(1500);
    expect(parseSizeToBytes('2GB')).toBe(2 * 1024 ** 3);
    expect(parseSizeToBytes('850 MB')).toBe(850 * 1024 ** 2);
    expect(parseSizeToBytes('bad')).toBeNull();
    expect(parseSizeToBytes(undefined)).toBeNull();
  });
});

describe('requiredBytesForDownload', () => {
  it('applies 1.1× plus pad', () => {
    const file = 1000;
    expect(requiredBytesForDownload(file)).toBe(Math.ceil(file * 1.1) + DISK_PREFLIGHT_PAD_BYTES);
  });
});

describe('formatBytesShort', () => {
  it('formats human-readable sizes', () => {
    expect(formatBytesShort(512)).toBe('512 B');
    expect(formatBytesShort(2 * 1024 ** 3)).toBe('2.0 GB');
  });
});
