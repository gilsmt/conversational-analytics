"use client";

import { InsightsList } from "@/components/insights";
import { QuestionsList } from "@/components/questions";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    useChatThread,
    useConversation,
    useInsights,
    useLatestAnalysisRun,
    useQuestions,
} from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import type { AnalysisRun } from "@conversational-analytics/shared";
import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect } from "react";
import { mutate } from "swr";

const CHAT_PATH_RE = /^\/chat\/([^/]+)/;

function chatIdFromPathname(pathname: string): string | null {
    const match = pathname.match(CHAT_PATH_RE);
    const chatId = match?.[1];
    return chatId && chatId !== "new" ? chatId : null;
}

function ContextualAnalysisResults({ run }: { run?: AnalysisRun | null }) {
    const pathname = usePathname();
    const chatId = chatIdFromPathname(pathname);
    const { data: thread } = useChatThread(chatId);
    const conversationId =
        thread?.scope === "single" ? thread.conversation_id : null;
    const isAnalyzing =
        !!run && ["queued", "running", "canceling"].includes(run.status);
    const { data: conversation } = useConversation(conversationId, {
        refreshInterval: isAnalyzing ? 1500 : 0,
    });
    const { data: insights } = useInsights();
    const { data: questions } = useQuestions();

    useEffect(() => {
        if (
            conversationId &&
            run &&
            ["completed", "failed", "canceled"].includes(run.status)
        ) {
            mutate(`/conversations/${conversationId}`).catch(() => {
                // SWR will retry on the next explicit refresh.
            });
        }
    }, [conversationId, run]);

    if (!chatId || thread?.scope !== "single" || !conversation) {
        return null;
    }

    const activeInsights = (insights ?? []).filter(
        (insight) => insight.is_active
    );

    const activeQuestions = (questions ?? []).filter(
        (question) => question.is_active
    );

    const visibleInsightResults = activeInsights
        .map((insight) => ({
            insight,
            result: conversation.insight_results?.[insight.id],
        }))
        .filter(({ result }) => result?.value || result?.explanation);

    const visibleQuestionResults = activeQuestions
        .map((question) => ({
            question,
            result: conversation.qualifying_results?.[question.id],
        }))
        .filter(({ result }) => result !== undefined && result !== null);

    const hasResults =
        visibleInsightResults.length > 0 || visibleQuestionResults.length > 0;

    return (
        <>
            <Separator />
            <CollapsibleSection title="Conversation results">
                <div className="space-y-3">
                    <p className="line-clamp-2 text-muted-foreground text-xs">
                        {conversation.title}
                    </p>
                    {conversation.analysis_status === "processing" ? (
                        <p className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Loader2 className="size-3 animate-spin" />
                            Analysis is running
                        </p>
                    ) : null}
                    {conversation.analysis_error ? (
                        <p className="rounded-md border border-destructive/30 p-2 text-destructive text-xs">
                            {conversation.analysis_error}
                        </p>
                    ) : null}
                    {hasResults ? (
                        <div className="space-y-3">
                            {visibleInsightResults.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Insights
                                    </p>
                                    {visibleInsightResults.map(
                                        ({ insight, result }) => (
                                            <div
                                                className="rounded-md border border-border/70 p-2 text-xs"
                                                key={insight.id}
                                            >
                                                <p className="font-medium">
                                                    {insight.name}
                                                </p>
                                                <p className="mt-1 text-foreground">
                                                    {result?.value ||
                                                        "No value"}
                                                </p>
                                                {result?.explanation ? (
                                                    <p className="mt-1 text-muted-foreground">
                                                        {result.explanation}
                                                    </p>
                                                ) : null}
                                            </div>
                                        )
                                    )}
                                </div>
                            ) : null}
                            {visibleQuestionResults.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Qualifying questions
                                    </p>
                                    {visibleQuestionResults.map(
                                        ({ question, result }) => (
                                            <div
                                                className="rounded-md border border-border/70 p-2 text-xs"
                                                key={question.id}
                                            >
                                                <p className="font-medium">
                                                    {question.question_text}
                                                </p>
                                                <p className="mt-1 text-muted-foreground">
                                                    {result}
                                                </p>
                                            </div>
                                        )
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-md border border-border/70 p-2 text-muted-foreground text-xs">
                            {conversation.analysis_status === "completed"
                                ? "No active results are available for this conversation."
                                : "Run analysis to populate this conversation's results."}
                        </p>
                    )}
                </div>
            </CollapsibleSection>
        </>
    );
}

export function FloatingSidebar() {
    const { data: run } = useLatestAnalysisRun();
    const isRunning =
        !!run && ["queued", "running", "canceling"].includes(run.status);

    return (
        <Sidebar
            className="sticky top-0 hidden h-fit! lg:flex"
            collapsible="offcanvas"
            side="right"
            style={
                {
                    "--sidebar": "var(--popover)",
                    "--sidebar-width": "22rem",
                    "--sidebar-width-mobile": "22rem",
                } as CSSProperties
            }
            variant="floating"
        >
            <SidebarContent className="gap-4 p-3">
                <InsightsList />
                <QuestionsList />
                <ContextualAnalysisResults run={run} />
                <Separator />
                <CollapsibleSection title="Analysis">
                    <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <AnalysisTooltip content="Analyzes conversations that are pending or previously failed. Completed conversations are left as-is.">
                                <span className="inline-flex w-full">
                                    <Button
                                        aria-label="Run analysis for pending and failed conversations"
                                        className="w-full"
                                        disabled={isRunning}
                                        onClick={async () => {
                                            const created =
                                                await api.createAnalysisRun(
                                                    false
                                                );
                                            await mutate(
                                                "/analysis-runs/latest",
                                                created,
                                                {
                                                    revalidate: true,
                                                }
                                            );
                                        }}
                                    >
                                        {isRunning ? (
                                            <Loader2 className="animate-spin" />
                                        ) : (
                                            <Play />
                                        )}
                                        Run analysis
                                    </Button>
                                </span>
                            </AnalysisTooltip>
                            <AnalysisTooltip content="Starts over for every imported conversation, replacing existing analysis results.">
                                <span className="inline-flex">
                                    <Button
                                        aria-label="Re-run analysis for every conversation"
                                        disabled={isRunning}
                                        onClick={async () => {
                                            const created =
                                                await api.createAnalysisRun(
                                                    true
                                                );
                                            await mutate(
                                                "/analysis-runs/latest",
                                                created,
                                                {
                                                    revalidate: true,
                                                }
                                            );
                                        }}
                                        size="icon"
                                        title="Re-run all"
                                        variant="outline"
                                    >
                                        <RotateCcw />
                                    </Button>
                                </span>
                            </AnalysisTooltip>
                        </div>
                        {run ? (
                            <div className="rounded-md border border-border/70 p-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium capitalize">
                                        {run.status}
                                    </span>
                                    {isRunning ? (
                                        <Button
                                            aria-label="Cancel analysis run"
                                            onClick={async () => {
                                                await api.cancelAnalysisRun(
                                                    run.id
                                                );
                                                await mutate(
                                                    "/analysis-runs/latest"
                                                );
                                            }}
                                            size="icon-xs"
                                            variant="ghost"
                                        >
                                            <Square />
                                        </Button>
                                    ) : null}
                                </div>
                                <p className="text-muted-foreground">
                                    {run.processed}/{run.total} processed,{" "}
                                    {run.failed} failed
                                </p>
                                {run.last_error ? (
                                    <p className="mt-1 text-destructive">
                                        {run.last_error}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </CollapsibleSection>
            </SidebarContent>
        </Sidebar>
    );
}

function AnalysisTooltip({
    children,
    content,
}: {
    children: React.ReactElement;
    content: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger render={children} />
            <TooltipContent align="end" side="left">
                {content}
            </TooltipContent>
        </Tooltip>
    );
}
