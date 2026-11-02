"use client";

import { Button } from "@/components/ui/button";
import {
    Combobox,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxPopup,
} from "@/components/ui/combobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import {
    useChatSuggestions,
    useChatThread,
    useConversation,
    useConversations,
} from "@/hooks/use-api-data";
import { api, chatMessageUrl } from "@/lib/api";
import type {
    ChatMessage,
    ChatSuggestion,
    ChatThreadDetail,
    ChatToolEvent,
    ConversationListItem,
} from "@conversational-analytics/shared";
import {
    ArrowUp,
    Brain,
    ChevronsUpDown,
    Clock3,
    Loader2,
    PanelRightOpen,
    RefreshCw,
    Search,
    Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { mutate } from "swr";

interface StreamEvent {
    data: Record<string, unknown>;
    event?: string;
}

function parseStreamChunk(buffer: string): {
    events: StreamEvent[];
    remaining: string;
} {
    const chunks = buffer.replaceAll("\r\n", "\n").split("\n\n");
    return {
        events: chunks.slice(0, -1).map(parseStreamEvent),
        remaining: chunks.at(-1) ?? "",
    };
}

function parseStreamEvent(chunk: string): StreamEvent {
    const lines = chunk.split("\n");
    const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
    const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
    if (!data) {
        return { data: {}, event };
    }
    try {
        return { data: JSON.parse(data) as Record<string, unknown>, event };
    } catch {
        return {
            data: { message: "Received an invalid chat stream event" },
            event: "error",
        };
    }
}

function messageFromStreamData(data: Record<string, unknown>): string {
    return typeof data.message === "string" ? data.message : "Chat failed";
}

function conversationToLabel(conversation: ConversationListItem): string {
    return `${conversation.title} ${conversation.session_id}`;
}

type ConversationContextItem =
    | {
          id: "all";
          kind: "all";
          label: "All conversations";
          searchLabel: string;
      }
    | {
          conversation: ConversationListItem;
          id: string;
          kind: "conversation";
          label: string;
          searchLabel: string;
      };

function conversationContextItems(
    conversations: ConversationListItem[]
): ConversationContextItem[] {
    return [
        {
            id: "all",
            kind: "all",
            label: "All conversations",
            searchLabel: "All conversations",
        },
        ...conversations.map((conversation) => ({
            conversation,
            id: conversation.id,
            kind: "conversation" as const,
            label: conversation.title,
            searchLabel: conversationToLabel(conversation),
        })),
    ];
}

function normalizeTool(value: unknown): ChatToolEvent | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const tool = value as Partial<ChatToolEvent>;
    if (
        typeof tool.id === "string" &&
        typeof tool.name === "string" &&
        ["running", "completed", "failed"].includes(String(tool.status))
    ) {
        return {
            id: tool.id,
            input: tool.input,
            name: tool.name,
            status: tool.status as ChatToolEvent["status"],
            summary:
                typeof tool.summary === "string" ? tool.summary : undefined,
        };
    }
    return null;
}

function toolEventsFromMeta(message: ChatMessage): ChatToolEvent[] {
    const raw = message.meta?.tool_events;
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        const tool = normalizeTool(item);
        return tool ? [tool] : [];
    });
}

function citationsFromMeta(
    message: ChatMessage
): Array<{ conversation_id: string; session_id: string; title: string }> {
    const raw = message.meta?.citations;
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        if (!item || typeof item !== "object") {
            return [];
        }
        const citation = item as Record<string, unknown>;
        if (
            typeof citation.conversation_id === "string" &&
            typeof citation.session_id === "string" &&
            typeof citation.title === "string"
        ) {
            return [
                {
                    conversation_id: citation.conversation_id,
                    session_id: citation.session_id,
                    title: citation.title,
                },
            ];
        }
        return [];
    });
}

function upsertToolEvent(
    current: ChatToolEvent[],
    nextTool: ChatToolEvent
): ChatToolEvent[] {
    const index = current.findIndex((item) => item.id === nextTool.id);
    if (index < 0) {
        return [...current, nextTool];
    }
    const next = [...current];
    next[index] = nextTool;
    return next;
}

