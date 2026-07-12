"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import data from "./data/questions.json";

type QuestionType = "single" | "multiple" | "judge" | "short";
type TypeFilter = "all" | QuestionType;
type PracticeBank = "chapter" | "master" | "xiao" | "dai" | "lite" | "xijiao" | "selftest" | "hust";
type LibraryId = "core" | "xiao" | "dai" | "lite" | "xijiao" | "selftest" | "hust";
type Question = (typeof data.questions)[number];
type Progress = {
  answered: string[];
  correct: string[];
  wrong: string[];
  starred: string[];
  notes: Record<string, string>;
};

const EMPTY_PROGRESS: Progress = { answered: [], correct: [], wrong: [], starred: [], notes: {} };

const TYPE_NAMES: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  short: "简答题",
};

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "single", label: "单选" },
  { key: "multiple", label: "多选" },
  { key: "judge", label: "判断" },
  { key: "short", label: "简答" },
];

function sameAnswer(left: string[], right: string[]) {
  return [...left].sort().join("") === [...right].sort().join("");
}

function updateList(list: string[], id: string, include: boolean) {
  const next = new Set(list);
  if (include) next.add(id);
  else next.delete(id);
  return [...next];
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [next[index], next[random]] = [next[random], next[index]];
  }
  return next;
}

