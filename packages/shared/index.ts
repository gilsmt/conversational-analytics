export interface ConversationListItem {
    id: string;
    session_id: string;
    title: string;
    message_count: number;
    analysis_status: "pending" | "processing" | "completed" | "failed";
    analysis_error: string | null;
    insight_results: Record<string, { value: string; explanation: string }>;
    qualifying_results: Record<string, string | null>;
    created_at: string;
    updated_at: string;
}

export interface MessageRead {
    id: string;
    speaker: string;
    message_type: string;
    text: string;
    content: Record<string, unknown>;
    confidence: number | null;
    created_at: string;
}

export interface ConversationDetail extends ConversationListItem {
    messages: MessageRead[];
}

export interface PaginatedConversations {
    items: ConversationListItem[];
    total: number;
    limit: number;
    offset: number;
}

export interface Insight {
    id: string;
    name: string;
    description: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface QualifyingQuestion {
    id: string;
    question_text: string;
    key: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AnalysisRun {
    id: string;
    status: "queued" | "running" | "canceling" | "completed" | "failed" | "canceled";
    total: number;
    processed: number;
    failed: number;
    reanalyze_all: boolean;
    cancel_requested: boolean;
    last_error: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    meta: Record<string, unknown>;
    created_at: string;
}

export interface ChatThread {
    id: string;
    scope: "all" | "single";
    conversation_id: string | null;
    title: string;
    created_at: string;
    updated_at: string;
    last_message_preview: string | null;
    message_count: number;
    conversation_title: string | null;
}

export interface ChatThreadDetail extends ChatThread {
    messages: ChatMessage[];
}

export interface PaginatedChatThreads {
    items: ChatThread[];
    total: number;
    limit: number;
    offset: number;
}

export interface ChatSuggestion {
    label: string;
    prompt: string;
    scope: "all" | "single";
    conversation_id?: string | null;
}

export interface ChatToolEvent {
    id: string;
    name: string;
    status: "running" | "completed" | "failed";
    input?: unknown;
    summary?: string;
}

export interface ImportFileResult {
    filename: string;
    status: "imported" | "skipped" | "failed";
    session_id: string | null;
    message_count: number;
    error: string | null;
}

export interface ImportSummary {
    imported: number;
    skipped: number;
    failed: number;
    files: ImportFileResult[];
}
