/** Shared by the upload route, the post validator and the uploader UI. */
export type MediaKind = "photo" | "video" | "audio" | "embed";
export type FileKind = Exclude<MediaKind, "embed">;

const MB = 1024 * 1024;

// Deliberately excludes SVG, HTML and anything else a browser could execute.
export const ALLOWED_TYPES: Record<string, { kind: FileKind; ext: string }> = {
  "image/jpeg": { kind: "photo", ext: "jpg" },
  "image/png": { kind: "photo", ext: "png" },
  "image/webp": { kind: "photo", ext: "webp" },
  "image/gif": { kind: "photo", ext: "gif" },
  "image/avif": { kind: "photo", ext: "avif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/webm": { kind: "video", ext: "webm" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/aac": { kind: "audio", ext: "aac" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
};

export const MAX_BYTES: Record<FileKind, number> = {
  photo: 25 * MB,
  audio: 60 * MB,
  video: 400 * MB,
};

export const MAX_FILES_PER_POST = 40;

export const ACCEPT_ATTR = Object.keys(ALLOWED_TYPES).join(",");
