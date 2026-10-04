import { generateText, LlmProvider } from "../common/llm-client";
import type { ImageProvider } from "../common/image-client";
import { extractJson } from "../common/json";
import { putJson } from "../common/s3";
import { getComedyLearnings } from "../common/comedy-learnings";
import type {
  TrendResult,
  ComicPlan,
  ComicReviewResult,
  ComicHistoryEntry,
  HistoryEntry,
} from "../common/types";

interface ComicCandidate {
  taste: string;
  comic: ComicPlan;
}

interface ReviewComicInput {
  runId: string;
  maxIterationIndex: number;
  maxComicIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comicCandidates: ComicCandidate[];
  history: HistoryEntry[];
  comicHistory: ComicHistoryEntry[];
  comicIteration?: number;
}

interface ReviewComicOutput {
  runId: string;
  maxIterationIndex: number;
  maxComicIterationIndex: number;
  llmProvider: LlmProvider;
  imageProvider: ImageProvider;
  trend: TrendResult;
  comic: ComicPlan;
  history: HistoryEntry[];
  comicHistory: ComicHistoryEntry[];
  comicIteration: number;
  comicReview: ComicReviewResult;
}

const PASS_SCORE_THRESHOLD = 75;

export const handler = async (input: ReviewComicInput): Promise<ReviewComicOutput> => {
  const comicIteration = input.comicIteration ?? 0;
  const comedyLearnings = await getComedyLearnings();

  const candidatesText = input.comicCandidates
    .map((c, i) => {
      const panelText = c.comic.panels
        .map((p) => `コマ${p.panel}: ${p.description} / セリフ:「${p.dialogue}」`)
        .join("\n");
      return `【案${i}: ${c.taste}】\nタイトル: ${c.comic.title}\n${panelText}`;
    })
    .join("\n\n");

  const learningsSection = comedyLearnings
    ? `\n【過去のレビューからの学び(人間のフィードバック)】\n${comedyLearnings}\n`
    : "";

  const text = await generateText(input.llmProvider, {
    prompt: `以下は、Xのトレンド「${input.trend.theme}」をテーマにした4コマ漫画の構成案です。テイストの異なる${input.comicCandidates.length}案が並んでいます。まだ絵にはなっておらず、テキストの構成のみです。実際に読んで面白いか、厳しい目でレビューしてください。

${candidatesText}

各案について、以下の観点でfunnyScoreを100点満点で厳しく採点してください:
・オチ(4コマ目)がちゃんと効いていて、読んだ後に「あるある」「くすっ」と思えるか
・単に状況を説明しているだけで終わっていないか(説明的で笑いどころがない場合は減点)
・テーマ・セリフ・展開のギャップや意外性が活きているか
・起承転結として自然に流れているか
・4コマ目を隠したとき読者が予想しそうなオチと、実際のオチが違うか(3コマ目の時点でオチが読めてしまう場合は減点)
・1〜3コマ目のフリ・要素がオチで回収されているか。「意外だが、言われてみれば納得」になっているか
・オチの一言が笑いではなく、ただの悪口・嫌味・不快感になっていないか
${learningsSection}
その上で、最も面白い1案を選び、そのインデックス(selectedIndex, 0始まり)を示してください。
選ばれた案のfunnyScoreが${PASS_SCORE_THRESHOLD}点以上ならpassをtrue、未満ならfalseにしてください。
passがfalseの場合は、次の構成案作成にそのまま渡せる指摘(revisionInstructions)を選ばれた案に対して日本語で書いてください。ただし、複数の観点を並べた長い講評にはせず、最も効果が高い改善点を1つだけ選び、200字程度に収めてください。一点に絞ることで、次の書き直しが確実にその点を直せるようにすること。そのまま流用できる完成形のセリフ例は書かず、「どの型のオチに変えるか」「どのフリを回収させるか」といった方向性で示すこと(セリフ例を書くと次の案がそれを丸写しし、発想が広がらなくなるため)。

以下のJSON形式のみを \`\`\`json ... \`\`\` のコードブロックで出力してください（説明文は不要です）。

{
  "candidateScores": [
    { "taste": "案0のテイスト名", "funnyScore": 0, "comment": "一言講評" }
  ],
  "selectedIndex": 0,
  "pass": true,
  "funnyScore": 0,
  "feedback": "選ばれた案についての詳細な講評",
  "revisionInstructions": "修正が必要な場合の具体的な指示。passがtrueの場合は空文字でよい"
}`,
  });

  const comicReview = extractJson<ComicReviewResult>(text);
  const winner = input.comicCandidates[comicReview.selectedIndex];

  const attemptNo = comicIteration + 1;
  const comicKey = `${input.runId}/comic-attempt-${attemptNo}.json`;
  const candidatesKey = `${input.runId}/comic-attempt-${attemptNo}-candidates.json`;
  const comicReviewKey = `${input.runId}/comic-attempt-${attemptNo}-review.json`;
  await putJson(comicKey, winner.comic);
  await putJson(candidatesKey, input.comicCandidates);
  await putJson(comicReviewKey, comicReview);

  const comicHistoryEntry: ComicHistoryEntry = {
    comicIteration,
    comicKey,
    candidatesKey,
    comicReviewKey,
    funnyScore: comicReview.funnyScore,
    candidateScores: comicReview.candidateScores,
    pass: comicReview.pass,
    feedback: comicReview.feedback,
    revisionInstructions: comicReview.revisionInstructions,
  };

  return {
    runId: input.runId,
    maxIterationIndex: input.maxIterationIndex,
    maxComicIterationIndex: input.maxComicIterationIndex,
    llmProvider: input.llmProvider,
    imageProvider: input.imageProvider,
    trend: input.trend,
    comic: winner.comic,
    history: input.history,
    comicHistory: [...input.comicHistory, comicHistoryEntry],
    comicIteration,
    comicReview,
  };
};
