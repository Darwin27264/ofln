/**
 * Build Markdown for local chat export.
 * Pure — share sheet wiring lives in the screen/handler.
 */

export type ExportableMessage = {
  role: string;
  content: string;
  thought?: string;
  personaName?: string;
};

export type BuildChatMarkdownOptions = {
  title?: string;
  /** ISO or locale date string; omitted if empty. */
  exportedAt?: string;
};

function headingForRole(role: string, personaName?: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') {
    const name = (personaName || '').trim();
    return name || 'Assistant';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** True when a message should appear in the export body. */
export function isExportableMessage(msg: ExportableMessage): boolean {
  if (msg.role === 'system') return false;
  const content = (msg.content || '').trim();
  const thought = (msg.thought || '').trim();
  return content.length > 0 || thought.length > 0;
}

/**
 * Build a calm Markdown document from chat messages.
 * Skips system prompts and empty placeholders.
 */
export function buildChatMarkdown(
  messages: ExportableMessage[],
  options: BuildChatMarkdownOptions = {},
): string {
  const title = (options.title || 'Chat').trim() || 'Chat';
  const lines: string[] = [`# ${title}`, ''];

  if (options.exportedAt) {
    lines.push(`*Exported from OFLN — ${options.exportedAt}*`, '');
  } else {
    lines.push('*Exported from OFLN*', '');
  }

  const visible = messages.filter(isExportableMessage);
  if (visible.length === 0) {
    lines.push('_No messages to export._', '');
    return lines.join('\n').trimEnd() + '\n';
  }

  for (const msg of visible) {
    lines.push(`## ${headingForRole(msg.role, msg.personaName)}`, '');
    const content = (msg.content || '').trim();
    if (content) {
      lines.push(content, '');
    }
    const thought = (msg.thought || '').trim();
    if (thought) {
      lines.push('### Thinking', '', thought, '');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
