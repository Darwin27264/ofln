/**
 * Slash commands registry and execution helpers for OFLN.
 * Provides on-device actions, diagnostics, context inspection, and developer utilities.
 */

import { formatRamGb, getTotalMemoryBytes, getUsedMemoryBytes } from '../services/ramFitService';
import {
  getThermalLevel,
  formatThermalLabel,
  formatThermalHint,
} from '../services/thermalService';
import { estimateConversationTokens } from './contextFullness';
import { buildChatMarkdown } from './chatMarkdownExport';
import type { Message } from '../screens/ConversationScreen';

export type SlashCommand = {
  name: string;
  label: string;
  title: string;
  syntax: string;
  description: string;
  icon: string;
  aliases?: string[];
  hasArgs?: boolean;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'stats',
    label: '/stats',
    title: 'Hardware & System Stats',
    syntax: '/stats',
    description: 'Device RAM, thermal state, battery & GPU/NPU acceleration',
    icon: 'hardware-chip-outline',
    aliases: ['device', 'hw'],
  },
  {
    name: 'context',
    label: '/context',
    title: 'Context & Token Window',
    syntax: '/context',
    description: 'Current conversation tokens, limit & headroom capacity',
    icon: 'layers-outline',
    aliases: ['tokens', 'ctx'],
  },
  {
    name: 'compact',
    label: '/compact',
    title: 'Compact Context',
    syntax: '/compact',
    description: 'Summarize earlier turns to reclaim context headroom',
    icon: 'contract-outline',
  },
  {
    name: 'export',
    label: '/export',
    title: 'Export Transcript',
    syntax: '/export',
    description: 'Copy entire chat to clipboard as formatted Markdown',
    icon: 'share-outline',
    aliases: ['copy', 'md'],
  },
  {
    name: 'clear',
    label: '/clear',
    title: 'Clear Chat',
    syntax: '/clear',
    description: 'Clear current conversation and start fresh',
    icon: 'trash-outline',
    aliases: ['reset', 'new'],
  },
  {
    name: 'demo',
    label: '/demo',
    title: 'Preview UI Demo',
    syntax: '/demo [thinking|stream]',
    description: 'Simulate thinking pill bubble or token-by-token streaming',
    icon: 'play-circle-outline',
    aliases: ['thinking'],
    hasArgs: true,
  },
  {
    name: 'temp',
    label: '/temp',
    title: 'Set Temperature',
    syntax: '/temp [0.0 - 2.0]',
    description: 'Inspect or adjust model sampling creativity',
    icon: 'thermometer-outline',
    aliases: ['temperature'],
    hasArgs: true,
  },
  {
    name: 'help',
    label: '/help',
    title: 'Help & Commands',
    syntax: '/help',
    description: 'Show reference list of all supported slash commands',
    icon: 'help-circle-outline',
    aliases: ['commands', '?'],
  },
];

/**
 * Filter slash commands matching user's current draft (e.g. "/st" -> stats).
 */
export function filterSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return [];

  // If user typed a space after command (e.g. "/demo "), don't show the palette
  if (input.includes(' ')) return [];

  const query = trimmed.slice(1).toLowerCase();
  if (!query) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.toLowerCase().startsWith(query)) return true;
    if (cmd.aliases?.some((a) => a.toLowerCase().startsWith(query))) return true;
    return false;
  });
}

/**
 * Parses user input into a slash command and its argument string.
 * Returns null if the input is not a slash command.
 */
export function parseSlashCommand(input: string): {
  command: SlashCommand;
  rawCommand: string;
  args: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const firstSpaceIndex = trimmed.indexOf(' ');
  const rawCommand = (
    firstSpaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpaceIndex)
  ).toLowerCase();
  const args = firstSpaceIndex === -1 ? '' : trimmed.slice(firstSpaceIndex + 1).trim();

  const command = SLASH_COMMANDS.find(
    (c) => c.name === rawCommand || c.aliases?.includes(rawCommand),
  );

  if (!command) return null;

  return { command, rawCommand, args };
}

/**
 * Markdown response for `/help`.
 */
