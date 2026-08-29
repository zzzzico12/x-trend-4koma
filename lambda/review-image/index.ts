import { reviewWithVision, LlmProvider } from "../common/llm-client";
import type { ImageProvider } from "../common/image-client";
import { extractJson } from "../common/json";
import { getImage, putJson } from "../common/s3";
import type { TrendResult, ComicPlan, ReviewResult, HistoryEntry } from "../common/types";

interface ReviewImageInput {
  runId: string;
  maxIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  iteration: number;
  imageKey: string;
  imageGenerationCallId: string;
  promptKey: string;
  mimeType: string;
}

interface ReviewImageOutput {
  runId: string;
  maxIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  iteration: number;
  imageKey: string;
  imageGenerationCallId: string;
  mimeType: string;
  review: ReviewResult;
}

const PASS_SCORE_THRESHOLD = 75;

export const handler = async (input: ReviewImageInput): Promise<ReviewImageOutput> => {
  const { data } = await getImage(input.imageKey);

  const panelText = input.comic.panels
    .map((p) => `コマ${p.panel}: ${p.description} / セリフ:「${p.dialogue}」`)
    .join("\n");

  const text = await reviewWithVision(input.llmProvider, {
    image: { data, mimeType: input.mimeType },
    prompt: `この画像は、以下の構成案から生成された4コマ漫画です。厳しい目でレビューしてください。

テーマ: ${input.trend.theme}
タイトル: ${input.comic.title}
想定した構成:
${panelText}

【必須のレイアウトルール】
・4コマが2×2ではなく、縦一列に上から下へ並んでいること
・各コマの間に区切り線があり、縦幅が均等であること

以下の観点で採点し、100点満点のスコアをつけてください:
1. レイアウトルールを守れているか(最重要。守れていなければ大幅減点)
2. 構成案の内容が絵に反映されているか
3. セリフが読みやすく、コマ内に自然に配置されているか
4. 絵の破綻(手足の異常・崩れた文字など)がないか

上記とは別に、「面白いかどうか(funnyScore)」を100点満点で厳しく採点してください。レイアウトが完璧でセリフも正しく読めても、実際に見て笑えなければ高得点をつけないでください。判断基準:
・オチ(4コマ目)がちゃんと効いていて、読んだ後に「あるある」「くすっ」と思えるか
・単に状況を説明しているだけで終わっていないか(説明的で笑いどころがない場合は減点)
・テーマ・セリフ・絵のギャップや意外性が活きているか

passをtrueにする条件は、scoreが${PASS_SCORE_THRESHOLD}点以上、かつfunnyScoreも${PASS_SCORE_THRESHOLD}点以上であることの両方です。どちらか一方でも基準未満ならpassはfalseにしてください。
passがfalseの場合は、画像生成AIへそのまま渡せる具体的な修正指示(revisionInstructions)を日本語で書いてください。funnyScoreが低いことが原因の場合は、オチやセリフをどう変えれば面白くなるか具体的に指示してください。

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

{
  "pass": true,
  "score": 0,
  "funnyScore": 0,
  "feedback": "レビューの詳細な講評(面白さについての評価を必ず含める)",
  "revisionInstructions": "修正が必要な場合の具体的な指示。passがtrueの場合は空文字でよい"
}`,
  });

  const review = extractJson<ReviewResult>(text);

  const reviewKey = `${input.runId}/attempt-${input.iteration + 1}-review.json`;
  await putJson(reviewKey, review);

  const historyEntry: HistoryEntry = {
    iteration: input.iteration,
    promptKey: input.promptKey,
    imageKey: input.imageKey,
    reviewKey,
    score: review.score,
    funnyScore: review.funnyScore,
    pass: review.pass,
    feedback: review.feedback,
    revisionInstructions: review.revisionInstructions,
  };

  return {
    runId: input.runId,
    maxIterationIndex: input.maxIterationIndex,
    llmProvider: input.llmProvider,
    imageProvider: input.imageProvider,
    trend: input.trend,
    comic: input.comic,
    history: [...input.history, historyEntry],
    iteration: input.iteration,
    imageKey: input.imageKey,
    imageGenerationCallId: input.imageGenerationCallId,
    mimeType: input.mimeType,
    review,
  };
};
