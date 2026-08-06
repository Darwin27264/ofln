import {
  documentInjectCharBudget,
  truncateDocumentForInject,
  inspectPdfSample,
  isInsufficientPdfExtract,
  isDocumentLimitationMessage,
  buildAttachmentTextForPrompt,
  sanitizeChatDocumentFileName,
  isLikelyPdfMeta,
  DOCUMENT_MESSAGES,
  DOCUMENT_MAX_PDF_BYTES,
  DOCUMENT_MAX_INJECT_CHARS,
  DOCUMENT_MIN_MEANINGFUL_CHARS,
} from '../src/utils/documentHelpers';

describe('documentInjectCharBudget', () => {
  it('caps at DOCUMENT_MAX_INJECT_CHARS for large contexts', () => {
    const budget = documentInjectCharBudget(32768, 1024);
    expect(budget).toBeLessThanOrEqual(DOCUMENT_MAX_INJECT_CHARS);
    expect(budget).toBeGreaterThan(1000);
  });

  it('shrinks on small n_ctx so docs cannot blow context', () => {
    const small = documentInjectCharBudget(1024, 256);
    const large = documentInjectCharBudget(8192, 512);
    expect(small).toBeLessThan(large);
    expect(small).toBeGreaterThanOrEqual(256);
  });
});

describe('truncateDocumentForInject', () => {
  it('returns short text unchanged', () => {
    expect(truncateDocumentForInject('hello', 100)).toBe('hello');
  });

  it('truncates and notes dropped characters', () => {
    const out = truncateDocumentForInject('abcdefghij', 5);
    expect(out.startsWith('abcde')).toBe(true);
    expect(out).toMatch(/truncated 5 characters/i);
  });
});

describe('inspectPdfSample', () => {
  it('detects PDF header and encryption', () => {
    expect(inspectPdfSample('%PDF-1.4\nrest').isPdf).toBe(true);
    expect(inspectPdfSample('%PDF-1.7\n/Encrypt 5 0 R').encrypted).toBe(true);
    expect(inspectPdfSample('not a pdf').isPdf).toBe(false);
  });
});

describe('isInsufficientPdfExtract', () => {
  it('flags empty and tiny noise', () => {
    expect(isInsufficientPdfExtract('')).toBe(true);
    expect(isInsufficientPdfExtract('   \n  ')).toBe(true);
    expect(isInsufficientPdfExtract('x'.repeat(DOCUMENT_MIN_MEANINGFUL_CHARS - 1))).toBe(
      true,
    );
    expect(isInsufficientPdfExtract('Meaningful extractable paragraph.')).toBe(false);
  });
});

describe('isDocumentLimitationMessage', () => {
  it('recognizes honest refusal strings', () => {
    expect(isDocumentLimitationMessage(DOCUMENT_MESSAGES.scanned)).toBe(true);
    expect(isDocumentLimitationMessage(DOCUMENT_MESSAGES.encrypted)).toBe(true);
    expect(
      isDocumentLimitationMessage(
        DOCUMENT_MESSAGES.tooLarge('12.0', String(DOCUMENT_MAX_PDF_BYTES / (1024 * 1024))),
      ),
    ).toBe(true);
    expect(isDocumentLimitationMessage('Normal document body text.')).toBe(false);
  });
});

describe('buildAttachmentTextForPrompt', () => {
  it('wraps PDF extract (or honest refusal) for native completion', () => {
    const out = buildAttachmentTextForPrompt('pdf', 'Hello from the PDF.', 'Summarize');
    expect(out).toBe(
      '[Document]\nHello from the PDF.\n\n[User]\nSummarize',
    );
    const refuse = buildAttachmentTextForPrompt('pdf', DOCUMENT_MESSAGES.scanned, '');
    expect(refuse).toContain('[Document]');
    expect(refuse).toContain(DOCUMENT_MESSAGES.scanned);
    expect(refuse).toContain('(No additional text)');
  });

  it('wraps image OCR text like the legacy image inject path', () => {
    const out = buildAttachmentTextForPrompt('image', 'receipt total 12', 'what is the total?');
    expect(out).toBe(
      '[Attached Image OCR]\nreceipt total 12\n\n[User]\nwhat is the total?',
    );
    expect(buildAttachmentTextForPrompt('image', '', '')).toContain('(No text detected.)');
  });
});

describe('sanitizeChatDocumentFileName', () => {
  it('strips path segments and forces .pdf', () => {
    expect(sanitizeChatDocumentFileName('../etc/passwd')).toBe('passwd.pdf');
    expect(sanitizeChatDocumentFileName('notes')).toBe('notes.pdf');
    expect(sanitizeChatDocumentFileName('My Report.PDF')).toBe('My Report.PDF');
    expect(sanitizeChatDocumentFileName('weird<>name?.doc')).toMatch(/\.pdf$/i);
  });

  it('never returns empty or dot-only names', () => {
    expect(sanitizeChatDocumentFileName('...')).toBe('document.pdf');
    expect(sanitizeChatDocumentFileName('')).toBe('document.pdf');
    expect(sanitizeChatDocumentFileName(null)).toBe('document.pdf');
  });
});

describe('isLikelyPdfMeta', () => {
  it('accepts extension or PDF MIME', () => {
    expect(isLikelyPdfMeta('a.pdf', '')).toBe(true);
    expect(isLikelyPdfMeta('a', 'application/pdf')).toBe(true);
    expect(isLikelyPdfMeta('a', 'application/x-pdf')).toBe(true);
    expect(isLikelyPdfMeta('a.png', 'image/png')).toBe(false);
  });
});
