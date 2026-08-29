import { generateText, LlmProvider } from "../common/llm-client";
import { extractJson } from "../common/json";
import { getComedyLearnings } from "../common/comedy-learnings";
import type { TrendResult, ComicPlan, HistoryEntry, ComicHistoryEntry } from "../common/types";

interface PlanComicInput {
  runId: string;
  maxIterationIndex: number;
  maxComicIterationIndex: number;
  history: HistoryEntry[];
  comicHistory: ComicHistoryEntry[];
  llmProvider: LlmProvider;
  trend: TrendResult;
  comicIteration?: number;
  previousComic?: ComicPlan;
  comicRevisionInstructions?: string;
}

interface ComicCandidate {
  taste: string;
  comic: ComicPlan;
}

interface PlanComicOutput extends PlanComicInput {
  comicCandidates: ComicCandidate[];
}

const TASTES = [
  {
    name: "王道あるある",
    instruction: "「あるある」「わかる」と共感される、素直な日常あるある路線でオチを作ってください。",
  },
  {
    name: "毒舌・自虐ツッコミ",
    instruction: "キャラの本音や毒舌ツッコミで笑わせる、辛口・自虐路線でオチを作ってください。",
  },
  {
    name: "シュール・暴走系",
    instruction: "予想を裏切る展開や、状況が想定外にエスカレートするシュール路線でオチを作ってください。",
  },
];

const PANEL_JSON_SCHEMA = `{
  "title": "漫画のタイトル",
  "panels": [
    { "panel": 1, "description": "コマ1の絵の描写", "dialogue": "コマ1のセリフ" },
    { "panel": 2, "description": "コマ2の絵の描写", "dialogue": "コマ2のセリフ" },
    { "panel": 3, "description": "コマ3の絵の描写", "dialogue": "コマ3のセリフ" },
    { "panel": 4, "description": "コマ4の絵の描写（オチ）", "dialogue": "コマ4のセリフ" }
  ]
}`;

const DIALOGUE_CONSTRAINT =
  "セリフは画像生成AIが正確に描画できるよう、1コマあたり25〜30文字程度までの言葉にしてください。難しい漢字は避け、ひらがな・カタカナ・常用漢字を中心にしてください。";

const HOUSE_STYLE_GUIDE = `【面白さのための指針】
・オチ(4コマ目)のセリフは状況説明ではなく、キャラの本音や思わず出たツッコミの一言にすること。読者に「いや、〜かい！」と心の中でツッコませる余地を残す。
・3コマ目では「まだ普通にありそうな状態」に留め、4コマ目で一気に振り切ること。3コマ目でオチの大半を見せてしまわないこと。

【各コマのdescriptionについての制約】
・1コマのdescriptionには、1つの場面・1つの瞬間だけを描写すること。「Aが起きて、その後Bが起きる」のように時間や場所が変わる複数の場面を1コマに詰め込まないこと(画像生成AIがそれを2コマに分けて描いてしまい、コマ数が4を超える原因になる)。`;

function buildLearningsSection(comedyLearnings: string): string {
  if (!comedyLearnings) return "";
  return `\n【過去のレビューからの学び(人間のフィードバック)】\n${comedyLearnings}\n`;
}

function buildInitialPrompt(
  trend: TrendResult,
  tasteInstruction: string,
  comedyLearnings: string
): string {
  return `以下のテーマで、起承転結のある4コマ漫画の構成を考えてください。

テーマ: ${trend.theme}
背景: ${trend.reason}

各コマについて、絵の内容(登場人物・状況・表情など、画像生成AIが描けるレベルの具体的な描写)とセリフを日本語で考えてください。
最後のコマにオチ(落ち)をつけて、笑えるようにしてください。

【この案のテイスト】
${tasteInstruction}

${HOUSE_STYLE_GUIDE}
${buildLearningsSection(comedyLearnings)}
${DIALOGUE_CONSTRAINT}

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

${PANEL_JSON_SCHEMA}`;
}

function buildRevisionPrompt(
  trend: TrendResult,
  previousComic: ComicPlan,
  revisionInstructions: string,
  tasteInstruction: string,
  comedyLearnings: string
): string {
  const panelText = previousComic.panels
    .map((p) => `コマ${p.panel}: ${p.description} / セリフ:「${p.dialogue}」`)
    .join("\n");

  return `以下の4コマ漫画の構成案を、指摘に基づいて書き直してください。単に言い回しを変えるだけでなく、笑いどころ自体を作り直すつもりで考えてください。

テーマ: ${trend.theme}
背景: ${trend.reason}

【前回の構成案(参考。このテイストに縛られる必要はない)】
タイトル: ${previousComic.title}
${panelText}

【指摘事項(なぜ面白くなかったか・どう直すべきか)】
${revisionInstructions}

【この案のテイスト】
${tasteInstruction}

${HOUSE_STYLE_GUIDE}
${buildLearningsSection(comedyLearnings)}
${DIALOGUE_CONSTRAINT}

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

${PANEL_JSON_SCHEMA}`;
}

export const handler = async (input: PlanComicInput): Promise<PlanComicOutput> => {
  const comedyLearnings = await getComedyLearnings();

  const comicCandidates = await Promise.all(
    TASTES.map(async (taste): Promise<ComicCandidate> => {
      const prompt =
        input.previousComic && input.comicRevisionInstructions
          ? buildRevisionPrompt(
              input.trend,
              input.previousComic,
              input.comicRevisionInstructions,
              taste.instruction,
              comedyLearnings
            )
          : buildInitialPrompt(input.trend, taste.instruction, comedyLearnings);

      const text = await generateText(input.llmProvider, { prompt });
      return { taste: taste.name, comic: extractJson<ComicPlan>(text) };
    })
  );

  return { ...input, comicCandidates };
};
