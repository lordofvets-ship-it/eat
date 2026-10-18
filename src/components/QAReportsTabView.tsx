import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  Download, 
  Search, 
  User, 
  Stethoscope, 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Sparkles,
  ArrowRight,
  Headphones,
  RotateCcw,
  ShieldCheck,
  Table,
  LayoutGrid,
  Percent,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { TranscriptionResponse, AnalyzedCallRecord } from "../types";
import { exportEvaluationToExcel } from "../utils/exportToExcel";
import { Language, translations } from "../utils/translations";
import { buildAnalyzedCallRecord, getDeterministicCallId } from "../utils/callRecordBuilder";
import { computeCallScorecard } from "../utils/qaScorecard";
import { CallScorecardTable } from "./CallScorecardTable";

interface QAReportsTabViewProps {
  result?: TranscriptionResponse | null;
  analyzedCalls?: AnalyzedCallRecord[];
  onRenameCall?: (id: string, newName: string) => void;
  onDeleteCall?: (id: string) => void;
  onClearAllCalls?: () => void;
  onOpenExcelModal: () => void;
  onBackToHome: () => void;
  onSelectCall?: (callData: TranscriptionResponse) => void;
  language?: Language;
}

// Storage key dedicated exclusively to actual calls analyzed by user (NO mock / seed examples)
export const ANALYZED_CALLS_STORAGE_KEY = "qa_actually_analyzed_calls_v4";
export const USER_DELETED_CALL_IDS_KEY = "qa_user_deleted_call_ids_v1";

