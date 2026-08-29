import OpenAI from "openai";
import { getSecret } from "./secrets";

let cachedClient: OpenAI | undefined;

async function getOpenAiClient(): Promise<OpenAI> {
  if (cachedClient) return cachedClient;
  const apiKey = await getSecret(process.env.OPENAI_SECRET_ARN!);
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.1";

// Portrait size closest to the "single vertical column of 4 panels" layout
// requirement among the fixed enum of accepted `size` values.
const IMAGE_SIZE = "1024x1536";

export async function openaiGenerateImage(opts: {
  prompt: string;
  previousImageGenerationCallId?: string;
}): Promise<{ data: Buffer; mimeType: string; imageGenerationCallId: string }> {
  const client = await getOpenAiClient();

  const input = opts.previousImageGenerationCallId
    ? [
        {
          role: "user" as const,
          content: [{ type: "input_text" as const, text: opts.prompt }],
        },
        {
          type: "image_generation_call" as const,
          id: opts.previousImageGenerationCallId,
          // Only `id`/`type` are meaningful on input (the API resolves the
          // rest server-side) — `result`/`status` are set to satisfy the SDK's
          // input type, which reuses the full output-item shape.
          result: null,
          status: "completed" as const,
        },
      ]
    : opts.prompt;

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input,
    tools: [{ type: "image_generation", size: IMAGE_SIZE }],
  });

  const imageCalls = response.output.filter(
    (item): item is Extract<typeof item, { type: "image_generation_call" }> =>
      item.type === "image_generation_call"
  );
  const first = imageCalls[0];
  if (!first?.result) {
    throw new Error(`OpenAI did not return an image. Response: ${JSON.stringify(response.output)}`);
  }

  return {
    data: Buffer.from(first.result, "base64"),
    mimeType: "image/png",
    imageGenerationCallId: first.id,
  };
}
