import { normalizeFile } from "@/lib/blob";
import { MIME_TYPES } from "@/lib/constants";
import {
    directoryOpen as _directoryOpen,
    fileOpen as _fileOpen,
} from "browser-fs-access";

type FILE_EXTENSION = Exclude<keyof typeof MIME_TYPES, "binary">;

export const fileOpen = async <M extends boolean | undefined = false>(options: {
    extensions?: FILE_EXTENSION[];
    description: string;
    multiple?: M;
}): Promise<M extends false | undefined ? File : File[]> => {
    type ReturnType = M extends false | undefined ? File : File[];

    const mimeTypes = options.extensions?.reduce((mimeTypes, type) => {
        mimeTypes.push(MIME_TYPES[type]);
        return mimeTypes;
    }, [] as string[]);

    const extensions = options.extensions?.reduce((acc, ext) => {
        if (ext === "jpg") {
            return acc.concat(".jpg", ".jpeg");
        }
        return acc.concat(`.${ext}`);
    }, [] as string[]);

    const files = await _fileOpen({
        description: options.description,
        extensions,
        mimeTypes,
        multiple: options.multiple ?? false,
    });

    if (Array.isArray(files)) {
        return (await Promise.all(
            files.map((file) => normalizeFile(file))
        )) as ReturnType;
    }

    return (await normalizeFile(files)) as ReturnType;
};

export const directoryOpen = async (options?: {
    recursive?: boolean;
}): Promise<File[]> => {
    const files = await _directoryOpen({
        recursive: options?.recursive ?? true,
    });
    return Promise.all(files.map((file) => normalizeFile(file)));
};
