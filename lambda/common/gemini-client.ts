import { GoogleGenAI } from "@google/genai";
import { getSecret } from "./secrets";

let cachedClient: GoogleGenAI | undefined;

async function getGeminiClient(): Promise<GoogleGenAI> {
  if (cachedClient) return cachedClient;
  const apiKey = await getSecret(process.env.GEMINI_SECRET_ARN!);
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

/**
 * Generates a new image from a text prompt, or (when `previousImage` is
 * supplied) edits the previous image conversationally using the prompt as
 * revision instructions. Returns raw PNG/JPEG bytes.
 */
export async function generateOrEditImage(
  prompt: string,
  previousImage?: { data: Buffer; mimeType: string }
): Promise<{ data: Buffer; mimeType: string }> {
  const client = await getGeminiClient();

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (previousImage) {
    parts.push({
      inlineData: {
        data: previousImage.data.toString("base64"),
        mimeType: previousImage.mimeType,
      },
    });
  }
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      // Strongly-portrait canvas biases the model toward a single vertical
      // strip of panels instead of a grid (2x2 / 3x2) — the closest fit
      // among the API's fixed aspect ratio options for 4 stacked panels.
      imageConfig: { aspectRatio: "9:16" },
    },
  });

  const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = candidateParts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error(`Gemini did not return an image. Response: ${JSON.stringify(response)}`);
  }

  return {
    data: Buffer.from(imagePart.inlineData.data, "base64"),
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