export default function Home() {
  const [view, setView] = useState<"home" | "practice" | "exam">("home");
  const [bank, setBank] = useState<PracticeBank>("chapter");
  const [section, setSection] = useState("intro");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [favoriteMode, setFavoriteMode] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [examQuestionIds, setExamQuestionIds] = useState<string[]>([]);
  const [examCurrent, setExamCurrent] = useState(0);
  const [examAnswers, setExamAnswers] = useState<Record<string, string[]>>({});
  const [examSubmitted, setExamSubmitted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("maogai-progress-v1");
      // Loading persisted study state is the purpose of this client-only synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setProgress({ ...EMPTY_PROGRESS, ...JSON.parse(saved) });
    } catch {
      // A private browsing policy can disable storage; the app still works in memory.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem("maogai-progress-v1", JSON.stringify(progress));
    } catch {
      // Keep the study session usable even when storage is unavailable.
    }
  }, [hydrated, progress]);

  const baseQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data.questions as Question[]).filter((question) => {
      const inCurrentLibrary = bank === "chapter" || bank === "master"
        ? question.bank === "chapter" || question.bank === "master"
        : question.bank === bank;
      if (favoriteMode) {
        if (!inCurrentLibrary || !progress.starred.includes(question.id)) return false;
      } else {
        if (bank === "chapter" || bank === "master") {
          if (question.bank !== bank) return false;
        } else if (question.bank !== bank) return false;
        if (bank !== "master" && question.section !== section) return false;
      }
      if (typeFilter !== "all" && question.type !== typeFilter) return false;
      if (normalizedQuery && !question.prompt.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [bank, section, typeFilter, query, favoriteMode, progress.starred]);

  const questions = useMemo(() => {
    if (!order.length) return baseQuestions;
    const map = new Map(baseQuestions.map((question) => [question.id, question]));
    if (order.length !== baseQuestions.length || order.some((id) => !map.has(id))) return baseQuestions;
    return order.map((id) => map.get(id)).filter(Boolean) as Question[];
  }, [baseQuestions, order]);

  const question = questions[current];
  const isStarred = question ? progress.starred.includes(question.id) : false;
  const isCorrect = question && question.type !== "short" ? sameAnswer(selected, question.answer) : false;
  const answeredHere = questions.filter((item) => progress.answered.includes(item.id)).length;
  const sectionCorrect = questions.filter((item) => progress.correct.includes(item.id)).length;
  const accuracy = answeredHere ? Math.round((sectionCorrect / answeredHere) * 100) : 0;

  const resetQuestion = useCallback((nextIndex: number) => {
    setCurrent(nextIndex);
    setSelected([]);
    setSubmitted(false);
    setRevealed(false);
    setNavigatorOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goNext = useCallback(() => {
    if (!questions.length) return;
    resetQuestion((current + 1) % questions.length);
  }, [current, questions.length, resetQuestion]);

  const recordResult = useCallback((correct: boolean) => {
    if (!question) return;
    setProgress((previous) => ({
      ...previous,
      answered: updateList(previous.answered, question.id, true),
      correct: updateList(previous.correct, question.id, correct),
      wrong: updateList(previous.wrong, question.id, !correct),
    }));
  }, [question]);

  const submit = useCallback(() => {
    if (!question || question.type === "short" || !selected.length) return;
    setSubmitted(true);
    recordResult(sameAnswer(selected, question.answer));
  }, [question, recordResult, selected]);

  function startExam() {
    const objectiveQuestions = (data.questions as Question[]).filter((item) => item.type === "single" || item.type === "multiple");
    const singles = shuffle(objectiveQuestions.filter((item) => item.type === "single")).slice(0, 40);
    const multiples = shuffle(objectiveQuestions.filter((item) => item.type === "multiple")).slice(0, 10);
    if (singles.length < 40 || multiples.length < 10) return;
    setExamQuestionIds(shuffle([...singles, ...multiples].map((item) => item.id)));
    setExamCurrent(0);
    setExamAnswers({});
    setExamSubmitted(false);
    setView("exam");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (view !== "practice") return;
      if (navigatorOpen) {
        if (event.key === "Escape") setNavigatorOpen(false);
        return;
      }
      const target = event.target;
      if (
        !question
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      const optionIndex = Number(event.key) - 1;
      if (!submitted && optionIndex >= 0 && optionIndex < question.options.length) {
        const key = question.options[optionIndex].key;
        if (question.type === "multiple") {
          setSelected((previous) => updateList(previous, key, !previous.includes(key)));
        } else if (question.type !== "short") {
          setSelected([key]);
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (submitted || (question.type === "short" && revealed)) goNext();
        else if (question.type === "short") setRevealed(true);
        else submit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, navigatorOpen, question, revealed, submit, submitted, view]);

  function chooseOption(key: string) {
    if (!question || submitted || question.type === "short") return;
    if (question.type === "multiple") {
      setSelected((previous) => updateList(previous, key, !previous.includes(key)));
    } else {
      setSelected([key]);
    }
  }

  function restartView() {
    setOrder([]);
    setCurrent(0);
    setSelected([]);
    setSubmitted(false);
    setRevealed(false);
    setNavigatorOpen(false);
  }

  function changeBank(nextBank: "chapter" | "master") {
    restartView();
    setBank(nextBank);
    setTypeFilter("all");
    setQuery("");
    setSidebarOpen(false);
    setFavoriteMode(false);
  }

  function enterLibrary(library: LibraryId) {
    restartView();
    setTypeFilter("all");
    setQuery("");
    setFavoriteMode(false);
    if (library === "core") {
      setBank("chapter");
      setSection("intro");
    } else {
      const defaults: Record<Exclude<LibraryId, "core">, [PracticeBank, string]> = {
        xiao: ["xiao", "xiao-intro"],
        dai: ["dai", "dai-intro"],
        lite: ["lite", "lite-intro"],
        xijiao: ["xijiao", "xijiao-ch1"],
        selftest: ["selftest", "selftest-1"],
        hust: ["hust", "hust-intro"],
      };
      const [nextBank, nextSection] = defaults[library];
      setBank(nextBank);
      setSection(nextSection);
    }
    setView("practice");
  }

  function openFavorites() {
    restartView();
    setFavoriteMode(true);
    setTypeFilter("all");
    setQuery("");
    setSidebarOpen(false);
  }

  function toggleStar() {
    if (!question) return;
    if (favoriteMode && isStarred) {
      setCurrent((previous) => Math.max(0, Math.min(previous, questions.length - 2)));
    }
    setProgress((previous) => ({
      ...previous,
      starred: updateList(previous.starred, question.id, !previous.starred.includes(question.id)),
    }));
  }

  function resetProgress() {
    if (window.confirm("确定清空所有作答记录、收藏和批注吗？此操作无法撤销。")) {
      setProgress(EMPTY_PROGRESS);
    }
  }

  function updateAnnotation(value: string) {
    if (!question) return;
    setProgress((previous) => {
      const notes = { ...previous.notes };
      if (value.trim()) notes[question.id] = value;
      else delete notes[question.id];
      return { ...previous, notes };
    });
  }

  function toggleAnnotation() {
    const opening = !annotationOpen;
    setAnnotationOpen(opening);
    if (opening && window.matchMedia("(max-width: 760px)").matches) {
      window.setTimeout(() => document.getElementById("annotation-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  const libraryId: LibraryId = bank === "chapter" || bank === "master" ? "core" : bank;
  const library = data.banks.find((item) => item.id === libraryId);
  const libraryName = library?.title ?? "题库";
  const libraryQuestionIds = new Set((data.questions as Question[]).filter((item) => libraryId === "core" ? item.bank === "chapter" || item.bank === "master" : item.bank === libraryId).map((item) => item.id));
  const libraryStarredCount = progress.starred.filter((id) => libraryQuestionIds.has(id)).length;
  const chapterList = bank === "chapter"
    ? data.chapters
    : bank === "xiao"
      ? data.xiaoChapters
      : bank === "dai"
        ? data.daiChapters
        : bank === "lite"
          ? data.liteChapters
          : bank === "xijiao"
            ? data.xijiaoChapters
            : bank === "selftest"
              ? data.selftestSets
              : bank === "hust"
                ? data.hustChapters
                : [];
  const currentChapter = chapterList.find((chapter) => chapter.id === section);
  const heading = favoriteMode ? `收藏题目 · ${libraryName}` : bank === "master" ? "综合大题库" : `${currentChapter?.label} · ${currentChapter?.title}`;
  const availableTypes = new Set((data.questions as Question[]).filter((item) => {
    if (bank === "master") return item.bank === "master";
    if (bank === "chapter") return item.bank === "chapter" && item.section === section;
    return item.bank === bank && (favoriteMode || item.section === section);
  }).map((item) => item.type));
  const navLabel = bank === "selftest" ? "自测套卷" : "课程章节";
  const bankEyebrow: Record<PracticeBank, string> = {
    chapter: "CHAPTER PRACTICE",
    master: "MASTER QUESTION BANK",
    xiao: "XIAO 1000",
    dai: "DAI ORIGINAL BANK",
    lite: "CHAPTER LITE",
    xijiao: "XIJIAO QUESTION BANK",
    selftest: "FINAL SELF-TEST",
    hust: "HUST PAST PAPERS",
  };
  const examQuestions = useMemo(() => {
    const byId = new Map((data.questions as Question[]).map((item) => [item.id, item]));
    return examQuestionIds.map((id) => byId.get(id)).filter(Boolean) as Question[];
  }, [examQuestionIds]);
  const examQuestion = examQuestions[examCurrent];
  const examAnsweredCount = examQuestions.filter((item) => (examAnswers[item.id] ?? []).length > 0).length;
  const examScore = examQuestions.reduce((score, item) => score + (sameAnswer(examAnswers[item.id] ?? [], item.answer) ? 2 : 0), 0);
  const examFullyCorrect = examQuestions.filter((item) => sameAnswer(examAnswers[item.id] ?? [], item.answer)).length;

  function chooseExamOption(key: string) {
    if (!examQuestion || examSubmitted) return;
    setExamAnswers((previous) => {
      const currentAnswer = previous[examQuestion.id] ?? [];
      const nextAnswer = examQuestion.type === "multiple"
        ? updateList(currentAnswer, key, !currentAnswer.includes(key))
        : [key];
      return { ...previous, [examQuestion.id]: nextAnswer };
    });
  }

  function submitExam() {
    if (window.confirm("现在交卷并评分吗？交卷后本套试卷不能再修改。")) setExamSubmitted(true);
  }

  if (view === "home") {
    return (
      <main className="portal-shell">
        <header className="portal-header">
          <div className="portal-brand"><span className="melon-dot" />MELON 题室</div>
          <div className="portal-meta">毛概 · 2023 版 <span>{data.stats.totalQuestions} 道已校验题目</span></div>
        </header>
        <section className="portal-hero">
          <div className="portal-kicker">THINK · PRACTICE · REMEMBER</div>
          <h1><span>把知识</span><br />练成直觉。</h1>
          <p>七套题库，七条复习路径；再来一场随机模拟。选择此刻最适合你的那一套，安静地做完下一题。</p>
          <div className="seed-orbit" aria-hidden="true"><i /><i /><i /><b>M</b></div>
        </section>
        <section className="library-grid" aria-label="选择题库">
          <button className="library-card library-exam" onClick={startExam}>
            <span className="library-index">EXAM / 100 POINTS</span>
            <span className="library-title">随机考试</span>
            <span className="library-description">从全体题库随机抽取 40 道单选与 10 道多选，完整模拟一次百分钟的知识盘点。</span>
            <span className="library-footer"><strong>50</strong> 道题 <i>开始 →</i></span>
          </button>
          {data.banks.map((item, index) => (
            <button key={item.id} className={`library-card library-${item.id}`} onClick={() => enterLibrary(item.id as LibraryId)}>
              <span className="library-index">{String(index + 2).padStart(2, "0")} / {item.id.toUpperCase()}</span>
              <span className="library-title">{item.title}</span>
              <span className="library-description">{item.subtitle}</span>
              <span className="library-footer"><strong>{item.count}</strong> 道题 <i>进入 →</i></span>
            </button>
          ))}
        </section>
        <footer className="portal-footer"><span>本机自动保存进度</span><span>答案来自原始题库</span><span>MELON / 2026</span></footer>
      </main>
    );
  }

  if (view === "exam") {
    if (!examQuestion) {
      return (
        <main className="exam-shell">
          <button className="exam-back" onClick={() => setView("home")}>← 返回首页</button>
          <div className="exam-empty"><strong>本套试卷尚未生成</strong><button className="primary-button" onClick={startExam}>重新生成试卷</button></div>
        </main>
      );
    }
    const examSelected = examAnswers[examQuestion.id] ?? [];
    const examQuestionCorrect = sameAnswer(examSelected, examQuestion.answer);
    return (
      <main className="exam-shell">
        <header className="exam-header">
          <button className="exam-back" onClick={() => { if (!examSubmitted && !window.confirm("退出考试将放弃本套作答，确定返回首页吗？")) return; setView("home"); }}>← MELON 题室</button>
          <div className="exam-title"><span>RANDOM EXAMINATION</span><strong>全题库随机考试</strong></div>
          <div className="exam-counter">{examSubmitted ? `${examScore} / 100 分` : `${examAnsweredCount} / 50 已作答`}</div>
        </header>
        <div className="exam-layout">
          <section className="exam-card">
            {examSubmitted && (
              <div className="exam-result" role="status">
                <span>EXAM RESULT</span>
                <strong>{examScore}<i>/100</i></strong>
                <p>答对 {examFullyCorrect} 题。每题 2 分；多选必须完全选对才得分。</p>
                <button className="primary-button" onClick={startExam}>再来一套</button>
              </div>
            )}
            <div className="question-meta">
              <span className={`type-badge type-${examQuestion.type}`}>{TYPE_NAMES[examQuestion.type as QuestionType]}</span>
              <span>第 {examCurrent + 1} / 50 题</span>
              <span className="exam-source">{examQuestion.sectionTitle}</span>
            </div>
            <div className="question-progress" aria-hidden="true"><span style={{ width: `${((examCurrent + 1) / 50) * 100}%` }} /></div>
            <h1>{examQuestion.prompt}</h1>
            <div className="options-list" role="group" aria-label="考试答案选项">
              {examQuestion.options.map((option) => {
                const checked = examSelected.includes(option.key);
                const correctOption = examSubmitted && examQuestion.answer.includes(option.key);
                const wrongOption = examSubmitted && checked && !examQuestion.answer.includes(option.key);
                return <button key={option.key} disabled={examSubmitted} onClick={() => chooseExamOption(option.key)} className={`option ${checked ? "option-selected" : ""} ${correctOption ? "option-correct" : ""} ${wrongOption ? "option-wrong" : ""}`}>
                  <span className="option-key">{option.key}</span><span className="option-text">{option.text}</span>
                </button>;
              })}
            </div>
            {examSubmitted && (
              <div className={`feedback ${examQuestionCorrect ? "feedback-correct" : "feedback-wrong"}`}>
                <div className="feedback-icon">{examQuestionCorrect ? "✓" : "×"}</div>
                <div><strong>{examQuestionCorrect ? "本题得 2 分" : "本题得 0 分"}</strong><p>标准答案：{examQuestion.answer.join("、")}</p></div>
              </div>
            )}
            <footer className="question-footer exam-footer">
              <button className="previous-button" onClick={() => setExamCurrent((previous) => Math.max(0, previous - 1))} disabled={examCurrent === 0}>上一题</button>
              <span>{examSubmitted ? "可查看全部答案" : "作答会在本试卷内暂存"}</span>
              {examCurrent === 49 ? (
                examSubmitted ? <button className="primary-button" onClick={() => setView("home")}>返回首页</button> : <button className="primary-button" onClick={submitExam}>交卷并评分</button>
              ) : <button className="primary-button" onClick={() => setExamCurrent((previous) => previous + 1)}>下一题</button>}
            </footer>
          </section>
          <aside className="exam-sidebar">
            <div className="exam-sidebar-heading"><span>QUESTION MAP</span><strong>试题导航</strong></div>
            <div className="exam-map">
              {examQuestions.map((item, index) => <button key={item.id} onClick={() => setExamCurrent(index)} className={`${index === examCurrent ? "exam-map-current" : ""} ${(examAnswers[item.id] ?? []).length ? "exam-map-done" : ""}`}>{index + 1}</button>)}
            </div>
            <p><i />已作答 <b />当前题目</p>
            {!examSubmitted && <button className="exam-submit" onClick={submitExam}>交卷并评分</button>}
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <button className="mobile-menu" aria-label="打开题库目录" onClick={() => setSidebarOpen(true)}>目录</button>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭题库目录" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">M</div>
            <div>
              <div className="brand-name">MELON 题室</div>
              <div className="brand-subtitle">毛概 · 2023 版</div>
            </div>
            <button className="home-link" onClick={() => { setSidebarOpen(false); setView("home"); }}>首页</button>
          <button className="sidebar-close" aria-label="关闭题库目录" onClick={() => setSidebarOpen(false)}>×</button>
        </div>

        {bank === "chapter" || bank === "master" ? (
          <div className="bank-switch" aria-label="选择题库">
            <button className={bank === "chapter" ? "active" : ""} onClick={() => changeBank("chapter")}>章节练习</button>
            <button className={bank === "master" ? "active" : ""} onClick={() => changeBank("master")}>综合题库</button>
          </div>
        ) : <div className="active-library-pill">{libraryName}<span>{questions.length} 道</span></div>}

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => { restartView(); setQuery(event.target.value); }} placeholder="搜索题目" aria-label="搜索题目" />
          {query && <button onClick={() => { restartView(); setQuery(""); }} aria-label="清空搜索">×</button>}
        </label>

        <button className={`favorite-entry ${favoriteMode ? "favorite-entry-active" : ""}`} onClick={openFavorites}>
          <span aria-hidden="true">★</span>
          <strong>收藏题目</strong>
          <em>{libraryStarredCount}</em>
        </button>

        <nav className="chapter-nav" aria-label="章节目录">
          <div className="nav-label">{favoriteMode ? "收藏练习" : chapterList.length ? navLabel : "题库概览"}</div>
          {!favoriteMode && chapterList.length ? chapterList.map((chapter) => {
            const completed = (data.questions as Question[]).filter((item) => item.section === chapter.id && progress.answered.includes(item.id)).length;
            return (
              <button key={chapter.id} className={section === chapter.id ? "chapter-active" : ""} onClick={() => { restartView(); setFavoriteMode(false); setSection(chapter.id); setSidebarOpen(false); }}>
                <span className="chapter-copy"><strong>{chapter.label}</strong><small>{chapter.title}</small></span>
                <span className="chapter-count">{completed}/{chapter.count}</span>
              </button>
            );
          }) : (
            <div className="master-summary">
              <div><strong>{favoriteMode ? libraryStarredCount : bank === "master" ? data.stats.masterQuestions : library?.count ?? 0}</strong><span>{favoriteMode ? "道收藏题目" : "道已校验题目"}</span></div>
              <div><strong>{progress.starred.length}</strong><span>全站收藏</span></div>
              <p>{favoriteMode ? "这里汇集当前题库中收藏过的题目。练习时仍可点击右上角星标，随时取消收藏。" : bank === "master" ? "来自综合题库的有效标准答案。重复题已合并，原文缺失答案的题目未收录。" : `${library?.subtitle ?? "本题库"}。仅收录选项和答案均可校验的客观题。`}</p>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="mini-stat"><span>累计练习</span><strong>{progress.answered.length} 题</strong></div>
          <div className="mini-stat"><span>答对</span><strong>{progress.correct.length} 题</strong></div>
          <button className="reset-link" onClick={resetProgress}>清空学习记录</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{favoriteMode ? "SAVED QUESTIONS" : bankEyebrow[bank]}</div>
            <h1>{heading}</h1>
          </div>
          <div className="top-actions">
            <button className="soft-button" onClick={() => { setOrder(shuffle(questions.map((item) => item.id))); resetQuestion(0); }} disabled={!questions.length}>随机练习</button>
            <button className={`annotation-button ${annotationOpen ? "annotation-button-active" : ""} ${question && progress.notes[question.id] ? "annotation-button-saved" : ""}`} onClick={toggleAnnotation} disabled={!question} aria-expanded={annotationOpen}>
              <span aria-hidden="true">✎</span>{question && progress.notes[question.id] ? "查看批注" : "写批注"}
            </button>
            <button className={`star-button ${isStarred ? "starred" : ""}`} onClick={toggleStar} disabled={!question} aria-label={isStarred ? "取消收藏" : "收藏本题"}>{isStarred ? "★" : "☆"}</button>
          </div>
        </header>

        <div className="filter-row" aria-label="题型筛选">
          {FILTERS.filter((filter) => filter.key === "all" || availableTypes.has(filter.key)).map((filter) => (
            <button key={filter.key} className={typeFilter === filter.key ? "filter-active" : ""} onClick={() => { restartView(); setTypeFilter(filter.key); }}>{filter.label}</button>
          ))}
        </div>

        <div className="study-grid">
          <section className="question-panel">
            {question ? (
              <>
                <div className="question-meta">
                  <span className={`type-badge type-${question.type}`}>{TYPE_NAMES[question.type as QuestionType]}</span>
                  <button className="question-index-button" onClick={() => setNavigatorOpen(true)}>第 {current + 1} / {questions.length} 题 <span>⌄</span></button>
                  {question.occurrences && question.occurrences > 1 ? <span>题库中出现 {question.occurrences} 次</span> : null}
                </div>
                {navigatorOpen && (
                  <div className="question-navigator" role="dialog" aria-modal="true" aria-label="选择题号">
                    <button className="navigator-scrim" aria-label="关闭题号目录" onClick={() => setNavigatorOpen(false)} />
                    <div className="navigator-card">
                      <div className="navigator-header">
                        <div><span>QUESTION INDEX</span><strong>选择题号</strong></div>
                        <button onClick={() => setNavigatorOpen(false)} aria-label="关闭">×</button>
                      </div>
                      <div className="navigator-legend"><span className="nav-dot nav-current" />当前 <span className="nav-dot nav-done" />已作答 <span className="nav-dot nav-saved" />已收藏</div>
                      <div className="navigator-grid">
                        {questions.map((item, index) => (
                          <button
                            key={item.id}
                            className={`${index === current ? "navigator-current" : ""} ${progress.answered.includes(item.id) ? "navigator-done" : ""} ${progress.starred.includes(item.id) ? "navigator-saved" : ""}`}
                            onClick={() => { resetQuestion(index); setNavigatorOpen(false); }}
                            aria-label={`跳转到第 ${index + 1} 题`}
                          >{index + 1}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="question-progress" aria-hidden="true"><span style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>
                <h2>{question.prompt}</h2>

                {question.type === "short" ? (
                  <div className="short-answer-area">
                    {!revealed ? (
                      <div className="recall-prompt">
                        <div className="recall-lines" aria-hidden="true"><span /><span /><span /><span /></div>
                        <p>先在心里组织答案，再查看参考要点。</p>
                        <button className="primary-button" onClick={() => setRevealed(true)}>查看参考答案</button>
                      </div>
                    ) : (
                      <div className="answer-reveal">
                        <div className="answer-label">参考答案</div>
                        <p>{question.explanation}</p>
                        <div className="self-check">
                          <span>这道题掌握了吗？</span>
                          <button onClick={() => { recordResult(false); goNext(); }}>还需巩固</button>
                          <button className="mastered" onClick={() => { recordResult(true); goNext(); }}>已经掌握</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="options-list" role="group" aria-label="答案选项">
                    {question.options.map((option, optionIndex) => {
                      const checked = selected.includes(option.key);
                      const correctOption = submitted && question.answer.includes(option.key);
                      const wrongOption = submitted && checked && !question.answer.includes(option.key);
                      return (
                        <button key={option.key} className={`option ${checked ? "option-selected" : ""} ${correctOption ? "option-correct" : ""} ${wrongOption ? "option-wrong" : ""}`} onClick={() => chooseOption(option.key)} disabled={submitted}>
                          <span className="option-key">{option.key}</span>
                          <span className="option-text">{option.text}</span>
                          <span className="shortcut">{optionIndex + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {submitted && question.type !== "short" && (
                  <div className={`feedback ${isCorrect ? "feedback-correct" : "feedback-wrong"}`} role="status">
                    <div className="feedback-icon">{isCorrect ? "✓" : "×"}</div>
                    <div>
                      <strong>{isCorrect ? "回答正确" : "再想一想"}</strong>
                      <p>标准答案：{question.answer.join("、")} · {question.answer.map((key) => question.options.find((option) => option.key === key)?.text).filter(Boolean).join("；")}</p>
                    </div>
                  </div>
                )}

                <footer className="question-footer">
                  <button className="previous-button" onClick={() => resetQuestion((current - 1 + questions.length) % questions.length)}>上一题</button>
                  <div className="keyboard-hint">数字键选择 · Enter 提交</div>
                  {question.type !== "short" && (
                    submitted ? <button className="primary-button" onClick={goNext}>下一题</button> : <button className="primary-button" onClick={submit} disabled={!selected.length}>提交答案</button>
                  )}
                </footer>

                <details className="source-note">
                  <summary>题目来源与校验</summary>
                  <p>{question.source}。答案按原题库标准答案录入，并通过选项完整性与答案指向检查。</p>
                </details>
              </>
            ) : (
              <div className="empty-state">
                <div>{favoriteMode ? "这里还没有收藏题目" : "没有找到匹配的题目"}</div>
                <p>{favoriteMode ? "练题时点击右上角的星标，题目就会出现在这里。" : "试试清空搜索或切换题型。"}</p>
                <button className="primary-button" onClick={() => { restartView(); setQuery(""); setTypeFilter("all"); if (favoriteMode) setFavoriteMode(false); }}>{favoriteMode ? "返回题库" : "显示全部题目"}</button>
              </div>
            )}
          </section>

          <aside className={`session-panel ${annotationOpen && question ? "annotation-panel" : ""}`} id="annotation-panel">
            {annotationOpen && question ? (
              <>
                <div className="annotation-heading">
                  <div><span>PERSONAL NOTE</span><strong>本题批注</strong></div>
                  <button onClick={() => setAnnotationOpen(false)} aria-label="关闭批注">×</button>
                </div>
                <div className="annotation-context">第 {current + 1} 题 · {TYPE_NAMES[question.type as QuestionType]}</div>
                <textarea
                  value={progress.notes[question.id] ?? ""}
                  onChange={(event) => updateAnnotation(event.target.value)}
                  placeholder="记下易错点、解题思路或需要复习的知识……"
                  aria-label="本题批注内容"
                  maxLength={2000}
                  autoFocus
                />
                <div className="annotation-footer">
                  <span>自动保存 · {(progress.notes[question.id] ?? "").length}/2000</span>
                  {progress.notes[question.id] ? <button onClick={() => updateAnnotation("")}>清空批注</button> : null}
                </div>
                <p className="annotation-tip">批注只保存在当前浏览器，不会上传，也不会遮挡题目区域。</p>
              </>
            ) : (
              <>
                <div className="session-heading"><span>本轮进度</span><strong>{answeredHere}/{questions.length}</strong></div>
                <div className="donut" style={{ "--progress": `${accuracy * 3.6}deg` } as React.CSSProperties}>
                  <div><strong>{accuracy}%</strong><span>正确率</span></div>
                </div>
                <div className="session-stats">
                  <div><span className="dot dot-correct" />答对<strong>{sectionCorrect}</strong></div>
                  <div><span className="dot dot-wrong" />待巩固<strong>{questions.filter((item) => progress.wrong.includes(item.id)).length}</strong></div>
                  <div><span className="dot dot-neutral" />未作答<strong>{Math.max(questions.length - answeredHere, 0)}</strong></div>
                </div>
                <div className="study-note">
                  <div className="note-number">01</div>
                  <p>先独立作答，再看标准答案。错题会保留在“待巩固”中，答对后自动移除。</p>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