export function buildHelpMarkdown(): string {
  const rows = SLASH_COMMANDS.map(
    (c) => `| **\`${c.syntax}\`** | ${c.description} |`,
  ).join('\n');

  return (
    `### ⚡ OFLN Slash Commands\n\n` +
    `| Command | Description |\n` +
    `|:---|:---|\n` +
    `${rows}\n\n` +
    `*Tip: Type \`/\` in the input bar anytime to open the interactive command palette.*`
  );
}

/**
 * Gathers system hardware metrics and formats a clean diagnostic card.
 */
export async function buildStatsMarkdown(params: {
  selectedModelName?: string | null;
  accelLabel?: string | null;
  accelDetail?: string | null;
}): Promise<string> {
  const [totalRam, usedRam, thermal] = await Promise.all([
    getTotalMemoryBytes(),
    getUsedMemoryBytes(),
    getThermalLevel({ force: true }).catch(() => 'unknown' as const),
  ]);

  const modelDisplay = params.selectedModelName
    ? `\`${params.selectedModelName}\``
    : '*None loaded*';

  let ramText = 'Unavailable on this build';
  if (totalRam != null && totalRam > 0) {
    if (usedRam != null && usedRam >= 0) {
      const pct = Math.max(0, Math.min(100, Math.round((usedRam / totalRam) * 100)));
      ramText = `${formatRamGb(usedRam)} / ${formatRamGb(totalRam)} (${pct}% used)`;
    } else {
      ramText = `Total: ${formatRamGb(totalRam)}`;
    }
  }

  const thermalLabel = formatThermalLabel(thermal);
  const thermalHint = formatThermalHint(thermal);

  const accelText = params.accelLabel
    ? `**${params.accelLabel}**${params.accelDetail ? ` (${params.accelDetail})` : ''}`
    : 'CPU / Native';

  return (
    `### 📱 System & Hardware Diagnostics\n\n` +
    `* **Active Model:** ${modelDisplay}\n` +
    `* **Hardware Acceleration:** ${accelText}\n` +
    `* **Device RAM:** ${ramText}\n` +
    `* **Thermal Status:** ${thermalLabel} — *${thermalHint}*\n`
  );
}

/**
 * Gathers context window utilization and returns a formatted report.
 */
export function buildContextMarkdown(params: {
  messages: Message[];
  n_ctx?: number;
}): string {
  const n_ctx = params.n_ctx && params.n_ctx > 0 ? params.n_ctx : 2048;
  const turns = params.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  ).length;

  const estimatedTokens = estimateConversationTokens(params.messages as any);
  const fullnessRatio = estimatedTokens / n_ctx;
  const pct = Math.max(0, Math.min(100, Math.round(fullnessRatio * 100)));
  const remaining = Math.max(0, n_ctx - estimatedTokens);

  const statusVerdict =
    pct >= 85
      ? '⚠️ **High context fullness.** Older turns may be trimmed or summarized soon.'
      : pct >= 60
        ? 'ℹ️ **Moderate context usage.** Headroom is healthy.'
        : '✅ **Ample headroom available.** Context is lightweight.';

  return (
    `### 📊 Context Window Utilization\n\n` +
    `* **Current Estimated Tokens:** ~**${estimatedTokens.toLocaleString()}** / **${n_ctx.toLocaleString()}** tokens (**${pct}%**)\n` +
    `* **Remaining Headroom:** ~**${remaining.toLocaleString()}** tokens\n` +
    `* **Conversation Turns:** **${turns}** messages in memory\n\n` +
    `${statusVerdict}\n\n` +
    `*Use \`/compact\` if you want to summarize earlier turns into a compact memory block.*`
  );
}

/**
 * Builds transcript markdown for `/export`.
 */
export function buildExportMarkdown(params: {
  messages: Message[];
  chatTitle?: string;
}): { markdown: string; turnsCount: number } {
  const turnsCount = params.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  ).length;
  const markdown = buildChatMarkdown(params.messages as any, {
    title: params.chatTitle || 'OFLN Conversation',
    exportedAt: new Date().toISOString().split('T')[0],
  });
  return { markdown, turnsCount };
}

