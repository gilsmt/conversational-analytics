"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DisclosureList } from "@/components/ui/disclosure-list";
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
import {
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConversations } from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import { directoryOpen, fileOpen } from "@/lib/file";
import {
    FileArchive,
    FolderOpen,
    Lightbulb,
    Loader2,
    Trash2,
    Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { mutate } from "swr";

export function ConversationsList() {
    const { data, isLoading } = useConversations();
    const router = useRouter();
    const conversations = data?.items ?? [];

    if (isLoading) {
        return (
            <p className="px-2 py-1 text-muted-foreground text-xs">
                Loading...
            </p>
        );
    }

    return (
        <DisclosureList maxVisible={6}>
            {conversations.map((conversation) => (
                <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                        onClick={async () => {
                            const thread = await api.createThread({
                                conversation_id: conversation.id,
                                scope: "single",
                            });
                            await mutate("/chat/threads?limit=200");
                            router.push(`/chat/${thread.id}`);
                        }}
                    >
                        <span className="truncate">{conversation.title}</span>
                    </SidebarMenuButton>
                    <ConfirmAction
                        body="This deletes the conversation, its messages, analysis results, and single-conversation chats."
                        onConfirm={async () => {
                            await api.deleteConversation(conversation.id);
                            await Promise.all([
                                mutate("/conversations?limit=200"),
                                mutate("/chat/threads?limit=200"),
                            ]);
                        }}
                        title="Delete conversation?"
                        trigger={
                            <SidebarMenuAction aria-label="Delete conversation">
                                <Trash2 />
                            </SidebarMenuAction>
                        }
                    />
                </SidebarMenuItem>
            ))}
        </DisclosureList>
    );
}

export function NewConversationTrigger({
    children,
    ...props
}: React.ComponentProps<typeof Button>) {
    return (
        <ImportConversationsDialog
            trigger={
                <Button {...props}>
                    {children ?? (
                        <>
                            <Upload />
                            Import
                        </>
                    )}
                </Button>
            }
        />
    );
}

export function ImportConversationsDialog({
    trigger,
    tooltip,
}: {
    trigger: React.ReactNode;
    tooltip?: string;
}) {
    const [open, setOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [summary, setSummary] = useState<Awaited<
        ReturnType<typeof api.importConversations>
    > | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function importFiles(files: File[]) {
        setIsImporting(true);
        setError(null);
        try {
            const result = await api.importConversations(files);
            setSummary(result);
            await mutate("/conversations?limit=200");
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Import failed"
            );
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <Dialog onOpenChange={setOpen} open={open}>
            {tooltip ? (
                <Tooltip>
                    <DialogTrigger
                        render={
                            <TooltipTrigger
                                render={trigger as React.ReactElement}
                            />
                        }
                    />
                    <TooltipContent align="end" side="right">
                        {tooltip}
                    </TooltipContent>
                </Tooltip>
            ) : (
                <DialogTrigger render={trigger as React.ReactElement} />
            )}
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>Import conversations</DialogTitle>
                </DialogHeader>
                <DialogPanel className="space-y-4">
                    <Alert variant="info">
                        <Lightbulb />
                        <AlertTitle>What gets imported?</AlertTitle>
                        <AlertDescription>
                            Upload a transcript zip or folder. Conversations are
                            grouped by session ID; duplicates are skipped and
                            reported without replacing existing data.
                        </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            disabled={isImporting}
                            onClick={async () => {
                                const file = await fileOpen({
                                    description: "Conversation zip",
                                    extensions: ["zip"],
                                });
                                await importFiles([file]);
                            }}
                            variant="outline"
                        >
                            <FileArchive />
                            Zip
                        </Button>
                        <Button
                            disabled={isImporting}
                            onClick={async () => {
                                const files = await directoryOpen({
                                    recursive: true,
                                });
                                await importFiles(files);
                            }}
                            variant="outline"
                        >
                            <FolderOpen />
                            Folder
                        </Button>
                    </div>
                    {isImporting ? (
                        <p className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="size-3 animate-spin" />
                            Importing transcripts
                        </p>
                    ) : null}
                    {error ? (
                        <p className="text-destructive text-sm">{error}</p>
                    ) : null}
                    {summary ? (
                        <div className="space-y-2 text-sm">
                            <p>
                                Imported {summary.imported}, skipped{" "}
                                {summary.skipped}, failed {summary.failed}
                            </p>
                            <div className="max-h-44 overflow-auto rounded-md border p-2 text-xs">
                                {summary.files.map((file) => (
                                    <div
                                        key={`${file.filename}-${file.status}`}
                                    >
                                        <span className="font-medium">
                                            {file.status}
                                        </span>{" "}
                                        {file.filename}
                                        {file.error ? ` - ${file.error}` : ""}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                        Close
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
