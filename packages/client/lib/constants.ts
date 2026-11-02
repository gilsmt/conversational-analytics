export const BASE_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const MIME_TYPES = {
    // image
    avif: "image/avif",
    // binary
    binary: "application/octet-stream",
    bmp: "image/bmp",
    // text
    csv: "text/csv",
    gif: "image/gif",
    html: "text/html",
    ico: "image/x-icon",
    jfif: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    png: "image/png",
    svg: "image/svg+xml",
    text: "text/plain",
    webp: "image/webp",
    zip: "application/zip",
} as const;
