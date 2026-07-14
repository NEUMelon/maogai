import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("question data is complete and internally consistent", async () => {
  const raw = await readFile(new URL("app/data/questions.json", root), "utf8");
  const data = JSON.parse(raw);
  assert.equal(data.stats.chapterQuestions, 324);
  assert.equal(data.stats.masterQuestions, 335);
  assert.equal(data.stats.xiaoQuestions, 149);
  assert.equal(data.stats.daiQuestions, 599);
  assert.equal(data.stats.liteQuestions, 174);
  assert.equal(data.stats.xijiaoQuestions, 259);
  assert.equal(data.stats.selftestQuestions, 105);
  assert.equal(data.stats.hustQuestions, 123);
  assert.equal(data.stats.totalQuestions, 2068);
  assert.equal(data.chapters.length, 9);
  assert.equal(data.xiaoChapters.length, 9);
  assert.equal(data.liteChapters.length, 9);
  assert.equal(data.xijiaoChapters.length, 7);
  assert.equal(data.selftestSets.length, 7);
  assert.equal(data.hustChapters.length, 8);
  assert.equal(data.questions.length, 2068);

  const xiaoCounts = new Map(data.xiaoChapters.map((chapter) => [chapter.id, chapter.count]));
  assert.deepEqual([...xiaoCounts.values()], [8, 18, 48, 30, 15, 6, 13, 7, 4]);
  assert.equal([...xiaoCounts.values()].reduce((sum, count) => sum + count, 0), 149);

  const ids = new Set();
  for (const question of data.questions) {
    assert.ok(question.prompt.trim(), `empty prompt for ${question.id}`);
    assert.ok(!ids.has(question.id), `duplicate id ${question.id}`);
    ids.add(question.id);
    const optionKeys = new Set(question.options.map((option) => option.key));
    if (question.type === "single" || question.type === "multiple") {
      assert.deepEqual([...optionKeys], ["A", "B", "C", "D"], `incomplete options for ${question.id}`);
    }
    if (question.type === "judge") assert.deepEqual([...optionKeys], ["A", "B"]);
    for (const answer of question.answer) assert.ok(optionKeys.has(answer), `invalid answer ${answer} for ${question.id}`);
    if (question.type === "short") assert.ok(question.explanation.trim(), `missing short answer for ${question.id}`);
    if (question.bank === "xiao") assert.ok(xiaoCounts.has(question.section), `unknown Xiao chapter for ${question.id}`);
    if (["lite", "xijiao", "selftest", "hust"].includes(question.bank)) assert.notEqual(question.type, "short", `subjective question imported: ${question.id}`);
    if (question.bank === "lite") {
      for (const option of question.options) assert.doesNotMatch(option.text, /(?:简要)?解析\s*[:：]/, `analysis leaked into ${question.id}`);
    }
  }
});

test("practice UI includes favorites and direct question navigation", async () => {
  const source = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(source, /收藏题目/);
  assert.match(source, /选择题号/);
  assert.match(source, /questions\.map\(\(item, index\)/);
  assert.match(source, /setFavoriteMode\(true\)/);
  assert.match(source, /本题批注/);
  assert.match(source, /自动保存/);
  assert.match(source, /notes: Record<string, string>/);
  assert.match(source, /target instanceof HTMLTextAreaElement/);
  assert.match(source, /"lite" \| "xijiao" \| "selftest" \| "hust"/);
  assert.match(source, /slice\(0, 40\)/);
  assert.match(source, /slice\(0, 10\)/);
  assert.match(source, /sameAnswer\(examAnswers/);
  assert.match(source, /答案必须完全正确才得分/);
  assert.match(source, /fluidData\.questions/);
  assert.match(source, /slice\(0, 20\)/);
  assert.match(source, /examCourse === "fluid" \? 5 : 2/);
});

test("engineering fluid mechanics data is complete and exam-safe", async () => {
  const raw = await readFile(new URL("app/data/fluid-questions.json", root), "utf8");
  const data = JSON.parse(raw);
  assert.equal(data.stats.totalQuestions, 120);
  assert.equal(data.stats.objectiveQuestions, 108);
  assert.equal(data.stats.shortQuestions, 12);
  assert.equal(data.chapters.length, 8);
  assert.equal(data.questions.length, 120);
  assert.equal(data.chapters.reduce((sum, chapter) => sum + chapter.count, 0), 120);
  const ids = new Set();
  for (const question of data.questions) {
    assert.ok(question.prompt.trim(), `empty fluid prompt for ${question.id}`);
    assert.ok(!ids.has(question.id), `duplicate fluid id ${question.id}`);
    ids.add(question.id);
    if (question.type === "short") {
      assert.equal(question.options.length, 0);
      assert.ok(question.explanation.trim(), `missing fluid written answer for ${question.id}`);
    } else {
      const keys = new Set(question.options.map((option) => option.key));
      assert.ok(question.options.length >= 2, `incomplete fluid options for ${question.id}`);
      assert.ok(question.answer.length > 0, `missing fluid answer for ${question.id}`);
      for (const answer of question.answer) assert.ok(keys.has(answer), `invalid fluid answer ${answer} for ${question.id}`);
    }
  }
});

test("server renders the finished Chinese practice app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>MELON 题室｜把复杂，变成会做<\/title>/);
  assert.match(html, /MELON 题室/);
  assert.match(html, /工程流体力学/);
  assert.match(html, /毛泽东思想和中国特色/);
  assert.match(html, /把复杂/);
  assert.match(html, /今天，想把哪门课/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
