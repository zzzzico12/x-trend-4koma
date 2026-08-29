import { generateText, LlmProvider } from "../common/llm-client";
import { extractJson } from "../common/json";
import type { TrendResult, ComicPlan, HistoryEntry } from "../common/types";

interface PlanComicInput {
  runId: string;
  maxIterationIndex: number;
  history: HistoryEntry[];
  llmProvider: LlmProvider;
  trend: TrendResult;
}

interface PlanComicOutput extends PlanComicInput {
  comic: ComicPlan;
}

export const handler = async (input: PlanComicInput): Promise<PlanComicOutput> => {
  const text = await generateText(input.llmProvider, {
    prompt: `以下のテーマで、起承転結のある4コマ漫画の構成を考えてください。

テーマ: ${input.trend.theme}
背景: ${input.trend.reason}

各コマについて、絵の内容(登場人物・状況・表情など、画像生成AIが描けるレベルの具体的な描写)とセリフを日本語で考えてください。
最後のコマにオチ(落ち)をつけて、笑えるようにしてください。
セリフは画像生成AIが正確に描画できるよう、1コマあたり15文字以内の短い言葉にしてください。難しい漢字は避け、ひらがな・カタカナ・常用漢字を中心にしてください。

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

{
  "title": "漫画のタイトル",
  "panels": [
    { "panel": 1, "description": "コマ1の絵の描写", "dialogue": "コマ1のセリフ" },
    { "panel": 2, "description": "コマ2の絵の描写", "dialogue": "コマ2のセリフ" },
    { "panel": 3, "description": "コマ3の絵の描写", "dialogue": "コマ3のセリフ" },
    { "panel": 4, "description": "コマ4の絵の描写（オチ）", "dialogue": "コマ4のセリフ" }
  ]
}`,
  });

  const comic = extractJson<ComicPlan>(text);
  return { ...input, comic };
};
