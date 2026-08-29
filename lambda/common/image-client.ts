import { generateOrEditImage } from "./gemini-client";
import { openaiGenerateImage } from "./openai-image-client";
import { bedrockGenerateImage } from "./bedrock-image-client";

export type ImageProvider = "gemini" | "openai" | "bedrock";

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
  /** Non-empty only for the "openai" provider — used to reference this image in a follow-up revision call. */
  imageGenerationCallId: string;
}

export async function generateImage(
  provider: ImageProvider,
  opts: {
    prompt: string;
    previousImage?: { data: Buffer; mimeType: string };
    previousImageGenerationCallId?: string;
  }
): Promise<GeneratedImage> {
  if (provider === "openai") {
    return openaiGenerateImage({
      prompt: opts.prompt,
      previousImageGenerationCallId: opts.previousImageGenerationCallId,
    });
  }

  if (provider === "bedrock") {
    return bedrockGenerateImage({ prompt: opts.prompt, previousImage: opts.previousImage });
  }

  const result = await generateOrEditImage(opts.prompt, opts.previousImage);
  return { ...result, imageGenerationCallId: "" };
}
