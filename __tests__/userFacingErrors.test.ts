import {
  classifyDownloadError,
  classifyLoadError,
  isDownloadCancelled,
  sanitizeErrorText,
  toUserFacingDownloadError,
  toUserFacingDownloadOrLoadError,
  toUserFacingLoadError,
  userFacingHttpError,
} from '../src/utils/userFacingErrors';

describe('sanitizeErrorText', () => {
  it('strips stack-like noise and truncates', () => {
    const raw =
      'Out of memory\n    at com.facebook.react.bridge.JavaMethodWrapper\njava.lang.RuntimeException';
    const clean = sanitizeErrorText(raw, 80);
    expect(clean.toLowerCase()).toContain('out of memory');
    expect(clean).not.toMatch(/com\.facebook/);
    expect(clean).not.toMatch(/java\.lang/);
  });
});

describe('classifyLoadError', () => {
  it('maps OOM / emulator size failures', () => {
    expect(classifyLoadError(new Error('Out of memory while allocating'))).toBe('oom');
    expect(
      classifyLoadError(null, 'Model is too large for the Android emulator (1800 MB)'),
    ).toBe('oom');
    expect(
      classifyLoadError(
        null,
        'Not enough free RAM to load this model safely (need ~4.2 GB, have ~2.1 GB).',
      ),
    ).toBe('oom');
  });

  it('maps corrupt / formatting failures', () => {
    expect(classifyLoadError(new Error('chat formatting failed after load'))).toBe(
      'corrupt',
    );
    expect(classifyLoadError(new Error('Unknown error'))).toBe('corrupt');
  });

  it('maps missing files', () => {
    expect(classifyLoadError(new Error('Model file does not exist: /x.gguf'))).toBe(
      'not_found',
    );
  });
});

describe('classifyDownloadError', () => {
  it('detects cancel and pause', () => {
    expect(isDownloadCancelled(new Error('Download was cancelled'))).toBe(true);
    expect(isDownloadCancelled(new Error('Download was paused'))).toBe(true);
    expect(toUserFacingDownloadError(new Error('Download was cancelled'))).toBeNull();
    expect(toUserFacingDownloadError(new Error('Download was paused'))).toBeNull();
  });

  it('maps auth / disk / network / size mismatch', () => {
    expect(classifyDownloadError(new Error('Download failed with status code: 401'))).toBe(
      'auth',
    );
    expect(classifyDownloadError(new Error('ENOSPC: no space left on device'))).toBe(
      'disk',
    );
    expect(classifyDownloadError(new Error('network timeout'))).toBe('network');
    expect(
      classifyDownloadError(new Error('Failed to download model: Download interrupted.')),
    ).toBe('network');
    expect(
      classifyDownloadError(
        new Error('Download interrupted. Progress was saved — tap download again to resume.'),
      ),
    ).toBe('network');
    expect(
      classifyDownloadError(
        new Error('Download size mismatch: expected ~1000 bytes, got 500'),
      ),
    ).toBe('corrupt');
  });
});

describe('user-facing builders', () => {
  it('never returns raw jni in load alerts', () => {
    const uf = toUserFacingLoadError(
      new Error('Unknown error\nat com.facebook.react.Something.invoke'),
      'Out of memory',
    );
    expect(uf.title).toBe('Not enough memory');
    expect(uf.message).not.toMatch(/com\.facebook|at /);
  });

  it('does not label post-download load failures as connection problems', () => {
    const uf = toUserFacingDownloadOrLoadError(
      Object.assign(new Error("Couldn't load model: Something went wrong while loading."), {
        oflnPhase: 'load',
      }),
      'Not enough free RAM to load this model safely (need ~4 GB, have ~2 GB).',
    );
    expect(uf?.kind).toBe('oom');
    expect(uf?.title).toBe('Not enough memory');
    expect(uf?.title).not.toBe('Download failed');
  });

  it('maps http statuses', () => {
    expect(userFacingHttpError(403).kind).toBe('auth');
    expect(userFacingHttpError(403).message).toMatch(/HF token|Models/i);
    expect(userFacingHttpError(404).kind).toBe('not_found');
    expect(userFacingHttpError(503).kind).toBe('network');
  });
});
