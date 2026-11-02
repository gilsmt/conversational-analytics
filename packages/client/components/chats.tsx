"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { ActivePathname } from "@/components/ui/active-pathname";
import { Button } from "@/components/ui/button";
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
import { DisclosureList } from "@/components/ui/disclosure-list";
import { Input } from "@/components/ui/input";
import {
    SidebarGroupAction,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatThreads } from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";

export function ChatsList() {
    const { data, isLoading } = useChatThreads();
    const router = useRouter();
    const chats = data?.items ?? [];

    if (isLoading) {
        return (
            <p className="px-2 py-1 text-muted-foreground text-xs">
                Loading...
            </p>
        );
    }

    return (
        <DisclosureList maxVisible={6}>
            {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                    <ActivePathname
                        href={`/chat/${chat.id}`}
                        render={
                            <SidebarMenuButton
                                onClick={() => router.push(`/chat/${chat.id}`)}
                            >
                                <span className="min-w-0 flex-1 truncate">
                                    {chat.title}
                                </span>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
                                    {chat.scope}
                                </span>
                            </SidebarMenuButton>
                        }
                    />
                    <RenameChatAction id={chat.id} title={chat.title} />
                    <ConfirmAction
                        body="This deletes the chat thread and all messages in it."
                        onConfirm={async () => {
                            await api.deleteThread(chat.id);
                            await mutate("/chat/threads?limit=200");
                            router.push("/");
                        }}
                        title="Delete chat?"
                        trigger={
                            <SidebarMenuAction aria-label="Delete chat">
                                <Trash2 />
                            </SidebarMenuAction>
                        }
                    />
                </SidebarMenuItem>
            ))}
        </DisclosureList>
    );
}

function RenameChatAction({ id, title }: { id: string; title: string }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(title);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }
        try {
            await api.renameThread(id, trimmed);
            await mutate("/chat/threads?limit=200");
            setOpen(false);
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Rename failed"
            );
        }
    }

    return (
        <Dialog onOpenChange={setOpen} open={open}>
            <DialogTrigger
                render={
                    <SidebarMenuAction
                        aria-label="Rename chat"
                        className="right-6"
                    >
                        <Pencil />
                    </SidebarMenuAction>
                }
            />
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>Rename chat</DialogTitle>
                </DialogHeader>
                <DialogPanel className="space-y-3">
                    <Input
                        nativeInput
                        onChange={(event) =>
                            setValue(event.currentTarget.value)
                        }
                        value={value}
                    />
                    {error ? (
                        <p className="text-destructive text-sm">{error}</p>
                    ) : null}
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                        Cancel
                    </DialogClose>
                    <Button
                        disabled={!value.trim()}
                        onClick={() => {
                            save().catch((caught) => {
                                setError(
                                    caught instanceof Error
                                        ? caught.message
                                        : "Rename failed"
                                );
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

export function NewChatButton() {
    const router = useRouter();

    return (
        <Button
            onClick={async () => {
                const thread = await api.createThread({ scope: "all" });
                await mutate("/chat/threads?limit=200");
                router.push(`/chat/${thread.id}`);
            }}
            size="sm"
            variant="ghost"
        >
            <Plus />
            New chat
        </Button>
    );
}

export function NewChatGroupAction() {
    const router = useRouter();

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <SidebarGroupAction
                        onClick={async () => {
                            const thread = await api.createThread({
                                scope: "all",
                            });
                            await mutate("/chat/threads?limit=200");
                            router.push(`/chat/${thread.id}`);
                        }}
                    >
                        <Plus />
                        <span className="sr-only">New chat</span>
                    </SidebarGroupAction>
                }
            />
            <TooltipContent align="end" side="right">
                Create a new chat
            </TooltipContent>
        </Tooltip>
    );
}