export const QAReportsTabView: React.FC<QAReportsTabViewProps> = ({
  result,
  analyzedCalls,
  onRenameCall,
  onDeleteCall,
  onClearAllCalls,
  onBackToHome,
  onSelectCall,
  language = "ar",
}) => {
  const currentLang = language || "ar";
  const t = translations[currentLang] || translations.ar;
  const tReports = t.qaReports;

  const [localCallsList, setLocalCallsList] = useState<AnalyzedCallRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "consultation" | "hold" | "complaint">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [expandedCallScorecardId, setExpandedCallScorecardId] = useState<string | null>(null);

  // Use parent-controlled analyzedCalls when provided, otherwise fallback to local state
  const callsList = analyzedCalls ?? localCallsList;

  // Fallback loader if used standalone without parent analyzedCalls
  useEffect(() => {
    if (analyzedCalls !== undefined) return;
    try {
      localStorage.removeItem("qa_analyzed_calls_log_v2");
      localStorage.removeItem("qa_analyzed_calls_log");

      const stored = localStorage.getItem(ANALYZED_CALLS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setLocalCallsList(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load analyzed calls:", e);
    }

    fetch("/api/analyzed-calls")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.calls)) {
          setLocalCallsList((prev) => {
            const byId = new Map<string, AnalyzedCallRecord>();
            for (const c of data.calls) byId.set(c.id, c);
            for (const c of prev) {
              if (!byId.has(c.id)) byId.set(c.id, c);
            }
            return Array.from(byId.values());
          });
        }
      })
      .catch(() => {});
  }, [analyzedCalls]);

  // Synchronize active analyzed call when standalone
  useEffect(() => {
    if (analyzedCalls !== undefined) return;
    if (!result || !result.transcript || result.transcript.length === 0) return;

    setLocalCallsList((prev) => {
      const detId = getDeterministicCallId(result);
      const existingIdx = prev.findIndex(
        (c) =>
          c.id === detId ||
          (result.audioHash && c.audioHash === result.audioHash) ||
          c.fullResult === result
      );

      const newRecord = buildAnalyzedCallRecord(
        result,
        existingIdx >= 0 ? prev[existingIdx] : undefined
      );

      let updated: AnalyzedCallRecord[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = newRecord;
      } else {
        updated = [newRecord, ...prev];
      }

      try {
        localStorage.setItem(ANALYZED_CALLS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [result, analyzedCalls]);

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (!editingName.trim()) return;
    const trimmed = editingName.trim();
    if (onRenameCall) {
      onRenameCall(id, trimmed);
    } else {
      const updated = localCallsList.map((call) =>
        call.id === id ? { ...call, agentName: trimmed } : call
      );
      setLocalCallsList(updated);
      try {
        localStorage.setItem(ANALYZED_CALLS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      fetch(`/api/analyzed-calls/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: trimmed }),
      }).catch(() => {});
    }
    setEditingId(null);
  };

  const handleExecuteDeleteCall = (id: string) => {
    if (onDeleteCall) {
      onDeleteCall(id);
    } else {
      const updated = localCallsList.filter((call) => call.id !== id);
      setLocalCallsList(updated);
      try {
        localStorage.setItem(ANALYZED_CALLS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      fetch(`/api/analyzed-calls/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setConfirmDeleteId(null);
  };

  const handleExecuteClearAll = () => {
    if (onClearAllCalls) {
      onClearAllCalls();
    } else {
      setLocalCallsList([]);
      try {
        localStorage.setItem(ANALYZED_CALLS_STORAGE_KEY, JSON.stringify([]));
      } catch {}
      fetch("/api/analyzed-calls", { method: "DELETE" }).catch(() => {});
    }
    setConfirmClearAll(false);
  };

  const handleSelectCall = (call: AnalyzedCallRecord) => {
    if (call.fullResult && onSelectCall) {
      onSelectCall(call.fullResult);
    } else {
      onBackToHome();
    }
  };

  // Filter and search
  const filteredCalls = callsList.filter((call) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      call.agentName.toLowerCase().includes(q) ||
      (call.customerName || "").toLowerCase().includes(q) ||
      call.consultationSummary.toLowerCase().includes(q) ||
      call.complaintSummary.toLowerCase().includes(q) ||
      call.holdSummary.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (activeFilter === "consultation") return call.hasConsultation;
    if (activeFilter === "hold") return call.hasHold;
    if (activeFilter === "complaint") return call.hasComplaint;

    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Banner: Strict QA Reports Definition */}
      <div className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EAE3D9] dark:border-stone-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20 flex items-center justify-center shrink-0 shadow-2xs">
              <FileSpreadsheet className="w-6 h-6 text-[#C25E38]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-stone-900 dark:text-stone-100">
                  {tReports.title}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C25E38]/10 text-[#C25E38] font-bold border border-[#C25E38]/20 font-mono">
                  {callsList.length} {currentLang === "en" ? "Actual Calls" : "مكالمات محللة فعلياً"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{currentLang === "en" ? "Auto-Saved Permanently" : "حفظ تلقائي دائم"}</span>
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed font-medium">
                {tReports.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
            {callsList.length > 0 && (
              confirmClearAll ? (
                <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 rounded-xl">
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                    {currentLang === "en" ? "Confirm clear all?" : "تأكيد مسح جميع المكالمات؟"}
                  </span>
                  <button
                    type="button"
                    onClick={handleExecuteClearAll}
                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                  >
                    {currentLang === "en" ? "Yes, Delete" : "نعم، مسح"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-[11px] font-bold cursor-pointer"
                  >
                    {currentLang === "en" ? "Cancel" : "إلغاء"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="py-2.5 px-3 bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-stone-600 dark:text-stone-300 hover:text-rose-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={currentLang === "en" ? "Clear Log" : "مسح السجل"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{currentLang === "en" ? "Clear Log" : "مسح السجل"}</span>
                </button>
              )
            )}

            {result && (
              <button
                type="button"
                onClick={() => exportEvaluationToExcel(result)}
                className="py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                title={tReports.exportExcelBtn}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{tReports.exportExcelBtn}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBackToHome}
              className="py-2.5 px-3.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowRight className={`w-3.5 h-3.5 ${currentLang === "en" ? "rotate-180" : ""}`} />
              <span>{tReports.backHome}</span>
            </button>
          </div>
        </div>

        {/* Search Input & Filter Chips: only shown when there are actual calls */}
        {callsList.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tReports.searchPlaceholder}
                className="w-full ps-9 pe-4 py-2 bg-[#FAF8F5] dark:bg-stone-900 border border-[#EAE3D9] dark:border-stone-800 rounded-xl text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#C25E38] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeFilter === "all"
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs"
                    : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                }`}
              >
                {tReports.filterAll}
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("consultation")}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeFilter === "consultation"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/60 border border-teal-200/60 dark:border-teal-900/40"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>{tReports.filterConsultation}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("hold")}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeFilter === "hold"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/40"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{tReports.filterHold}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("complaint")}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeFilter === "complaint"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-200/60 dark:border-rose-900/40"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{tReports.filterComplaint}</span>
              </button>
            </div>

            {/* View Mode Switcher (Concise Scores Table vs Cards) */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl shrink-0 border border-[#EAE3D9] dark:border-stone-700">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                }`}
                title="عرض جدول مختصر بالدرجات لجميع المكالمات"
              >
                <Table className="w-3.5 h-3.5 text-[#C25E38]" />
                <span>جدول الدرجات المختصر</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                }`}
                title="عرض بطاقات المكالمات التفصيلية"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-stone-500" />
                <span>بطاقات المكالمات</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actual Calls Log Section */}
      <div className="space-y-4">
        {callsList.length === 0 ? (
          /* Empty State when NO calls have been analyzed yet */
          <div className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20 mx-auto flex items-center justify-center shadow-2xs">
              <Headphones className="w-8 h-8 text-[#C25E38]" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
                {currentLang === "en" ? "No Analyzed Calls Yet" : "لا توجد مكالمات تم تحليلها حتى الآن"}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-sans">
                {currentLang === "en"
                  ? "The reports log exclusively registers calls that have been actually analyzed in the system, with zero preset mock examples. Upload an audio recording in the 'Dashboard' tab to automatically log it under the colleague's name with consultation, hold, and complaint summaries."
                  : "سجل التقارير مخصص حصرياً للمكالمات التي تم تحليلها فعلياً في النظام بدون أي أمثلة أو بيانات افتراضية. تفضل برفع وتحليل مكالمة صوتية في التبويب 'الرئيسية' ليتم تسجيلها وحفظها هنا تلقائياً باسم الزميل مع ملخص للاستشارة والهولد والشكوى."}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onBackToHome}
                className="py-3 px-6 bg-[#C25E38] hover:bg-[#A94E2C] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer inline-flex items-center gap-2 active:scale-95"
              >
                <Headphones className="w-4 h-4" />
                <span>{currentLang === "en" ? "Go to Dashboard & Analyze Call" : "الذهاب للرئيسية ورفع مكالمة للتحليل"}</span>
              </button>
            </div>
          </div>
        ) : filteredCalls.length === 0 ? (
          /* Empty state for search filter mismatch */
          <div className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 mx-auto flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {tReports.emptyTitle}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
              لم يتم العثور على أي مكالمة تطابق البحث "{searchQuery}".
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveFilter("all");
              }}
              className="py-2 px-3.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط البحث</span>
            </button>
          </div>
        ) : viewMode === "table" ? (
          /* Concise Scores Table View for All Calls */
          <div className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#EAE3D9] dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF8F5]/60 dark:bg-stone-900/40">
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-[#C25E38]" />
                  <span>جدول الدرجات المختصر لكل مكالمة (المعيار المعتمد 100)</span>
                </h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  المقدمة (10) • المهارات (35) • الهولد (15) • الإنهاء (10) • UPDATE (5) • ACTION (25) = 100 درجة
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20 font-mono">
                  {filteredCalls.length} {filteredCalls.length === 1 ? "مكالمة" : "مكالمات"}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 dark:bg-stone-900 border-b border-[#EAE3D9] dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-400 font-bold">
                    <th className="py-2.5 px-3 text-start">الزميل (الصيدلي)</th>
                    <th className="py-2.5 px-3 text-start">العميل</th>
                    <th className="py-2.5 px-2 text-center">المدة</th>
                    <th className="py-2.5 px-2 text-center bg-amber-500/5 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
                      المقدمة (10)
                    </th>
                    <th className="py-2.5 px-2 text-center bg-blue-500/5 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300">
                      المهارات (35)
                    </th>
                    <th className="py-2.5 px-2 text-center bg-indigo-500/5 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300">
                      الهولد (15)
                    </th>
                    <th className="py-2.5 px-2 text-center bg-teal-500/5 dark:bg-teal-500/10 text-teal-800 dark:text-teal-300">
                      الإنهاء (10)
                    </th>
                    <th className="py-2.5 px-2 text-center bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                      UPDATE (5)
                    </th>
                    <th className="py-2.5 px-2 text-center bg-purple-500/5 dark:bg-purple-500/10 text-purple-800 dark:text-purple-300">
                      ACTION (25)
                    </th>
                    <th className="py-2.5 px-3 text-center bg-[#C25E38]/5 dark:bg-[#C25E38]/10 text-stone-900 dark:text-stone-100 font-black">
                      الإجمالي (100)
                    </th>
                    <th className="py-2.5 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE3D9] dark:divide-stone-800 font-medium">
                  {filteredCalls.map((call) => {
                    const scorecard = computeCallScorecard(call);
                    const isExpanded = expandedCallScorecardId === call.id;

                    return (
                      <React.Fragment key={call.id}>
                        <tr className="hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-stone-900 dark:text-stone-100">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[#C25E38] shrink-0" />
                              <span className="truncate max-w-[140px]">{call.agentName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 dark:text-stone-300">
                            <span className="truncate max-w-[100px] block">
                              {call.customerName || "غير محدد"}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-stone-500 dark:text-stone-400">
                            {call.duration}د
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold bg-amber-500/5 dark:bg-amber-500/10">
                            <span className={scorecard.sections.intro.score < 10 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {scorecard.sections.intro.score}
                            </span>
                            {scorecard.sections.intro.deduction > 0 && (
                              <span className="text-[10px] text-rose-500 block">(-{scorecard.sections.intro.deduction})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold bg-blue-500/5 dark:bg-blue-500/10">
                            <span className={scorecard.sections.skills.score < 35 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {scorecard.sections.skills.score}
                            </span>
                            {scorecard.sections.skills.deduction > 0 && (
                              <span className="text-[10px] text-rose-500 block">(-{scorecard.sections.skills.deduction})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold bg-indigo-500/5 dark:bg-indigo-500/10">
                            <span className={scorecard.sections.hold.score < 15 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {scorecard.sections.hold.score}
                            </span>
                            {scorecard.sections.hold.deduction > 0 && (
                              <span className="text-[10px] text-rose-500 block">(-{scorecard.sections.hold.deduction})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold bg-teal-500/5 dark:bg-teal-500/10">
                            <span className={scorecard.sections.closing.score < 10 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {scorecard.sections.closing.score}
                            </span>
                            {scorecard.sections.closing.deduction > 0 && (
                              <span className="text-[10px] text-rose-500 block">(-{scorecard.sections.closing.deduction})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 dark:bg-emerald-500/10">
                            5
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/5 dark:bg-purple-500/10">
                            25
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-sm bg-[#C25E38]/5 dark:bg-[#C25E38]/10">
                            <span className={`px-2 py-0.5 rounded-lg ${
                              scorecard.totalScore >= 85
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : scorecard.totalScore >= 70
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                            }`}>
                              {scorecard.totalScore}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setExpandedCallScorecardId(isExpanded ? null : call.id)}
                                className="py-1 px-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="تفصيل درجات البنود"
                              >
                                <span>{isExpanded ? "إغلاق" : "تفصيل"}</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectCall(call)}
                                className="py-1 px-2.5 bg-[#C25E38] hover:bg-[#A94E2C] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title={tReports.viewCallBtn || "عرض التفريغ"}
                              >
                                <span>{currentLang === "en" ? "View" : "عرض التفريغ"}</span>
                                <ChevronRight className={`w-3 h-3 ${currentLang === "ar" ? "rotate-180" : ""}`} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Detailed Scorecard Row */}
                        {isExpanded && (
                          <tr className="bg-[#FAF8F5]/80 dark:bg-stone-900/80">
                            <td colSpan={11} className="p-3 border-b border-[#EAE3D9] dark:border-stone-800">
                              <CallScorecardTable scorecard={scorecard} compact={false} showDetailsToggle={true} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Cards View with Scorecard Embedded in Each Card */
          filteredCalls.map((call) => {
            const isEditing = editingId === call.id;
            const isConfirmingDelete = confirmDeleteId === call.id;
            const scorecard = computeCallScorecard(call);

            return (
              <div
                key={call.id}
                className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 p-5 shadow-xs hover:border-[#C25E38]/30 transition-all space-y-4"
              >
                {/* Call Top Header: Colleague Name & Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE3D9] dark:border-stone-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-[#C25E38] border border-[#EAE3D9] dark:border-stone-700 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-[#C25E38]" />
                    </div>

                    <div className="space-y-0.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(call.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="py-1 px-2 text-xs font-bold bg-[#FAF8F5] dark:bg-stone-900 border border-[#C25E38] rounded-lg text-stone-900 dark:text-stone-100 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(call.id)}
                            className="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            title="حفظ"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                            title="إلغاء"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
                            {call.agentName}
                          </h3>
                          <button
                            type="button"
                            onClick={() => handleStartRename(call.id, call.agentName)}
                            className="text-stone-400 hover:text-[#C25E38] transition-colors p-0.5 cursor-pointer"
                            title="تعديل اسم الزميل"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {call.customerName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold border border-stone-200 dark:border-stone-700">
                              العميل: {call.customerName}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400 font-medium flex-wrap">
                        <span>{call.callDate}</span>
                        <span>•</span>
                        <span>المدة: {call.duration} د</span>
                        <span>•</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          محفوظة في التقارير ✓
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score & Actions */}
                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <span className="text-[10px] text-stone-400 font-medium block">
                        {tReports.scoreTitle}
                      </span>
                      <span className={`text-base font-black ${
                        scorecard.totalScore >= 85 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                      }`}>
                        {scorecard.totalScore}%
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectCall(call)}
                        className="py-1.5 px-3 bg-[#C25E38] hover:bg-[#A94E2C] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                        title={tReports.viewCallBtn}
                      >
                        <span>{currentLang === "en" ? "View" : "عرض التفريغ"}</span>
                        <ChevronRight className={`w-3.5 h-3.5 ${currentLang === "ar" ? "rotate-180" : ""}`} />
                      </button>

                      {call.fullResult && (
                        <button
                          type="button"
                          onClick={() => exportEvaluationToExcel(call.fullResult!)}
                          className="p-2 bg-stone-100 dark:bg-stone-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-stone-700 dark:text-stone-300 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer"
                          title={tReports.exportExcelBtn}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2 py-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => handleExecuteDeleteCall(call.id)}
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                            title="تأكيد حذف المكالمة"
                          >
                            {currentLang === "en" ? "Delete" : "تأكيد الحذف"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-[10px] font-bold cursor-pointer"
                            title="إلغاء"
                          >
                            {currentLang === "en" ? "Cancel" : "إلغاء"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(call.id)}
                          className="p-2 bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-stone-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                          title="حذف من السجل"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Brief Analysis Summary Cards (استشارة - هولد - شكوى) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 1. Consultation Summary */}
                  <div className={`p-3.5 rounded-xl border space-y-1.5 transition-colors ${
                    call.hasConsultation
                      ? "bg-teal-50/60 dark:bg-teal-950/20 border-teal-200/70 dark:border-teal-900/40"
                      : "bg-[#FAF8F5] dark:bg-stone-900/40 border-[#EAE3D9] dark:border-stone-800"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <Stethoscope className={`w-3.5 h-3.5 ${call.hasConsultation ? "text-teal-600" : "text-stone-400"}`} />
                        <span>{tReports.consultationTitle}</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        call.hasConsultation
                          ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/20"
                          : "bg-stone-200/60 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                      }`}>
                        {call.hasConsultation 
                          ? (currentLang === "en" ? "Consultation Present" : "بها استشارة")
                          : (currentLang === "en" ? "No Consultation" : "طلب مباشر")}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                      {call.consultationSummary}
                    </p>
                  </div>

                  {/* 2. Hold Summary */}
                  <div className={`p-3.5 rounded-xl border space-y-1.5 transition-colors ${
                    call.hasHold
                      ? "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200/70 dark:border-indigo-900/40"
                      : "bg-[#FAF8F5] dark:bg-stone-900/40 border-[#EAE3D9] dark:border-stone-800"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${call.hasHold ? "text-indigo-600" : "text-stone-400"}`} />
                        <span>{tReports.holdTitle}</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        call.hasHold
                          ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                          : "bg-stone-200/60 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                      }`}>
                        {call.hasHold 
                          ? (currentLang === "en" ? "Hold Detected" : "بها هولد")
                          : (currentLang === "en" ? "Zero Hold" : "بدون هولد")}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                      {call.holdSummary}
                    </p>
                  </div>

                  {/* 3. Customer Complaint Summary */}
                  <div className={`p-3.5 rounded-xl border space-y-1.5 transition-colors ${
                    call.hasComplaint
                      ? "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/50"
                      : "bg-[#FAF8F5] dark:bg-stone-900/40 border-[#EAE3D9] dark:border-stone-800"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 ${call.hasComplaint ? "text-rose-600" : "text-emerald-600"}`} />
                        <span>{tReports.complaintTitle}</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        call.hasComplaint
                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                      }`}>
                        {call.hasComplaint 
                          ? (currentLang === "en" ? "Complaint Alert" : "رصد شكوى")
                          : (currentLang === "en" ? "No Complaints" : "خالية من الشكاوى")}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                      {call.complaintSummary}
                    </p>
                  </div>
                </div>

                {/* Concise Call Scorecard Table */}
                <CallScorecardTable scorecard={scorecard} compact={true} showDetailsToggle={true} />

                {/* Tone Notes Footer strip */}
                {call.toneSummary && (
                  <div className="pt-2 border-t border-[#EAE3D9]/60 dark:border-stone-800/60 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 gap-2">
                    <span className="flex items-center gap-1.5 shrink-0 text-violet-700 dark:text-violet-300 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                      <span>{tReports.toneTitle}:</span>
                    </span>
                    <span className="truncate">{call.toneSummary}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
