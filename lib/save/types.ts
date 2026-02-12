export interface TranscriptEntry {
  type: string;
  timestamp: string;
  uuid?: string;
  parentUuid?: string;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?:
      | string
      | Array<{
          type: string;
          thinking?: string;
          text?: string;
          name?: string;
          id?: string;
          input?: { file_path?: string; command?: string; pattern?: string };
          tool_use_id?: string;
          content?: string;
          is_error?: boolean;
        }>;
  };
  isCompactSummary?: boolean;
  planContent?: string;
  data?: {
    type?: string;
    hookEvent?: string;
    hookName?: string;
    status?: string;
    toolName?: string;
    prompt?: string;
    agentId?: string;
  };
}

export interface ToolResultMeta {
  toolUseId: string;
  toolName?: string;
  success: boolean;
  contentLength?: number;
  filePath?: string;
  lineCount?: number;
}

export interface ProgressEvent {
  type: string;
  timestamp: string;
  hookEvent?: string;
  hookName?: string;
  toolName?: string;
  prompt?: string;
  agentId?: string;
}

export interface ParsedInteraction {
  timestamp: string;
  user: string;
  thinking: string;
  assistant: string;
  isCompactSummary: boolean;
  isContinuation?: boolean;
  toolsUsed: string[];
  toolDetails: Array<{ name: string; detail: unknown }>;
  inPlanMode?: boolean;
  slashCommand?: string;
  toolResults?: ToolResultMeta[];
  progressEvents?: ProgressEvent[];
}

export interface SaveState {
  claudeSessionId: string;
  mnemeSessionId: string;
  projectPath: string;
  lastSavedTimestamp: string | null;
  lastSavedLine: number;
  isCommitted: number;
}

export interface SaveResult {
  success: boolean;
  savedCount: number;
  totalCount: number;
  message: string;
}
