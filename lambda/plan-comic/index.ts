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

// ochiIdeas/rejectedOchi make the model brainstorm and discard the predictable
// punchline before committing to panels; they're stripped before the plan leaves this Lambda.
const PANEL_JSON_SCHEMA = `{
  "ochiIdeas": ["オチ(4コマ目)の案を、型の異なるものを5つ。それぞれ1行で"],
  "rejectedOchi": "5案のうち読者が先読みできそうで捨てた案と、その理由",
  "title": "漫画のタイトル",
  "panels": [
    { "panel": 1, "description": "コマ1の絵の描写", "dialogue": "コマ1のセリフ" },
    { "panel": 2, "description": "コマ2の絵の描写", "dialogue": "コマ2のセリフ" },
    { "panel": 3, "description": "コマ3の絵の描写", "dialogue": "コマ3のセリフ" },
    { "panel": 4, "description": "コマ4の絵の描写（オチ）", "dialogue": "コマ4のセリフ" }
  ]
}`;

const DIALOGUE_CONSTRAINT = `セリフは画像生成AIが正確に描画できるよう、1コマあたり25〜30文字程度までの言葉にしてください。難しい漢字は避け、ひらがな・カタカナ・常用漢字を中心にしてください。
dialogueにはセリフ本文だけを書き、「主」「同」「彼女」のような話者名、「(心の声)」などの注記、外側の鉤括弧「」は含めないでください(書いたものがそのまま吹き出しに描かれてしまうため)。誰が話しているか・心の声かどうかはdescriptionに書いてください。

まずochiIdeasでオチ案を5つ出し、読者が先読みできそうな案をrejectedOchiで捨ててから、残りの中で最も意外で納得感のあるオチに向けてpanelsを組んでください。`;

const HOUSE_STYLE_GUIDE = `【面白さのための指針】
・笑いは「フリで作った予想」と「オチ」のズレから生まれる。1〜2コマ目で読者に「普通はこうなる」という予想をはっきり植え付け、4コマ目でそれを裏切ること。フリが弱いとズレも生まれない。
・各コマの役割: 1コマ目(起)はテーマと状況を一目で伝える(説明は最小限)。2コマ目(承)は予想を固める。3コマ目(転)は変化を入れるが「まだ普通にありそうな状態」に留め、オチの答えは見せない。4コマ目(結)で一気に振り切る。
・オチは先に決め、そこから逆算して1〜3コマ目のフリを組むこと。最初に思いついた「ありがちなオチ」は読者も先読みできるので、捨てるか3コマ目に置いて4コマ目でさらにもう一段ひっくり返す(2段階の裏切り)。
・説明的なコマは削り、読者が頭の中で補完する飛躍を作る。1コマ目の何気ない要素・セリフが4コマ目で別の意味を持つ「伏線回収」は強い。
・オチ(4コマ目)のセリフは状況説明やオチの解説ではなく、キャラの本音や思わず出たツッコミの一言にすること。読者に「いや、〜かい！」と心の中でツッコませる余地を残す。
・オチは「意外だが、言われてみれば納得」であること。フリとつながらない、ただ突飛なだけの展開は笑いにならない。
・オチの型の引き出し: 立場逆転 / 小さな行動が過剰にエスカレート / 勘違い・言葉を文字通りに受け取る / 建前から本音が漏れる / 予想外の第三者・物の登場 / 結局振り出しに戻る・目的と手段が入れ替わる。
・起承転結でオチが弱くなる場合は、二段オチ(オチの後にもう一発追い打ち)や、1コマ目で状況提示して2〜4コマ目でボケを3連発し最後を最大にする大喜利型も使ってよい。
・出力前の自己チェック: 4コマ目を隠したとき読者が予想しそうなオチと実際のオチは違うか。1〜3コマ目の要素がオチで回収されているか。4コマ目の絵と短い一言だけで何が起きたか伝わるか。

【各コマのdescriptionについての制約】
・1コマのdescriptionには、1つの場面・1つの瞬間だけを描写すること。「Aが起きて、その後Bが起きる」のように時間や場所が変わる複数の場面を1コマに詰め込まないこと(画像生成AIがそれを2コマに分けて描いてしまい、コマ数が4を超える原因になる)。`;

