import { SidebarProvider } from "@/components/ui/sidebar";
import "./globals.css";

import { FloatingSidebar } from "@/components/floating-sidebar";
import { ChatsSidebar } from "@/components/main-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
    },
    description:
        "Extract insights from AI conversations and explore them through scoped chat.",
    title: "Conversational Analytics",
};

export const viewport: Viewport = {
    initialScale: 1,
    themeColor: "#000000",
    viewportFit: "cover",
    width: "device-width",
};

export default function RootLayout({
    children,
}: Readonly<React.PropsWithChildren>) {
    return (
        <html className={cn("h-full font-sans", inter.variable)} lang="en">
            <body className="flex min-h-full flex-col antialiased">
                <TooltipProvider>
                    <SidebarProvider>
                        <ChatsSidebar />
                        {children}
                        <FloatingSidebar />
                    </SidebarProvider>
                </TooltipProvider>
            </body>
        </html>
    );
}
