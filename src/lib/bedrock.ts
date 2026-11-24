import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Claude on Amazon Bedrock through the Converse API, signed with the
 * project-only IAM user (it can invoke one model and nothing else).
 */
export type ConverseTool = { name: string; description: string; schema: Record<string, unknown> };

export async function converseWithTool<T>(
  env: CloudflareEnv,
  { system, user, tool, maxTokens = 3000 }: { system: string; user: string; tool: ConverseTool; maxTokens?: number },
): Promise<{ input: T; usage: { inputTokens: number; outputTokens: number } }> {
  const keys = env as unknown as { BEDROCK_ACCESS_KEY_ID?: string; BEDROCK_SECRET_ACCESS_KEY?: string };
  if (!keys.BEDROCK_ACCESS_KEY_ID || !keys.BEDROCK_SECRET_ACCESS_KEY) {
    throw new BedrockError("Writing help isn't set up yet. Add the Bedrock access key to the site's secrets.");
  }
  const region = env.BEDROCK_REGION || "us-east-1";
  const client = new AwsClient({
    accessKeyId: keys.BEDROCK_ACCESS_KEY_ID,
    secretAccessKey: keys.BEDROCK_SECRET_ACCESS_KEY,
    service: "bedrock", // bedrock-runtime signs as "bedrock"
    region,
  });
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(env.BEDROCK_MODEL_ID)}/converse`;
  const res = await client.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens, temperature: 0.9 },
      toolConfig: {
        tools: [{ toolSpec: { name: tool.name, description: tool.description, inputSchema: { json: tool.schema } } }],
        toolChoice: { tool: { name: tool.name } },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Bedrock error", res.status, text.slice(0, 500));
    if (res.status === 429) throw new BedrockError("The writer is busy right now. Try again in a minute.");
    throw new BedrockError("Couldn't write the draft. Try again, and check the Bedrock setup if it keeps failing.");
  }
  const data = (await res.json()) as {
    output?: { message?: { content?: Array<{ toolUse?: { name: string; input: T } }> } };
    usage?: { inputTokens: number; outputTokens: number };
    stopReason?: string;
  };
  const use = data.output?.message?.content?.find((c) => c.toolUse?.name === tool.name)?.toolUse;
  if (!use) throw new BedrockError("The reply came back in the wrong shape. Try again.");
  return { input: use.input, usage: data.usage ?? { inputTokens: 0, outputTokens: 0 } };
}

export class BedrockError extends Error {}
