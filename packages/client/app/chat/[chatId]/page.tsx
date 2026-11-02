"use client";

import { ChatWorkspace } from "@/components/chat-workspace";
import { use } from "react";

interface ChatPageProps {
    params: Promise<{ chatId: string }>;
}

export default function ChatPage(props: ChatPageProps) {
    const { chatId } = use(props.params);
    return <ChatWorkspace chatId={chatId} />;
}
