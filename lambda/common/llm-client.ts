import { anthropicGenerateText, anthropicReviewImage } from "./anthropic-client";
import { openaiGenerateText, openaiReviewImage } from "./openai-client";

export type LlmProvider = "anthropic" | "openai";

export async function generateText(
  provider: LlmProvider,
  opts: { prompt: string; webSearch?: boolean }
): Promise<string> {
  return provider === "openai" ? openaiGenerateText(opts) : anthropicGenerateText(opts);
}

export async function reviewWithVision(
  provider: LlmProvider,
  opts: { prompt: string; image: { data: Buffer; mimeType: string } }
): Promise<string> {
  return provider === "openai" ? openaiReviewImage(opts) : anthropicReviewImage(opts);
}
