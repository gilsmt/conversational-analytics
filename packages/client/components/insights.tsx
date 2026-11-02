"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
    Dialog,
    DialogClose,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInsights } from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import type { Insight } from "@conversational-analytics/shared";
import { CircleHelp, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { mutate } from "swr";

export function InsightsList() {
    const { data } = useInsights();
    const insights = data ?? [];

    return (
        <CollapsibleSection
            actions={
                <>
                    <GuideTooltip content="Insights are reusable analysis labels Conversational Analytics extracts for every conversation, such as pain point, fit, or next step.">
                        <Button
                            aria-label="What insights mean"
                            size="icon-sm"
                            variant="ghost"
                        >
                            <CircleHelp />
                        </Button>
                    </GuideTooltip>
                    <InsightDialog
                        tooltip="Create a new insight"
                        trigger={
                            <Button
                                aria-label="Create insight"
                                size="icon-sm"
                                variant="ghost"
                            >
                                <Plus />
                            </Button>
                        }
                    />
                </>
            }
            panelClassName="gap-2"
            title="Insights"
        >
            {insights.map((insight) => (
                <div
                    className="rounded-md border border-border/70 p-2 text-xs"
                    key={insight.id}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div
                            className={
                                insight.is_active ? undefined : "opacity-50"
                            }
                        >
                            <p className="font-medium">{insight.name}</p>
                            <p className="text-muted-foreground">
                                {insight.description}
                            </p>
                        </div>
                        <div className="flex gap-1">
                            <InsightDialog
                                insight={insight}
                                trigger={
                                    <Button
                                        aria-label={`Edit ${insight.name}`}
                                        size="icon-xs"
                                        variant="ghost"
                                    >
                                        <Pencil />
                                    </Button>
                                }
                            />
                            <Button
                                aria-label={`${insight.is_active ? "Deactivate" : "Activate"} ${insight.name}`}
                                onClick={async () => {
                                    await api.updateInsight(insight.id, {
                                        is_active: !insight.is_active,
                                    });
                                    await mutate("/insights");
                                }}
                                size="icon-xs"
                                variant="ghost"
                            >
                                {insight.is_active ? "On" : "Off"}
                            </Button>
                            <ConfirmAction
                                body="This hard-deletes the insight and removes its saved result keys from conversations."
                                onConfirm={async () => {
                                    await api.deleteInsight(insight.id);
                                    await mutate("/insights");
                                    await mutate("/conversations?limit=200");
                                }}
                                title="Delete insight?"
                                trigger={
                                    <Button
                                        aria-label={`Delete ${insight.name}`}
                                        size="icon-xs"
                                        variant="destructive"
                                    >
                                        <Trash2 />
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </div>
            ))}
        </CollapsibleSection>
    );
}

function GuideTooltip({
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

export function NewInsightDialog() {
    return (
        <InsightDialog
            trigger={
                <Button>
                    <Plus />
                    New insight
                </Button>
            }
        />
    );
}

function InsightDialog({
    trigger,
    insight,
    tooltip,
}: {
    trigger: React.ReactNode;
    insight?: Insight;
    tooltip?: string;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(insight?.name ?? "");
    const [description, setDescription] = useState(insight?.description ?? "");

    function resetFields() {
        setName(insight?.name ?? "");
        setDescription(insight?.description ?? "");
    }

    function handleOpenChange(nextOpen: boolean) {
        setOpen(nextOpen);
        if (nextOpen) {
            resetFields();
        }
    }

    async function save() {
        if (insight) {
            await api.updateInsight(insight.id, { description, name });
        } else {
            await api.createInsight({ description, name });
        }
        await mutate("/insights");
        await mutate("/conversations?limit=200");
        setOpen(false);
    }

    return (
        <Dialog onOpenChange={handleOpenChange} open={open}>
            {tooltip ? (
                <Tooltip>
                    <DialogTrigger
                        render={
                            <TooltipTrigger
                                render={trigger as React.ReactElement}
                            />
                        }
                    />
                    <TooltipContent align="end" side="left">
                        {tooltip}
                    </TooltipContent>
                </Tooltip>
            ) : (
                <DialogTrigger render={trigger as React.ReactElement} />
            )}
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        {insight ? "Edit insight" : "New insight"}
                    </DialogTitle>
                </DialogHeader>
                <DialogPanel className="space-y-3">
                    <Alert variant="info">
                        <Lightbulb />
                        <AlertTitle>What is an insight?</AlertTitle>
                        <AlertDescription>
                            An insight is a structured label Conversational
                            Analytics extracts from each transcript. Use a clear
                            description so results are comparable across
                            conversations.
                        </AlertDescription>
                    </Alert>
                    <Input
                        aria-label="Insight name"
                        nativeInput
                        onChange={(event) => setName(event.currentTarget.value)}
                        placeholder="Name"
                        value={name}
                    />
                    <Textarea
                        aria-label="Insight description"
                        onChange={(event) =>
                            setDescription(event.currentTarget.value)
                        }
                        placeholder="Description"
                        value={description}
                    />
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                        Cancel
                    </DialogClose>
                    <Button
                        disabled={!(name && description)}
                        onClick={() => {
                            save().catch(() => {
                                // Dialog save errors are surfaced by the browser console in this v1 UI.
                            });
                        }}
                    >
                        Save
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
