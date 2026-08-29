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

export async function openaiGenerateText(opts: {
  prompt: string;
  webSearch?: boolean;
}): Promise<string> {
  const client = await getOpenAiClient();

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    tools: opts.webSearch ? [{ type: "web_search" }] : undefined,
    input: opts.prompt,
  });

  return response.output_text;
}

export async function openaiReviewImage(opts: {
  prompt: string;
  image: { data: Buffer; mimeType: string };
}): Promise<string> {
  const client = await getOpenAiClient();

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: opts.prompt },
          {
            type: "input_image",
            image_url: `data:${opts.image.mimeType};base64,${opts.image.data.toString("base64")}`,
            detail: "auto",
          },
        ],
      },
    ],
  });

  return response.output_text;
}
