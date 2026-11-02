import { api, fetcher } from "@/lib/api";
import type {
    AnalysisRun,
    ChatSuggestion,
    ChatThreadDetail,
    ConversationDetail,
    Insight,
    PaginatedChatThreads,
    PaginatedConversations,
    QualifyingQuestion,
} from "@conversational-analytics/shared";
import { useEffect, useRef } from "react";
import useSWR, { mutate, type SWRConfiguration } from "swr";

export function useConversations() {
    return useSWR<PaginatedConversations>("/conversations?limit=200", fetcher);
}

export function useConversation(
    id: string | null,
    options?: SWRConfiguration<ConversationDetail>
) {
    return useSWR<ConversationDetail>(
        id ? `/conversations/${id}` : null,
        fetcher,
        options
    );
}

export function useInsights() {
    return useSWR<Insight[]>("/insights", fetcher);
}

export function useQuestions() {
    return useSWR<QualifyingQuestion[]>("/qualifying-questions", fetcher);
}

export function useLatestAnalysisRun() {
    const previousRunKeyRef = useRef<string | null>(null);
    const response = useSWR<AnalysisRun | null>(
        "/analysis-runs/latest",
        fetcher,
        {
            refreshInterval: (run) =>
                run && ["queued", "running", "canceling"].includes(run.status)
                    ? 1000
                    : 0,
        }
    );
    const run = response.data;

    useEffect(() => {
        if (
            !(run && ["completed", "failed", "canceled"].includes(run.status))
        ) {
            return;
        }
        const runKey = `${run.id}:${run.status}:${run.finished_at ?? ""}`;
        if (previousRunKeyRef.current === runKey) {
            return;
        }
        previousRunKeyRef.current = runKey;
        mutate("/conversations?limit=200").catch(() => {
            // SWR will retry on the next explicit refresh.
        });
    }, [run]);

    return response;
}

export function useChatThreads() {
    return useSWR<PaginatedChatThreads>("/chat/threads?limit=200", fetcher);
}

export function useChatThread(id: string | null) {
    return useSWR<ChatThreadDetail>(id ? `/chat/threads/${id}` : null, fetcher);
}

export function useChatSuggestions(id: string | null) {
    return useSWR<ChatSuggestion[]>(
        id ? `/chat/threads/${id}/suggestions` : null,
        () => (id ? api.suggestions(id) : [])
    );
}
