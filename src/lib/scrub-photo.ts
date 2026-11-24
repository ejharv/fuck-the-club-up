/**
 * Re-encode photos in the browser before upload. Drawing to a canvas drops all
 * EXIF data (GPS, device, timestamps). GIFs are left alone so animations
 * survive. If a photo can't be decoded it's rejected, never uploaded with its
 * metadata intact.
 */
export async function scrubPhoto(file: File, maxEdge = 2560): Promise<File> {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9));
    if (!blob) throw new Error("encode failed");
    return new File([blob], file.name.replace(/\.[^.]+$/, type === "image/png" ? ".png" : ".jpg"), { type });
  } catch {
    throw new Error(`${file.name} couldn't be processed. Try exporting it as a JPG.`);
  }
}

/** PUT with progress. */
export function putWithProgress(url: string, file: Blob, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}
