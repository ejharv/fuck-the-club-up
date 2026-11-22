import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Presigned PUT straight to R2's S3 API, so big videos never pass through the
 * Worker (which caps request bodies). Content-Type and Content-Length are both
 * signed (aws4fetch skips them unless allHeaders is set), so the browser must
 * upload exactly the type and size that were approved.
 */
export async function presignPut(env: CloudflareEnv, key: string, contentType: string, size: number): Promise<string> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    service: "s3",
    region: "auto",
  });
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", "600");
  const signed = await client.sign(
    new Request(url, { method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(size) } }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

/** Uploading through the Worker is a local-dev convenience only, opted into from .dev.vars. */
export function localUploadsEnabled(env: CloudflareEnv): boolean {
  return env.ALLOW_LOCAL_UPLOADS === "1" && !canPresign(env);
}

export function canPresign(env: CloudflareEnv): boolean {
  return Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID && env.R2_BUCKET_NAME);
}
