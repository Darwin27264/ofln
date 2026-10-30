/**
 * Share Sheet & Text Selection prompt builder.
 * Pure text transforms for ShareOverlay, background intents, and automation.
 */

export type ActionType =
  | 'summarize'
  | 'rephrase'
  | 'tone_formal'
  | 'tone_casual'
  | 'fix_grammar'
  | 'translate'
  | 'draft_reply'
  | 'key_points'
  | 'simplify'
  | 'custom';

export interface ActionPillConfig {
  id: ActionType;
  label: string;
  icon: string;
}

export const ACTION_PILLS: ActionPillConfig[] = [
  { id: 'summarize', label: 'Summarize', icon: 'sparkles-outline' },
  { id: 'rephrase', label: 'Rephrase', icon: 'sync-outline' },
  { id: 'fix_grammar', label: 'Fix Grammar', icon: 'checkmark-circle-outline' },
  { id: 'translate', label: 'Translate', icon: 'language-outline' },
  { id: 'draft_reply', label: 'Reply', icon: 'arrow-undo-outline' },
  { id: 'tone_formal', label: 'Formal', icon: 'briefcase-outline' },
  { id: 'tone_casual', label: 'Casual', icon: 'cafe-outline' },
  { id: 'key_points', label: 'Key Points', icon: 'bulb-outline' },
  { id: 'simplify', label: 'Simplify', icon: 'reader-outline' },
  { id: 'custom', label: 'Ask...', icon: 'chatbubble-ellipses-outline' },
];

export const SHARE_SYSTEM_PROMPT =
  'You are ofln, an expert on-device text processing assistant. ' +
  'Directly perform the requested transformation (summarize, rephrase, fix grammar, translate, reply, change tone, or simplify) ' +
  'on the provided source text. Output the result directly without conversational preamble, pleasantries, ' +
  'or asking for confirmation.';

export function buildPromptText(
  action: ActionType,
  sourceText: string,
  custom?: string,
): string {
  const trimmed = sourceText.trim();
  switch (action) {
    case 'summarize':
      return `Summarize the following content into concise, clear bullet points:\n\n"""\n${trimmed}\n"""\n\nKey Summary:`;
    case 'rephrase':
      return `Rewrite the following text to be polished, clear, and natural while preserving its original meaning:\n\n"""\n${trimmed}\n"""\n\nPolished Version:`;
    case 'fix_grammar':
      return `Fix all grammar, spelling, punctuation, and phrasing errors in the following text, preserving its meaning and tone. Output only the corrected text:\n\n"""\n${trimmed}\n"""\n\nCorrected Version:`;
    case 'translate':
      return `Translate the following text into English (or into Spanish if already in English), maintaining natural phrasing and fidelity to the original meaning. Output only the translation:\n\n"""\n${trimmed}\n"""\n\nTranslation:`;
    case 'draft_reply':
      return `Draft a thoughtful, concise, and helpful reply to the following message:\n\n"""\n${trimmed}\n"""\n\nSuggested Reply:`;
    case 'tone_formal':
      return `Rewrite the following text in a professional, polite, and formal tone:\n\n"""\n${trimmed}\n"""\n\nFormal Version:`;
    case 'tone_casual':
      return `Rewrite the following text in a friendly, conversational, and relaxed tone:\n\n"""\n${trimmed}\n"""\n\nCasual Version:`;
    case 'key_points':
      return `Extract the key takeaways, core facts, and action items from the following content:\n\n"""\n${trimmed}\n"""\n\nKey Takeaways:`;
    case 'simplify':
      return `Explain the following content in simple, easy-to-understand terms:\n\n"""\n${trimmed}\n"""\n\nSimplified Explanation:`;
    case 'custom':
      return `${(custom || '').trim()}\n\nSource Content:\n"""\n${trimmed}\n"""`;
  }
}
