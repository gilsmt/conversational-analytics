import { ChatsList, NewChatGroupAction } from "@/components/chats";
import {
    ConversationsList,
    ImportConversationsDialog,
} from "@/components/conversations";
import { ActivePathname } from "@/components/ui/active-pathname";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/cn";
import { ChartPie, Plus, SquarePen } from "lucide-react";
import Link from "next/link";
import { Suspense, type SVGProps } from "react";

export function ChatsSidebar() {
    return (
        <Sidebar collapsible="offcanvas" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <Link className="contents" href="/" prefetch tabIndex={0}>
                        <SidebarMenuItem className="group">
                            <ActivePathname
                                href="/"
                                render={
                                    <SidebarMenuButton>
                                        <SquarePen
                                            aria-hidden
                                            className="inline-block size-3.5 shrink-0"
                                            focusable="false"
                                        />
                                        New session
                                    </SidebarMenuButton>
                                }
                            />
                        </SidebarMenuItem>
                    </Link>
                    <Link
                        className="contents"
                        href="/dashboard"
                        prefetch
                        tabIndex={0}
                    >
                        <SidebarMenuItem className="group">
                            <ActivePathname
                                href="/dashboard"
                                render={
                                    <SidebarMenuButton>
                                        <ChartPie
                                            aria-hidden
                                            className="inline-block size-3.5 shrink-0"
                                            focusable="false"
                                        />
                                        Dashboard
                                    </SidebarMenuButton>
                                }
                            />
                        </SidebarMenuItem>
                    </Link>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <SidebarMenu>
                    <Collapsible className="group">
                        <SidebarGroup>
                            <SidebarGroupLabel
                                render={
                                    <CollapsibleTrigger>
                                        <span className="min-w-0 text-xs">
                                            Conversations
                                        </span>
                                        <ChevronDownFilledIcon />
                                    </CollapsibleTrigger>
                                }
                            />
                            <ImportConversationsDialog
                                tooltip="Import conversations"
                                trigger={
                                    <SidebarGroupAction>
                                        <Plus />
                                        <span className="sr-only">
                                            New conversation
                                        </span>
                                    </SidebarGroupAction>
                                }
                            />
                            <CollapsiblePanel>
                                <SidebarGroupContent>
                                    <Suspense>
                                        <ConversationsList />
                                    </Suspense>
                                </SidebarGroupContent>
                            </CollapsiblePanel>
                        </SidebarGroup>
                    </Collapsible>
                    <Collapsible className="group" defaultOpen>
                        <SidebarGroup>
                            <SidebarGroupLabel
                                render={
                                    <CollapsibleTrigger>
                                        <span className="min-w-0 text-xs">
                                            Chats
                                        </span>
                                        <ChevronDownFilledIcon />
                                    </CollapsibleTrigger>
                                }
                            />
                            <NewChatGroupAction />
                            <CollapsiblePanel>
                                <SidebarGroupContent>
                                    <Suspense>
                                        <ChatsList />
                                    </Suspense>
                                </SidebarGroupContent>
                            </CollapsiblePanel>
                        </SidebarGroup>
                    </Collapsible>
                </SidebarMenu>
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    );
}

const ChevronDownFilledIcon = ({
    className,
    ...props
}: SVGProps<SVGSVGElement>) => (
    <svg
        aria-hidden="true"
        className={cn(
            "pointer-events-none inline-block size-4 shrink-0 opacity-80 transition-[opacity,transform] group-hover:opacity-80! group-data-panel-open:rotate-90 group-data-panel-open:opacity-30",
            className
        )}
        fill="currentColor"
        focusable="false"
        height="16"
        role="img"
        viewBox="0 0 16 16"
        width="16"
        {...props}
    >
        <path d="M7.002 10.624a.5.5 0 01-.752-.432V5.808a.5.5 0 01.752-.432l3.758 2.192a.5.5 0 010 .864z" />
    </svg>
);
