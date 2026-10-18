import React, { useState, useMemo } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Sliders, 
  Eye, 
  EyeOff, 
  Search, 
  Filter, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Percent, 
  Layers, 
  Play,
  Volume2,
  Music,
  VolumeX,
  AlertTriangle,
  User,
  Award,
  Activity,
  Headphones,
  Heart,
  Sparkles,
  PhoneOff,
  Stethoscope,
  FlaskConical,
  MessageSquare,
  ShieldCheck,
  Check
} from "lucide-react";
import { TranscriptionResponse, MeasurementItemSetting, MeasurementItemId } from "../types";
import { computeCallScorecard, CallScorecard, ScorecardItem } from "../utils/qaScorecard";
import { Language } from "../utils/translations";

export interface CriterionRowData {
  id: string;
  measurementId: MeasurementItemId | "update_fixed" | "action_fixed";
  titleArabic: string;
  titleEn: string;
  category: "acoustic" | "protocol" | "customer_experience" | "pharma" | "system";
  categoryArabic: string;
  standardDescription: string;
  timingRuleArabic: string;
  measurementMethodArabic: string;
  weightLabel: string;
  maxScore: number;
  sectionArabic: string;
  // Dynamic measured values (if call result is present)
  isApplicable: boolean;
  isCompliant: boolean;
  scoreAwarded?: number;
  deduction?: number;
  resultStatusArabic: string;
  resultDetails?: string;
  evidenceQuotes?: { time?: string; quote?: string }[];
  detectedTimestamps?: string[];
  visible: boolean;
}

interface CallQualityCriteriaViewProps {
  result: TranscriptionResponse | null;
  measurementSettings: MeasurementItemSetting[];
  onToggleSingleMeasurement?: (id: MeasurementItemId) => void;
  onOpenCriteriaModal?: () => void;
  language?: Language;
  onSeekAudio?: (timeStr: string) => void;
  playbackUrl?: string | null;
}

