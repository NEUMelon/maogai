import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2] ?? "C:/Users/DELL/Downloads/工程流体力学_第一章_思考题与参考答案.md";
const outputPath = process.argv[3] ?? "app/data/fluid-questions.json";
const sourceName = path.basename(sourcePath);

const chapterTitles = {
  1: "流体基本概念与性质",
  2: "流体静力学",
  3: "理想流体动力学基础",
  4: "黏性流体动力学基础",
  5: "可压缩气体一元定常流动",
  6: "量纲分析与相似原理",
  7: "理想流体平面势流",
  8: "黏性流体绕流与边界层",
};

const chapterLabels = ["", "第一章", "第二章", "第三章", "第四章", "第五章", "第六章", "第七章", "第八章"];

function cleanInline(value) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\\\(|\\\)/g, "")
    .replace(/\\mathrm\{([^{}]+)\}/g, "$1")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/\\dfrac/g, "\\frac")
    .replace(/\\lambda/g, "λ")
    .replace(/\\gamma/g, "γ")
    .replace(/\\rho/g, "ρ")
    .replace(/\\mu/g, "μ")
    .replace(/\\tau/g, "τ")
    .replace(/\\delta/g, "δ")
    .replace(/\\infty/g, "∞")
    .replace(/\\to/g, "→")
    .replace(/\\propto/g, "∝")
    .replace(/\\,/g, " ")
    .replace(/\\ /g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanExplanation(lines) {
  return lines
    .filter((line) => !line.startsWith("**手写答案判断："))
    .filter((line) => line.trim() !== "---")
    .map((line) => cleanInline(line.replace(/^[-*]\s+/, "• ")))
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const markdown = await readFile(sourcePath, "utf8");
const lines = markdown.split(/\r?\n/);
const starts = [];
for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/^###\s+(\d+)-(\d+)\s+(.+)$/);
  if (match) starts.push({ index, chapter: Number(match[1]), number: Number(match[2]), prompt: match[3].trim() });
}

const questions = [];
for (let itemIndex = 0; itemIndex < starts.length; itemIndex += 1) {
  const start = starts[itemIndex];
  const end = itemIndex + 1 < starts.length ? starts[itemIndex + 1].index : lines.length;
  const block = lines.slice(start.index + 1, end);
  const answerLineIndex = block.findIndex((line) => /^\*\*参考答案：/.test(line));
  if (answerLineIndex < 0) throw new Error(`Missing reference answer for ${start.chapter}-${start.number}`);

  const optionPattern = /^([A-Z](?:[₁₂])?)[.．]\s*(.+?)\s{0,2}$/;
  const options = [];
  for (const line of block.slice(0, answerLineIndex)) {
    const match = line.trim().match(optionPattern);
    if (match) options.push({ key: match[1], text: cleanInline(match[2]) });
  }

  const answerLine = block[answerLineIndex].replace(/\*\*/g, "");
  const answerText = answerLine.replace(/^参考答案：\s*/, "").trim();
  const candidateAnswers = answerText.match(/[A-Z](?:[₁₂])?/g) ?? [];
  const optionKeys = new Set(options.map((option) => option.key));
  const objective = Boolean(answerText) && candidateAnswers.length > 0 && candidateAnswers.every((key) => optionKeys.has(key));
  const answer = objective ? [...new Set(candidateAnswers)] : [];
  const afterAnswer = cleanExplanation(block.slice(answerLineIndex + 1));
  const explanation = objective
    ? afterAnswer
    : cleanExplanation([answerText ? `参考答案：${answerText}` : "", ...block.slice(answerLineIndex + 1)]);
  if (!objective && !explanation) throw new Error(`Missing written answer for ${start.chapter}-${start.number}`);

  questions.push({
    id: `fluid-thought-ch${start.chapter}-${objective ? (answer.length > 1 ? "m" : "s") : "q"}-${start.number}`,
    bank: "fluid-thought",
    section: `fluid-ch${start.chapter}`,
    sectionTitle: `工程流体力学 · ${chapterLabels[start.chapter]} · ${chapterTitles[start.chapter]}`,
    type: objective ? (answer.length > 1 ? "multiple" : "single") : "short",
    prompt: cleanInline(start.prompt),
    options: objective ? options : [],
    answer,
    explanation,
    source: sourceName,
  });
}

const chapters = Object.entries(chapterTitles).map(([numberText, title]) => {
  const number = Number(numberText);
  return {
    id: `fluid-ch${number}`,
    label: chapterLabels[number],
    title,
    count: questions.filter((question) => question.section === `fluid-ch${number}`).length,
  };
});

const objectiveCount = questions.filter((question) => question.type !== "short").length;
const result = {
  version: 1,
  generatedFrom: sourceName,
  banks: [{ id: "fluid-thought", title: "思考题题库", subtitle: "八章核心概念、判断与推导", count: questions.length }],
  chapters,
  stats: { totalQuestions: questions.length, objectiveQuestions: objectiveCount, shortQuestions: questions.length - objectiveCount },
  questions,
};

await writeFile(outputPath, `${JSON.stringify(result)}\n`, "utf8");
console.log(JSON.stringify(result.stats));
