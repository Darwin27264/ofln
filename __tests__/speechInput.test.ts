import { joinComposerSpeech } from '../src/utils/speechInput';

describe('joinComposerSpeech', () => {
  it('returns speech when base is empty', () => {
    expect(joinComposerSpeech('', 'hello world')).toBe('hello world');
    expect(joinComposerSpeech('   ', 'hello')).toBe('hello');
  });

  it('appends speech with a single space', () => {
    expect(joinComposerSpeech('Hi', 'there')).toBe('Hi there');
    expect(joinComposerSpeech('Hi  ', 'there')).toBe('Hi there');
  });

  it('keeps base when speech is blank', () => {
    expect(joinComposerSpeech('keep me', '')).toBe('keep me');
    expect(joinComposerSpeech('keep me', '   ')).toBe('keep me');
  });
});
