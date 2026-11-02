"use client";

import { SidebarInset } from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { mutate } from "swr";

let pendingNewChatThread: ReturnType<typeof api.createThread> | null = null;

function createNewChatThread() {
    pendingNewChatThread ??= api.createThread({ scope: "all" }).finally(() => {
        pendingNewChatThread = null;
    });
    return pendingNewChatThread;
}

export default function NewChatPage() {
    const router = useRouter();

    useEffect(() => {
        let active = true;
        async function createThread() {
            const thread = await createNewChatThread();
            await mutate("/chat/threads?limit=200");
            if (active) {
                router.replace(`/chat/${thread.id}`);
            }
        }
        createThread().catch(() => {
            router.replace("/");
        });
        return () => {
            active = false;
        };
    }, [router]);

    return (
        <SidebarInset>
            <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                Creating chat...
            </div>
        </SidebarInset>
    );
}
