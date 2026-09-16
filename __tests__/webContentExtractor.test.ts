import {
  decodeHtmlEntities,
  extractHtmlMetadata,
  extractMainContentContainer,
  extractWebContent,
  htmlToStructuredText,
  parseRssOrAtomFeed,
  smartTruncateText,
  stripHtmlBoilerplate,
} from '../src/services/webContentExtractor';

describe('webContentExtractor', () => {
  describe('decodeHtmlEntities', () => {
    it('decodes named entities correctly', () => {
      const input = 'AT&amp;T &lt;hello&gt; &quot;world&quot; &mdash; &ndash; &hellip; &copy; 2026';
      expect(decodeHtmlEntities(input)).toBe('AT&T <hello> "world" — – … © 2026');
    });

    it('decodes decimal numeric entities correctly', () => {
      const input = 'Price: &#36;100 &#8212; discount';
      expect(decodeHtmlEntities(input)).toBe('Price: $100 — discount');
    });

    it('decodes hex numeric entities correctly', () => {
      const input = 'Emoji: &#x1f600; &amp; symbol: &#x2014;';
      expect(decodeHtmlEntities(input)).toBe('Emoji: 😀 & symbol: —');
    });

    it('handles strings without entities unchanged', () => {
      expect(decodeHtmlEntities('Simple plain text')).toBe('Simple plain text');
    });
  });

  describe('stripHtmlBoilerplate', () => {
    it('removes nav, header, footer, aside, and scripts', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script>console.log("bad")</script>
            <style>.cls { color: red; }</style>
          </head>
          <body>
            <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
            <aside class="sidebar">Recent posts list</aside>
            <main><p>Substantive article content goes here.</p></main>
            <footer><p>Copyright 2026. All rights reserved.</p></footer>
          </body>
        </html>
      `;
      const cleaned = stripHtmlBoilerplate(html);
      expect(cleaned).not.toContain('console.log');
      expect(cleaned).not.toContain('.cls { color');
      expect(cleaned).not.toContain('Home');
      expect(cleaned).not.toContain('About');
      expect(cleaned).not.toContain('Recent posts list');
      expect(cleaned).not.toContain('Copyright 2026');
      expect(cleaned).toContain('Substantive article content goes here.');
    });

    it('removes cookie banners and consent popups by class heuristic', () => {
      const html = `
        <div class="cookie-banner-consent">
          <p>We use cookies to ensure optimal performance. Accept all cookies.</p>
        </div>
        <article><p>Real news article</p></article>
      `;
      const cleaned = stripHtmlBoilerplate(html);
      expect(cleaned).not.toContain('Accept all cookies');
      expect(cleaned).toContain('Real news article');
    });

    it('removes dialogs and elements with aria-hidden="true"', () => {
      const html = `
        <div aria-hidden="true"><span>Decorative background elements</span></div>
        <dialog open><p>Subscribe to our newsletter!</p></dialog>
        <p>Main message</p>
      `;
      const cleaned = stripHtmlBoilerplate(html);
      expect(cleaned).not.toContain('Decorative background');
      expect(cleaned).not.toContain('newsletter');
      expect(cleaned).toContain('Main message');
    });
  });

  describe('extractMainContentContainer', () => {
    it('prioritizes <article> when substantial text is present', () => {
      const articleText = 'A'.repeat(200);
      const otherText = 'B'.repeat(100);
      const html = `<div>${otherText}</div><article><p>${articleText}</p></article>`;
      const extracted = extractMainContentContainer(html);
      expect(extracted).toContain(articleText);
      expect(extracted).not.toContain(otherText);
    });

    it('prioritizes <main> container when article is not found', () => {
      const mainText = 'Substantive article '.repeat(15);
      const html = `<div class="sidebar">Side stuff</div><main><p>${mainText}</p></main>`;
      const extracted = extractMainContentContainer(html);
      expect(extracted).toContain(mainText);
      expect(extracted).not.toContain('Side stuff');
    });
  });

  describe('htmlToStructuredText', () => {
    it('formats headings with markdown symbols', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2><p>Body text.</p>';
      const formatted = htmlToStructuredText(html);
      expect(formatted).toContain('# Title');
      expect(formatted).toContain('## Subtitle');
      expect(formatted).toContain('Body text.');
    });

    it('formats list items with bullet points', () => {
      const html = '<ul><li>First item</li><li>Second item</li></ul>';
      const formatted = htmlToStructuredText(html);
      expect(formatted).toContain('* First item');
      expect(formatted).toContain('* Second item');
    });

    it('formats blockquotes and code blocks', () => {
      const html = '<blockquote>Inspiring quote</blockquote><pre><code>const x = 10;</code></pre>';
      const formatted = htmlToStructuredText(html);
      expect(formatted).toContain('> Inspiring quote');
      expect(formatted).toContain('```\nconst x = 10;\n```');
    });
  });

  describe('extractHtmlMetadata', () => {
    it('extracts OpenGraph metadata', () => {
      const html = `
        <head>
          <meta property="og:title" content="Breaking News: Next Big AI Leap" />
          <meta property="og:description" content="Detailed analysis of offline LLM capabilities." />
          <meta property="og:site_name" content="Tech Dispatch" />
          <meta property="article:published_time" content="2026-09-15T12:00:00Z" />
          <meta name="author" content="Jane Doe" />
        </head>
      `;
      const meta = extractHtmlMetadata(html);
      expect(meta.title).toBe('Breaking News: Next Big AI Leap');
      expect(meta.description).toBe('Detailed analysis of offline LLM capabilities.');
      expect(meta.siteName).toBe('Tech Dispatch');
      expect(meta.author).toBe('Jane Doe');
      expect(meta.publishedTime).toBe('2026-09-15T12:00:00Z');
    });

    it('extracts Schema.org JSON-LD for SPAs', () => {
      const html = `
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "NewsArticle",
              "headline": "Breakthrough in Edge Computing",
              "description": "On-device models run faster than ever before.",
              "datePublished": "2026-09-15",
              "author": {
                "@type": "Person",
                "name": "Dr. Alan Smith"
              }
            }
          </script>
        </head>
        <body><div id="root"></div></body>
      `;
      const meta = extractHtmlMetadata(html);
      expect(meta.title).toBe('Breakthrough in Edge Computing');
      expect(meta.description).toBe('On-device models run faster than ever before.');
      expect(meta.author).toBe('Dr. Alan Smith');
      expect(meta.publishedTime).toBe('2026-09-15');
    });
  });

  describe('parseRssOrAtomFeed', () => {
    it('parses RSS 2.0 feed into structured items', () => {
      const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Tech Daily RSS</title>
            <description>Latest technology news and updates</description>
            <item>
              <title>OFLN v1.2 Released</title>
              <link>https://example.com/ofln-v1-2</link>
              <pubDate>Tue, 15 Sep 2026 18:00:00 GMT</pubDate>
              <description>Full offline LLM task runner support now included.</description>
            </item>
          </channel>
        </rss>
      `;
      const feed = parseRssOrAtomFeed(rssXml);
      expect(feed).not.toBeNull();
      expect(feed?.isFeed).toBe(true);
      expect(feed?.metadata.title).toBe('Tech Daily RSS');
      expect(feed?.text).toContain('Feed: Tech Daily RSS');
      expect(feed?.text).toContain('### 1. OFLN v1.2 Released');
      expect(feed?.text).toContain('Published: Tue, 15 Sep 2026 18:00:00 GMT');
      expect(feed?.text).toContain('Link: https://example.com/ofln-v1-2');
      expect(feed?.text).toContain('Full offline LLM task runner support now included.');
    });

    it('parses Atom feed entries into structured items', () => {
      const atomXml = `<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Engineering Blog</title>
          <entry>
            <title>Scaling Offline Inference</title>
            <link href="https://example.com/scaling-offline" />
            <published>2026-09-15T15:00:00Z</published>
            <summary>Architectural insights into native WakeLock and RAM fit.</summary>
          </entry>
        </feed>
      `;
      const feed = parseRssOrAtomFeed(atomXml);
      expect(feed).not.toBeNull();
      expect(feed?.isFeed).toBe(true);
      expect(feed?.metadata.title).toBe('Engineering Blog');
      expect(feed?.text).toContain('Feed: Engineering Blog');
      expect(feed?.text).toContain('### 1. Scaling Offline Inference');
      expect(feed?.text).toContain('Architectural insights into native WakeLock and RAM fit.');
    });
  });

  describe('smartTruncateText', () => {
    it('does not truncate text within limits', () => {
      const text = 'Hello world, short text.';
      const res = smartTruncateText(text, 100);
      expect(res.truncated).toBe(false);
      expect(res.text).toBe(text);
    });

    it('truncates at paragraph boundary when available', () => {
      const p1 = 'First paragraph content that is long enough.'.repeat(4);
      const p2 = 'Second paragraph content.'.repeat(4);
      const fullText = `${p1}\n\n${p2}`;
      const res = smartTruncateText(fullText, p1.length + 20);
      expect(res.truncated).toBe(true);
      expect(res.text).toContain(p1);
      expect(res.text).toContain('[…truncated');
      expect(res.text.endsWith('[…truncated 100 characters to fit analysis limits]')).toBe(false);
    });

    it('truncates at sentence boundary when no paragraph boundary exists', () => {
      const s1 = 'First sentence is complete here.';
      const s2 = ' Second sentence is also quite interesting.';
      const full = s1 + s2;
      const res = smartTruncateText(full, s1.length + 10);
      expect(res.truncated).toBe(true);
      expect(res.text).toContain(s1);
    });
  });

  describe('extractWebContent integration', () => {
    it('supplements SPA blank body with metadata summary', () => {
      const spaHtml = `
        <html>
          <head>
            <meta property="og:title" content="Interactive SPA Web App" />
            <meta property="og:description" content="This is an SPA dashboard rendered on client side." />
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `;
      const res = extractWebContent(spaHtml, 'text/html');
      expect(res.metadata.title).toBe('Interactive SPA Web App');
      expect(res.text).toContain('# Interactive SPA Web App');
      expect(res.text).toContain('This is an SPA dashboard rendered on client side.');
    });
  });
});
