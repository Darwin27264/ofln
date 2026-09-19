import { NativeModules, Platform } from 'react-native';
import {
  getSharedPayload,
  closeOverlay,
  returnProcessedText,
  openInFullApp,
  publishDirectShareShortcuts,
  getFullAppHandoff,
} from '../src/services/shareReceiverService';

describe('shareReceiverService', () => {
  const mockGetSharedPayload = jest.fn();
  const mockCloseOverlay = jest.fn();
  const mockReturnProcessedText = jest.fn();
  const mockOpenInFullApp = jest.fn();
  const mockPublishDirectShareShortcuts = jest.fn();
  const mockGetFullAppHandoff = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    NativeModules.ShareReceiver = {
      getSharedPayload: mockGetSharedPayload,
      closeOverlay: mockCloseOverlay,
      returnProcessedText: mockReturnProcessedText,
      openInFullApp: mockOpenInFullApp,
      publishDirectShareShortcuts: mockPublishDirectShareShortcuts,
      getFullAppHandoff: mockGetFullAppHandoff,
    };
  });

  it('resolves payload when native module returns data', async () => {
    mockGetSharedPayload.mockResolvedValueOnce({
      action: 'SEND',
      type: 'text',
      text: 'Hello world',
    });

    const result = await getSharedPayload();
    expect(result).toEqual({
      action: 'SEND',
      type: 'text',
      text: 'Hello world',
    });
    expect(mockGetSharedPayload).toHaveBeenCalledTimes(1);
  });

  it('returns null when payload is empty or not on android', async () => {
    mockGetSharedPayload.mockResolvedValueOnce(null);
    expect(await getSharedPayload()).toBeNull();

    Platform.OS = 'ios';
    expect(await getSharedPayload()).toBeNull();
  });

  it('calls native closeOverlay properly', async () => {
    mockCloseOverlay.mockResolvedValueOnce(true);
    const res = await closeOverlay();
    expect(res).toBe(true);
    expect(mockCloseOverlay).toHaveBeenCalledTimes(1);
  });

  it('calls returnProcessedText for text replacement', async () => {
    mockReturnProcessedText.mockResolvedValueOnce(true);
    const res = await returnProcessedText('Rephrased content');
    expect(res).toBe(true);
    expect(mockReturnProcessedText).toHaveBeenCalledWith('Rephrased content');
  });

  it('calls openInFullApp for handoff', async () => {
    mockOpenInFullApp.mockResolvedValueOnce(true);
    const res = await openInFullApp('Summarize this', 'Summary output', 'chat-123');
    expect(res).toBe(true);
    expect(mockOpenInFullApp).toHaveBeenCalledWith('Summarize this', 'Summary output', 'chat-123');
  });

  it('calls publishDirectShareShortcuts', async () => {
    mockPublishDirectShareShortcuts.mockResolvedValueOnce(true);
    const res = await publishDirectShareShortcuts();
    expect(res).toBe(true);
    expect(mockPublishDirectShareShortcuts).toHaveBeenCalledTimes(1);
  });

  it('calls getFullAppHandoff and returns payload', async () => {
    const mockPayload = {
      sharedPrompt: 'User prompt',
      sharedResponse: 'Assistant response',
      sharedChatId: 'chat-abc',
    };
    mockGetFullAppHandoff.mockResolvedValueOnce(mockPayload);
    const res = await getFullAppHandoff();
    expect(res).toEqual(mockPayload);
    expect(mockGetFullAppHandoff).toHaveBeenCalledTimes(1);
  });
});
