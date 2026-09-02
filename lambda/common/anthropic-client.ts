import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./secrets";

let cachedClient: Anthropic | undefined;

async function getAnthropicClient(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  const apiKey = await getSecret(process.env.ANTHROPIC_SECRET_ARN!);
  // Identity-linked API keys aren't bound to a single workspace, so the
  // workspace to act in must be declared on every request.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  cachedClient = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
  return cachedClient;
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

/**
 * Extracts the final text block from a Claude response, skipping over any
 * server tool_use / tool_result / web_search_tool_result blocks emitted
 * while the model was searching.
 */
function extractFinalText(message: Anthropic.Message): string {
  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  if (textBlocks.length === 0) {
    throw new Error(`No text block in Claude response: ${JSON.stringify(message.content)}`);
  }
  return textBlocks[textBlocks.length - 1].text;
}

export async function anthropicGenerateText(opts: {
  prompt: string;
  webSearch?: boolean;
}): Promise<string> {
  const client = await getAnthropicClient();

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    tools: opts.webSearch
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
      : undefined,
    messages: [{ role: "user", content: opts.prompt }],
  });

  return extractFinalText(message);
}

export async function anthropicReviewImage(opts: {
  prompt: string;
  image: { data: Buffer; mimeType: string };
}): Promise<string> {
  const client = await getAnthropicClient();
  const mediaType = opts.image.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: opts.image.data.toString("base64") },
          },
          { type: "text", text: opts.prompt },
        ],
      },
    ],
  });

  return extractFinalText(message);
}