export const CallQualityCriteriaView: React.FC<CallQualityCriteriaViewProps> = ({
  result,
  measurementSettings,
  onToggleSingleMeasurement,
  onOpenCriteriaModal,
  language = "ar",
  onSeekAudio,
  playbackUrl,
}) => {
  const currentLang = language || "ar";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | "compliant" | "deducted" | "na">("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Compute official 100-point rubric scorecard if call result exists
  const scorecard: CallScorecard | null = useMemo(() => {
    if (!result) return null;
    try {
      return computeCallScorecard(result);
    } catch (e) {
      console.error("Failed to compute call scorecard:", e);
      return null;
    }
  }, [result]);

  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    measurementSettings.forEach((s) => map.set(s.id, s.visible));
    map.set("update_fixed", true);
    map.set("action_fixed", true);
    return map;
  }, [measurementSettings]);

  // Construct standardized criteria items combining predefined definitions and actual measured values
  const allCriteriaRows: CriterionRowData[] = useMemo(() => {
    // 1. Greeting
    const isGreetingUsed = Boolean(result?.greetingAnalysis?.isGreetingUsed);
    const greetingTime = result?.greetingAnalysis?.greetingTimestamps?.[0] || result?.greetingAnalysis?.agentStartSecond || "00:02";
    const greetingSnippet = result?.greetingAnalysis?.greetingTextSnippet || "";

    // 2. Intro Smile
    const smileTraits = result?.agentToneAnalysis?.detectedTraits || [];
    const smileEvalDetails = scorecard?.items.find((i) => i.id === "intro_smile");
    const introSmileMet = smileEvalDetails ? smileEvalDetails.met : false;

    // 3. Call Tone
    const toneItem = scorecard?.items.find((i) => i.id === "tone");

    // 4. Silence
    const silenceItem = scorecard?.items.find((i) => i.id === "silence");
    const silenceSegments = result?.agentSilenceSummary?.silenceSegments || [];
    const totalSilenceSec = Math.round(result?.agentSilenceSummary?.totalSilenceSeconds || 0);

    // 5. Customer Name & Title
    const nameCount = Number(result?.customerNameAnalysis?.mentionCount || 0);
    const titleCount = Number(result?.customerTitleAnalysis?.titleMentionCount || 0);
    const totalNameAndTitle = nameCount + titleCount;
    const nameItem = scorecard?.items.find((i) => i.id === "customer_name_title");

    // 6. Apology
    const hasComplaint = Boolean(result?.customerComplaintAnalysis?.hasComplaint);
    const apologyItem = scorecard?.items.find((i) => i.id === "apology_complaint");

    // 7. Medical Consultation
    const hasConsultation = Boolean(result?.medicalConsultationAnalysis?.isMedicalConsultationPresent);
    const consultItem = scorecard?.items.find((i) => i.id === "consultation");

    // 8. Empathy
    const empathyItem = scorecard?.items.find((i) => i.id === "empathy");

    // 9. Verbal Tics
    const ticsItem = scorecard?.items.find((i) => i.id === "verbal_tics");
    const detectedTics = result?.verbalTicsAnalysis?.detectedTics || [];

    // 10. Hold Time
    const holdItem = scorecard?.items.find((i) => i.id === "hold");
    const totalHoldSec = Number(result?.holdTimeSummary?.totalHoldSeconds || 0);
    const holdSegments = result?.holdTimeSummary?.holdSegments || [];

    // 11. Further Assistance
    const assistanceItem = scorecard?.items.find((i) => i.id === "further_assistance");
    const isAssistOffered = Boolean(result?.furtherAssistanceAnalysis?.isAssistanceOffered);

    // 12. Call Ending
    const endingItem = scorecard?.items.find((i) => i.id === "closing_phrase");
    const isEndingUsed = Boolean(result?.callEndingAnalysis?.isEndingPhraseUsed);

    // 13. Unprofessional Words
    const hasUnprof = Boolean(result?.unprofessionalWordsAnalysis?.hasUnprofessionalWords);
    const unprofWords = result?.unprofessionalWordsAnalysis?.detectedWords || [];

    // 14. Scientific Knowledge / Medscape
    const hasScientific = Boolean(result?.agentScientificKnowledge?.hasScientificDiscussion);
    const medsMentioned = result?.agentScientificKnowledge?.medicationsMentioned || [];

    const rows: CriterionRowData[] = [
      {
        id: "crit-greeting",
        measurementId: "greeting",
        titleArabic: "التحية والافتتاحية وسرعة الرد",
        titleEn: "Greeting & Opening",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "المقدمة (10)",
        standardDescription: "بدء المكالمة بالترحيب الرسمي المعتمد، وذكر اسم صيدليات الطرشوبي واسم الموظف، وسرعة الرد خلال أول 3 ثوانٍ.",
        timingRuleArabic: "أول 3 ثوانٍ من المكالمة (الافتتاحية)",
        measurementMethodArabic: "التحقق الصوتي من توقيت بدء صوت الموظف ومطابقة عبارة الترحيب واسم الصيدلية في المقاطع الافتتاحية الأولى.",
        weightLabel: "2 درجة (من 10)",
        maxScore: 2,
        isApplicable: true,
        isCompliant: result ? isGreetingUsed : true,
        scoreAwarded: result ? (isGreetingUsed ? 2 : 0) : undefined,
        deduction: result ? (isGreetingUsed ? 0 : 2) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : isGreetingUsed ? "مستوفى بنجاح ✓" : "غير مستوفى (خصم 2)",
        resultDetails: result
          ? isGreetingUsed
            ? `بدأ الموظف بالترحيب المعتمد بالتوقيت (${greetingTime})`
            : "لم يبدأ الموظف المكالمة بالترحيب المعتمد"
          : undefined,
        evidenceQuotes: result && greetingSnippet ? [{ time: greetingTime, quote: greetingSnippet }] : [],
        detectedTimestamps: result?.greetingAnalysis?.greetingTimestamps || [],
        visible: visibilityMap.get("greeting") ?? true,
      },
      {
        id: "crit-intro-smile",
        measurementId: "agentTone",
        titleArabic: "نبرة الابتسامة في الترحيب والمقدمة",
        titleEn: "Intro Smile Tone",
        category: "acoustic",
        categoryArabic: "التحليل الصوتي",
        sectionArabic: "المقدمة (10)",
        standardDescription: "اتسام نبرة صوت الموظف في المقدمة والترحيب بالبشاشة والابتسامة المعتمدة بنسبة تتجاوز 70% (> 70%).",
        timingRuleArabic: "الثواني الأولى أثناء الترحيب المبدئي",
        measurementMethodArabic: "تحليل ترددات النبرة الصوتية عبر Wav2Vec2/التحليل الصوتي، ولا تُعتمد الابتسامة إلا بعد تخطي النسبة 70%، وإلا يُخصم درجتان.",
        weightLabel: "2 درجة (من 10)",
        maxScore: 2,
        isApplicable: true,
        isCompliant: result ? introSmileMet : true,
        scoreAwarded: result ? (introSmileMet ? 2 : 0) : undefined,
        deduction: result ? (introSmileMet ? 0 : 2) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : introSmileMet ? "مستوفى بنجاح ✓" : "غير مستوفى (خصم 2)",
        resultDetails: result
          ? introSmileMet
            ? `نبرة معتمدة وبها ابتسامة بنسبة تتجاوز 70%`
            : `عدم اعتماد نبرة الابتسامة لعدم تجاوز نسبة 70% (خصم 2 في المقدمة)`
          : undefined,
        evidenceQuotes: result?.agentToneAnalysis?.introductionSummary
          ? [{ quote: result.agentToneAnalysis.introductionSummary }]
          : [],
        detectedTimestamps: [],
        visible: visibilityMap.get("agentTone") ?? true,
      },
      {
        id: "crit-call-tone",
        measurementId: "agentTone",
        titleArabic: "نبرة الصوت والابتسامة أثناء المكالمة",
        titleEn: "Voice Tone & Emotion",
        category: "acoustic",
        categoryArabic: "التحليل الصوتي",
        sectionArabic: "المهارات (35)",
        standardDescription: "الحفاظ على نبرة ودودة ومبتسمة بنسبة تفوق 70%، وخلو الصوت من الحدة أو البرود أو الرتابة أو التردد.",
        timingRuleArabic: "طوال مجريات المكالمة",
        measurementMethodArabic: "فحص نبرة الصوت المعتمدة بنسبة > 70%، ورصد أي عيوب نبرة (خصم درجتان لعدم تجاوز الابتسامة 70% ودرجة لكل عيب بحد أقصى 5).",
        weightLabel: "5 درجات (من 35)",
        maxScore: 5,
        isApplicable: true,
        isCompliant: result ? (toneItem?.deduction === 0) : true,
        scoreAwarded: result ? Math.max(0, 5 - (toneItem?.deduction || 0)) : undefined,
        deduction: result ? (toneItem?.deduction || 0) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : (toneItem?.deduction === 0) ? "مستوفى بنجاح ✓" : `به خصم (-${toneItem?.deduction})`,
        resultDetails: toneItem?.details,
        evidenceQuotes: result?.agentToneAnalysis?.callSummary ? [{ quote: result.agentToneAnalysis.callSummary }] : [],
        detectedTimestamps: [],
        visible: visibilityMap.get("agentTone") ?? true,
      },
      {
        id: "crit-silence",
        measurementId: "silence",
        titleArabic: "فترات الصمت المفرط (خارج الهولد)",
        titleEn: "Excessive Silence",
        category: "acoustic",
        categoryArabic: "التحليل الصوتي",
        sectionArabic: "المهارات (35)",
        standardDescription: "تجنب فترات الصمت التام غير المبرر على الخط خارج الهولد، وألا تتجاوز فترة التوقف أثناء فحص النظام 15 ثانية.",
        timingRuleArabic: "أثناء الحديث وفحص السيستم",
        measurementMethodArabic: "رصد فترات الصمت التام (>15 ثانية) وتطبيق شرائح الخصم المقررة (15-24ث: -1، 25-39ث: -2، 40-49ث: -4، 50-59ث: -6، >=60ث: -10).",
        weightLabel: "شرائح خصم حتى 10 (من 35)",
        maxScore: 10,
        isApplicable: true,
        isCompliant: result ? (silenceItem?.deduction === 0) : true,
        scoreAwarded: result ? Math.max(0, 10 - (silenceItem?.deduction || 0)) : undefined,
        deduction: result ? (silenceItem?.deduction || 0) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : (silenceItem?.deduction === 0) ? "مستوفى بنجاح ✓" : `به خصم (-${silenceItem?.deduction})`,
        resultDetails: result
          ? (silenceItem?.deduction === 0)
            ? "لا توجد فترات صمت مفرطة تتجاوز 15 ثانية"
            : `رُصدت فترات صمت بإجمالي ${totalSilenceSec} ثانية (خصم ${silenceItem?.deduction} درجات)`
          : undefined,
        evidenceQuotes: silenceSegments.filter((s) => (s.duration || 0) > 15).map((s) => ({
          time: s.timeStart,
          quote: `صمت مدته ${Math.round(s.duration || 0)} ثانية (${s.timeStart} ← ${s.timeEnd})`,
        })),
        detectedTimestamps: silenceSegments.map((s) => s.timeStart || ""),
        visible: visibilityMap.get("silence") ?? true,
      },
      {
        id: "crit-name-title",
        measurementId: "customerName",
        titleArabic: "مناداة اسم العميل ولقبه المفضل",
        titleEn: "Customer Name & Title",
        category: "customer_experience",
        categoryArabic: "تجربة العميل",
        sectionArabic: "المهارات (35)",
        standardDescription: "مناداة العميل باسمه الشخصي أو لقبه الوقور المعتمد 4 مرات فأكثر خلال المكالمة (استبعاد يا فندم وحدها وحظر اعتماد حاجة كلقب).",
        timingRuleArabic: "موزعاً على مدار المكالمة",
        measurementMethodArabic: "حصر عدد مرات مناداة الموظف للعميل بالاسم أو اللقب الصريح، والتحقق من بلوغ 4 مرات فأكثر لتفادي خصم درجتين.",
        weightLabel: "2 درجة (من 35)",
        maxScore: 2,
        isApplicable: true,
        isCompliant: result ? totalNameAndTitle >= 4 : true,
        scoreAwarded: result ? (totalNameAndTitle >= 4 ? 2 : 0) : undefined,
        deduction: result ? (totalNameAndTitle >= 4 ? 0 : 2) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : totalNameAndTitle >= 4 ? "مستوفى بنجاح ✓" : "غير مستوفى (خصم 2)",
        resultDetails: result
          ? totalNameAndTitle >= 4
            ? `تم ذكر الاسم واللقب ${totalNameAndTitle} مرات (مستوفى الشرط)`
            : `تم الذكر ${totalNameAndTitle} مرات فقط (أقل من 4، خصم درجتين)`
          : undefined,
        evidenceQuotes: result?.customerNameAnalysis?.nameSnippet
          ? [{ quote: result.customerNameAnalysis.nameSnippet }]
          : [],
        detectedTimestamps: [
          ...(result?.customerNameAnalysis?.mentionsTimestamps || []),
          ...(result?.customerTitleAnalysis?.titleMentionsTimestamps || []),
        ],
        visible: visibilityMap.get("customerName") ?? true,
      },
      {
        id: "crit-apology",
        measurementId: "apology",
        titleArabic: "الاعتذار الصريح عند وجود شكوى أو تأخير",
        titleEn: "Apology for Complaint",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "المهارات (35)",
        standardDescription: "تقديم اعتذار صريح وواضح للعميل فور إبداء أي شكوى أو اعتراض أو انزعاج من الخدمة أو التأخير.",
        timingRuleArabic: "فور إبداء العميل للشكوى",
        measurementMethodArabic: "التحقق من وجود شكوى مسجلة، ثم مطابقة عبارة الاعتذار الصريحة في كلام الموظف (خصم 4 درجات في حال غياب الاعتذار).",
        weightLabel: "4 درجات (من 35)",
        maxScore: 4,
        isApplicable: result ? hasComplaint : true,
        isCompliant: result ? (apologyItem ? apologyItem.met : true) : true,
        scoreAwarded: result ? (hasComplaint ? (apologyItem?.met ? 4 : 0) : 4) : undefined,
        deduction: result ? (hasComplaint ? (apologyItem?.met ? 0 : 4) : 0) : undefined,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : !hasComplaint
          ? "لا ينطبق (بدون شكوى)"
          : apologyItem?.met
          ? "مستوفى بنجاح ✓"
          : "غير مستوفى (خصم 4)",
        resultDetails: apologyItem?.details,
        evidenceQuotes: result?.customerComplaintAnalysis?.summaryText
          ? [{ quote: result.customerComplaintAnalysis.summaryText }]
          : [],
        detectedTimestamps: (result?.customerComplaintAnalysis?.detectedComplaints || [])
          .map((c) => c.timestamp)
          .filter(Boolean) as string[],
        visible: visibilityMap.get("apology") ?? true,
      },
      {
        id: "crit-consultation",
        measurementId: "medicalConsultation",
        titleArabic: "بروتوكول الاستشارة الطبية (8 أسئلة)",
        titleEn: "Medical Consultation Protocol",
        category: "pharma",
        categoryArabic: "المعايير الصيدلانية",
        sectionArabic: "المهارات (35)",
        standardDescription: "طرح الأسئلة الاستقصائية الإلزامية الثمانية لبروتوكول الاستشارة عند طلب العميل نصيحة أو علاجاً لأعراض مرضية.",
        timingRuleArabic: "عند طلب العميل نصيحة لأعراض مرضية",
        measurementMethodArabic: "التحقق من شرط طلب الاستشارة، وفحص طرح أسئلة البروتوكول الثمانية (خصم درجة واحدة لكل سؤال مفقود بحد أقصى 8).",
        weightLabel: "8 درجات (من 35)",
        maxScore: 8,
        isApplicable: result ? hasConsultation : true,
        isCompliant: result ? (consultItem ? consultItem.deduction === 0 : true) : true,
        scoreAwarded: result ? (hasConsultation ? Math.max(0, 8 - (consultItem?.deduction || 0)) : 8) : undefined,
        deduction: result ? (hasConsultation ? (consultItem?.deduction || 0) : 0) : undefined,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : !hasConsultation
          ? "لا ينطبق (طلب مباشر لصنف)"
          : consultItem?.deduction === 0
          ? "مستوفى بنجاح ✓"
          : `به خصم (-${consultItem?.deduction})`,
        resultDetails: consultItem?.details,
        evidenceQuotes: result?.medicalConsultationAnalysis?.customerSymptomSnippet
          ? [{ quote: result.medicalConsultationAnalysis.customerSymptomSnippet }]
          : [],
        detectedTimestamps: [],
        visible: visibilityMap.get("medicalConsultation") ?? true,
      },
      {
        id: "crit-empathy",
        measurementId: "empathy",
        titleArabic: "إظهار التعاطف الصريح مع العميل",
        titleEn: "Empathy Expressions",
        category: "customer_experience",
        categoryArabic: "تجربة العميل",
        sectionArabic: "المهارات (35)",
        standardDescription: "التعبير عن التعاطف الإنساني والدعاء بالشفاء والسلامة (ألف سلامة / بالشفاء) عند تعبير العميل عن مرض أو ألم أو شكوى.",
        timingRuleArabic: "عند ذكر العميل لأعراض مرض أو شكوى",
        measurementMethodArabic: "فحص استدعاء سياق المكالمة للتعاطف، والتحقق من نطق الموظف لعبارات التعاطف المعتمدة (خصم 3 درجات إذا استدعت ولم يظهره).",
        weightLabel: "3 درجات (من 35)",
        maxScore: 3,
        isApplicable: result ? (empathyItem ? empathyItem.applicable : true) : true,
        isCompliant: result ? (empathyItem ? empathyItem.met : true) : true,
        scoreAwarded: result ? (empathyItem?.applicable ? (empathyItem.met ? 3 : 0) : 3) : undefined,
        deduction: result ? (empathyItem?.applicable ? (empathyItem.met ? 0 : 3) : 0) : undefined,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : empathyItem?.applicable
          ? empathyItem.met
            ? "مستوفى بنجاح ✓"
            : "غير مستوفى (خصم 3)"
          : "لا ينطبق (استفسار اعتيادي)",
        resultDetails: empathyItem?.details,
        evidenceQuotes: result?.empathyAnalysis?.empathyTextSnippet
          ? [{ quote: result.empathyAnalysis.empathyTextSnippet }]
          : [],
        detectedTimestamps: result?.empathyAnalysis?.empathyTimestamps || [],
        visible: visibilityMap.get("empathy") ?? true,
      },
      {
        id: "crit-verbal-tics",
        measurementId: "verbalTics",
        titleArabic: "اللازمات اللفظية وتكرار الأسئلة",
        titleEn: "Verbal Tics & Repetition",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "المهارات (35)",
        standardDescription: "خلو الحديث من اللازمات اللفظية المتكررة غير المبررة (مثل تكرار تمام، ماشي) وعدم تكرار نفس السؤال بلا داعٍ.",
        timingRuleArabic: "طوال مجريات المكالمة",
        measurementMethodArabic: "رصد الكلمات المكررة كـ لازمات لفظية للموظف حصراً، وتطبيق خصم درجتين عن كل لازمة مستقلة بغض النظر عن تكرارها.",
        weightLabel: "خصم درجتان لكل لازمة (من 35)",
        maxScore: 10,
        isApplicable: true,
        isCompliant: result ? (ticsItem?.deduction === 0) : true,
        scoreAwarded: result ? Math.max(0, 10 - (ticsItem?.deduction || 0)) : undefined,
        deduction: result ? (ticsItem?.deduction || 0) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : (ticsItem?.deduction === 0) ? "مستوفى بنجاح ✓" : `به خصم (-${ticsItem?.deduction})`,
        resultDetails: ticsItem?.details,
        evidenceQuotes: detectedTics.map((t) => ({ quote: `لازمة "${t.word}" (${t.count}x)` })),
        detectedTimestamps: [],
        visible: visibilityMap.get("verbalTics") ?? true,
      },
      {
        id: "crit-hold-time",
        measurementId: "holdTime",
        titleArabic: "شروط ومدة الهولد وموسيقى الانتظار",
        titleEn: "Hold Time & Music Audit",
        category: "acoustic",
        categoryArabic: "التحليل الصوتي",
        sectionArabic: "الهولد (15)",
        standardDescription: "الاستئذان قبل الهولد والشكر بعده، ووجود نغمة موسيقى انتظار كشرط إلزامي، وألا يتعدى إجمالي الهولد 90 ثانية وبداعي فني فقط.",
        timingRuleArabic: "عند الحاجة لمراجعة الفرع أو السيستم",
        measurementMethodArabic: "التحقق الصوتي الصارم من موسيقى الانتظار، واحتساب المدة الكلية وتطبيق شرائح الخصم (<=90ث: 0، <=150ث: -5، <=180ث: -10، >180ث: -15، بدون داعٍ: -5).",
        weightLabel: "15 درجة (قسم مستقل)",
        maxScore: 15,
        isApplicable: true,
        isCompliant: result ? (holdItem?.deduction === 0) : true,
        scoreAwarded: result ? Math.max(0, 15 - (holdItem?.deduction || 0)) : undefined,
        deduction: result ? (holdItem?.deduction || 0) : undefined,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : (holdItem?.deduction === 0)
          ? "مستوفى بنجاح ✓"
          : `به خصم (-${holdItem?.deduction})`,
        resultDetails: holdItem?.details,
        evidenceQuotes: holdSegments.map((h) => ({
          time: h.timeStart,
          quote: `هولد مدته ${h.duration}ث (${h.classification || "بداعي"})`,
        })),
        detectedTimestamps: holdSegments.map((h) => h.timeStart || ""),
        visible: visibilityMap.get("holdTime") ?? true,
      },
      {
        id: "crit-further-assist",
        measurementId: "furtherAssistance",
        titleArabic: "عرض خدمات ومساعدات أخرى",
        titleEn: "Further Assistance Offer",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "الإنهاء (10)",
        standardDescription: "السؤال عن تقديم أي خدمة أو إضافة أخرى حصرياً بعد مراجعة تفاصيل الطلب والإجمالي وقبل ختام المكالمة.",
        timingRuleArabic: "بعد مراجعة الأوردر والإجمالي وقبل الختام",
        measurementMethodArabic: "التحقق من نطق سؤال المساعدة الإضافية في موضعه الزمني الصحيح بعد انتهاء تفاصيل الطلب (خصم 3 درجات عند الإغفال).",
        weightLabel: "3 درجات (من 10)",
        maxScore: 3,
        isApplicable: true,
        isCompliant: result ? isAssistOffered : true,
        scoreAwarded: result ? (isAssistOffered ? 3 : 0) : undefined,
        deduction: result ? (isAssistOffered ? 0 : 3) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : isAssistOffered ? "مستوفى بنجاح ✓" : "غير مستوفى (خصم 3)",
        resultDetails: assistanceItem?.details,
        evidenceQuotes: result?.furtherAssistanceAnalysis?.assistanceTextSnippet
          ? [{ quote: result.furtherAssistanceAnalysis.assistanceTextSnippet }]
          : [],
        detectedTimestamps: result?.furtherAssistanceAnalysis?.assistanceTimestamps || [],
        visible: visibilityMap.get("furtherAssistance") ?? true,
      },
      {
        id: "crit-call-ending",
        measurementId: "callEnding",
        titleArabic: "عبارة الختام المعتمدة",
        titleEn: "Call Ending Phrase",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "الإنهاء (10)",
        standardDescription: "إنهاء المكالمة بالصيغة الرسمية المقررة الموثقة حصرياً (شرفتنا / شرفتني / شكراً للتواصل) واستبعاد الصيغ الوداعية الأخرى.",
        timingRuleArabic: "ختام المكالمة (آخر 10 ثوانٍ)",
        measurementMethodArabic: "مطابقة ألفاظ الختام المنطوقة من الموظف مع الصيغ المعتمدة المحددة بنص المكالمة واستبعاد العبارات غير المتفق عليها.",
        weightLabel: "3 درجات (من 10)",
        maxScore: 3,
        isApplicable: true,
        isCompliant: result ? isEndingUsed : true,
        scoreAwarded: result ? (isEndingUsed ? 3 : 0) : undefined,
        deduction: result ? (isEndingUsed ? 0 : 3) : undefined,
        resultStatusArabic: !result ? "معيار معتمد" : isEndingUsed ? "مستوفى بنجاح ✓" : "غير مستوفى (خصم 3)",
        resultDetails: endingItem?.details,
        evidenceQuotes: result?.callEndingAnalysis?.endingTextSnippet
          ? [{ quote: result.callEndingAnalysis.endingTextSnippet }]
          : [],
        detectedTimestamps: result?.callEndingAnalysis?.lastSpokenTimestamp
          ? [result.callEndingAnalysis.lastSpokenTimestamp]
          : [],
        visible: visibilityMap.get("callEnding") ?? true,
      },
      {
        id: "crit-update-fixed",
        measurementId: "update_fixed",
        titleArabic: "تحديث بيانات النظام (UPDATE)",
        titleEn: "System Update",
        category: "system",
        categoryArabic: "إجراءات النظام",
        sectionArabic: "تحديث النظام (5)",
        standardDescription: "تسجيل وتحديث بيانات العميل والطلب ومراجعة العناوين على سيستم الصيدلية.",
        timingRuleArabic: "أثناء وبعد تنفيذ الأوردر",
        measurementMethodArabic: "معيار تشغيلي ثابت معتمد بالنظام برصيد كامل لجميع المكالمات المسجلة.",
        weightLabel: "5 درجات (ثابتة وكاملة)",
        maxScore: 5,
        isApplicable: true,
        isCompliant: true,
        scoreAwarded: 5,
        deduction: 0,
        resultStatusArabic: "كاملة وثابتة (5/5) ✓",
        resultDetails: "درجة ثابتة ومستوفاة دائماً في النظام (5/5)",
        evidenceQuotes: [],
        detectedTimestamps: [],
        visible: true,
      },
      {
        id: "crit-action-fixed",
        measurementId: "action_fixed",
        titleArabic: "إجراء وتنفيذ الطلب (ACTION)",
        titleEn: "Order Action",
        category: "system",
        categoryArabic: "إجراءات النظام",
        sectionArabic: "إجراء الطلب (25)",
        standardDescription: "استلام أصناف الطلب ومراجعة توافرها وتوجيهها للمسار الصحيح بالتوصيل أو التجهيز.",
        timingRuleArabic: "خلال مسار المكالمة",
        measurementMethodArabic: "معيار تشغيلي ثابت معتمد بالنظام برصيد كامل لجميع المكالمات الموثقة.",
        weightLabel: "25 درجة (ثابتة وكاملة)",
        maxScore: 25,
        isApplicable: true,
        isCompliant: true,
        scoreAwarded: 25,
        deduction: 0,
        resultStatusArabic: "كاملة وثابتة (25/25) ✓",
        resultDetails: "درجة ثابتة ومستوفاة دائماً في النظام (25/25)",
        evidenceQuotes: [],
        detectedTimestamps: [],
        visible: true,
      },
      {
        id: "crit-unprofessional-words",
        measurementId: "unprofessionalWords",
        titleArabic: "الألفاظ غير الاحترافية أو الدارجة",
        titleEn: "Unprofessional Words Filter",
        category: "protocol",
        categoryArabic: "بروتوكول المكالمة",
        sectionArabic: "ملاحظات الجودة",
        standardDescription: "التزام التحدث بلغة مهنية فصحى أو عامية مهذبة وتجنب الألفاظ العامية المحظورة (مثل: معنديش معلومة، اركن، اللى هو).",
        timingRuleArabic: "طوال مجريات المكالمة",
        measurementMethodArabic: "مطابقة قائمة الكلمات العامية المحظورة في كلام الموظف حصراً واستبعاد كلام العميل ورصد التنبيهات الموجهة.",
        weightLabel: "بند رقابي (ملاحظة تدريبية)",
        maxScore: 0,
        isApplicable: true,
        isCompliant: result ? !hasUnprof : true,
        scoreAwarded: 0,
        deduction: 0,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : !hasUnprof
          ? "خالٍ من الألفاظ العامية ✓"
          : `رُصدت ${unprofWords.length} ألفاظ عامية`,
        resultDetails: result
          ? !hasUnprof
            ? "التزم الموظف بلغة مهنية واحترافية طوال المكالمة"
            : `رُصد استخدام ألفاظ عامية: (${unprofWords.map((w) => w.word).join("، ")})`
          : undefined,
        evidenceQuotes: unprofWords.map((w) => ({
          time: w.timestamps?.[0],
          quote: `لفظ "${w.word}": ${w.contextSnippet || ""}`,
        })),
        detectedTimestamps: unprofWords.flatMap((w) => w.timestamps || []),
        visible: visibilityMap.get("unprofessionalWords") ?? true,
      },
      {
        id: "crit-scientific-knowledge",
        measurementId: "scientificKnowledge",
        titleArabic: "المعرفة الصيدلانية وتدقيق Medscape",
        titleEn: "Pharma Scientific Knowledge",
        category: "pharma",
        categoryArabic: "المعايير الصيدلانية",
        sectionArabic: "ملاحظات الجودة",
        standardDescription: "التعامل العلمي الصحيح مع الأصناف الطبية والبدائل المسجلة ومطابقة الجرعات والمواد الفعالة واستئذان العميل عند ترشيح أي بديل.",
        timingRuleArabic: "أثناء مناقشة واستفسار الأدوية",
        measurementMethodArabic: "فحص النقاش العلمي الصيدلاني وتدقيق استئذان العميل وموافقته المسبقة قبل استبدال أي صنف دوائي.",
        weightLabel: "بند تدقيق صيدلاني",
        maxScore: 0,
        isApplicable: true,
        isCompliant: true,
        scoreAwarded: 0,
        deduction: 0,
        resultStatusArabic: !result
          ? "معيار معتمد"
          : hasScientific
          ? "تم نقاش علمي صيدلاني ✓"
          : "طلب اعتيادي للأصناف ✓",
        resultDetails: result
          ? `الأصناف المذكورة: ${medsMentioned.length > 0 ? medsMentioned.join("، ") : "لا يوجد"}`
          : undefined,
        evidenceQuotes: [],
        detectedTimestamps: [],
        visible: visibilityMap.get("scientificKnowledge") ?? true,
      },
    ];

    return rows;
  }, [result, scorecard, visibilityMap]);

  // Filter rows based on search, category, and status
  const filteredRows = useMemo(() => {
    return allCriteriaRows.filter((row) => {
      // Must be visible in settings
      if (!row.visible) return false;

      // Category filter
      if (selectedCategory !== "all" && row.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatusFilter === "compliant" && !row.isCompliant) return false;
      if (selectedStatusFilter === "deducted" && (row.deduction || 0) <= 0) return false;
      if (selectedStatusFilter === "na" && row.isApplicable) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchTitle = row.titleArabic.toLowerCase().includes(q) || row.titleEn.toLowerCase().includes(q);
        const matchStd = row.standardDescription.toLowerCase().includes(q);
        const matchTiming = row.timingRuleArabic.toLowerCase().includes(q);
        const matchMethod = row.measurementMethodArabic.toLowerCase().includes(q);
        const matchRes = (row.resultDetails || "").toLowerCase().includes(q) || row.resultStatusArabic.toLowerCase().includes(q);
        return matchTitle || matchStd || matchTiming || matchMethod || matchRes;
      }

      return true;
    });
  }, [allCriteriaRows, selectedCategory, selectedStatusFilter, searchQuery]);

  const toggleRowExpanded = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const getCategoryBadgeClass = (category: CriterionRowData["category"]) => {
    switch (category) {
      case "acoustic":
        return "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-900/40";
      case "protocol":
        return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/40";
      case "customer_experience":
        return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/40";
      case "pharma":
        return "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200/60 dark:border-teal-900/40";
      case "system":
        return "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/60 dark:border-purple-900/40";
      default:
        return "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700";
    }
  };

  const getItemIcon = (id: string) => {
    if (id.includes("greeting")) return <Headphones className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    if (id.includes("smile") || id.includes("tone")) return <Volume2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />;
    if (id.includes("silence")) return <VolumeX className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    if (id.includes("name") || id.includes("title")) return <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    if (id.includes("apology")) return <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    if (id.includes("consultation")) return <Stethoscope className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
    if (id.includes("empathy")) return <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    if (id.includes("tics")) return <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    if (id.includes("hold")) return <Music className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    if (id.includes("assist")) return <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    if (id.includes("ending")) return <PhoneOff className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    if (id.includes("update") || id.includes("action")) return <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    if (id.includes("unprofessional")) return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    if (id.includes("scientific")) return <FlaskConical className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    return <ShieldCheck className="w-4 h-4 text-stone-500" />;
  };

  return (
    <div id="call-quality-evaluation-criteria-page" className="space-y-4">
      {/* 1. Header & Direct Controls */}
      <div 
        id="evaluation-criteria-control-bar"
        className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1C1A18] border border-[#EAE3D9] dark:border-stone-800 shadow-2xs space-y-3 transition-colors"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#C25E38]/10 text-[#C25E38] border border-[#C25E38]/20 rounded-xl shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-stone-900 dark:text-white font-sans tracking-tight">
                  بنود ومعايير تقييم جودة المكالمة (Call Quality Evaluation Criteria)
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 font-bold font-mono">
                  {filteredRows.length} من {allCriteriaRows.length} معيار معروض
                </span>
                {scorecard && (
                  <span className={`text-[12px] px-2.5 py-0.5 rounded-full font-black font-mono border ${
                    scorecard.totalScore >= 85
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      : scorecard.totalScore >= 70
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                      : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                  }`}>
                    إجمالي النتيجة: {scorecard.totalScore} / 100
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-sans mt-0.5">
                جدول موحد وبسيط يعرض المعايير المعتمدة مسبقاً، وتوقيت كل بند، وطريقة قياسه الموضوعية، ووزنه الأصلي، والنتيجة الفعلية بدقة وتجرد.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {onOpenCriteriaModal && (
              <button
                type="button"
                id="btn-open-criteria-modal"
                onClick={onOpenCriteriaModal}
                className="py-2 px-3.5 bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                title="تخصيص وإخفاء بنود التقييم بمفاتيح التبديل (الدائرة والمسار)"
              >
                <Sliders className="w-4 h-4" />
                <span>تخصيص وإخفاء البنود</span>
              </button>
            )}
          </div>
        </div>

        {/* Scorecard Sections Summary Strip (when a call result is loaded) */}
        {scorecard && (
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-stone-500 dark:text-stone-400 font-bold">
              توزيع الأقسام المعتمد:
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 font-bold font-mono">
              المقدمة: {scorecard.sections.intro.score} / 10
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20 font-bold font-mono">
              المهارات: {scorecard.sections.skills.score} / 35
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/20 font-bold font-mono">
              الهولد: {scorecard.sections.hold.score} / 15
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/20 font-bold font-mono">
              الإنهاء: {scorecard.sections.closing.score} / 10
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 font-bold font-mono">
              UPDATE: 5 / 5
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-500/20 font-bold font-mono">
              ACTION: 25 / 25
            </span>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "all"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
              }`}
            >
              كافة المعايير
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("acoustic")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "acoustic"
                  ? "bg-violet-600 text-white shadow-2xs"
                  : "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 border border-violet-200/60 dark:border-violet-900/40"
              }`}
            >
              التحليل الصوتي
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("protocol")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "protocol"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-200/60 dark:border-amber-900/40"
              }`}
            >
              بروتوكول المكالمة
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("customer_experience")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "customer_experience"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-900/40"
              }`}
            >
              تجربة العميل
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("pharma")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "pharma"
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/60 border border-teal-200/60 dark:border-teal-900/40"
              }`}
            >
              المعايير الصيدلانية
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("system")}
              className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                selectedCategory === "system"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 border border-purple-200/60 dark:border-purple-900/40"
              }`}
            >
              إجراءات النظام
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] sm:w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في اسم البند أو المعيار..."
              className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-white placeholder:text-stone-400 focus:outline-hidden focus:border-[#C25E38]"
            />
          </div>
        </div>
      </div>

      {/* 2. Main Standardized Table */}
      <div className="bg-white dark:bg-[#1C1A18] rounded-2xl border border-[#EAE3D9] dark:border-stone-800 shadow-2xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-start border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F5] dark:bg-stone-900/80 border-b border-[#EAE3D9] dark:border-stone-800 text-stone-600 dark:text-stone-300 font-bold select-none">
                <th className="py-3 px-3 text-start w-[20%]">
                  1. بند التقييم
                </th>
                <th className="py-3 px-3 text-start w-[24%]">
                  2. المعيار المعتمد
                </th>
                <th className="py-3 px-2.5 text-start w-[14%]">
                  3. التوقيت
                </th>
                <th className="py-3 px-3 text-start w-[22%]">
                  4. طريقة القياس
                </th>
                <th className="py-3 px-2.5 text-center w-[10%]">
                  5. الوزن أو الدرجة
                </th>
                <th className="py-3 px-3 text-start w-[10%]">
                  6. النتيجة
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE3D9]/70 dark:divide-stone-800/70 font-sans">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const isExpanded = expandedRowId === row.id;
                  const hasEvidence = Boolean(row.evidenceQuotes && row.evidenceQuotes.length > 0);

                  return (
                    <React.Fragment key={row.id}>
                      <tr 
                        className={`transition-colors hover:bg-stone-50/70 dark:hover:bg-stone-800/40 ${
                          !row.isCompliant && row.isApplicable && result
                            ? "bg-rose-50/20 dark:bg-rose-950/10"
                            : ""
                        }`}
                      >
                        {/* 1. بند التقييم */}
                        <td className="py-3 px-3 align-top font-bold text-stone-900 dark:text-stone-100">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/60 flex items-center justify-center shrink-0 mt-0.5">
                              {getItemIcon(row.id)}
                            </div>
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-stone-900 dark:text-white leading-tight">
                                  {row.titleArabic}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${getCategoryBadgeClass(row.category)}`}>
                                  {row.categoryArabic}
                                </span>
                                <span className="text-[9px] text-stone-400 dark:text-stone-500 font-mono">
                                  {row.sectionArabic}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. المعيار المعتمد */}
                        <td className="py-3 px-3 align-top text-stone-700 dark:text-stone-300 leading-relaxed">
                          <p className="text-[11px] font-medium leading-relaxed">
                            {row.standardDescription}
                          </p>
                        </td>

                        {/* 3. التوقيت */}
                        <td className="py-3 px-2.5 align-top text-stone-600 dark:text-stone-400 font-medium">
                          <div className="space-y-1">
                            <div className="flex items-start gap-1 text-[11px] leading-tight">
                              <Clock className="w-3 h-3 text-stone-400 shrink-0 mt-0.5" />
                              <span>{row.timingRuleArabic}</span>
                            </div>

                            {/* Detected Call Timestamps (if call is loaded) */}
                            {row.detectedTimestamps && row.detectedTimestamps.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {row.detectedTimestamps.slice(0, 3).map((ts, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => onSeekAudio?.(ts)}
                                    disabled={!playbackUrl}
                                    className={`px-1.5 py-0.2 text-[10px] font-mono rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center gap-0.5 ${
                                      playbackUrl ? "cursor-pointer text-[#C25E38] hover:bg-stone-200 dark:hover:bg-stone-700" : "text-stone-600 dark:text-stone-400"
                                    }`}
                                    title={playbackUrl ? `تشغيل من التوقيت ${ts}` : ts}
                                  >
                                    {playbackUrl && <Play className="w-2.5 h-2.5" />}
                                    <span>{ts}</span>
                                  </button>
                                ))}
                                {row.detectedTimestamps.length > 3 && (
                                  <span className="text-[9px] text-stone-400">
                                    +{row.detectedTimestamps.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 4. طريقة القياس */}
                        <td className="py-3 px-3 align-top text-stone-600 dark:text-stone-300 leading-relaxed text-[11px]">
                          <p className="font-medium leading-relaxed">
                            {row.measurementMethodArabic}
                          </p>
                        </td>

                        {/* 5. الوزن أو الدرجة */}
                        <td className="py-3 px-2.5 align-top text-center">
                          <div className="inline-flex flex-col items-center justify-center">
                            <span className="font-mono font-black text-xs text-stone-900 dark:text-white px-2 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                              {row.weightLabel}
                            </span>
                            {result && typeof row.scoreAwarded === "number" && (
                              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-1">
                                المستحق: {row.scoreAwarded}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. النتيجة */}
                        <td className="py-3 px-3 align-top">
                          <div className="space-y-1.5">
                            {/* Result Status Badge */}
                            <div>
                              {!result ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100/70 dark:bg-stone-800/60 text-stone-400 dark:text-stone-500 font-medium">
                                  — (غير محدد)
                                </span>
                              ) : !row.isApplicable ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 font-bold border border-stone-200/60 dark:border-stone-700/60">
                                  لا ينطبق
                                </span>
                              ) : row.deduction && row.deduction > 0 ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900/40 flex items-center gap-1 w-fit">
                                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span>خصم {row.deduction}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-1 w-fit">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>مستوفى ✓</span>
                                </span>
                              )}
                            </div>

                            {/* Measured Detail note */}
                            {row.resultDetails && (
                              <p className="text-[10px] text-stone-600 dark:text-stone-400 font-sans leading-tight">
                                {row.resultDetails}
                              </p>
                            )}

                            {/* Evidence expansion toggle */}
                            {hasEvidence && (
                              <button
                                type="button"
                                onClick={() => toggleRowExpanded(row.id)}
                                className="text-[10px] font-bold text-[#C25E38] hover:underline flex items-center gap-0.5 cursor-pointer pt-0.5"
                              >
                                <span>{isExpanded ? "إخفاء الدليل" : "عرض الدليل الحرفي"}</span>
                                {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Evidence Row (Only literal quotes from call, zero subjective text) */}
                      {isExpanded && hasEvidence && (
                        <tr className="bg-[#FAF8F5]/80 dark:bg-stone-900/80 border-b border-[#EAE3D9] dark:border-stone-800">
                          <td colSpan={6} className="p-3 px-4">
                            <div className="space-y-1.5 text-[11px]">
                              <div className="flex items-center gap-1.5 font-bold text-stone-800 dark:text-stone-200">
                                <FileText className="w-3.5 h-3.5 text-[#C25E38]" />
                                <span>الدليل الحرفي المستخرج من المكالمة (Verbatim Quote):</span>
                              </div>
                              <div className="space-y-1">
                                {row.evidenceQuotes?.map((ev, evIdx) => (
                                  <div 
                                    key={evIdx}
                                    className="p-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 italic flex items-start gap-2"
                                  >
                                    {ev.time && (
                                      <button
                                        type="button"
                                        onClick={() => onSeekAudio?.(ev.time!)}
                                        disabled={!playbackUrl}
                                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-700 font-bold shrink-0 ${
                                          playbackUrl ? "text-[#C25E38] cursor-pointer hover:bg-stone-200" : ""
                                        }`}
                                      >
                                        {ev.time}
                                      </button>
                                    )}
                                    <span className="leading-relaxed">«{ev.quote}»</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-500 dark:text-stone-400 font-medium text-xs">
                    لا توجد بنود تطابق معايير البحث أو التصفية المختارة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
