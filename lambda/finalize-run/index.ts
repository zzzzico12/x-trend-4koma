import { putJson, getPresignedUrl } from "../common/s3";
import { publishNotification } from "../common/sns";
import { generateText } from "../common/llm-client";
import type { LlmProvider } from "../common/llm-client";
import type { ImageProvider } from "../common/image-client";
import type { TrendResult, ComicPlan, ReviewResult, HistoryEntry } from "../common/types";

interface FinalizeRunInput {
  runId: string;
  maxIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  iteration: number;
  imageKey: string;
  mimeType: string;
  review: ReviewResult;
}

interface FinalizeRunOutput {
  runId: string;
  summaryKey: string;
}

async function buildPostText(input: FinalizeRunInput): Promise<string> {
  const panelText = input.comic.panels.map((p) => `コマ${p.panel}: ${p.dialogue}`).join(" / ");

  const text = await generateText(input.llmProvider, {
    prompt: `以下の4コマ漫画をX(旧Twitter)に投稿するための本文を1つ作ってください。

タイトル: ${input.comic.title}
テーマ: ${input.trend.theme}
セリフの流れ: ${panelText}

【条件】
・Xにそのままコピペして投稿できる完成した本文のみを出力すること。前置きや説明、\`\`\`などの装飾は一切不要
・日本語で、Xの文字数カウント基準で280字以内（全角文字は2字分としてカウントされるため、実質140字程度を目安にすること）
・漫画の内容を一言で紹介し、読みたくなるような一文にすること
・最後に関連するハッシュタグを2〜3個つけること（例: #4コマ漫画 のような漫画・テーマに関連するタグ）`,
  });

  return text.trim();
}

export const handler = async (input: FinalizeRunInput): Promise<FinalizeRunOutput> => {
  const summaryKey = `${input.runId}/summary.json`;
  const postText = await buildPostText(input);
  const imageUrl = await getPresignedUrl(input.imageKey);

  await putJson(summaryKey, {
    runId: input.runId,
    llmProvider: input.llmProvider,
    imageProvider: input.imageProvider,
    theme: input.trend.theme,
    reason: input.trend.reason,
    sourceUrls: input.trend.sourceUrls,
    title: input.comic.title,
    panels: input.comic.panels,
    totalAttempts: input.iteration + 1,
    finalPass: input.review.pass,
    finalScore: input.review.score,
    finalFeedback: input.review.feedback,
    finalImageKey: input.imageKey,
    postText,
    history: input.history,
  });

  const emailMessage = `本日の4コマ漫画「${input.comic.title}」（${input.trend.theme}）ができました。

${imageUrl}`;

  await publishNotification(`本日の4コマ漫画: ${input.comic.title}`, emailMessage);

  return { runId: input.runId, summaryKey };
};
