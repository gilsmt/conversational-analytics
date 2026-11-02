"use client";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { CheckIcon, ClipboardIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "./button";

interface CopyButtonProps extends React.ComponentProps<typeof Button> {
    value: string;
}

function CopyButton({ value, children, onClick, ...props }: CopyButtonProps) {
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    return (
        <Button
            onClick={(event) => {
                copyToClipboard(value);
                onClick?.(event);
            }}
            {...props}
        >
            {isCopied ? (
                <>
                    <CheckIcon />
                    Copied
                </>
            ) : (
                <>
                    <ClipboardIcon />
                    {children ?? "Copy"}
                </>
            )}
        </Button>
    );
}

export { CopyButton };
