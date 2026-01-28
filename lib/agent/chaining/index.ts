/**
 * Action Chaining Module
 *
 * Exports all action chaining functionality for batch action execution.
 *
 * Key features:
 * - Chain safety analysis
 * - Chain generation from actions or forms
 * - Partial failure recovery
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 */

// Types
export type {
  ChainableActionType,
  ChainedAction,
  ChainMetadata,
  ActionChain,
  ChainPartialState,
  ChainActionError,
  ChainSafetyAnalysis,
  ChainBlocker,
  ChainRecoveryStrategy,
  ChainRecoveryResult,
  ChainReason,
} from "./types"

export {
  chainedActionSchema,
  chainMetadataSchema,
  actionChainSchema,
  chainPartialStateSchema,
  chainActionErrorSchema,
  isChainableActionType,
  isHighRiskAction,
  extractElementId,
  extractActionType,
} from "./types"

// Chain Analyzer
export {
  analyzeChainSafety,
  identifyChainableGroups,
  buildChainMetadata,
  MAX_CHAIN_SIZE,
  MIN_CHAIN_SIZE,
  CHAIN_CONFIDENCE_THRESHOLD,
} from "./chain-analyzer"

// Chain Generator
export {
  generateFormFillChain,
  generateChainFromActions,
  parseChainFromLLMResponse,
  buildChainPromptInstructions,
  enhancePromptForChaining,
  generateActionDescription,
  determineChainReason,
} from "./chain-generator"

// Chain Recovery
export {
  handleChainPartialFailure,
  validateChainPartialState,
  MAX_RETRY_ATTEMPTS,
  MIN_REMAINING_FOR_CHAIN,
} from "./chain-recovery"
