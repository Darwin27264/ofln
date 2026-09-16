import axios from 'axios';
import {
  assertSafeSourceUrl,
  buildFormattedSourceDocument,
  decodeBuffer,
  DEFAULT_BROWSER_USER_AGENT,
  detectCharset,
  fetchSourceText,
  SOURCE_FETCH_MAX_BYTES,
} from '../src/services/sourceFetchService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('sourceFetchService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertSafeSourceUrl', () => {
    it('accepts valid http and https URLs', () => {
      expect(assertSafeSourceUrl('https://example.com').protocol).toBe('https:');
      expect(assertSafeSourceUrl('http://example.com/test?q=1').protocol).toBe('http:');
    });

    it('rejects non-http protocols and credentials', () => {
      expect(() => assertSafeSourceUrl('ftp://example.com')).toThrow();
      expect(() => assertSafeSourceUrl('file:///etc/passwd')).toThrow();
      expect(() => assertSafeSourceUrl('javascript:alert(1)')).toThrow();
      expect(() => assertSafeSourceUrl('https://user:pass@example.com')).toThrow();
    });
  });

  describe('detectCharset and decodeBuffer', () => {
    it('detects charset from Content-Type header', () => {
      const charset = detectCharset('text/html; charset=iso-8859-1', new Uint8Array([0]));
      expect(charset).toBe('iso-8859-1');
    });

    it('detects charset from meta tag preview', () => {
      const meta = '<meta charset="windows-1252">';
      const bytes = new Uint8Array(meta.split('').map((c) => c.charCodeAt(0)));
      const charset = detectCharset(null, bytes);
      expect(charset).toBe('windows-1252');
    });

    it('decodes buffer with fallback', () => {
      const text = 'Hello world';
      const buf = new Uint8Array(text.split('').map((c) => c.charCodeAt(0))).buffer;
      const decoded = decodeBuffer(buf, 'utf-8');
      expect(decoded).toBe('Hello world');
    });
  });

  describe('buildFormattedSourceDocument', () => {
    it('prepends structured header when title is present', () => {
      const extracted = {
        text: 'Main article content here.',
        metadata: {
          title: 'Article Headline',
          siteName: 'News Site',
          author: 'John Doe',
          publishedTime: '2026-09-15',
          description: 'A brief summary',
        },
        isFeed: false,
      };
      const formatted = buildFormattedSourceDocument('https://example.com/post', extracted);
      expect(formatted).toContain('Title: Article Headline');
      expect(formatted).toContain('Source: https://example.com/post');
      expect(formatted).toContain('Site: News Site');
      expect(formatted).toContain('Author: John Doe');
      expect(formatted).toContain('Date: 2026-09-15');
      expect(formatted).toContain('Summary: A brief summary');
      expect(formatted).toContain('---');
      expect(formatted).toContain('Main article content here.');
    });

    it('returns raw text directly for RSS/Atom feeds without duplicate header', () => {
      const feedText = 'Feed: Tech News\nLatest items: ...';
      const extracted = {
        text: feedText,
        metadata: { title: 'Tech News' },
        isFeed: true,
      };
      const formatted = buildFormattedSourceDocument('https://example.com/feed', extracted);
      expect(formatted).toBe(feedText);
    });
  });

  describe('fetchSourceText', () => {
    it('uses standard mobile browser User-Agent and headers', async () => {
      const rawHtml = `
        <html>
          <head><title>Test Page</title></head>
          <body><article><p>Hello from test article content that is sufficiently long to pass.</p></article></body>
        </html>
      `;
      const buf = Buffer.from(rawHtml, 'utf-8');

      mockedAxios.get.mockResolvedValueOnce({
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 200,
      });

      const result = await fetchSourceText('https://example.com/article');
      expect(result.title).toBe('Test Page');
      expect(result.text).toContain('Hello from test article');

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[0]).toBe('https://example.com/article');
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(DEFAULT_BROWSER_USER_AGENT);
      expect(headers['Accept']).toContain('text/html');
      expect(headers['Sec-Ch-Ua-Platform']).toBe('"Android"');
    });

    it('handles 403 Forbidden with user-friendly error explanation', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403 },
        message: 'Request failed with status code 403',
      };
      (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockedAxios.get.mockRejectedValueOnce(axiosError);

      await expect(fetchSourceText('https://blocked-site.com')).rejects.toThrow(
        /Access denied by website \(HTTP 403 Forbidden\)/,
      );
    });

    it('rejects oversized responses', async () => {
      const bigBuf = new ArrayBuffer(SOURCE_FETCH_MAX_BYTES + 1024);
      mockedAxios.get.mockResolvedValueOnce({
        data: bigBuf,
        headers: { 'content-type': 'text/html' },
        status: 200,
      });

      await expect(fetchSourceText('https://huge-site.com')).rejects.toThrow(/too large/);
    });
  });
});