function buildLearningsSection(comedyLearnings: string): string {
  if (!comedyLearnings) return "";
  return `\n【過去のレビューからの学び(人間のフィードバック)】\n${comedyLearnings}\n`;
}

function formatPanels(comic: ComicPlan): string {
  return comic.panels
    .map((p) => `コマ${p.panel}: ${p.description} / セリフ:「${p.dialogue}」`)
    .join("\n");
}

function buildPreviousFailureSection(previousComic: ComicPlan, revisionInstructions: string): string {
  return `
【前回の不合格案(これと同じ前提・同じオチは使わないこと)】
タイトル: ${previousComic.title}
${formatPanels(previousComic)}

【前回の不合格理由(教訓として参考にする。指摘中のセリフ例をそのまま使わないこと)】
${revisionInstructions}
`;
}

function buildInitialPrompt(
  trend: TrendResult,
  tasteInstruction: string,
  comedyLearnings: string,
  previousFailureSection = ""
): string {
  return `以下のテーマで、起承転結のある4コマ漫画の構成を考えてください。

テーマ: ${trend.theme}
背景: ${trend.reason}

各コマについて、絵の内容(登場人物・状況・表情など、画像生成AIが描けるレベルの具体的な描写)とセリフを日本語で考えてください。
最後のコマにオチ(落ち)をつけて、笑えるようにしてください。
${previousFailureSection}
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
  comedyLearnings: string
): string {
  return `以下の4コマ漫画の構成案を、指摘に基づいて書き直してください。単に言い回しを変えるだけでなく、笑いどころ自体を作り直すつもりで考えてください。指摘中のセリフ例はそのまま使わず、方向性だけを参考にしてください。

テーマ: ${trend.theme}
背景: ${trend.reason}

【前回の構成案】
タイトル: ${previousComic.title}
${formatPanels(previousComic)}

【指摘事項(なぜ面白くなかったか・どう直すべきか)】
${revisionInstructions}

${HOUSE_STYLE_GUIDE}
${buildLearningsSection(comedyLearnings)}
${DIALOGUE_CONSTRAINT}

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

${PANEL_JSON_SCHEMA}`;
}

// Models still occasionally prefix a speaker label (主「…」 / 同(心の声)「…」), which
// the image model draws verbatim into the speech bubble.
function stripSpeakerLabel(dialogue: string): string {
  const labeled = dialogue.trim().match(/^[^「」\s]{1,12}[「『]([\s\S]*)[」』]$/);
  const body = labeled ? labeled[1] : dialogue.trim();
  return body.replace(/^「([\s\S]*)」$/, "$1").trim();
}

async function generateCandidate(
  llmProvider: LlmProvider,
  taste: string,
  prompt: string
): Promise<ComicCandidate> {
  const text = await generateText(llmProvider, { prompt });
  const raw = extractJson<ComicPlan>(text);
  const comic: ComicPlan = {
    title: raw.title,
    panels: raw.panels.map((p) => ({ ...p, dialogue: stripSpeakerLabel(p.dialogue) })),
  };
  return { taste, comic };
}

export const handler = async (input: PlanComicInput): Promise<PlanComicOutput> => {
  const comedyLearnings = await getComedyLearnings();
  const { trend, previousComic, comicRevisionInstructions, llmProvider } = input;
  const isRevision = Boolean(previousComic && comicRevisionInstructions);

  // On revision, every taste starts a fresh premise (told what failed last time) so the
  // candidates don't all converge on patching the same punchline; one extra candidate
  // still refines the previous winner directly.
  const previousFailureSection = isRevision
    ? buildPreviousFailureSection(previousComic!, comicRevisionInstructions!)
    : "";

  const jobs = TASTES.map((taste) =>
    generateCandidate(
      llmProvider,
      taste.name,
      buildInitialPrompt(trend, taste.instruction, comedyLearnings, previousFailureSection)
    )
  );
  if (isRevision) {
    jobs.push(
      generateCandidate(
        llmProvider,
        "前回案の改善",
        buildRevisionPrompt(trend, previousComic!, comicRevisionInstructions!, comedyLearnings)
      )
    );
  }

  const comicCandidates = await Promise.all(jobs);
  return { ...input, comicCandidates };
};
