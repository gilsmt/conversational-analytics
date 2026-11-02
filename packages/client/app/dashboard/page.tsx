"use client";

import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
    useConversations,
    useInsights,
    useQuestions,
} from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { mutate } from "swr";

function normalize(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase() || "No value";
}

export default function DashboardPage() {
    const { data: conversations } = useConversations();
    const { data: insights } = useInsights();
    const { data: questions } = useQuestions();
    const items = conversations?.items ?? [];
    const totalConversations = conversations?.total ?? items.length;
    const isLimitedView = totalConversations > items.length;
    const activeInsights = (insights ?? []).filter((item) => item.is_active);
    const activeQuestions = (questions ?? []).filter((item) => item.is_active);
    const completed = items.filter(
        (item) => item.analysis_status === "completed"
    ).length;

    const insightCharts = activeInsights.map((insight) => {
        const counts = new Map<string, number>();
        for (const conversation of items) {
            const result = conversation.insight_results?.[insight.id];
            const value = typeof result?.value === "string" ? result.value : "";
            const key = normalize(value);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return {
            data: [...counts].map(([name, count]) => ({ count, name })),
            insight,
        };
    });
    const questionSummaries = activeQuestions.map((question) => {
        const counts = new Map<string, number>();
        for (const conversation of items) {
            const value = conversation.qualifying_results?.[question.id];
            const key = normalize(value ?? "Not answered");
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return {
            data: [...counts].map(([name, count]) => ({ count, name })),
            question,
        };
    });

    return (
        <SidebarInset>
            <SidebarTrigger className="absolute top-3 left-3 z-20" />
            <main className="min-h-svh space-y-6 p-4">
                <div className="flex items-start justify-between gap-4 pl-9">
                    <div>
                        <h1 className="font-medium text-xl">Dashboard</h1>
                        <p className="text-muted-foreground text-sm">
                            {totalConversations} conversations, {completed}{" "}
                            analyzed
                            {isLimitedView
                                ? ` in the first ${items.length} shown`
                                : ""}
                            .
                        </p>
                    </div>
                    <Button
                        onClick={async () => {
                            await api.createAnalysisRun(false);
                            await mutate("/analysis-runs/latest");
                        }}
                    >
                        Run analysis
                    </Button>
                </div>
                <section className="grid gap-3 md:grid-cols-4">
                    {["pending", "processing", "completed", "failed"].map(
                        (status) => (
                            <div
                                className="rounded-lg border border-border/70 p-4"
                                key={status}
                            >
                                <p className="font-semibold text-2xl tabular-nums">
                                    {
                                        items.filter(
                                            (item) =>
                                                item.analysis_status === status
                                        ).length
                                    }
                                </p>
                                <p className="text-foreground text-xs capitalize">
                                    {status}
                                </p>
                            </div>
                        )
                    )}
                </section>
                <section className="grid gap-4 lg:grid-cols-2">
                    {insightCharts.map(({ insight, data }) => (
                        <div
                            className="rounded-lg border border-border/70 p-4"
                            key={insight.id}
                        >
                            <h2 className="font-medium text-sm">
                                {insight.name}
                            </h2>
                            <div className="mt-4 h-48">
                                <ResponsiveContainer height="100%" width="100%">
                                    <BarChart data={data}>
                                        <XAxis dataKey="name" hide />
                                        <YAxis
                                            allowDecimals={false}
                                            width={28}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="var(--primary)"
                                            radius={4}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-2 space-y-1 text-xs">
                                {data.map((row) => (
                                    <div
                                        className="flex justify-between gap-2"
                                        key={row.name}
                                    >
                                        <span className="truncate">
                                            {row.name}
                                        </span>
                                        <span>{row.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {questionSummaries.map(({ data, question }) => (
                        <div
                            className="rounded-lg border border-border/70 p-4"
                            key={question.id}
                        >
                            <h2 className="font-medium text-sm">
                                {question.question_text}
                            </h2>
                            <div className="mt-3 space-y-1 text-xs">
                                {data.map((row) => (
                                    <div
                                        className="flex justify-between gap-2"
                                        key={row.name}
                                    >
                                        <span className="truncate">
                                            {row.name}
                                        </span>
                                        <span>{row.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
                <section className="overflow-x-auto rounded-lg border border-border/70">
                    <table className="w-full min-w-3xl text-left text-xs">
                        <thead className="border-b text-muted-foreground">
                            <tr>
                                <th className="p-3 font-medium">
                                    Conversation
                                </th>
                                <th className="p-3 font-medium">Status</th>
                                {activeInsights.map((insight) => (
                                    <th
                                        className="p-3 font-medium"
                                        key={insight.id}
                                    >
                                        {insight.name}
                                    </th>
                                ))}
                                {activeQuestions.map((question) => (
                                    <th
                                        className="p-3 font-medium"
                                        key={question.id}
                                    >
                                        {question.question_text}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((conversation) => (
                                <tr
                                    className="border-b last:border-b-0"
                                    key={conversation.id}
                                >
                                    <td className="max-w-64 truncate p-3">
                                        {conversation.title}
                                    </td>
                                    <td className="p-3 capitalize">
                                        {conversation.analysis_status}
                                    </td>
                                    {activeInsights.map((insight) => (
                                        <td
                                            className="max-w-48 truncate p-3"
                                            key={insight.id}
                                        >
                                            {conversation.insight_results?.[
                                                insight.id
                                            ]?.value ?? ""}
                                        </td>
                                    ))}
                                    {activeQuestions.map((question) => (
                                        <td
                                            className="max-w-48 truncate p-3"
                                            key={question.id}
                                        >
                                            {conversation.qualifying_results?.[
                                                question.id
                                            ] ?? ""}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </main>
        </SidebarInset>
    );
}
