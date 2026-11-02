"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import type { ReactElement } from "react";
import { useState, useTransition } from "react";

export function ConfirmAction({
    body,
    confirmLabel = "Delete",
    onConfirm,
    title,
    trigger,
}: {
    body: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
    title: string;
    trigger: ReactElement;
}) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isWorking, startTransition] = useTransition();

    function confirm() {
        startTransition(async () => {
            setError(null);
            try {
                await onConfirm();
                setOpen(false);
            } catch (caught) {
                setError(
                    caught instanceof Error ? caught.message : "Action failed"
                );
            }
        });
    }

    function handleOpenChange(nextOpen: boolean) {
        setOpen(nextOpen);
        if (nextOpen) {
            setError(null);
        }
    }

    return (
        <Dialog onOpenChange={handleOpenChange} open={open}>
            <DialogTrigger render={trigger} />
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{body}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    {error ? (
                        <p className="text-destructive text-sm">{error}</p>
                    ) : null}
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                        Cancel
                    </DialogClose>
                    <Button
                        disabled={isWorking}
                        onClick={() => {
                            confirm();
                        }}
                        variant="destructive"
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
