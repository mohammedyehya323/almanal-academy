import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "../classroom.css";
import {
  ArrowLeft,
  AudioLines,
  Check,
  Clock3,
  Eye,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type Token = string;
type Step = { label: string; kind: "number" | "operation" | "bracket" };
type SessionMode = "ready" | "running" | "paused" | "finished" | "revealed";

const VIDEO_EXAMPLE =
  "9 + 8 - 5 - 2 + 3 + 9 + 3 + 8 - 1 + 7 - 1 + 1 + 9 - 5 + 9 + 8 - 8 - 6 + 9 + 8 + 7";

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    const numberMatch = source.slice(index).match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push(numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }
    const character = source[index];
    if ("()+-−*/×÷".includes(character)) {
      tokens.push(character === "×" ? "*" : character === "÷" ? "/" : character === "−" ? "-" : character);
      index += 1;
      continue;
    }
    throw new Error(`الرمز «${character}» غير مدعوم`);
  }
  if (!tokens.length) throw new Error("اكتبي مسألة حسابية أولًا");
  return tokens;
}

function evaluateExpression(source: string): number {
  const tokens = tokenize(source);
  let cursor = 0;

  const parsePrimary = (): number => {
    const token = tokens[cursor];
    if (token === "+") {
      cursor += 1;
      return parsePrimary();
    }
    if (token === "-") {
      cursor += 1;
      return -parsePrimary();
    }
    if (token === "(") {
      cursor += 1;
      const value = parseExpression();
      if (tokens[cursor] !== ")") throw new Error("فيه قوس مفتوح محتاج قفلة )");
      cursor += 1;
      return value;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
      throw new Error("راجعي ترتيب الأرقام والعمليات");
    }
    cursor += 1;
    return Number(token);
  };

  const parseMultiply = (): number => {
    let value = parsePrimary();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const next = parsePrimary();
      if (operator === "/" && next === 0) throw new Error("مينفعش القسمة على صفر");
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };

  const parseExpression = (): number => {
    let value = parseMultiply();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const next = parseMultiply();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };

  const result = parseExpression();
  if (cursor !== tokens.length) throw new Error("راجعي ترتيب العمليات والأقواس");
  if (!Number.isFinite(result)) throw new Error("الناتج خارج النطاق الحسابي");
  return Number(result.toFixed(6));
}

function buildSteps(source: string): Step[] {
  const tokens = tokenize(source);
  const steps: Step[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "(" || token === ")") {
      steps.push({ label: token, kind: "bracket" });
      index += 1;
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      steps.push({ label: token, kind: "number" });
      index += 1;
      continue;
    }
    if (!(token === "+" || token === "-" || token === "*" || token === "/")) {
      throw new Error("راجعي ترتيب الأرقام والعمليات");
    }
    const operator = token;
    index += 1;
    const unarySigns: string[] = [];
    while (tokens[index] === "+" || tokens[index] === "-") unarySigns.push(tokens[index++]);
    const operand = tokens[index];
    if (operand === "(") {
      steps.push({ label: operator === "*" ? "×" : operator === "/" ? "÷" : operator === "+" ? "+" : "−", kind: "operation" });
      continue;
    }
    if (!operand || !/^\d+(?:\.\d+)?$/.test(operand)) throw new Error("فيه عملية من غير رقم بعدها");
    const negativeOperand = unarySigns.filter((sign) => sign === "-").length % 2 === 1;
    if (operator === "+" || operator === "-") {
      const negative = (operator === "-") !== negativeOperand;
      steps.push({ label: `${negative ? "−" : "+"}${operand}`, kind: "number" });
    } else {
      steps.push({ label: `${operator === "*" ? "×" : "÷"} ${negativeOperand ? "−" : ""}${operand}`, kind: "operation" });
    }
    index += 1;
  }
  const startsWithUnaryGroup = (tokens[0] === "-" || tokens[0] === "+") && tokens[1] === "(";
  if (!steps.length || (steps[0].kind === "operation" && !startsWithUnaryGroup) || (steps[0].kind === "bracket" && steps[0].label === ")")) {
    throw new Error("ابدئي برقم أو بقوس مفتوح");
  }
  return steps;
}

