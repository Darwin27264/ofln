/**
 * Family-specific short Jinja stubs used ONLY when the GGUF chat_template
 * cannot be used (oversized / multimodal / metadata missing after load).
 *
 * Prefer native `tokenizer.chat_template` whenever it is valid — stubs are
 * last-resort so inference stays coherent across Qwen / Gemma / Phi.
 */

import type { ModelFamilyId } from './modelFamily';

/** ChatML + Qwen enable_thinking empty-think gate (existing OFLN behavior). */
export const STUB_CHATML_THINK =
  "{% for message in messages %}" +
  "{{ '<|im_start|>' + message['role'] + '\\n' + message['content'] + '<|im_end|>\\n' }}" +
  "{% endfor %}" +
  "{% if add_generation_prompt %}" +
  "{{ '<|im_start|>assistant\\n' }}" +
  "{% if enable_thinking is defined and enable_thinking is false %}" +
  "{{ '<think>\\n\\n</think>\\n' }}" +
  "{% endif %}" +
  "{% endif %}";

/** Gemma IT turn tokens (system routed as user-side instruction turns). */
export const STUB_GEMMA =
  "{% for message in messages %}" +
  "{% if message['role'] == 'system' %}" +
  "{{ '<start_of_turn>user\\n' + message['content'] + '<end_of_turn>\\n' }}" +
  "{% elif message['role'] == 'user' %}" +
  "{{ '<start_of_turn>user\\n' + message['content'] + '<end_of_turn>\\n' }}" +
  "{% elif message['role'] == 'assistant' %}" +
  "{{ '<start_of_turn>model\\n' + message['content'] + '<end_of_turn>\\n' }}" +
  "{% endif %}" +
  "{% endfor %}" +
  "{% if add_generation_prompt %}{{ '<start_of_turn>model\\n' }}{% endif %}";

/** Phi-3 / Phi-4 mini style role tags. */
export const STUB_PHI =
  "{% for message in messages %}" +
  "{% if message['role'] == 'system' %}" +
  "{{ '<|system|>\\n' + message['content'] + '<|end|>\\n' }}" +
  "{% elif message['role'] == 'user' %}" +
  "{{ '<|user|>\\n' + message['content'] + '<|end|>\\n' }}" +
  "{% elif message['role'] == 'assistant' %}" +
  "{{ '<|assistant|>\\n' + message['content'] + '<|end|>\\n' }}" +
  "{% endif %}" +
  "{% endfor %}" +
  "{% if add_generation_prompt %}{{ '<|assistant|>\\n' }}{% endif %}";

/**
 * Resolve text-chat Jinja stub for a family.
 * Qwen / DeepSeek-R1 / Smol / generic → ChatML (+ thinking gate for hybrid).
 */
export function getSafeChatTemplateStub(familyId: ModelFamilyId): string {
  switch (familyId) {
    case 'gemma4':
      return STUB_GEMMA;
    case 'phi':
      return STUB_PHI;
    case 'qwen3':
    case 'deepseek-r1':
    case 'smollm3':
    case 'generic':
    default:
      return STUB_CHATML_THINK;
  }
}

/** @deprecated Prefer getSafeChatTemplateStub(familyId). Kept for import compatibility. */
export const SAFE_CHAT_TEMPLATE_STUB = STUB_CHATML_THINK;
