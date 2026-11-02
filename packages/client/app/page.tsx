"use client";

import { ImportConversationsDialog } from "@/components/conversations";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { PageShell } from "@/components/ui/page-shell";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { useConversations } from "@/hooks/use-api-data";
import { api } from "@/lib/api";
import { BASE_URL } from "@/lib/constants";
import { Info, MessageSquarePlus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";

export default function HomePage() {
    const { data } = useConversations();
    const router = useRouter();
    const count = data?.total ?? 0;

    return (
        <SidebarInset>
            <SidebarTrigger className="absolute top-2 left-2 z-20 invert" />
            <PageShell className="rounded-t-2xl">
                <div className="relative z-10 mt-48 w-full max-w-2xl px-3 sm:px-8">
                    <div className="mb-4 px-4 text-center">
                        <h1 className="mx-auto w-fit font-bold text-2xl text-background sm:text-3xl">
                            Conversational Analytics
                        </h1>
                        <p className="mt-2 text-balance text-base text-muted-foreground">
                            Import conversations, set questions and insights to
                            analyze, then ask the agent what they reveal.
                        </p>
                    </div>
                    <div className="translate-y-[0.8px] rounded-[34px] rounded-out-b-[24px] rounded-b-none bg-black p-[10px] pb-0">
                        <div className="relative rounded-3xl bg-[#F3EEE7]">
                            <div className="p-4 sm:p-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <ImportConversationsDialog
                                        trigger={
                                            <Button
                                                className="group h-auto min-h-32 flex-col items-start gap-4 rounded-xl bg-black p-4 text-left text-white transition-all hover:bg-stone-900"
                                                variant="ghost"
                                            >
                                                <Upload className="size-6 shrink-0 transition-transform group-hover:scale-110" />
                                                <span className="max-w-full">
                                                    <span className="block font-semibold text-sm">
                                                        Import conversations
                                                    </span>
                                                    <span className="mt-0.5 block min-w-0 max-w-full truncate text-stone-400 text-xs">
                                                        Upload a folder or .zip
                                                        with transcripts
                                                    </span>
                                                </span>
                                            </Button>
                                        }
                                    />
                                    <Button
                                        className="group h-auto min-h-32 flex-col items-start gap-4 rounded-xl bg-amber-150 p-4 text-left text-amber-900 transition-all hover:bg-black/3 hover:text-amber-900"
                                        onClick={async () => {
                                            const thread =
                                                await api.createThread({
                                                    scope: "all",
                                                });
                                            await mutate(
                                                "/chat/threads?limit=200"
                                            );
                                            router.push(`/chat/${thread.id}`);
                                        }}
                                        variant="ghost"
                                    >
                                        <MessageSquarePlus className="size-6 shrink-0 transition-transform group-hover:scale-110" />
                                        <span className="max-w-full">
                                            <span className="block font-semibold text-sm">
                                                New session
                                            </span>
                                            <span className="mt-0.5 block min-w-0 max-w-full truncate text-xs">
                                                Start an all-conversation agent
                                                chat
                                            </span>
                                        </span>
                                    </Button>
                                </div>
                                <div className="absolute top-full left-0 mt-4 flex w-full flex-col items-center justify-center gap-3 text-center font-medium text-muted-foreground text-xs">
                                    <p className="flex items-center justify-center gap-1.5 text-center font-medium text-muted-foreground text-xs leading-none">
                                        <Info className="mt-0.5 size-3.5 shrink-0" />
                                        <span>
                                            {count} imported conversations.
                                            Ready when you are.
                                        </span>
                                    </p>
                                    <CopyButton
                                        className="inline-flex items-center gap-1.5 underline underline-offset-4"
                                        value={BASE_URL}
                                        variant="link"
                                    >
                                        Copy link to share this page
                                    </CopyButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative min-h-48 w-full flex-1 bg-black">
                    <div className="absolute -top-[23px] -left-[24px] z-50 size-[24px] rounded-out-br-[24px] bg-black" />
                    <div className="absolute -top-[23px] -right-[24px] z-50 size-[24px] rounded-out-bl-[24px] bg-black" />
                </div>
            </PageShell>
        </SidebarInset>
    );
}
