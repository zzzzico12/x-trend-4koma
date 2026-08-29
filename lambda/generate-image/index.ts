import { generateImage, ImageProvider } from "../common/image-client";
import { putImage, putText, getImage } from "../common/s3";
import { FIXED_LAYOUT_INSTRUCTIONS } from "../common/layout-instructions";
import type { LlmProvider } from "../common/llm-client";
import type { TrendResult, ComicPlan, HistoryEntry, ComicHistoryEntry } from "../common/types";

interface GenerateImageInput {
  runId: string;
  maxIterationIndex: number;
  maxComicIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  comicHistory: ComicHistoryEntry[];
  iteration?: number;
  previousImageKey?: string;
  previousImageGenerationCallId?: string;
  revisionInstructions?: string;
}

interface GenerateImageOutput {
  runId: string;
  maxIterationIndex: number;
  maxComicIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  comicHistory: ComicHistoryEntry[];
  iteration: number;
  imageKey: string;
  imageGenerationCallId: string;
  promptKey: string;
  mimeType: string;
}

function buildInitialPrompt(comic: ComicPlan): string {
  const panelText = comic.panels
    .map((p) => `コマ${p.panel}: ${p.description}\nセリフ: 「${p.dialogue}」`)
    .join("\n\n");

  return `以下の内容で4コマ漫画のイラストを1枚の画像として生成してください。

タイトル: ${comic.title}

${panelText}

${FIXED_LAYOUT_INSTRUCTIONS}`;
}

function buildRevisionPrompt(revisionInstructions: string): string {
  return `この画像を以下の指摘に基づいて修正してください。

【修正指示】
${revisionInstructions}

${FIXED_LAYOUT_INSTRUCTIONS}`;
}

export const handler = async (input: GenerateImageInput): Promise<GenerateImageOutput> => {
  const iteration = input.iteration ?? 0;
  const isRevision =
    iteration > 0 &&
    !!input.revisionInstructions &&
    (!!input.previousImageKey || !!input.previousImageGenerationCallId);

  const prompt = isRevision
    ? buildRevisionPrompt(input.revisionInstructions!)
    : buildInitialPrompt(input.comic);

  // Gemini and Bedrock condition their revision on the previous image's
  // bytes; OpenAI instead references its own prior image_generation_call id.
  let previousImage: { data: Buffer; mimeType: string } | undefined;
  if (isRevision && input.imageProvider !== "openai" && input.previousImageKey) {
    previousImage = await getImage(input.previousImageKey);
  }

  const image = await generateImage(input.imageProvider, {
    prompt,
    previousImage,
    previousImageGenerationCallId: isRevision ? input.previousImageGenerationCallId : undefined,
  });

  const attemptNo = iteration + 1;
  const imageKey = `${input.runId}/attempt-${attemptNo}.png`;
  const promptKey = `${input.runId}/attempt-${attemptNo}-prompt.txt`;
  await putImage(imageKey, image.data, image.mimeType);
  await putText(promptKey, prompt);

  return {
    runId: input.runId,
    maxIterationIndex: input.maxIterationIndex,
    maxComicIterationIndex: input.maxComicIterationIndex,
    llmProvider: input.llmProvider,
    imageProvider: input.imageProvider,
    trend: input.trend,
    comic: input.comic,
    history: input.history,
    comicHistory: input.comicHistory,
    iteration,
    imageKey,
    imageGenerationCallId: image.imageGenerationCallId,
    promptKey,
    mimeType: image.mimeType,
  };
};
