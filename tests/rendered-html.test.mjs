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
  assert.equal(data.stats.totalQuestions, 1407);
  assert.equal(data.chapters.length, 9);
  assert.equal(data.questions.length, 1407);

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
  }
});

test("server renders the finished Chinese practice app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>MELON 题室｜毛概刷题<\/title>/);
  assert.match(html, /MELON 题室/);
  assert.match(html, /肖1000/);
  assert.match(html, /戴题库/);
  assert.match(html, /把知识/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
