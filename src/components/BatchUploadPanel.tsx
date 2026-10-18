import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Layers,
  Upload,
  Play,
  Square,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  ChevronDown,
  Zap,
  Stethoscope,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import type { Language } from "../utils/translations";
import { addFiles, runBatch, summarize, type BatchItem } from "../utils/batchQueue";
import { transcribeFile } from "../utils/transcribeClient";
import { buildAnalyzedCallRecord, getFastBatchAlerts, type FastBatchAlert } from "../utils/callRecordBuilder";

export { getFastBatchAlerts, type FastBatchAlert };

interface Props {
  processingMode?: string;
  language?: Language;
  /** test seam */
  transcribe?: typeof transcribeFile;
  onSelectResult?: (result: any) => void;
}

const T = {
  ar: {
    title: "رفع دفعي لعدة مكالمات",
    subtitle: "اكتشاف سريع وخفيف للشكاوى والاستشارات والهولد الطويل مع إمكانية التحليل الكامل",
    pick: "اختر ملفات صوتية أو اسحبها هنا",
    pickHint: "يمكن اختيار عدة ملفات دفعة واحدة (وضع اكتشاف سريع وخفيف)",
    speed: "المعالجة المتوازية",
    start: "بدء التحليل",
    stop: "إيقاف",
    retry: "إعادة محاولة الفاشلة",
    clear: "مسح المنتهي",
    skipped: "تم تجاهل ملفات مكررة:",
    queued: "في الانتظار",
    analyzing: "قيد التحليل",
    done: "تم",
    failed: "فشل",
    cancelled: "أُلغي",
    cached: "من الكاش",
    summary: "اكتمل",
    of: "من",
    avg: "متوسط الجودة",
    score: "الدرجة",
    agent: "الزميل",
    stopNote: "الإيقاف يمنع بدء مكالمات جديدة؛ التحليل الجاري في الخادم يكتمل ويُحفظ.",
    fullAnalysisBtn: "تحليل كامل",
    fullAnalysisRunning: "جارِ التحليل...",
    viewCallBtn: "عرض المكالمة",
    totalAlerts: "إجمالي التنبيهات",
    complaintsBadge: "شكوى",
    consultationsBadge: "استشارة",
    longHoldBadge: "هولد طويل",
    noAlerts: "سليمة (لا توجد تنبيهات)",
    fastModeBadge: "وضع اكتشاف سريع",
  },
  en: {
    title: "Batch upload",
    subtitle: "Fast lightweight screening for complaints, consultations, and long holds with on-demand full analysis",
    pick: "Choose audio files or drop them here",
    pickHint: "You can select several files at once",
    speed: "Parallel calls",
    start: "Start analysis",
    stop: "Stop",
    retry: "Retry failed",
    clear: "Clear finished",
    skipped: "Duplicate files ignored:",
    queued: "Queued",
    analyzing: "Analysing",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    cached: "cached",
    summary: "Finished",
    of: "of",
    avg: "Average quality",
    score: "Score",
    agent: "Agent",
    stopNote: "Stopping prevents new calls from starting; an analysis already running on the server completes and is saved.",
    fullAnalysisBtn: "Full Analysis",
    fullAnalysisRunning: "Analyzing...",
    viewCallBtn: "View Call",
    totalAlerts: "Total Alerts",
    complaintsBadge: "Complaint",
    consultationsBadge: "Consultation",
    longHoldBadge: "Long Hold",
    noAlerts: "Clear (No Alerts)",
    fastModeBadge: "Fast Detection Mode",
  },
} as const;

