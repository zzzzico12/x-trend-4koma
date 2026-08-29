import { generateText, LlmProvider } from "../common/llm-client";
import { extractJson } from "../common/json";
import type { TrendResult, HistoryEntry } from "../common/types";

interface TrendResearchInput {
  runId: string;
  maxIterationIndex: number;
  history: HistoryEntry[];
  llmProvider: LlmProvider;
}

interface TrendResearchOutput extends TrendResearchInput {
  trend: TrendResult;
}

export const handler = async (input: TrendResearchInput): Promise<TrendResearchOutput> => {
  const today = new Date().toISOString().slice(0, 10);

  const text = await generateText(input.llmProvider, {
    webSearch: true,
    prompt: `今日(${today})、X(旧Twitter)で実際に話題になっているトレンドを、必ずWeb検索を使って調べてください。検索せずに季節感や一般知識だけでそれっぽいテーマを作文することは禁止です。

【検索の指示】
・twittrend.jp、trends24.in など、Xのトレンドランキングを掲載しているサイトや、当日のニュース記事を検索し、実際にランクインしている具体的なトレンドワードを確認してください。
・日付の語呂合わせ（例: 29日は「にく」で語呂合わせの記念日、など）のような、その日ならではの定番トレンドも見逃さないよう注意してください。
・複数回検索して、できるだけ具体的で検証可能なトレンドを見つけてください。曖昧な季節ネタしか見つからない場合も、実際に検索で確認できた最も具体的な事実を選んでください。

検索結果の中から、4コマ漫画のテーマとして面白く展開しやすいものを1つ選んでください。
政治的に極端な話題や特定個人への誹謗中傷につながりかねない話題は避け、あるある的・時事ネタ的に笑える題材を優先してください。

調査と選定が終わったら、最後に以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

{
  "theme": "選んだテーマ（短い日本語のフレーズ）",
  "reason": "このテーマを選んだ理由と、なぜ4コマとして面白いか。検索で実際に確認した具体的な事実（トレンド順位・記事の内容など）を含めること（2〜3文）",
  "sourceUrls": ["検索で実際に開いた個別ページのURL。トップページ（例: https://example.com のようなドメインのみのURL）は不可、必ず具体的な記事・トレンドページのURLにすること", "..."]
}`,
  });

  const trend = extractJson<TrendResult>(text);
  return { ...input, trend };
};
