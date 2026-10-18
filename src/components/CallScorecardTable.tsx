import React, { useState } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  HelpCircle,
  FileText,
  Percent
} from "lucide-react";
import { CallScorecard, ScorecardItem } from "../utils/qaScorecard";

interface CallScorecardTableProps {
  scorecard: CallScorecard;
  compact?: boolean;
  showDetailsToggle?: boolean;
}

export const CallScorecardTable: React.FC<CallScorecardTableProps> = ({
  scorecard,
  compact = false,
  showDetailsToggle = true,
}) => {
  const [showItemDetails, setShowItemDetails] = useState(!compact);
  const { sections, items, totalScore, maxTotalScore, ignoredObservations } = scorecard;

  const sectionRows = [
    { key: "intro", data: sections.intro, color: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20" },
    { key: "skills", data: sections.skills, color: "text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20" },
    { key: "hold", data: sections.hold, color: "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border-indigo-500/20" },
    { key: "closing", data: sections.closing, color: "text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/20" },
    { key: "update", data: sections.update, color: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
    { key: "action", data: sections.action, color: "text-purple-700 dark:text-purple-300 bg-purple-500/10 border-purple-500/20" },
  ];

  return (
    <div className="bg-[#FAF8F5] dark:bg-stone-900/60 rounded-xl border border-[#EAE3D9] dark:border-stone-800 p-3.5 space-y-3 text-xs transition-colors">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-[#EAE3D9] dark:border-stone-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#C25E38]/10 text-[#C25E38] flex items-center justify-center font-bold">
            <Percent className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-stone-900 dark:text-stone-100">
            جدول درجات المكالمة المختصر (المعيار المعتمد 100)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-[#EAE3D9] dark:border-stone-700 font-bold">
            <span className="text-[11px] text-stone-500 dark:text-stone-400">الإجمالي:</span>
            <span className={`text-sm font-black ${
              totalScore >= 85 ? "text-emerald-600 dark:text-emerald-400" : totalScore >= 70 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
            }`}>
              {totalScore} / {maxTotalScore}
            </span>
          </div>

          {showDetailsToggle && (
            <button
              type="button"
              onClick={() => setShowItemDetails(!showItemDetails)}
              className="py-1 px-2 text-[11px] font-bold text-[#C25E38] hover:bg-[#C25E38]/10 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{showItemDetails ? "إخفاء تفصيل البنود" : "عرض تفصيل البنود"}</span>
              {showItemDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Concise Sections Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b border-[#EAE3D9] dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 font-bold">
              <th className="py-1.5 px-2 text-start">القسم</th>
              <th className="py-1.5 px-2 text-center">الحد الأقصى</th>
              <th className="py-1.5 px-2 text-center">الخصومات</th>
              <th className="py-1.5 px-2 text-center">الدرجة المستحقة</th>
              <th className="py-1.5 px-2 text-start">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAE3D9]/60 dark:divide-stone-800/60 font-medium">
            {sectionRows.map(({ key, data, color }) => (
              <tr key={key} className="hover:bg-white/40 dark:hover:bg-stone-800/40 transition-colors">
                <td className="py-1.5 px-2 font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${color}`}>
                    {data.nameArabic}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center text-stone-600 dark:text-stone-300 font-mono">
                  {data.max}
                </td>
                <td className="py-1.5 px-2 text-center font-mono">
                  {data.deduction > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      -{data.deduction}
                    </span>
                  ) : (
                    <span className="text-stone-400">0</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-center font-bold font-mono text-stone-900 dark:text-stone-100">
                  <span className={data.score < data.max ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                    {data.score}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-start text-[11px]">
                  {data.fixed ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>ثابتة وكاملة</span>
                    </span>
                  ) : data.deduction === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>استيفاء كامل</span>
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>خصم {data.deduction}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {/* Total Row */}
            <tr className="bg-stone-100/80 dark:bg-stone-800/80 font-bold border-t-2 border-[#EAE3D9] dark:border-stone-700">
              <td className="py-2 px-2 text-stone-900 dark:text-stone-100">
                المجموع الكلي النهائي
              </td>
              <td className="py-2 px-2 text-center font-mono text-stone-900 dark:text-stone-100">
                {maxTotalScore}
              </td>
              <td className="py-2 px-2 text-center font-mono text-rose-600 dark:text-rose-400">
                -{maxTotalScore - totalScore}
              </td>
              <td className="py-2 px-2 text-center font-mono text-sm text-stone-900 dark:text-stone-100">
                <span className={totalScore >= 85 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {totalScore}
                </span>
              </td>
              <td className="py-2 px-2 text-[11px]">
                <span className={`px-2 py-0.5 rounded font-bold ${
                  totalScore >= 85
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : totalScore >= 70
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                }`}>
                  {totalScore >= 85 ? "مكالمة ممتازة" : totalScore >= 70 ? "مكالمة مقبولة" : "تحتاج تدريب ومراجعة"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detailed Items Breakdown (Collapsible) */}
      {showItemDetails && (
        <div className="pt-2 border-t border-[#EAE3D9] dark:border-stone-800 space-y-2">
          <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300 font-bold text-[11px]">
            <FileText className="w-3.5 h-3.5 text-[#C25E38]" />
            <span>تفصيل البنود الـ 11 المحسوبة:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-2 rounded-lg border text-[11px] space-y-1 transition-colors ${
                  !item.applicable
                    ? "bg-stone-50 dark:bg-stone-900/30 border-stone-200 dark:border-stone-800 text-stone-400"
                    : item.deduction > 0
                    ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-stone-800 dark:text-stone-200"
                    : "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40 text-stone-800 dark:text-stone-200"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-bold truncate">{item.titleArabic}</span>
                  <span className="shrink-0 font-mono font-bold">
                    {!item.applicable ? (
                      <span className="text-[10px] text-stone-400">لا ينطبق</span>
                    ) : item.deduction > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 text-[10px]">خصم {item.deduction}</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">مستوفى ✓</span>
                    )}
                  </span>
                </div>
                {item.details && (
                  <p className="text-[10px] text-stone-600 dark:text-stone-400 leading-tight">
                    {item.details}
                  </p>
                )}
                {item.evidence && item.evidence.length > 0 && item.evidence[0].quote && (
                  <div className="text-[9px] text-stone-500 dark:text-stone-400 italic bg-white/60 dark:bg-stone-800/60 px-1.5 py-0.5 rounded">
                    «{item.evidence[0].quote}»
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Ignored observations notice */}
          {ignoredObservations && ignoredObservations.length > 0 && (
            <div className="pt-1">
              {ignoredObservations.map((obs, idx) => (
                <div key={idx} className="text-[10px] text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/50 p-2 rounded-lg flex items-start gap-1.5">
                  <HelpCircle className="w-3 h-3 text-stone-400 shrink-0 mt-0.5" />
                  <span>{obs.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
