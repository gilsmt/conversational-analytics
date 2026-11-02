import { cn } from "@/lib/cn";
import type * as React from "react";

export function PageShell({
    className,
    as: Comp = "main",
    ...props
}: React.ComponentProps<"main"> & { as?: React.ElementType }) {
    return (
        <Comp
            {...props}
            className={cn(
                "relative isolate z-0 mx-auto flex size-full min-h-svh flex-1 flex-col items-center justify-center overflow-hidden overscroll-none bg-[#F3EEE7] pt-[max(1rem,env(safe-area-inset-top))] leading-snug outline-hidden [-webkit-user-drag:none] focus-visible:outline-hidden",
                className
            )}
            id="main"
            tabIndex={-1}
        />
    );
}
