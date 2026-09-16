/**
 * Web Content Extraction Engine
 *
 * Implements industry best practices for extracting clean, high-signal,
 * LLM-ready text from HTML pages, RSS/Atom feeds, and JSON APIs.
 *
 * Designed specifically for React Native / Hermes:
 * - Pure TypeScript / JavaScript with zero native dependencies
 * - Memory and regex safe (avoids catastrophic backtracking)
 * - Extracts OpenGraph, Twitter Cards, and Schema.org JSON-LD for client-side SPAs
 * - Removes navigation, headers, footers, cookie banners, ads, and layout noise
 * - Prioritizes main article containers (<article>, <main>, #content)
 * - Decodes full suite of HTML named, decimal, and hex entities
 */

export type ExtractedMetadata = {
  title?: string;
  description?: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  language?: string;
};

export type WebExtractionResult = {
  text: string;
  metadata: ExtractedMetadata;
  isFeed: boolean;
};

// Common HTML named entities lookup table
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  times: '×',
  divide: '÷',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  para: '¶',
  sect: '§',
  dagger: '†',
  ddagger: '‡',
  permil: '‰',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  check: '✓',
  hearts: '♥',
  spades: '♠',
  clubs: '♣',
  diams: '♦',
};

/**
 * Decode all HTML entities: named (&mdash;), decimal (&#8212;), and hex (&#x2014;).
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes('&')) return input || '';

  return input.replace(/&([a-zA-Z0-9#]+);/g, (match, entity) => {
    // Decimal: &#1234;
    if (entity.startsWith('#') && !entity.startsWith('#x') && !entity.startsWith('#X')) {
      const code = parseInt(entity.slice(1), 10);
      if (!Number.isNaN(code) && code >= 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return ' ';
        }
      }
      return match;
    }

    // Hex: &#x1f600;
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      if (!Number.isNaN(code) && code >= 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return ' ';
        }
      }
      return match;
    }

    // Named: &mdash;
    const lower = entity.toLowerCase();
    if (NAMED_ENTITIES[lower] !== undefined) {
      return NAMED_ENTITIES[lower];
    }

    return match;
  });
}

/**
 * Strip CDATA wrappers: <![CDATA[ content ]]>
 */
