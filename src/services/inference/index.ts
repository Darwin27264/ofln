export {
  resolveModelFamily,
  isThinkingModelForUi,
  type ModelFamilyId,
  type ModelFamilyProfile,
} from './modelFamily';

export {
  isComplexQuery,
  isSimplePrompt,
  resolveEnableThinking,
  resolveNPredict,
} from './promptHeuristics';

export {
  buildCompletionParams,
  type BuildCompletionParamsInput,
  type BuiltCompletionParams,
} from './completionParams';

export {
  STOP_WORDS,
  SIMPLE_PROMPT_STOP_EXTRAS,
  buildStopSequences,
  isLikelyChainOfThought,
  extractAnswerFromCotDump,
  stripThinkBlocks,
  trimDegenerateRepetition,
  createThinkStreamState,
  ingestThinkDelta,
  finalizeVisibleAndThought,
  type ThinkStreamState,
} from './thinkStreamParser';

export { trimConversation, type TrimableMessage } from './contextTrim';