function fallbackSuggestions(
    scope: ChatThreadDetail["scope"]
): ChatSuggestion[] {
    if (scope === "single") {
        return [
            {
                label: "What changed?",
                prompt: "What changed during this conversation, and why?",
                scope: "single",
            },
            {
                label: "Missed opportunity",
                prompt: "Where did the agent miss an opportunity in this conversation?",
                scope: "single",
            },
            {
                label: "User intent",
                prompt: "What did the user actually want, and how well did the agent respond?",
                scope: "single",
            },
        ];
    }
    return [
        {
            label: "Common pain points",
            prompt: "What pain points appear most often across the conversations?",
            scope: "all",
        },
        {
            label: "Feature requests",
            prompt: "What features do users keep asking for?",
            scope: "all",
        },
        {
            label: "Missed opportunities",
            prompt: "Where did the agent most often miss an opportunity?",
            scope: "all",
        },
    ];
}

async function processStreamEvent({
    data,
    event,
    refreshSuggestions,
    refreshThread,
    setError,
    setStatusMessage,
    setStreamingText,
    setToolEvents,
}: StreamEvent & {
    refreshSuggestions: () => Promise<unknown>;
    refreshThread: () => Promise<unknown>;
    setError: (message: string) => void;
    setStatusMessage: (message: string | null) => void;
    setStreamingText: (update: (current: string) => string) => void;
    setToolEvents: (
        update: (current: ChatToolEvent[]) => ChatToolEvent[]
    ) => void;
}) {
    if (event === "status") {
        setStatusMessage(
            typeof data.message === "string" ? data.message : "Working"
        );
        return;
    }
    if (event === "tool_start" || event === "tool_result") {
        const tool = normalizeTool(data.tool);
        if (tool) {
            setToolEvents((current) => upsertToolEvent(current, tool));
            setStatusMessage(
                tool.status === "running"
                    ? `Running ${tool.name}`
                    : (tool.summary ?? `${tool.name} complete`)
            );
        }
        return;
    }
    if (event === "token") {
        const token = typeof data.text === "string" ? data.text : "";
        setStreamingText((current) => current + token);
        return;
    }
    if (event === "error") {
        setStreamingText(() => "");
        setStatusMessage(null);
        setError(messageFromStreamData(data));
        await Promise.all([mutate("/chat/threads?limit=200"), refreshThread()]);
        return;
    }
    if (event === "done") {
        setStreamingText(() => "");
        setStatusMessage(null);
        await refreshThread();
        await Promise.all([
            mutate("/chat/threads?limit=200"),
            refreshSuggestions(),
        ]);
    }
}

async function readChatStream({
    reader,
    refreshSuggestions,
    refreshThread,
    setError,
    setStatusMessage,
    setStreamingText,
    setToolEvents,
}: {
    reader: ReadableStreamDefaultReader<Uint8Array>;
    refreshSuggestions: () => Promise<unknown>;
    refreshThread: () => Promise<unknown>;
    setError: (message: string) => void;
    setStatusMessage: (message: string | null) => void;
    setStreamingText: (update: (current: string) => string) => void;
    setToolEvents: (
        update: (current: ChatToolEvent[]) => ChatToolEvent[]
    ) => void;
}) {
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseStreamChunk(buffer);
        buffer = parsed.remaining;
        for (const streamEvent of parsed.events) {
            await processStreamEvent({
                ...streamEvent,
                refreshSuggestions,
                refreshThread,
                setError,
                setStatusMessage,
                setStreamingText,
                setToolEvents,
            });
        }
    }
    const finalEvent = buffer.trim() ? parseStreamEvent(buffer) : null;
    if (finalEvent) {
        await processStreamEvent({
            ...finalEvent,
            refreshSuggestions,
            refreshThread,
            setError,
            setStatusMessage,
            setStreamingText,
            setToolEvents,
        });
    }
}

