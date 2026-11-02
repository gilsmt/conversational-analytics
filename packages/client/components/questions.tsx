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
import { useQuestions } from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import { slugify } from "@/lib/strings";
import type { QualifyingQuestion } from "@conversational-analytics/shared";
import { CircleHelp, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { mutate } from "swr";

export function QuestionsList() {
    const { data } = useQuestions();
    const questions = data ?? [];

    return (
        <CollapsibleSection
            actions={
                <>
                    <GuideTooltip content="Questions are predefined qualifiers Conversational Analytics answers from each transcript, usually as short answers you can scan or compare.">
                        <Button
                            aria-label="What questions mean"
                            size="icon-sm"
                            variant="ghost"
                        >
                            <CircleHelp />
                        </Button>
                    </GuideTooltip>
                    <QuestionDialog
                        tooltip="Create a new question"
                        trigger={
                            <Button
                                aria-label="Create question"
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
            title="Questions"
        >
            {questions.map((question) => (
                <div
                    className="rounded-md border border-border/70 p-2 text-xs"
                    key={question.id}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div
                            className={
                                question.is_active ? undefined : "opacity-50"
                            }
                        >
                            <p className="font-medium">
                                {question.question_text}
                            </p>
                            <p className="text-muted-foreground">
                                {question.key}
                            </p>
                        </div>
                        <div className="flex gap-1">
                            <QuestionDialog
                                question={question}
                                trigger={
                                    <Button
                                        aria-label={`Edit ${question.question_text}`}
                                        size="icon-xs"
                                        variant="ghost"
                                    >
                                        <Pencil />
                                    </Button>
                                }
                            />
                            <Button
                                aria-label={`${question.is_active ? "Deactivate" : "Activate"} ${question.question_text}`}
                                onClick={async () => {
                                    await api.updateQuestion(question.id, {
                                        is_active: !question.is_active,
                                    });
                                    await mutate("/qualifying-questions");
                                }}
                                size="icon-xs"
                                variant="ghost"
                            >
                                {question.is_active ? "On" : "Off"}
                            </Button>
                            <ConfirmAction
                                body="This hard-deletes the question and removes its saved answer keys from conversations."
                                onConfirm={async () => {
                                    await api.deleteQuestion(question.id);
                                    await mutate("/qualifying-questions");
                                    await mutate("/conversations?limit=200");
                                }}
                                title="Delete question?"
                                trigger={
                                    <Button
                                        aria-label={`Delete ${question.question_text}`}
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

export function NewQuestionDialog() {
    return (
        <QuestionDialog
            trigger={
                <Button>
                    <Plus />
                    New question
                </Button>
            }
        />
    );
}

function QuestionDialog({
    trigger,
    question,
    tooltip,
}: {
    trigger: React.ReactNode;
    question?: QualifyingQuestion;
    tooltip?: string;
}) {
    const [open, setOpen] = useState(false);
    const [questionText, setQuestionText] = useState(
        question?.question_text ?? ""
    );
    const [key, setKey] = useState(question?.key ?? "");

    function resetFields() {
        setQuestionText(question?.question_text ?? "");
        setKey(question?.key ?? "");
    }

    function handleOpenChange(nextOpen: boolean) {
        setOpen(nextOpen);
        if (nextOpen) {
            resetFields();
        }
    }

    function updateText(value: string) {
        setQuestionText(value);
        if (!question) {
            setKey(slugify(value));
        }
    }

    async function save() {
        if (question) {
            await api.updateQuestion(question.id, {
                key,
                question_text: questionText,
            });
        } else {
            await api.createQuestion({ key, question_text: questionText });
        }
        await mutate("/qualifying-questions");
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
                        {question ? "Edit question" : "New question"}
                    </DialogTitle>
                </DialogHeader>
                <DialogPanel className="space-y-3">
                    <Alert variant="info">
                        <Lightbulb />
                        <AlertTitle>What is a question?</AlertTitle>
                        <AlertDescription>
                            A question is a fixed qualifier Conversational
                            Analytics answers for each transcript. Use it for
                            facts you want to compare, filter, or summarize.
                        </AlertDescription>
                    </Alert>
                    <Textarea
                        aria-label="Question text"
                        onChange={(event) =>
                            updateText(event.currentTarget.value)
                        }
                        placeholder="Question"
                        value={questionText}
                    />
                    <Input
                        aria-label="Question key"
                        nativeInput
                        onChange={(event) => setKey(event.currentTarget.value)}
                        placeholder="key"
                        value={key}
                    />
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                        Cancel
                    </DialogClose>
                    <Button
                        disabled={!(questionText && key)}
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