function prettyAnswer(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

export default function Home() {
  const [expression, setExpression] = useState(VIDEO_EXAMPLE);
  const [interval, setIntervalMs] = useState(1000);
  const [soundOn, setSoundOn] = useState(true);
  const [mode, setMode] = useState<SessionMode>("ready");
  const [stepIndex, setStepIndex] = useState(-1);
  const [presentation, setPresentation] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const parsed = useMemo(() => {
    try {
      return { steps: buildSteps(expression), answer: evaluateExpression(expression), error: "" };
    } catch (error) {
      return {
        steps: [] as Step[],
        answer: 0,
        error: error instanceof Error ? error.message : "راجعي المسألة",
      };
    }
  }, [expression]);

  const currentStep = parsed.steps[stepIndex];
  const isPlaying = mode === "running";
  const isComplete = mode === "finished" || mode === "revealed";

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      audioRef.current = new AudioContextClass();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const playTone = useCallback((frequency: number, startAt = 0, length = 0.12, volume = 0.07) => {
    if (!soundOn) return;
    const context = getAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + startAt);
    gain.gain.setValueAtTime(0.0001, context.currentTime + startAt);
    gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startAt + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + startAt);
    oscillator.stop(context.currentTime + startAt + length + 0.02);
  }, [getAudio, soundOn]);

  const playApplause = useCallback(() => {
    if (!soundOn) return;
    playTone(523.25, 0, 0.2, 0.045);
    playTone(659.25, 0.11, 0.25, 0.05);
    playTone(783.99, 0.23, 0.36, 0.055);
    playTone(1046.5, 0.38, 0.55, 0.04);
    const context = getAudio();
    if (!context) return;
    const sampleLength = Math.floor(context.sampleRate * 0.9);
    const buffer = context.createBuffer(1, sampleLength, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleLength; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / sampleLength);
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime + 0.28);
    [0.32, 0.46, 0.59, 0.73, 0.84, 1].forEach((time, index) => {
      gain.gain.setValueAtTime(index % 2 ? 0.0001 : 0.028, context.currentTime + time);
    });
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.2);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    noise.start(context.currentTime + 0.28);
    noise.stop(context.currentTime + 1.2);
  }, [getAudio, playTone, soundOn]);

  useEffect(() => {
    if (mode !== "running") return;
    playTone(880, 0, 0.105, 0.055);
    const timer = window.setTimeout(() => {
      if (stepIndex < parsed.steps.length - 1) {
        setStepIndex((value) => value + 1);
      } else {
        setMode("finished");
      }
    }, interval);
    return () => window.clearTimeout(timer);
  }, [interval, mode, parsed.steps.length, playTone, stepIndex]);

  useEffect(() => {
    if (mode !== "running") return;
    const keepAwake = async () => {
      try {
        // Keep the projected screen awake on supported browsers during a lesson.
        const navigatorWithWakeLock = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<unknown> } };
        await navigatorWithWakeLock.wakeLock?.request("screen");
      } catch {
        // Wake lock is an optional enhancement; playback does not depend on it.
      }
    };
    void keepAwake();
  }, [mode]);

  const resetSession = useCallback(() => {
    setMode("ready");
    setStepIndex(-1);
    setShowConfetti(false);
  }, []);

  const startSession = useCallback(() => {
    if (parsed.error || !parsed.steps.length) return;
    getAudio();
    setShowConfetti(false);
    setStepIndex(0);
    setMode("running");
  }, [getAudio, parsed.error, parsed.steps.length]);

  const revealAnswer = useCallback(() => {
    if (mode !== "finished") return;
    getAudio();
    setMode("revealed");
    setShowConfetti(true);
    playApplause();
    window.setTimeout(() => setShowConfetti(false), 2500);
  }, [getAudio, mode, playApplause]);

  const pauseOrResume = useCallback(() => {
    if (mode === "running") setMode("paused");
    else if (mode === "paused") {
      getAudio();
      setMode("running");
    }
  }, [getAudio, mode]);

  const togglePresentation = useCallback(async () => {
    const next = !presentation;
    setPresentation(next);
    if (next) {
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // The focused presentation layout still works if fullscreen is unavailable.
      }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  }, [presentation]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresentation(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (mode === "running" || mode === "paused") pauseOrResume();
        else if (!parsed.error) startSession();
      }
      if (event.key === "Escape" && presentation) void togglePresentation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, parsed.error, pauseOrResume, presentation, startSession, togglePresentation]);

  const handleExpressionChange = (value: string) => {
    setExpression(value);
    resetSession();
  };

  const remaining = parsed.steps.length ? Math.max(0, parsed.steps.length - Math.max(stepIndex + 1, 0)) : 0;
  const progress = parsed.steps.length && stepIndex >= 0 ? ((stepIndex + 1) / parsed.steps.length) * 100 : 0;

  return (
    <main className={`app-shell${presentation ? " presentation-mode" : ""}`} dir="rtl">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="مختبر الأرقام - الرئيسية">
          <span className="brand-mark"><AudioLines size={21} strokeWidth={2.5} /></span>
          <span className="brand-copy">
            <strong>مختبر الأرقام</strong>
            <small>تدريب يوقّظ الذهن</small>
          </span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> أكاديمية المنال</div>
        <button className={`presentation-toggle${presentation ? " active" : ""}`} onClick={() => void togglePresentation()}>
          {presentation ? <X size={17} /> : <Maximize2 size={17} />}
          <span>{presentation ? "إنهاء وضع العرض" : "وضع العرض"}</span>
        </button>
      </header>

      <section className="intro-row" id="top">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> حصة الحساب الذهني</p>
          <h1>كل رقم... <span>لحظة تركيز.</span></h1>
          <p className="intro-copy">جهّزي المسألة، وسيبي الأرقام تقود التحدّي. الإجابة تفضل سرّ لحد ما تختاري تكشفيها.</p>
        </div>
        <div className="lesson-chip"><Sparkles size={17} /><span>جاهزة للتحدّي؟</span></div>
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <div className="panel-heading">
            <div className="panel-icon"><span>١</span></div>
            <div><h2>حضّري المسألة</h2><p>اكتبي العمليات بالترتيب</p></div>
          </div>

          <label className="field-label" htmlFor="problem-input">تسلسل الأرقام والعمليات</label>
          <div className={`expression-box${parsed.error ? " has-error" : ""}`}>
            <textarea
              id="problem-input"
              value={expression}
              onChange={(event) => handleExpressionChange(event.target.value)}
              placeholder="مثال: 9 + 8 - 5 × 2"
              dir="ltr"
              spellCheck={false}
              disabled={mode === "running" || mode === "paused"}
              aria-describedby="expression-hint"
            />
            <div className="expression-tools"><span className="keyboard-hint">+ &nbsp; − &nbsp; × &nbsp; ÷</span><span className="step-count">{parsed.steps.length} خطوة</span></div>
          </div>
          {parsed.error ? <p className="input-error" role="alert">{parsed.error}</p> : <p className="field-hint" id="expression-hint">الأقواس مدعومة. الضرب والقسمة يُحسبان قبل الجمع والطرح.</p>}

          <button className="sample-button" onClick={() => { handleExpressionChange(VIDEO_EXAMPLE); }} disabled={mode === "running" || mode === "paused"}>
            <span className="sample-symbol">٢١</span>
            <span className="sample-copy"><strong>مثال الفيديو</strong><small>تسلسل من ٢١ خطوة · مثال جاهز</small></span>
            <ArrowLeft size={17} />
          </button>

          <div className="panel-divider" />
          <div className="settings-heading"><span>إعدادات العرض</span><small>تقدري تغيّريها في أي وقت</small></div>

          <div className="speed-setting">
            <div className="setting-label"><span className="setting-icon"><Clock3 size={16} /></span><span>الوقت بين كل رقم</span><strong>{(interval / 1000).toFixed(2).replace(/0$/, "")} ث</strong></div>
            <input
              aria-label="الوقت بين الأرقام"
              type="range"
              min="500"
              max="2500"
              step="250"
              value={interval}
              onChange={(event) => setIntervalMs(Number(event.target.value))}
              style={{ "--range-progress": `${((interval - 500) / 2000) * 100}%` } as CSSProperties}
            />
            <div className="range-captions"><span>أسرع</span><span>أهدى</span></div>
          </div>

          <button className={`sound-setting${soundOn ? "" : " muted"}`} onClick={() => setSoundOn((value) => !value)} aria-pressed={soundOn}>
            <span className="setting-icon sound-icon">{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</span>
            <span className="sound-copy"><strong>صوت التنبيه</strong><small>{soundOn ? "نغمة خفيفة مع كل رقم" : "الصوت مكتوم"}</small></span>
            <span className={`switch${soundOn ? " on" : ""}`}><span /></span>
          </button>

          <div className="teacher-tip"><span className="tip-star">✳</span><p><strong>فكرة للمدرّبة</strong><br />اختاري وضع العرض بعد ما تجهّزي المسألة عشان تركيز الطلبة يبقى على الأرقام بس.</p></div>
        </aside>

        <section className={`lesson-stage${mode === "revealed" ? " answer-shown" : ""}`} aria-label="شاشة عرض التحدي">
          <div className="stage-topline">
            <div className="stage-label"><span className="stage-led" /> <span>{isPlaying ? "التحدّي شغّال" : isComplete ? "اكتمل التحدّي" : mode === "paused" ? "التحدّي متوقف" : "مساحة العرض"}</span></div>
            <div className="stage-meta"><span>تحدّي اليوم</span><span className="meta-separator">·</span><span>{parsed.steps.length || "—"} رقم</span></div>
          </div>

          <div className={`number-canvas${currentStep ? " has-number" : ""}${mode === "revealed" ? " showing-answer" : ""}`}>
            <div className="canvas-corner corner-tl" /><div className="canvas-corner corner-br" />
            {!currentStep && mode !== "revealed" ? (
              <div className="canvas-idle">
                <span className="idle-orbit orbit-a" /><span className="idle-orbit orbit-b" />
                <span className="idle-play"><Play size={25} fill="currentColor" /></span>
                <p>هنا هيظهر كل رقم</p><small>ابدئي التحدّي لما تكوني جاهزة</small>
              </div>
            ) : mode === "revealed" ? (
              <div className="answer-reveal" key="answer">
                <span className="answer-kicker"><Sparkles size={16} /> أحسنتم يا أبطال!</span>
                <span className="answer-number" dir="ltr">{prettyAnswer(parsed.answer)}</span>
                <span className="answer-caption">الإجابة الصحيحة</span>
                <span className="answer-check"><Check size={19} strokeWidth={3} /></span>
              </div>
            ) : (
              <div className={`number-reveal${currentStep.kind === "operation" ? " operation-step" : ""}`} key={`${stepIndex}-${currentStep.label}`}>
                <span className="number-overline">{currentStep.kind === "operation" ? "العملية التالية" : "ركّزوا معايا"}</span>
                <span className="number-value" dir="ltr">{currentStep.label}</span>
                <span className="number-underline" />
              </div>
            )}
            {showConfetti && <div className="confetti-layer" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <span key={i} style={{ "--x": `${(i * 47) % 101}%`, "--delay": `${(i % 7) * 35}ms`, "--hue": (i * 43 + 8) % 360 } as CSSProperties} />)}</div>}
          </div>

          <div className="progress-row">
            <div className="progress-copy"><span>{stepIndex < 0 ? "مستعدين؟" : mode === "revealed" ? "خلصنا التحدّي" : isComplete ? "انتهت الأرقام" : `الخطوة ${stepIndex + 1} من ${parsed.steps.length}`}</span><span className="progress-count" dir="ltr">{stepIndex < 0 ? "00" : String(stepIndex + 1).padStart(2, "0")}<i> / {String(parsed.steps.length).padStart(2, "0")}</i></span></div>
            <div className="progress-track" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="تقدم التحدي"><span style={{ width: `${progress}%` }} /></div>
            <div className="progress-foot"><span>{mode === "finished" ? "ممتاز.. فاضل نكشف الإجابة" : mode === "revealed" ? "تصفيق للأبطال اللي حاولوا!" : isPlaying ? `فاضل ${remaining} خطوة` : "الإجابة مخفية عن الطلبة"}</span><span className="private-pill"><Eye size={13} /> سرّية الإجابة</span></div>
          </div>

          <div className="stage-actions">
            <div className="play-actions">
              {mode === "running" ? (
                <button className="primary-action pause-action" onClick={pauseOrResume}><Pause size={18} fill="currentColor" /> إيقاف مؤقت</button>
              ) : mode === "paused" ? (
                <button className="primary-action" onClick={pauseOrResume}><Play size={18} fill="currentColor" /> كمّلي التحدّي</button>
              ) : isComplete ? (
                <button className="primary-action replay-action" onClick={startSession}><RotateCcw size={17} /> ابدئي من جديد</button>
              ) : (
                <button className="primary-action" onClick={startSession} disabled={Boolean(parsed.error)}><Play size={18} fill="currentColor" /> ابدئي التحدّي</button>
              )}
              <button className="reset-action" onClick={resetSession} disabled={mode === "ready"}><RotateCcw size={16} /><span>إعادة</span></button>
            </div>
            <button className={`reveal-action${mode === "revealed" ? " revealed" : ""}`} onClick={mode === "revealed" ? resetSession : revealAnswer} disabled={mode !== "finished" && mode !== "revealed"}>
              {mode === "revealed" ? <><Check size={17} /> اتكشفت الإجابة</> : <><Sparkles size={17} /> اكشفي الإجابة</>}
            </button>
          </div>
          <div className="stage-footer"><span><span className="footer-key">SPACE</span> للبدء أو الإيقاف</span><span>صمّمي لحظة تركيز.. واحتفلي بالمحاولة</span></div>
        </section>
      </section>

      <footer className="site-footer"><span>مختبر الأرقام <span className="footer-dot">·</span> مساحة آمنة للتعلّم بالمحاولة</span><span className="footer-made">بتركيزهم.. كل رقم بيحكي حكاية</span></footer>
    </main>
  );
}
