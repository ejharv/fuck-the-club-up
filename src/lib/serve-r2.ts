import "server-only";

/** Streams an R2 object with range support and locked-down headers so nothing in it can run. */
export async function serveObject(
  bucket: R2Bucket,
  key: string,
  req: Request,
  { download, filename, cache = "private, max-age=3600" }: { download?: boolean; filename?: string; cache?: string } = {},
): Promise<Response> {
  const range = req.headers.get("range");
  const obj = await bucket.get(key, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", cache);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("referrer-policy", "no-referrer");
  if (download) headers.set("content-disposition", `attachment; filename="${(filename ?? key.split("/").pop() ?? "file").replace(/[^\w.-]/g, "_")}"`);
  if (range && obj.range && "offset" in obj.range) {
    const offset = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}
