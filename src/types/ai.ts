/**
 * Shared type definitions for the Vercel AI SDK integration layer.
 *
 * These types bridge the existing app's message format with the AI SDK's
 * expected interfaces, and define contracts for the provider, vision,
 * and document parsing services.
 */

// ── Core Message Types ─────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageAttachment {
  type: 'image' | 'pdf';
  uri: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileName?: string;
}

/** Persona stamped on assistant messages at generation time (see personaAttribution). */
export interface MessagePersonaAttribution {
  personaId?: string;
  personaName?: string;
  personaTagline?: string;
  personaAvatar?: string;
  personaAvatarUri?: string;
}

export interface ChatMessage extends MessagePersonaAttribution {
  id?: string;
  role: MessageRole;
  content: string;
  thought?: string;
  showThought?: boolean;
  /** Inference speed for this assistant turn (persisted with chat history). */
  tokensPerSecond?: number;
  attachments?: MessageAttachment[];
  createdAt?: Date;
  /** Perspective debate seat attribution. */
  perspectiveSeatId?: string;
  perspectiveSeatLabel?: string;
  perspectiveModelFileName?: string;
}

// ── AI SDK Content Parts (Vercel AI SDK v6 message format) ─────────────────────

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  image: string; // base64 data URI or URL
  mimeType?: string;
}

export type ContentPart = TextPart | ImagePart;

export interface AIMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

// ── Provider Configuration ─────────────────────────────────────────────────────

export interface LlamaProviderConfig {
  modelPath: string;
  projectorPath?: string;
  projectorUseGpu?: boolean;
  contextParams?: {
    n_ctx?: number;
    n_gpu_layers?: number;
    use_mlock?: boolean;
    devices?: string[];
  };
}

export type ModelReadyState =
  | 'idle'
  | 'downloading'
  | 'preparing'
  | 'ready'
  | 'error'
  | 'unloaded';

export interface ModelStatus {
  state: ModelReadyState;
  modelPath: string | null;
  projectorPath: string | null;
  error: string | null;
}

// ── Chat Service Types ─────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onThought?: (thought: string) => void;
  onFinish?: (result: CompletionResult) => void;
  onError?: (error: Error) => void;
}

export interface CompletionResult {
  text: string;
  thought?: string;
  tokensPerSecond: number;
  totalTokens: number;
  inferenceTimeMs: number;
  /** Messages dropped by sliding-window trim before completion. */
  trimmedMessageCount?: number;
}

export interface SendOptions {
  /**
   * Display/user text for this send. Prefer this over relying on hook `input`
   * state — setInput + handleSubmit in the same tick races and silently no-ops.
   */
  text?: string;
  textForPrompt?: string;
  attachments?: MessageAttachment[];
  signal?: AbortSignal;
}

// ── Document Parsing Types ─────────────────────────────────────────────────────

export interface ParsedDocument {
  text: string;
  pages: ParsedPage[];
  pageCount: number;
  sourceUri: string;
  sourceType: 'pdf' | 'image';
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  imageBase64?: string;
  width?: number;
  height?: number;
}

// ── Vision Service Types ───────────────────────────────────────────────────────

export interface VisionInput {
  imageBase64: string;
  mimeType: string;
  prompt?: string;
}

export interface FormattedVisionMessage {
  role: 'user';
  content: ContentPart[];
}
