import { shouldFlushChatPersist, shouldFlushChatPersistOnTransition } from '../src/utils/chatPersistAppState';

describe('shouldFlushChatPersist', () => {
  it('flushes when leaving the foreground', () => {
    expect(shouldFlushChatPersist('inactive')).toBe(true);
    expect(shouldFlushChatPersist('background')).toBe(true);
  });

  it('does not flush while active', () => {
    expect(shouldFlushChatPersist('active')).toBe(false);
  });
});

describe('shouldFlushChatPersistOnTransition', () => {
  it('flushes only when leaving active', () => {
    expect(shouldFlushChatPersistOnTransition('active', 'inactive')).toBe(true);
    expect(shouldFlushChatPersistOnTransition('active', 'background')).toBe(true);
  });

  it('does not double-flush inactive → background', () => {
    expect(shouldFlushChatPersistOnTransition('inactive', 'background')).toBe(false);
  });

  it('does not flush on resume or no-op', () => {
    expect(shouldFlushChatPersistOnTransition('background', 'active')).toBe(false);
    expect(shouldFlushChatPersistOnTransition('active', 'active')).toBe(false);
  });
});