const scoreOf = (r: any): number | undefined => {
  try {
    const v = buildAnalyzedCallRecord(r).overallScore;
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
};

const agentOf = (r: any): string => {
  try {
    return buildAnalyzedCallRecord(r).agentName || "";
  } catch {
    return "";
  }
};

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const BatchUploadPanel: React.FC<Props> = ({
  processingMode = "fast_detection",
  language = "ar",
  transcribe = transcribeFile,
  onSelectResult,
}) => {
  const currentLang = language === "en" ? "en" : "ar";
  const t = T[currentLang];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [concurrency, setConcurrency] = useState(1);
  const [skipped, setSkipped] = useState(0);
  const [drag, setDrag] = useState(false);
  const [fullAnalyzingId, setFullAnalyzingId] = useState<string | null>(null);

  const itemsRef = useRef<BatchItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commit = useCallback((next: BatchItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const onFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list || []).filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a|ogg|flac|webm|aac)$/i.test(f.name)
    );
    if (!files.length) return;
    const { items: next, skipped: sk } = addFiles(itemsRef.current, files);
    setSkipped(sk);
    commit(next);
    setOpen(true);
  };

  const start = async () => {
    if (running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    const working = itemsRef.current.map((i) => ({ ...i }));
    commit(working.map((i) => ({ ...i })));

    // When processingMode is explicitly passed as "transcription_with_analysis" (e.g. from tests),
    // we respect it; otherwise we default to the ultra-fast "fast_detection" mode.
    const modeToUse = processingMode || "fast_detection";

    try {
      await runBatch(working, {
        concurrency,
        signal: ctrl.signal,
        onUpdate: (u) => {
          commit(itemsRef.current.map((p) => (p.id === u.id ? u : p)));
          if (u.status === "done") {
            window.dispatchEvent(new Event("qa-calls-changed"));
          }
        },
        run: async (item, signal) => {
          const result = await transcribe(item.file, {
            processingMode: modeToUse,
            signal,
          });
          return { result, cached: Boolean(result?.cacheHit) };
        },
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const retryFailed = () => {
    commit(
      itemsRef.current.map((i) =>
        i.status === "failed" || i.status === "cancelled"
          ? { ...i, status: "queued" as const, error: undefined }
          : i
      )
    );
    setTimeout(start, 0);
  };

  const clearFinished = () =>
    commit(itemsRef.current.filter((i) => i.status === "queued" || i.status === "analyzing"));

  /**
   * Run separate full transcription + QA scorecard on demand for an individual call.
   */
  const handleRunFullAnalysis = async (item: BatchItem) => {
    if (fullAnalyzingId) return;
    setFullAnalyzingId(item.id);
    try {
      const fullResult = await transcribe(item.file, {
        processingMode: "transcription_with_analysis",
      });
      // Update item with full analysis result
      const updated = itemsRef.current.map((i) =>
        i.id === item.id ? { ...i, result: fullResult, cached: Boolean(fullResult?.cacheHit) } : i
      );
      commit(updated);
      window.dispatchEvent(new Event("qa-calls-changed"));
      if (onSelectResult) {
        onSelectResult(fullResult);
      }
    } catch (err: any) {
      console.error("Full analysis failed:", err);
      const updated = itemsRef.current.map((i) =>
        i.id === item.id ? { ...i, error: `فشل التحليل الكامل: ${err?.message || err}` } : i
      );
      commit(updated);
    } finally {
      setFullAnalyzingId(null);
    }
  };

  const sum = useMemo(() => summarize(items, scoreOf), [items]);
  const pct = sum.total ? Math.round((sum.finished / sum.total) * 100) : 0;
  const hasQueued = items.some((i) => i.status === "queued");
  const hasRetry = items.some((i) => i.status === "failed" || i.status === "cancelled");

  // Aggregate fast detection alerts across completed items
  const alertStats = useMemo(() => {
    let complaints = 0;
    let consultations = 0;
    let longHolds = 0;
    for (const item of items) {
      if (item.status === "done" && item.result) {
        const itemAlerts = getFastBatchAlerts(item.result);
        for (const a of itemAlerts) {
          if (a.type === "complaint") complaints++;
          else if (a.type === "consultation") consultations++;
          else if (a.type === "long_hold") longHolds++;
        }
      }
    }
    return {
      complaints,
      consultations,
      longHolds,
      total: complaints + consultations + longHolds,
    };
  }, [items]);

  const badge = (i: BatchItem) => {
    const m: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      queued: {
        cls: "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700",
        icon: <Clock className="w-3 h-3" />,
        label: t.queued,
      },
      analyzing: {
        cls: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        label: t.analyzing,
      },
      done: {
        cls: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
        icon: <CheckCircle2 className="w-3 h-3" />,
        label: t.done,
      },
      failed: {
        cls: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50",
        icon: <AlertTriangle className="w-3 h-3" />,
        label: t.failed,
      },
      cancelled: {
        cls: "bg-stone-100 dark:bg-stone-800 text-stone-500 border-stone-200 dark:border-stone-700",
        icon: <Square className="w-3 h-3" />,
        label: t.cancelled,
      },
    };
    const x = m[i.status];
    return (
      <span
        data-testid={`batch-status-${i.name}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${x.cls}`}
      >
        {x.icon}
        {x.label}
      </span>
    );
  };

  return (
    <section
      className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 shadow-xs transition-colors"
      data-testid="batch-panel"
      aria-label={t.title}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full p-4 flex items-center justify-between gap-3 text-start cursor-pointer hover:bg-stone-50/50 dark:hover:bg-stone-900/30 transition-colors rounded-2xl"
      >
        <span className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-stone-900 dark:text-stone-100 font-sans">
                {t.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-bold font-sans">
                {t.fastModeBadge}
              </span>
            </div>
            <span className="block text-[11px] text-stone-500 dark:text-stone-400 font-sans mt-0.5">
              {t.subtitle}
            </span>
          </div>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {items.length > 0 && (
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20">
              {sum.finished}/{sum.total}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-4 border-t border-[#EAE3D9] dark:border-stone-800">
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFiles(e.dataTransfer?.files || null);
            }}
            onClick={() => inputRef.current?.click()}
            className={`mt-4 p-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-1 cursor-pointer transition-all ${
              drag
                ? "border-[#C25E38] bg-[#C25E38]/5"
                : "border-[#EAE3D9] dark:border-stone-700 hover:border-[#C25E38]/40 bg-[#FAF8F5]/60 dark:bg-stone-900/40"
            }`}
          >
            <Upload className="w-5 h-5 text-stone-500 dark:text-stone-400" />
            <span className="text-xs font-bold text-stone-800 dark:text-stone-100">
              {t.pick}
            </span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {t.pickHint}
            </span>
            <input
              ref={inputRef}
              data-testid="batch-input"
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {skipped > 0 && (
            <p
              className="text-[11px] text-amber-700 dark:text-amber-400 font-sans"
              data-testid="batch-skipped"
            >
              {t.skipped} {skipped}
            </p>
          )}

          {items.length > 0 && (
            <>
              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={start}
                  disabled={running || !hasQueued}
                  className="py-2 px-3.5 bg-[#C25E38] hover:bg-[#A94E2C] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  {t.start}
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={!running}
                  className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 disabled:opacity-50 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  {t.stop}
                </button>
                <button
                  type="button"
                  onClick={retryFailed}
                  disabled={running || !hasRetry}
                  className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 disabled:opacity-50 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.retry}
                </button>
                <button
                  type="button"
                  onClick={clearFinished}
                  disabled={running}
                  className="py-2 px-3.5 bg-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.clear}
                </button>
                <label className="ms-auto flex items-center gap-2 text-[11px] font-bold text-stone-600 dark:text-stone-300">
                  {t.speed}
                  <select
                    value={concurrency}
                    disabled={running}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    aria-label={t.speed}
                    className="py-1 px-2 rounded-lg border border-[#EAE3D9] dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Top Summary Header & Quick Alert Counters */}
              <div className="space-y-2">
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-stone-600 dark:text-stone-300 gap-2"
                  data-testid="batch-summary"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>
                      {t.summary} {sum.finished} {t.of} {sum.total} • ✓ {sum.done} • ✗ {sum.failed}
                      {sum.cached ? ` • ⚡ ${sum.cached} ${t.cached}` : ""}
                    </span>
                    {alertStats.total > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        {alertStats.total} {currentLang === "ar" ? "تنبيه" : "alerts"}
                      </span>
                    )}
                  </div>
                  {sum.avgScore !== undefined && (
                    <span className="font-mono font-bold">
                      {t.avg}: {sum.avgScore}%
                    </span>
                  )}
                </div>

                {/* Quick breakdown badges if there are finished items */}
                {sum.finished > 0 && (
                  <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 text-[11px]">
                    <span className="text-stone-500 dark:text-stone-400 font-semibold">
                      {currentLang === "ar" ? "توزيع التنبيهات السريعة:" : "Fast Alert Summary:"}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                      {alertStats.complaints} {t.complaintsBadge}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      <Stethoscope className="w-3 h-3 text-indigo-500" />
                      {alertStats.consultations} {t.consultationsBadge}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      <Clock className="w-3 h-3 text-amber-500" />
                      {alertStats.longHolds} {t.longHoldBadge}
                    </span>
                  </div>
                )}

                <div
                  className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-[#C25E38] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {running && (
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 font-sans">
                    {t.stopNote}
                  </p>
                )}
              </div>

              {/* Items List */}
              <ul className="space-y-2.5 max-h-96 overflow-y-auto pr-0.5" data-testid="batch-list">
                {items.map((i) => {
                  const sc = i.status === "done" ? scoreOf(i.result) : undefined;
                  const alerts = i.status === "done" ? getFastBatchAlerts(i.result) : [];
                  const isFullAnalyzing = fullAnalyzingId === i.id;
                  const hasFullScorecard = Boolean(
                    i.result?.evaluationScorecard || i.result?.overallScore !== undefined
                  );

                  return (
                    <li
                      key={i.id}
                      className="p-3 rounded-xl border border-[#EAE3D9] dark:border-stone-800 bg-[#FAF8F5]/60 dark:bg-stone-900/40 text-xs space-y-2 transition-all hover:border-[#C25E38]/30"
                    >
                      {/* File Name & Status */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className="font-bold text-stone-900 dark:text-stone-100 truncate max-w-[280px] sm:max-w-md"
                          dir="ltr"
                          title={i.name}
                        >
                          {i.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] text-stone-500">
                            {fmtSize(i.size)}
                          </span>
                          {badge(i)}
                        </div>
                      </div>

                      {/* Fast Detection Alert Badges */}
                      {i.status === "done" && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-stone-200/60 dark:border-stone-800/80">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {alerts.length > 0 ? (
                              alerts.map((alert, idx) => {
                                if (alert.type === "complaint") {
                                  return (
                                    <span
                                      key={idx}
                                      title={alert.reason}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-help"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                                      <span>{currentLang === "ar" ? alert.labelAr : alert.labelEn}</span>
                                    </span>
                                  );
                                }
                                if (alert.type === "consultation") {
                                  return (
                                    <span
                                      key={idx}
                                      title={alert.reason}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-help"
                                    >
                                      <Stethoscope className="w-3 h-3 text-indigo-500" />
                                      <span>{currentLang === "ar" ? alert.labelAr : alert.labelEn}</span>
                                    </span>
                                  );
                                }
                                if (alert.type === "long_hold") {
                                  return (
                                    <span
                                      key={idx}
                                      title={alert.reason}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 cursor-help"
                                    >
                                      <Clock className="w-3 h-3 text-amber-500" />
                                      <span>{currentLang === "ar" ? alert.labelAr : alert.labelEn}</span>
                                    </span>
                                  );
                                }
                                return null;
                              })
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                {t.noAlerts}
                              </span>
                            )}

                            {agentOf(i.result) && (
                              <span className="text-[11px] text-stone-500 dark:text-stone-400 ms-1">
                                {t.agent}: <b className="text-stone-700 dark:text-stone-200">{agentOf(i.result)}</b>
                              </span>
                            )}

                            {sc !== undefined && (
                              <span className="text-[11px] text-stone-500 dark:text-stone-400 ms-1 font-mono">
                                {t.score}: <b className="text-stone-800 dark:text-stone-100">{sc}%</b>
                              </span>
                            )}

                            {i.cached && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 dark:text-amber-400 font-sans">
                                <Zap className="w-3 h-3" />
                                {t.cached}
                              </span>
                            )}
                          </div>

                          {/* Action Buttons: Run Full Analysis On-Demand & View Call */}
                          <div className="flex items-center gap-1.5 ms-auto shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRunFullAnalysis(i)}
                              disabled={isFullAnalyzing || running}
                              className="py-1 px-2.5 rounded-lg text-[11px] font-bold bg-[#C25E38]/10 hover:bg-[#C25E38]/20 text-[#C25E38] border border-[#C25E38]/30 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                              title={
                                currentLang === "ar"
                                  ? "تشغيل تفريغ حرفي كامل وتحليل شامل لبطاقة الـ QA Scorecard لهذه المكالمة فقط"
                                  : "Run full transcript and QA scorecard analysis for this call"
                              }
                            >
                              {isFullAnalyzing ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{t.fullAnalysisRunning}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  <span>{hasFullScorecard ? (currentLang === "ar" ? "إعادة تحليل كامل" : "Re-analyze Full") : t.fullAnalysisBtn}</span>
                                </>
                              )}
                            </button>

                            {onSelectResult && (
                              <button
                                type="button"
                                onClick={() => onSelectResult(i.result)}
                                className="py-1 px-2 rounded-lg text-[11px] font-semibold bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 flex items-center gap-1 cursor-pointer transition-colors"
                                title={t.viewCallBtn}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>{t.viewCallBtn}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {i.status === "failed" && (
                        <p className="text-[11px] text-rose-700 dark:text-rose-400 font-sans">
                          {i.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
};
