import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// stability.sd3-5-large-v1:0 is only available in us-west-2 as of writing —
// the rest of the stack stays in ap-northeast-1, so this client targets
// us-west-2 explicitly regardless of the Lambda's own region.
const BEDROCK_REGION = "us-west-2";
const MODEL_ID = "stability.sd3-5-large-v1:0";

// How much the image-to-image revision is allowed to deviate from the
// previous attempt (0 = keep input unchanged, 1 = ignore it entirely).
const REVISION_STRENGTH = 0.7;

let cachedClient: BedrockRuntimeClient | undefined;

function getBedrockClient(): BedrockRuntimeClient {
  if (cachedClient) return cachedClient;
  cachedClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  return cachedClient;
}

interface StabilityResponse {
  images: string[];
  seeds: number[];
  finish_reasons: (string | null)[];
}

export async function bedrockGenerateImage(opts: {
  prompt: string;
  previousImage?: { data: Buffer; mimeType: string };
}): Promise<{ data: Buffer; mimeType: string; imageGenerationCallId: string }> {
  const client = getBedrockClient();

  const body = opts.previousImage
    ? {
        prompt: opts.prompt,
        mode: "image-to-image",
        image: opts.previousImage.data.toString("base64"),
        strength: REVISION_STRENGTH,
        output_format: "png",
      }
    : {
        prompt: opts.prompt,
        aspect_ratio: "9:16",
        output_format: "png",
      };

  const response = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    })
  );

  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8")) as StabilityResponse;
  const finishReason = parsed.finish_reasons?.[0];
  if (finishReason) {
    throw new Error(`Bedrock (Stability) declined to generate an image: ${finishReason}`);
  }
  const first = parsed.images?.[0];
  if (!first) {
    throw new Error(`Bedrock did not return an image. Response: ${JSON.stringify(parsed)}`);
  }

  return {
    data: Buffer.from(first, "base64"),
    mimeType: "image/png",
    imageGenerationCallId: "",
  };
}
