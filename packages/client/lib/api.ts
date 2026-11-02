import type {
    AnalysisRun,
    ChatSuggestion,
    ChatThread,
    ChatThreadDetail,
    ConversationDetail,
    ImportSummary,
    Insight,
    PaginatedChatThreads,
    PaginatedConversations,
    QualifyingQuestion,
} from "@conversational-analytics/shared";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000";
const API_PREFIX = `${API_BASE}/api/v1`;

export class FetchError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = "FetchError";
        this.status = status;
        this.details = details;
    }
}

async function parseError(response: Response): Promise<FetchError> {
    try {
        const data = (await response.json()) as {
            message?: string;
            error?: string;
            details?: unknown;
        };
        return new FetchError(
            data.message ?? data.error ?? response.statusText,
            response.status,
            data.details
        );
    } catch {
        return new FetchError(response.statusText, response.status);
    }
}

export async function apiFetch<T>(
    path: string,
    init?: RequestInit
): Promise<T> {
    const response = await fetch(`${API_PREFIX}${path}`, {
        ...init,
        headers:
            init?.body instanceof FormData
                ? init.headers
                : {
                      "Content-Type": "application/json",
                      ...init?.headers,
                  },
    });
    if (!response.ok) {
        throw await parseError(response);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return response.json() as Promise<T>;
}

export const fetcher = <T>(path: string) => apiFetch<T>(path);

export const api = {
    analysisRun: (id: string) => apiFetch<AnalysisRun>(`/analysis-runs/${id}`),
    cancelAnalysisRun: (id: string) =>
        apiFetch<AnalysisRun>(`/analysis-runs/${id}/cancel`, {
            method: "POST",
        }),
    conversation: (id: string) =>
        apiFetch<ConversationDetail>(`/conversations/${id}`),
    conversations: () =>
        apiFetch<PaginatedConversations>("/conversations?limit=200"),
    createAnalysisRun: (reanalyze_all = false) =>
        apiFetch<AnalysisRun>("/analysis-runs", {
            body: JSON.stringify({ reanalyze_all }),
            method: "POST",
        }),
    createInsight: (payload: {
        name: string;
        description: string;
        is_active?: boolean;
    }) =>
        apiFetch<Insight>("/insights", {
            body: JSON.stringify(payload),
            method: "POST",
        }),
    createQuestion: (payload: {
        question_text: string;
        key: string;
        is_active?: boolean;
    }) =>
        apiFetch<QualifyingQuestion>("/qualifying-questions", {
            body: JSON.stringify(payload),
            method: "POST",
        }),
    createThread: (payload: {
        scope: "all" | "single";
        conversation_id?: string;
        related_conversation_id?: string;
    }) =>
        apiFetch<ChatThread>("/chat/threads", {
            body: JSON.stringify(payload),
            method: "POST",
        }),
    deleteConversation: (id: string) =>
        apiFetch<void>(`/conversations/${id}`, { method: "DELETE" }),
    deleteInsight: (id: string) =>
        apiFetch<void>(`/insights/${id}`, { method: "DELETE" }),
    deleteQuestion: (id: string) =>
        apiFetch<void>(`/qualifying-questions/${id}`, { method: "DELETE" }),
    deleteThread: (id: string) =>
        apiFetch<void>(`/chat/threads/${id}`, { method: "DELETE" }),
    importConversations: (files: File[]) => {
        const formData = new FormData();
        for (const file of files) {
            formData.append("files", file, file.name);
            formData.append(
                "paths",
                (file as File & { webkitRelativePath?: string })
                    .webkitRelativePath || file.name
            );
        }
        return apiFetch<ImportSummary>("/conversations/import", {
            body: formData,
            method: "POST",
        });
    },
    insights: () => apiFetch<Insight[]>("/insights"),
    latestAnalysisRun: () =>
        apiFetch<AnalysisRun | null>("/analysis-runs/latest"),
    questions: () => apiFetch<QualifyingQuestion[]>("/qualifying-questions"),
    renameThread: (id: string, title: string) =>
        apiFetch<ChatThread>(`/chat/threads/${id}`, {
            body: JSON.stringify({ title }),
            method: "PATCH",
        }),
    suggestions: (id: string) =>
        apiFetch<ChatSuggestion[]>(`/chat/threads/${id}/suggestions`, {
            method: "POST",
        }),
    thread: (id: string) => apiFetch<ChatThreadDetail>(`/chat/threads/${id}`),
    threads: () => apiFetch<PaginatedChatThreads>("/chat/threads?limit=200"),
    updateInsight: (
        id: string,
        payload: Partial<Pick<Insight, "name" | "description" | "is_active">>
    ) =>
        apiFetch<Insight>(`/insights/${id}`, {
            body: JSON.stringify(payload),
            method: "PATCH",
        }),
    updateQuestion: (
        id: string,
        payload: Partial<
            Pick<QualifyingQuestion, "question_text" | "key" | "is_active">
        >
    ) =>
        apiFetch<QualifyingQuestion>(`/qualifying-questions/${id}`, {
            body: JSON.stringify(payload),
            method: "PATCH",
        }),
};

export function chatMessageUrl(threadId: string) {
    return `${API_PREFIX}/chat/threads/${threadId}/messages`;
}