function streamErrorMessage(caught: unknown): string {
    return caught instanceof Error ? caught.message : "Chat failed";
}

function isAbortError(caught: unknown): boolean {
    return caught instanceof Error && caught.name === "AbortError";
}

function optimisticUser(content: string): ChatMessage {
    return {
        content,
        created_at: new Date().toISOString(),
        id: `local-${Date.now()}`,
        meta: {},
        role: "user",
    };
}

export function ChatWorkspace({ chatId }: { chatId: string }) {
    const router = useRouter();
    const { data: thread, mutate: refreshThread } = useChatThread(chatId);
    const { data: suggestions, mutate: refreshSuggestions } =
        useChatSuggestions(chatId);
    const { data: conversations } = useConversations();
    const [selectedTranscriptId, setSelectedTranscriptId] = useState<
        string | null
    >(null);
    const { data: conversation } = useConversation(selectedTranscriptId);

    const [input, setInput] = useState("");
    const [streamingText, setStreamingText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [toolEvents, setToolEvents] = useState<ChatToolEvent[]>([]);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [lastPrompt, setLastPrompt] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const scopeLabel =
        thread?.scope === "single"
            ? (thread.conversation_title ?? "Single conversation")
            : "All conversations";
    const conversationsLoaded = conversations !== undefined;
    const hasAnyConversations = conversations ? conversations.total > 0 : true;
    const hasCompletedAnalysis =
        conversations?.items.some(
            (conversationItem) =>
                conversationItem.analysis_status === "completed"
        ) ?? false;
    const suggestionItems = (
        suggestions && suggestions.length > 0
            ? suggestions
            : fallbackSuggestions(thread?.scope ?? "all")
    ).filter((suggestion) => {
        if (!thread) {
            return false;
        }
        if (suggestion.scope !== thread.scope) {
            return false;
        }
        if (thread.scope === "single" && suggestion.conversation_id) {
            return suggestion.conversation_id === thread.conversation_id;
        }
        return true;
    });

    let composerNotice: string | null = null;
    if (conversationsLoaded && !hasAnyConversations) {
        composerNotice = "Import conversations to ground answers.";
    } else if (conversationsLoaded && !hasCompletedAnalysis) {
        composerNotice = "Predefined analysis is unavailable.";
    }

    async function switchContext(target: ConversationContextItem) {
        if (!thread) {
            return;
        }
        if (target.kind === "all") {
            if (thread.scope === "all") {
                return;
            }
            const nextThread = await api.createThread({ scope: "all" });
            await mutate("/chat/threads?limit=200");
            router.push(`/chat/${nextThread.id}`);
            return;
        }
        if (
            thread.scope === "single" &&
            thread.conversation_id === target.conversation.id
        ) {
            return;
        }
        const nextThread = await api.createThread({
            conversation_id: target.conversation.id,
            scope: "single",
        });
        await mutate("/chat/threads?limit=200");
        router.push(`/chat/${nextThread.id}`);
    }

    async function send(promptOverride?: string) {
        const content = (promptOverride ?? input).trim();
        if (!content || isStreaming) {
            return;
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setInput("");
        setStreamingText("");
        setError(null);
        setStatusMessage("Reading conversations");
        setToolEvents([]);
        setStartedAt(Date.now());
        setLastPrompt(content);
        setIsStreaming(true);
        await refreshThread(
            thread
                ? {
                      ...thread,
                      messages: [...thread.messages, optimisticUser(content)],
                  }
                : undefined,
            { revalidate: false }
        );
        await submitChatMessage(content, controller);
    }

    async function submitChatMessage(
        content: string,
        controller: AbortController
    ) {
        try {
            const response = await fetch(chatMessageUrl(chatId), {
                body: JSON.stringify({ content }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
                signal: controller.signal,
            });
            if (!(response.ok && response.body)) {
                throw new Error(response.statusText || "Chat failed");
            }
            await readChatStream({
                reader: response.body.getReader(),
                refreshSuggestions,
                refreshThread,
                setError,
                setStatusMessage,
                setStreamingText,
                setToolEvents,
            });
        } catch (caught) {
            setStreamingText("");
            setStatusMessage(null);
            setToolEvents([]);
            if (isAbortError(caught)) {
                await Promise.all([
                    mutate("/chat/threads?limit=200"),
                    refreshThread(),
                ]);
            } else {
                setError(streamErrorMessage(caught));
            }
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    }

    function openTranscript(conversationId: string | null) {
        if (!conversationId) {
            return;
        }
        setSelectedTranscriptId(conversationId);
        setShowTranscript(true);
    }

    return (
        <SidebarInset>
            <SidebarTrigger className="absolute top-3 left-3 z-20" />
            <main className="flex min-h-svh">
                <section className="flex min-w-0 flex-1 flex-col">
                    <ChatHeader
                        onToggleTranscript={() =>
                            openTranscript(thread?.conversation_id ?? null)
                        }
                        scopeLabel={scopeLabel}
                        thread={thread}
                    />
                    <MessageList
                        error={error}
                        isStreaming={isStreaming}
                        onCitationClick={openTranscript}
                        onRetry={() => {
                            if (lastPrompt) {
                                send(lastPrompt).catch((caught) => {
                                    setError(
                                        caught instanceof Error
                                            ? caught.message
                                            : "Chat failed"
                                    );
                                });
                            }
                        }}
                        startedAt={startedAt}
                        statusMessage={statusMessage}
                        streamingText={streamingText}
                        thread={thread}
                        toolEvents={toolEvents}
                    />
                    <ChatComposer
                        composerNotice={composerNotice}
                        conversations={conversations?.items ?? []}
                        currentConversationId={thread?.conversation_id ?? null}
                        disabledContextSwitch={isStreaming || !conversations}
                        input={input}
                        isStreaming={isStreaming}
                        onInputChange={setInput}
                        onSend={(value) => {
                            send(value).catch((caught) => {
                                setError(
                                    caught instanceof Error
                                        ? caught.message
                                        : "Chat failed"
                                );
                            });
                        }}
                        onStop={() => abortControllerRef.current?.abort()}
                        onSwitchContext={(target) => {
                            switchContext(target).catch((caught) => {
                                setError(
                                    caught instanceof Error
                                        ? caught.message
                                        : "Could not switch conversation context"
                                );
                            });
                        }}
                        scope={thread?.scope}
                        scopeLabel={scopeLabel}
                        setError={setError}
                        suggestions={suggestionItems}
                    />
                </section>
                {showTranscript && conversation ? (
                    <TranscriptPanel conversation={conversation} />
                ) : null}
            </main>
        </SidebarInset>
    );
}

function ChatHeader({
    onToggleTranscript,
    scopeLabel,
    thread,
}: {
    onToggleTranscript: () => void;
    scopeLabel: string;
    thread?: ChatThreadDetail;
}) {
    return (
        <header className="border-border/70 border-b p-2 pl-14">
            <div className="ml-8 flex items-center justify-between gap-3 md:ml-0">
                <div className="min-w-0">
                    <h1 className="truncate font-medium text-base">
                        {thread?.title ?? "Chat"}
                    </h1>
                    <p className="truncate text-muted-foreground text-xs">
                        {scopeLabel}
                    </p>
                </div>
                {thread?.scope === "single" ? (
                    <Button
                        onClick={onToggleTranscript}
                        size="sm"
                        variant="outline"
                    >
                        <PanelRightOpen />
                        Transcript
                    </Button>
                ) : null}
            </div>
        </header>
    );
}

function MessageList({
    error,
    isStreaming,
    onCitationClick,
    onRetry,
    startedAt,
    statusMessage,
    streamingText,
    thread,
    toolEvents,
}: {
    error: string | null;
    isStreaming: boolean;
    onCitationClick: (conversationId: string) => void;
    onRetry: () => void;
    startedAt: number | null;
    statusMessage: string | null;
    streamingText: string;
    thread?: ChatThreadDetail;
    toolEvents: ChatToolEvent[];
}) {
    return (
        <div className="flex-1 space-y-4 overflow-auto p-4 md:p-8">
            {thread ? null : (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Loading chat
                </p>
            )}
            {thread?.messages.map((message) => (
                <ChatMessageBubble
                    key={message.id}
                    message={message}
                    onCitationClick={onCitationClick}
                />
            ))}
            {isStreaming ? (
                <AgentActivity
                    isStreaming
                    startedAt={startedAt}
                    statusMessage={statusMessage}
                    toolEvents={toolEvents}
                />
            ) : null}
            {streamingText ? (
                <div className="max-w-2xl rounded-lg border border-border/70 px-3 py-2 text-sm">
                    <Streamdown>{streamingText}</Streamdown>
                </div>
            ) : null}
            {isStreaming && !streamingText ? (
                <p
                    aria-live="polite"
                    className="max-w-2xl px-1 text-muted-foreground text-sm"
                >
                    Thinking...
                </p>
            ) : null}
            {error ? (
                <div className="flex max-w-2xl items-center gap-2 text-sm">
                    <p className="text-destructive">{error}</p>
                    <Button onClick={onRetry} size="sm" variant="outline">
                        <RefreshCw />
                        Retry
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function ChatMessageBubble({
    message,
    onCitationClick,
}: {
    message: ChatMessage;
    onCitationClick: (conversationId: string) => void;
}) {
    const tools = toolEventsFromMeta(message);
    const citations = citationsFromMeta(message);
    if (message.role === "user") {
        return (
            <div className="ml-auto w-fit max-w-2xl rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm">
                <Streamdown>{message.content}</Streamdown>
            </div>
        );
    }
    return (
        <div className="max-w-2xl space-y-2">
            {tools.length > 0 ? (
                <AgentActivity
                    isStreaming={false}
                    startedAt={null}
                    statusMessage="Evidence used"
                    toolEvents={tools}
                />
            ) : null}
            <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                <Streamdown>{message.content}</Streamdown>
                {citations.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {citations.map((citation) => (
                            <Button
                                key={citation.conversation_id}
                                onClick={() =>
                                    onCitationClick(citation.conversation_id)
                                }
                                size="xs"
                                variant="outline"
                            >
                                {citation.title || citation.session_id}
                            </Button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AgentActivity({
    isStreaming,
    startedAt,
    statusMessage,
    toolEvents,
}: {
    isStreaming: boolean;
    startedAt: number | null;
    statusMessage: string | null;
    toolEvents: ChatToolEvent[];
}) {
    const [elapsed, setElapsed] = useState(0);
    const [expanded, setExpanded] = useState(isStreaming);

    useEffect(() => {
        if (!(isStreaming && startedAt)) {
            return;
        }
        const tick = () =>
            setElapsed(
                Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
            );
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [isStreaming, startedAt]);

    const runningCount = toolEvents.filter(
        (tool) => tool.status === "running"
    ).length;
    let fallbackLabel = "Done";
    if (runningCount > 0) {
        fallbackLabel = "Using tools";
    } else if (isStreaming) {
        fallbackLabel = "Thinking";
    }
    const label = statusMessage ?? fallbackLabel;

    return (
        <div className="max-w-2xl rounded-md border border-border/70 bg-muted/30 p-2 text-xs">
            <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpanded((value) => !value)}
                type="button"
            >
                <span className="flex min-w-0 items-center gap-2">
                    {isStreaming ? (
                        <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
                    ) : (
                        <Brain className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Clock3 className="size-3" />
                    {elapsed}s
                </span>
            </button>
            {expanded && toolEvents.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                    {toolEvents.map((tool) => (
                        <div
                            className="rounded border border-border/70 bg-background px-2 py-1.5"
                            key={`${tool.id}-${tool.status}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 font-medium">
                                    {tool.status === "running" ? (
                                        <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                        <Search className="size-3" />
                                    )}
                                    {tool.name}
                                </span>
                                <span className="text-muted-foreground capitalize">
                                    {tool.status}
                                </span>
                            </div>
                            {tool.summary ? (
                                <p className="mt-1 text-muted-foreground">
                                    {tool.summary}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ChatComposer({
    composerNotice,
    conversations,
    currentConversationId,
    disabledContextSwitch,
    input,
    isStreaming,
    onInputChange,
    onSend,
    onStop,
    onSwitchContext,
    scope,
    scopeLabel,
    setError,
    suggestions,
}: {
    composerNotice: string | null;
    conversations: ConversationListItem[];
    currentConversationId: string | null;
    disabledContextSwitch: boolean;
    input: string;
    isStreaming: boolean;
    onInputChange: (value: string) => void;
    onSend: (value?: string) => void;
    onStop: () => void;
    onSwitchContext: (target: ConversationContextItem) => void;
    scope?: "all" | "single";
    scopeLabel: string;
    setError: (message: string | null) => void;
    suggestions: ChatSuggestion[];
}) {
    return (
        <div className="sticky bottom-0 border-border/70 border-t bg-background p-4 md:p-6">
            <div className="mx-auto max-w-3xl rounded-lg border border-border/70 p-2">
                {suggestions.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                        {suggestions.map((suggestion) => (
                            <Button
                                disabled={isStreaming}
                                key={`${suggestion.label}-${suggestion.prompt}`}
                                onClick={() => onSend(suggestion.prompt)}
                                size="xs"
                                variant="outline"
                            >
                                {suggestion.label}
                            </Button>
                        ))}
                    </div>
                ) : null}
                <Textarea
                    onChange={(event) =>
                        onInputChange(event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            onSend();
                        }
                    }}
                    placeholder="Ask about the conversations..."
                    unstyled
                    value={input}
                />
                <div className="flex justify-between">
                    <div className="flex min-w-0 items-center justify-between gap-2 px-1">
                        <ComposerContextControl
                            conversations={conversations}
                            currentConversationId={currentConversationId}
                            disabled={disabledContextSwitch}
                            onError={setError}
                            onSwitchContext={onSwitchContext}
                            scope={scope}
                            scopeLabel={scopeLabel}
                        />
                        {composerNotice ? (
                            <span className="truncate text-muted-foreground text-xs">
                                {composerNotice}
                            </span>
                        ) : null}
                    </div>
                    {isStreaming ? (
                        <Button
                            aria-label="Stop response"
                            onClick={onStop}
                            size="icon-lg"
                            variant="outline"
                        >
                            <Square />
                        </Button>
                    ) : (
                        <Button
                            aria-label="Send message"
                            onClick={() => onSend()}
                            size="icon-lg"
                        >
                            <ArrowUp />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ComposerContextControl({
    conversations,
    currentConversationId,
    disabled,
    onError,
    onSwitchContext,
    scope,
    scopeLabel,
}: {
    conversations: ConversationListItem[];
    currentConversationId: string | null;
    disabled: boolean;
    onError: (message: string | null) => void;
    onSwitchContext: (target: ConversationContextItem) => void;
    scope?: "all" | "single";
    scopeLabel: string;
}) {
    if (scope === "all" || scope === "single") {
        return (
            <ConversationContextCombobox
                conversations={conversations}
                currentConversationId={currentConversationId}
                disabled={disabled}
                onError={onError}
                onSwitchContext={onSwitchContext}
                placeholder={
                    scope === "single" ? scopeLabel : "All conversations"
                }
                scope={scope}
            />
        );
    }

    return (
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">
            {scopeLabel}
        </span>
    );
}

function ConversationContextCombobox({
    conversations,
    currentConversationId,
    disabled,
    onError,
    onSwitchContext,
    placeholder,
    scope,
}: {
    conversations: ConversationListItem[];
    currentConversationId: string | null;
    disabled: boolean;
    onError: (message: string | null) => void;
    onSwitchContext: (target: ConversationContextItem) => void;
    placeholder: string;
    scope?: "all" | "single";
}) {
    const inputId = useId();
    const items = conversationContextItems(conversations);
    const currentItem =
        scope === "single"
            ? (items.find(
                  (item) =>
                      item.kind === "conversation" &&
                      item.id === currentConversationId
              ) ?? null)
            : (items.find((item) => item.kind === "all") ?? null);
    const [pendingItem, setPendingItem] =
        useState<ConversationContextItem | null>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    const isSwitchingRef = useRef(false);

    async function switchConversationContext(
        nextItem: ConversationContextItem | null
    ) {
        if (
            !nextItem ||
            isSwitchingRef.current ||
            (nextItem.kind === "all" && scope === "all") ||
            (nextItem.kind === "conversation" &&
                nextItem.id === currentConversationId)
        ) {
            return;
        }

        isSwitchingRef.current = true;
        setPendingItem(nextItem);
        setIsSwitching(true);
        onError(null);

        try {
            await onSwitchContext(nextItem);
        } catch (caught) {
            setPendingItem(null);
            onError(
                caught instanceof Error
                    ? caught.message
                    : "Could not switch conversation context"
            );
        } finally {
            isSwitchingRef.current = false;
            setIsSwitching(false);
        }
    }

    return (
        <Combobox<ConversationContextItem>
            disabled={disabled || isSwitching}
            items={items}
            itemToStringLabel={(item) => item.searchLabel}
            itemToStringValue={(item) => item.label}
            onValueChange={(nextItem) => {
                switchConversationContext(nextItem).catch((caught) => {
                    isSwitchingRef.current = false;
                    setPendingItem(null);
                    setIsSwitching(false);
                    onError(
                        caught instanceof Error
                            ? caught.message
                            : "Could not switch conversation context"
                    );
                });
            }}
            value={pendingItem ?? currentItem}
        >
            <ComboboxInput
                aria-label="Conversation context"
                className="w-52 max-w-[52vw] bg-muted"
                endAddon={
                    isSwitching ? (
                        <Loader2 className="animate-spin" />
                    ) : (
                        <ChevronsUpDown />
                    )
                }
                id={inputId}
                placeholder={placeholder}
                size="sm"
            />
            <ComboboxPopup sideOffset={6}>
                <ComboboxEmpty>No conversations found.</ComboboxEmpty>
                <ComboboxList>
                    {(item: ConversationContextItem) => (
                        <ComboboxItem
                            key={item.id}
                            showIndicatorLast
                            value={item}
                        >
                            {item.kind === "all" ? (
                                <div className="min-w-0">
                                    <p className="truncate font-medium">
                                        All conversations
                                    </p>
                                    <p className="truncate text-muted-foreground text-xs">
                                        Use the full imported dataset
                                    </p>
                                </div>
                            ) : (
                                <div className="min-w-0">
                                    <p className="truncate font-medium">
                                        {item.conversation.title}
                                    </p>
                                    <p className="truncate text-muted-foreground text-xs">
                                        {item.conversation.message_count}{" "}
                                        messages -{" "}
                                        {item.conversation.session_id}
                                    </p>
                                </div>
                            )}
                        </ComboboxItem>
                    )}
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

function TranscriptPanel({
    conversation,
}: {
    conversation: {
        title: string;
        messages: Array<{ id: string; speaker: string; text: string }>;
    };
}) {
    return (
        <aside className="hidden max-h-full w-96 shrink-0 border-border/70 border-l p-4 lg:block">
            <ScrollArea scrollFade>
                <h2 className="font-semibold text-sm">{conversation.title}</h2>
                <div className="mt-4 space-y-3 overflow-auto text-xs">
                    {conversation.messages.map((message) => (
                        <div key={message.id}>
                            <p className="font-medium capitalize">
                                {message.speaker}
                            </p>
                            <p className="text-muted-foreground">
                                {message.text}
                            </p>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </aside>
    );
}