export function stripCData(raw: string): string {
  return (raw || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
}

/**
 * Extract OpenGraph, Twitter Card, and standard HTML metadata from HTML string.
 */
export function extractHtmlMetadata(html: string): ExtractedMetadata {
  const meta: ExtractedMetadata = {};
  const s = String(html || '');

  // Helper to extract content attribute from a meta tag
  const findMetaContent = (nameOrPropPattern: string): string | undefined => {
    // Handles <meta property="..." content="..."> and <meta content="..." property="...">
    const regex1 = new RegExp(
      `<meta[^>]+(?:property|name)=["'](?:${nameOrPropPattern})["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    const m1 = s.match(regex1);
    if (m1 && m1[1]) return decodeHtmlEntities(m1[1].trim());

    const regex2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:${nameOrPropPattern})["']`,
      'i',
    );
    const m2 = s.match(regex2);
    if (m2 && m2[1]) return decodeHtmlEntities(m2[1].trim());

    return undefined;
  };

  // Title: og:title -> twitter:title -> <title>
  const ogTitle = findMetaContent('og:title');
  const twTitle = findMetaContent('twitter:title');
  const titleTagMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleTag = titleTagMatch
    ? decodeHtmlEntities(stripTags(titleTagMatch[1])).trim()
    : undefined;

  meta.title = ogTitle || twTitle || titleTag;

  // Description / Summary: og:description -> twitter:description -> description
  const ogDesc = findMetaContent('og:description');
  const twDesc = findMetaContent('twitter:description');
  const desc = findMetaContent('description');
  meta.description = ogDesc || twDesc || desc;

  // Author / Publisher: author -> article:author -> og:site_name
  const author = findMetaContent('author|article:author');
  meta.author = author;

  const siteName = findMetaContent('og:site_name');
  meta.siteName = siteName;

  // Published Time: article:published_time -> date
  const pubTime = findMetaContent('article:published_time|date|pubdate');
  if (pubTime) {
    meta.publishedTime = pubTime;
  } else {
    const timeTagMatch = s.match(/<time[^>]+datetime=["']([^"']*)["']/i);
    if (timeTagMatch && timeTagMatch[1]) {
      meta.publishedTime = timeTagMatch[1].trim();
    }
  }

  // Check Schema.org JSON-LD (<script type="application/ld+json">)
  // This is critical for SPAs (Single Page Applications) where the body is empty
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch: RegExpExecArray | null;

  while ((jsonLdMatch = jsonLdRegex.exec(s)) !== null) {
    try {
      const rawJson = stripCData(jsonLdMatch[1]).trim();
      if (!rawJson) continue;
      const parsed = JSON.parse(rawJson);

      // May be an array, single object, or @graph
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item['@type'] || '').toLowerCase();
        const isArticle =
          type.includes('article') ||
          type.includes('news') ||
          type.includes('post') ||
          type.includes('webpage') ||
          type.includes('product');

        if (isArticle) {
          if (!meta.title && item.headline) {
            meta.title = decodeHtmlEntities(String(item.headline).trim());
          }
          if (!meta.description && item.description) {
            meta.description = decodeHtmlEntities(String(item.description).trim());
          }
          if (!meta.author) {
            if (typeof item.author === 'string') {
              meta.author = decodeHtmlEntities(item.author.trim());
            } else if (item.author && typeof item.author.name === 'string') {
              meta.author = decodeHtmlEntities(item.author.name.trim());
            } else if (Array.isArray(item.author) && item.author[0]?.name) {
              meta.author = decodeHtmlEntities(item.author[0].name.trim());
            }
          }
          if (!meta.publishedTime && (item.datePublished || item.dateCreated)) {
            meta.publishedTime = String(item.datePublished || item.dateCreated).trim();
          }
          if (!meta.siteName && item.publisher?.name) {
            meta.siteName = decodeHtmlEntities(String(item.publisher.name).trim());
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in malformed ld+json
    }
  }

  return meta;
}

/**
 * Remove scripts, styles, navigation, footers, cookie dialogs, and layout clutter.
 */
export function stripHtmlBoilerplate(html: string): string {
  let s = String(html || '');

  // Strip HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');

  // Strip code, scripts, styles, embeds, and media tags
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<template[\s\S]*?<\/template>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<canvas[\s\S]*?<\/canvas>/gi, ' ');
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
  s = s.replace(/<video[\s\S]*?<\/video>/gi, ' ');
  s = s.replace(/<audio[\s\S]*?<\/audio>/gi, ' ');
  s = s.replace(/<object[\s\S]*?<\/object>/gi, ' ');
  s = s.replace(/<embed[\s\S]*?<\/embed>/gi, ' ');

  // Strip structural boilerplate: nav, header, footer, aside, forms, dialogs
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  s = s.replace(/<form[\s\S]*?<\/form>/gi, ' ');
  s = s.replace(/<button[\s\S]*?<\/button>/gi, ' ');
  s = s.replace(/<dialog[\s\S]*?<\/dialog>/gi, ' ');

  // Strip cookie notices, consent popups, and ad containers by class/id patterns
  s = s.replace(
    /<(?:div|section|aside|div|span)[^>]*(?:class|id)=["'][^"']*(?:cookie|consent|notice|gdpr|advertisement|ad-banner|share-button)[^"']*["'][\s\S]*?<\/(?:div|section|aside|span)>/gi,
    ' ',
  );

  // Strip elements with aria-hidden="true" or dialog roles
  s = s.replace(
    /<(?:div|section|aside|span)[^>]*(?:aria-hidden=["']true["']|role=["'](?:dialog|alertdialog|banner|navigation)["'])[\s\S]*?<\/(?:div|section|aside|span)>/gi,
    ' ',
  );

  return s;
}

/**
 * Prioritize main article containers (Readability heuristic).
 * If an article or main container has substantial content (>150 chars),
 * return that instead of the entire cluttered document.
 */
export function extractMainContentContainer(html: string): string {
  // Check for <article>
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch && stripTags(articleMatch[1]).trim().length > 150) {
    return articleMatch[1];
  }

  // Check for <main> or role="main"
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && stripTags(mainMatch[1]).trim().length > 150) {
    return mainMatch[1];
  }

  const roleMainMatch = html.match(
    /<(?:div|section)[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i,
  );
  if (roleMainMatch && stripTags(roleMainMatch[1]).trim().length > 150) {
    return roleMainMatch[1];
  }

  // Check for common content wrapper IDs/classes
  const contentWrapperMatch = html.match(
    /<(?:div|section)[^>]*(?:id|class)=["'][^"']*(?:main-content|article-content|post-content|entry-content|article-body|story-body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i,
  );
  if (contentWrapperMatch && stripTags(contentWrapperMatch[1]).trim().length > 150) {
    return contentWrapperMatch[1];
  }

  // Fallback to body or entire html
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

/**
 * Remove all HTML tags.
 */
export function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ');
}

/**
 * Convert HTML to clean, structured markdown/plain text for LLM consumption.
 */
export function htmlToStructuredText(rawHtml: string): string {
  const cleaned = stripHtmlBoilerplate(rawHtml);
  const main = extractMainContentContainer(cleaned);

  let s = main;

  // Format Headings: <h1> -> # Title, <h2> -> ## Subtitle, etc.
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  s = s.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');
  s = s.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

  // Format blockquotes
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n');

  // Format preformatted code blocks
  s = s.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, ' `$1` ');

  // Format list items
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n* $1');

  // Format table rows and cells
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, '\n| $1');
  s = s.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, ' $1 |');

  // Format paragraphs and block breaks
  s = s.replace(/<\/(p|div|section|article|tr|table)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Strip all remaining tags
  s = stripTags(s);

  // Decode HTML entities
  s = decodeHtmlEntities(s);

  // Clean up whitespace: normalize spaces, strip trailing line whitespace
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');

  return s.trim();
}

/**
 * Parse RSS 2.0 or Atom XML feeds into structured, LLM-ready digest.
 */
export function parseRssOrAtomFeed(xml: string, maxItems: number = 15): WebExtractionResult | null {
  const s = stripCData(String(xml || ''));

  const isRss = /<rss[\s>]|<channel[\s>]/i.test(s);
  const isAtom = /<feed[\s>]|xmlns=["'][^"']*atom/i.test(s);

  if (!isRss && !isAtom) {
    return null;
  }

  // Extract Feed Title and Description
  const channelTitleMatch =
    s.match(/<channel[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) ||
    s.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
  const feedTitle = channelTitleMatch
    ? decodeHtmlEntities(stripTags(channelTitleMatch[1])).trim()
    : 'Feed';

  const channelDescMatch =
    s.match(/<channel[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i) ||
    s.match(/<feed[^>]*>[\s\S]*?<subtitle[^>]*>([\s\S]*?)<\/subtitle>/i);
  const feedDescription = channelDescMatch
    ? decodeHtmlEntities(stripTags(channelDescMatch[1])).trim()
    : undefined;

  // Extract items/entries
  const items: Array<{
    title: string;
    link?: string;
    published?: string;
    author?: string;
    summary?: string;
  }> = [];

  const itemRegex = isRss ? /<item[\s\S]*?<\/item>/gi : /<entry[\s\S]*?<\/entry>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(s)) !== null && items.length < maxItems) {
    const itemXml = itemMatch[0];

    // Item Title
    const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? decodeHtmlEntities(stripTags(titleMatch[1])).trim()
      : 'Untitled Item';

    // Item Link
    let link: string | undefined;
    const linkHrefMatch = itemXml.match(/<link[^>]+href=["']([^"']*)["']/i);
    if (linkHrefMatch && linkHrefMatch[1]) {
      link = linkHrefMatch[1].trim();
    } else {
      const linkTagMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
      if (linkTagMatch && linkTagMatch[1]) {
        link = linkTagMatch[1].trim();
      }
    }

    // Published Date
    const dateMatch =
      itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      itemXml.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
      itemXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
      itemXml.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
    const published = dateMatch
      ? decodeHtmlEntities(stripTags(dateMatch[1])).trim()
      : undefined;

    // Author
    const authorMatch =
      itemXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) ||
      itemXml.match(/<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>/i) ||
      itemXml.match(/<author[^>]*>([\s\S]*?)<\/author>/i);
    const author = authorMatch
      ? decodeHtmlEntities(stripTags(authorMatch[1])).trim()
      : undefined;

    // Summary / Content
    const summaryMatch =
      itemXml.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
      itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      itemXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
      itemXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    const summary = summaryMatch
      ? decodeHtmlEntities(stripTags(summaryMatch[1])).replace(/\s+/g, ' ').trim()
      : undefined;

    items.push({ title, link, published, author, summary });
  }

  // Build formatted feed text
  const lines: string[] = [];
  lines.push(`Feed: ${feedTitle}`);
  if (feedDescription) {
    lines.push(`Description: ${feedDescription}`);
  }
  lines.push(`Total items: ${items.length}`);
  lines.push('');

  items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`);
    if (item.published) lines.push(`Published: ${item.published}`);
    if (item.author) lines.push(`Author: ${item.author}`);
    if (item.link) lines.push(`Link: ${item.link}`);
    if (item.summary) {
      const shortSummary =
        item.summary.length > 500
          ? `${item.summary.slice(0, 500)}...`
          : item.summary;
      lines.push(`Summary: ${shortSummary}`);
    }
    lines.push('');
  });

  return {
    text: lines.join('\n').trim(),
    metadata: {
      title: feedTitle,
      description: feedDescription,
    },
    isFeed: true,
  };
}

/**
 * Format JSON API responses into readable, indented text.
 */
export function formatJsonPayload(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawJson;
  }
}

/**
 * Extract content from HTML, RSS/Atom XML, or JSON into an LLM-ready text string.
 */
export function extractWebContent(raw: string, contentType: string | null): WebExtractionResult {
  const lowerType = (contentType || '').toLowerCase();
  const trimmed = (raw || '').trim();

  // 1. Check for RSS/Atom XML Feeds
  if (
    lowerType.includes('xml') ||
    lowerType.includes('rss') ||
    lowerType.includes('atom') ||
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<rss') ||
    trimmed.startsWith('<feed')
  ) {
    const feedResult = parseRssOrAtomFeed(trimmed);
    if (feedResult) return feedResult;
  }

  // 2. Check for JSON APIs
  if (
    lowerType.includes('json') ||
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    const formatted = formatJsonPayload(trimmed);
    return {
      text: formatted,
      metadata: {},
      isFeed: false,
    };
  }

  // 3. HTML Page Processing
  const metadata = extractHtmlMetadata(raw);
  let bodyText = htmlToStructuredText(raw);

  // If the extracted body text is extremely short (< 120 chars) but we have rich
  // metadata (typical for client-side SPAs like Twitter, Reddit, Medium, Next.js apps),
  // supplement the text with the title and description so the LLM has substantial context!
  if (bodyText.length < 120 && (metadata.title || metadata.description)) {
    const parts: string[] = [];
    if (metadata.title) parts.push(`# ${metadata.title}`);
    if (metadata.description) parts.push(metadata.description);
    if (bodyText.length > 0) parts.push(bodyText);
    bodyText = parts.join('\n\n');
  }

  return {
    text: bodyText,
    metadata,
    isFeed: false,
  };
}

/**
 * Smart truncation: Truncates at paragraph or sentence boundaries
 * rather than cutting off in the middle of words or sentences.
 */
export function smartTruncateText(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  const t = (text || '').trim();
  if (t.length <= maxChars) {
    return { text: t, truncated: false };
  }

  // Search for the best boundary in the window [maxChars - 400, maxChars]
  const minCut = Math.max(0, maxChars - 400);
  const windowSlice = t.slice(minCut, maxChars);

  // Preferred break 1: double newline (paragraph end)
  const lastDoubleNewline = windowSlice.lastIndexOf('\n\n');
  if (lastDoubleNewline !== -1) {
    const cut = minCut + lastDoubleNewline;
    return {
      text: `${t.slice(0, cut).trim()}\n\n[…truncated ${t.length - cut} characters to fit analysis limits]`,
      truncated: true,
    };
  }

  // Preferred break 2: sentence end (. / ! / ?)
  const sentenceMatch = windowSlice.match(/.*[.!?]\s+/s);
  if (sentenceMatch && sentenceMatch[0]) {
    const cut = minCut + sentenceMatch[0].length;
    return {
      text: `${t.slice(0, cut).trim()}\n\n[…truncated ${t.length - cut} characters to fit analysis limits]`,
      truncated: true,
    };
  }

  // Preferred break 3: single newline
  const lastNewline = windowSlice.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const cut = minCut + lastNewline;
    return {
      text: `${t.slice(0, cut).trim()}\n\n[…truncated ${t.length - cut} characters to fit analysis limits]`,
      truncated: true,
    };
  }

  // Preferred break 4: whitespace
  const lastSpace = windowSlice.lastIndexOf(' ');
  if (lastSpace !== -1) {
    const cut = minCut + lastSpace;
    return {
      text: `${t.slice(0, cut).trim()}\n\n[…truncated ${t.length - cut} characters to fit analysis limits]`,
      truncated: true,
    };
  }

  // Fallback: hard cut
  return {
    text: `${t.slice(0, maxChars)}\n\n[…truncated ${t.length - maxChars} characters to fit analysis limits]`,
    truncated: true,
  };
}
