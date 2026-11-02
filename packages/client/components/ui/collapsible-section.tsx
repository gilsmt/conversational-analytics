"use client";

import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import type * as React from "react";

export function CollapsibleSection({
    actions,
    children,
    className,
    defaultOpen = true,
    panelClassName,
    title,
}: {
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    defaultOpen?: boolean;
    panelClassName?: string;
    title: React.ReactNode;
}) {
    return (
        <Collapsible
            className={cn("group space-y-2", className)}
            defaultOpen={defaultOpen}
        >
            <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger className="flex min-w-0 items-center gap-1.5 rounded-md text-left font-semibold text-sm">
                    <ChevronDownFilledIcon />
                    <span className="min-w-0 truncate">{title}</span>
                </CollapsibleTrigger>
                {actions ? (
                    <div className="flex items-center gap-1">{actions}</div>
                ) : null}
            </div>
            <CollapsiblePanel className={panelClassName}>
                {children}
            </CollapsiblePanel>
        </Collapsible>
    );
}

function ChevronDownFilledIcon({
    className,
    ...props
}: React.SVGProps<SVGSVGElement>) {
    return (
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
}
