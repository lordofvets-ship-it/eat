import { TranscriptionResponse, AnalyzedCallRecord, HoldSegment, SilenceSegment } from "../types";

export interface ScorecardItem {
  id: string;
  titleArabic: string;
  section: "intro" | "skills" | "hold" | "closing" | "update" | "action";
  applicable: boolean;
  met: boolean;
  deduction: number;
  max?: number;
  details?: string;
  evidence?: { time?: string; quote?: string }[];
  needsReview?: boolean;
}

export interface ScorecardSection {
  id: "intro" | "skills" | "hold" | "closing" | "update" | "action";
  nameArabic: string;
  nameEn: string;
  max: number;
  deduction: number;
  score: number;
  fixed?: boolean;
}

export interface CallScorecard {
  callId: string;
  agentName: string;
  customerName?: string;
  callDate?: string;
  duration?: string;
  sections: {
    intro: ScorecardSection;
    skills: ScorecardSection;
    hold: ScorecardSection;
    closing: ScorecardSection;
    update: ScorecardSection;
    action: ScorecardSection;
  };
  items: ScorecardItem[];
  totalScore: number;
  maxTotalScore: number;
  ignoredObservations: { topic: string; note: string; score: null; countedInTotal: false }[];
}

/**
 * Evaluates whether the smile in colleague's tone is approved:
 * Rule (حاسم ومعتمد): عدم اعتماد النبرة بها ابتسامة إلا بعد تعدي النسبة أكبر من 70% (> 70%).
 * وإذا لم تتعدَّ تنقص درجتين في المقدمة وتنقص درجتين في المهارات.
 */
export function evaluateSmileTone(result: Partial<TranscriptionResponse>): {
  smilePercentage: number;
  hasApprovedSmile: boolean;
  details: string;
} {
  const tone = result.agentToneAnalysis;
  if (!tone) {
    return {
      smilePercentage: 0,
      hasApprovedSmile: false,
      details: "لم يتوفر تحليل نبرة الصوت (النسبة: 0%)",
    };
  }

  let smilePercentage = 0;

  if (tone.wav2vec2Emotion) {
    const happyScore =
      tone.wav2vec2Emotion.allScores?.find(
        (s) => s.label === "happy" || (s.labelArabic && s.labelArabic.includes("ابتسام"))
      )?.percentage || 0;

    const dominantIsHappy =
      tone.wav2vec2Emotion.dominantEmotion === "happy" ||
      Boolean(tone.wav2vec2Emotion.dominantEmotionArabic?.includes("ابتسام"));

    const domConf = dominantIsHappy
      ? (tone.wav2vec2Emotion.confidencePercentage ||
         Math.round((tone.wav2vec2Emotion.dominantScore || 0) * 100))
      : 0;

    const introConf = tone.wav2vec2Emotion.introduction?.isSmileSupported
      ? (tone.wav2vec2Emotion.introduction?.confidencePercentage || 0)
      : 0;

    const duringConf = tone.wav2vec2Emotion.duringCall?.isSmileSupported
      ? (tone.wav2vec2Emotion.duringCall?.confidencePercentage || 0)
      : 0;

    smilePercentage = Math.max(happyScore, domConf, introConf, duringConf);
  }

  // If no wav2vec2 or smilePercentage was 0, evaluate based on score and hasSmile
  if (smilePercentage === 0) {
    const traitsHaveSmile = (tone.detectedTraits || []).some(
      (t) => (t.includes("ابتسام") || t.includes("ودود") || t.includes("بشوش")) && !t.includes("ينقص")
    );
    if (tone.hasSmile || traitsHaveSmile) {
      if (typeof tone.score === "number") {
        smilePercentage = Math.round(tone.score * 10);
      } else {
        smilePercentage = tone.hasSmile ? 75 : 0;
      }
    }
  }

  // Strict Rule: Must strictly exceed 70% (> 70) to be approved
  const hasApprovedSmile = smilePercentage > 70;

  return {
    smilePercentage,
    hasApprovedSmile,
    details: hasApprovedSmile
      ? `نبرة معتمدة وبها ابتسامة بنسبة (${smilePercentage}%) تتجاوز 70%`
      : `عدم اعتماد نبرة الابتسامة لعدم تجاوز النسبة 70% (النسبة: ${smilePercentage}%)`,
  };
}

/**
 * Calculates the exact 100-point QA Scorecard per the approved Pharmacy Call Center Rubric:
 * - Sections: Intro (10), Skills (35), Hold (15), Closing (10), Update (5 fixed), Action (25 fixed).
 * - Total = 100. Section scores never drop below 0.
 */
export function computeCallScorecard(call: AnalyzedCallRecord | TranscriptionResponse, callMeta?: Partial<AnalyzedCallRecord>): CallScorecard {
  const result: TranscriptionResponse = ("fullResult" in call && call.fullResult) ? call.fullResult : (call as TranscriptionResponse);

  const agentName = callMeta?.agentName || ("agentName" in call && call.agentName ? call.agentName : result.agentName || "الزميل");
  const customerName = callMeta?.customerName || ("customerName" in call && call.customerName ? call.customerName : result.customerName || result.customerNameAnalysis?.customerNameDetected || "");
  const callDate = callMeta?.callDate || ("callDate" in call && call.callDate ? call.callDate : result.savedAt ? new Date(result.savedAt).toLocaleDateString("ar-EG") : "");
  const duration = callMeta?.duration || ("duration" in call && call.duration ? call.duration : result.callEndingAnalysis?.callTotalDuration || "");
  const callId = callMeta?.id || ("id" in call && call.id ? call.id : result.audioHash || "call-1");

  const items: ScorecardItem[] = [];
  const ignoredObservations: { topic: string; note: string; score: null; countedInTotal: false }[] = [];

  // Evaluate smile tone compliance: must strictly exceed 70%
  const smileEval = evaluateSmileTone(result);

  // ==========================================
  // 1. INTRO SECTION (المقدمة - حدها 10)
  // ==========================================
  // 1.1 Greeting (الترحيب المعتمد - درجتان)
  const isGreetingUsed = Boolean(result.greetingAnalysis?.isGreetingUsed);
  const greetingDeduction = isGreetingUsed ? 0 : 2;
  items.push({
    id: "greeting",
    titleArabic: "الترحيب المعتمد",
    section: "intro",
    applicable: true,
    met: isGreetingUsed,
    deduction: greetingDeduction,
    max: 2,
    details: isGreetingUsed ? "بدأ الزميل بعبارة الترحيب المعتمدة" : "لم يبدأ الزميل المكالمة بعبارة الترحيب المعتمدة (خصم 2)",
    evidence: result.greetingAnalysis?.greetingTextSnippet ? [{ quote: result.greetingAnalysis.greetingTextSnippet.slice(0, 100) }] : [],
    needsReview: false,
  });

  // 1.2 Intro Tone & Smile (نبرة الابتسامة في المقدمة - درجتان)
  // قاعدة معتمدة: عدم اعتماد النبرة بها ابتسامة إلا بعد تعدي النسبة أكبر من 70%، وإذا لم تتعدَّ تنقص درجتين في المقدمة
  const introSmileDeduction = smileEval.hasApprovedSmile ? 0 : 2;
  items.push({
    id: "intro_smile",
    titleArabic: "نبرة الابتسامة في المقدمة والترحيب",
    section: "intro",
    applicable: true,
    met: smileEval.hasApprovedSmile,
    deduction: introSmileDeduction,
    max: 2,
    details: smileEval.hasApprovedSmile
      ? `نبرة معتمدة وبها ابتسامة بنسبة (${smileEval.smilePercentage}%) تتعدى 70%`
      : `عدم اعتماد نبرة الابتسامة لعدم تجاوز النسبة 70% (النسبة: ${smileEval.smilePercentage}%)، خصم درجتين في المقدمة`,
    evidence: result.agentToneAnalysis?.introductionSummary
      ? [{ quote: result.agentToneAnalysis.introductionSummary }]
      : (result.agentToneAnalysis?.wav2vec2Emotion?.introduction?.acousticNotes
      ? [{ quote: result.agentToneAnalysis.wav2vec2Emotion.introduction.acousticNotes }]
      : []),
    needsReview: false,
  });

  const introTotalDeduction = greetingDeduction + introSmileDeduction;
  const introScore = Math.max(0, 10 - introTotalDeduction);

  // ==========================================
  // 2. SKILLS SECTION (المهارات - حدها 35)
  // ==========================================
  let skillsTotalDeduction = 0;

  // 2.1 Tone (النبرة والابتسامة - 5 درجات)
  // قاعدة معتمدة: عدم اعتماد النبرة بها ابتسامة إلا بعد تعدي النسبة أكبر من 70%، وإذا لم تتعدَّ تنقص درجتين في المهارات
  const toneTraits = result.agentToneAnalysis?.detectedTraits || [];
  let toneFlawsCount = 0;
  if (!smileEval.hasApprovedSmile) {
    toneFlawsCount += 2; // غياب الابتسامة المعتمدة أو عدم تجاوز 70% = خصم درجتين في المهارات
  }
  const otherFlaws = toneTraits.filter((t) =>
    t.includes("سرعة") ||
    t.includes("حدة") ||
    t.includes("برود") ||
    t.includes("رتابة") ||
    t.includes("عدم اهتمام") ||
    t.includes("جافة") ||
    t.includes("تردد") ||
    t.includes("ينقصها التفاعل") ||
    t.includes("ينقصها الحماس")
  );
  toneFlawsCount += otherFlaws.length;
  const toneDeduction = Math.min(5, toneFlawsCount);
  skillsTotalDeduction += toneDeduction;
  items.push({
    id: "tone",
    titleArabic: "نبرة الصوت والابتسامة",
    section: "skills",
    applicable: true,
    met: toneDeduction === 0,
    deduction: toneDeduction,
    max: 5,
    details:
      toneDeduction === 0
        ? `نبرة ودودة ومبتسمة وملائمة ومعتمدة بنسبة (${smileEval.smilePercentage}%) تتجاوز 70%`
        : `خصم ${toneDeduction} من 5 (${!smileEval.hasApprovedSmile ? `عدم اعتماد الابتسامة لعدم تجاوز 70% [النسبة: ${smileEval.smilePercentage}%] (خصم 2)` : ""}${otherFlaws.length > 0 ? (smileEval.hasApprovedSmile ? "" : " + ") + "عيوب نبرة ملحوظة" : ""})`,
    evidence: result.agentToneAnalysis?.callSummary
      ? [{ quote: result.agentToneAnalysis.callSummary }]
      : (result.agentToneAnalysis?.wav2vec2Emotion
      ? [{ quote: result.agentToneAnalysis.wav2vec2Emotion.dominantEmotionArabic }]
      : []),
    needsReview: false,
  });

  // 2.2 Silence (الصمت خارج الهولد)
  const silenceSegments: SilenceSegment[] = result.agentSilenceSummary?.silenceSegments || [];
  let silenceDeduction = 0;
  if (silenceSegments.length > 0) {
    for (const seg of silenceSegments) {
      const sec = Math.round(seg.duration || 0);
      if (sec <= 15) {
        // 0
      } else if (sec <= 24) {
        silenceDeduction += 1;
      } else if (sec <= 39) {
        silenceDeduction += 2;
      } else if (sec <= 49) {
        silenceDeduction += 4;
      } else if (sec <= 59) {
        silenceDeduction += 6;
      } else {
        silenceDeduction += 10;
      }
    }
  } else if ((result.agentSilenceSummary?.totalSilenceSeconds || 0) > 15) {
    const totalSec = Math.round(result.agentSilenceSummary?.totalSilenceSeconds || 0);
    if (totalSec <= 24) silenceDeduction = 1;
    else if (totalSec <= 39) silenceDeduction = 2;
    else if (totalSec <= 49) silenceDeduction = 4;
    else if (totalSec <= 59) silenceDeduction = 6;
    else silenceDeduction = 10;
  }
  skillsTotalDeduction += silenceDeduction;
  items.push({
    id: "silence",
    titleArabic: "فترات الصمت المفرط",
    section: "skills",
    applicable: true,
    met: silenceDeduction === 0,
    deduction: silenceDeduction,
    details: silenceDeduction === 0
      ? "لا توجد فترات صمت مفرطة تتجاوز 15 ثانية"
      : `خصم ${silenceDeduction} درجات لفترات صمت على الخط (${silenceSegments.filter(s => (s.duration || 0) > 15).map(s => `${s.timeStart}-${s.timeEnd}`).join("، ") || `${silenceSegments.length} فترات`})`,
    evidence: silenceSegments.map((s) => ({ time: s.timeStart, quote: `صمت ${Math.round(s.duration)} ثانية من ${s.timeStart} إلى ${s.timeEnd}` })),
    needsReview: false,
  });

  // 2.3 Customer Name / Title (اسم العميل أو لقبه - 2 درجة)
  const nameCount = Number(result.customerNameAnalysis?.mentionCount || 0);
  const titleCount = Number(result.customerTitleAnalysis?.titleMentionCount || 0);
  const totalNameAndTitleMentions = nameCount + titleCount;
  const nameDeduction = totalNameAndTitleMentions >= 4 ? 0 : 2;
  skillsTotalDeduction += nameDeduction;
  items.push({
    id: "customer_name_title",
    titleArabic: "اسم العميل ولقبه (4 مرات فأكثر)",
    section: "skills",
    applicable: true,
    met: totalNameAndTitleMentions >= 4,
    deduction: nameDeduction,
    max: 2,
    details: totalNameAndTitleMentions >= 4 ? `تم ذكر الاسم/اللقب ${totalNameAndTitleMentions} مرات (مستوفى)` : `تم الذكر ${totalNameAndTitleMentions} مرات فقط (أقل من 4، خصم 2)`,
    evidence: result.customerNameAnalysis?.nameSnippet ? [{ quote: result.customerNameAnalysis.nameSnippet }] : [],
    needsReview: false,
  });

  // 2.4 Apology for Complaint (الاعتذار عن الشكوى - 4 درجات)
  const hasComplaint = Boolean(result.customerComplaintAnalysis?.hasComplaint);
  let apologyDeduction = 0;
  if (hasComplaint) {
    const apologizedForComplaint = Boolean(
      result.customerComplaintAnalysis?.complaintApology?.didApologizeForComplaint ??
      result.agentApologyAnalysis?.isApologyUsedByAgent
    );
    apologyDeduction = apologizedForComplaint ? 0 : 4;
    skillsTotalDeduction += apologyDeduction;
    items.push({
      id: "apology_complaint",
      titleArabic: "الاعتذار الصريح عن الشكوى",
      section: "skills",
      applicable: true,
      met: apologizedForComplaint,
      deduction: apologyDeduction,
      max: 4,
      details: apologizedForComplaint ? "اعتذر الزميل صراحةً عن شكوى العميل" : "توجد شكوى ولم يعتذر الزميل عنها صراحةً (خصم 4)",
      evidence: result.customerComplaintAnalysis?.summaryText ? [{ quote: result.customerComplaintAnalysis.summaryText }] : [],
      needsReview: false,
    });
  } else {
    items.push({
      id: "apology_complaint",
      titleArabic: "الاعتذار عن الشكوى",
      section: "skills",
      applicable: false,
      met: true,
      deduction: 0,
      max: 4,
      details: "لا توجد شكوى في المكالمة (لا ينطبق)",
      needsReview: false,
    });
  }

  // 2.5 Medical Consultation (الاستشارة الطبية - 8 درجات)
  const hasConsultation = Boolean(result.medicalConsultationAnalysis?.isMedicalConsultationPresent);
  let consultationDeduction = 0;
  if (hasConsultation) {
    const steps = result.medicalConsultationAnalysis?.steps || [];
    const missingSteps = steps.filter((s) => !s.wasAsked).length;
    consultationDeduction = Math.min(8, missingSteps > 0 ? missingSteps : Number(result.medicalConsultationAnalysis?.missingStepsCount || 0));
    skillsTotalDeduction += consultationDeduction;
    items.push({
      id: "consultation",
      titleArabic: "خطوات الاستشارة الطبية (8 أسئلة)",
      section: "skills",
      applicable: true,
      met: consultationDeduction === 0,
      deduction: consultationDeduction,
      max: 8,
      details: consultationDeduction === 0 ? "استوفى الزميل كامل الأسئلة الإلزامية الثمانية" : `أغفل الزميل ${consultationDeduction} أسئلة من البروتوكول (خصم 1 لكل سؤال)`,
      evidence: result.medicalConsultationAnalysis?.customerSymptomSnippet ? [{ quote: result.medicalConsultationAnalysis.customerSymptomSnippet }] : [],
      needsReview: false,
    });
  } else {
    items.push({
      id: "consultation",
      titleArabic: "الاستشارة الطبية",
      section: "skills",
      applicable: false,
      met: true,
      deduction: 0,
      max: 8,
      details: "طلب منتج مباشر بدون استشارة أعراض (لا ينطبق)",
      needsReview: false,
    });
  }

  // 2.6 Empathy (التعاطف - 3 درجات)
  const callsForEmpathy = hasComplaint || hasConsultation || (result.transcript || []).some((t) => /(تعبان|مريض|وجع|ألم|تأخير|مشكلة|دواء|حرارة|سخونية)/i.test(t.text || ""));
  let empathyDeduction = 0;
  if (callsForEmpathy) {
    const isEmpathyUsed = Boolean(result.empathyAnalysis?.isEmpathyUsed);
    empathyDeduction = isEmpathyUsed ? 0 : 3;
    skillsTotalDeduction += empathyDeduction;
    items.push({
      id: "empathy",
      titleArabic: "إظهار التعاطف الصريح",
      section: "skills",
      applicable: true,
      met: isEmpathyUsed,
      deduction: empathyDeduction,
      max: 3,
      details: isEmpathyUsed ? "عبّر الزميل عن تعاطف صريح ملائم" : "استدعت المكالمة تعاطفاً ولم يظهره الزميل (خصم 3)",
      evidence: result.empathyAnalysis?.empathyTextSnippet ? [{ quote: result.empathyAnalysis.empathyTextSnippet }] : [],
      needsReview: false,
    });
  } else {
    items.push({
      id: "empathy",
      titleArabic: "التعاطف",
      section: "skills",
      applicable: false,
      met: true,
      deduction: 0,
      max: 3,
      details: "مكالمة استفسار اعتيادي لا تستدعي تعاطفاً (لا ينطبق)",
      needsReview: false,
    });
  }

  // 2.7 Verbal Tics (اللازمات اللفظية: خصم درجتين عن كل لازمة مستقلة بأي عدد تكرار)
  const detectedTics = result.verbalTicsAnalysis?.detectedTics || [];
  const uniqueTicsCount = detectedTics.length;
  let totalTicOccurrences = 0;
  for (const tic of detectedTics) {
    totalTicOccurrences += Number(tic.count || 1);
  }
  // خصم 2 درجات عن كل لازمة كلامية مختلفة مكررة (بغض النظر عن عدد مرات تكرار الكلمة)
  const verbalTicsDeduction = uniqueTicsCount * 2;
  skillsTotalDeduction += verbalTicsDeduction;
  items.push({
    id: "verbal_tics",
    titleArabic: "اللازمات اللفظية والتكرار",
    section: "skills",
    applicable: true,
    met: verbalTicsDeduction === 0,
    deduction: verbalTicsDeduction,
    details: verbalTicsDeduction === 0
      ? "كلام مهني متصل وخالٍ من اللازمات"
      : uniqueTicsCount === 1
      ? `رُصدت لازمة لفظية واحدة "${detectedTics[0].word}" (${totalTicOccurrences}x) — خصم درجتين على اللازمة`
      : `رُصدت ${uniqueTicsCount} لازمات لفظية (${detectedTics.map((t) => `"${t.word}"`).join("، ")}) — خصم درجتين لكل لازمة (إجمالي خصم ${verbalTicsDeduction})`,
    evidence: detectedTics.map((t) => ({ quote: `لازمة "${t.word}" (${t.count}x)` })),
    needsReview: false,
  });

  const skillsScore = Math.max(0, 35 - skillsTotalDeduction);

  // ==========================================
  // 3. HOLD SECTION (الهولد - حده 15)
  // ==========================================
  const holdSegments: HoldSegment[] = result.holdTimeSummary?.holdSegments || [];
  const totalHoldSec = Number(result.holdTimeSummary?.totalHoldSeconds || 0);
  let durationBracketDeduction = 0;
  if (totalHoldSec <= 90) {
    durationBracketDeduction = 0;
  } else if (totalHoldSec <= 150) {
    durationBracketDeduction = 5;
  } else if (totalHoldSec <= 180) {
    durationBracketDeduction = 10;
  } else {
    durationBracketDeduction = 15;
  }

  const unjustifiedHoldsCount = Number(result.holdTimeSummary?.unjustifiedHoldCount || 0) ||
    holdSegments.filter((h) => h.classification === "بدون داعي").length;
  const unjustifiedDeduction = unjustifiedHoldsCount * 5;

  const holdTotalDeduction = Math.min(15, durationBracketDeduction + unjustifiedDeduction);
  const holdScore = Math.max(0, 15 - holdTotalDeduction);

  items.push({
    id: "hold",
    titleArabic: "شروط ومدة الهولد (الانتظار)",
    section: "hold",
    applicable: holdSegments.length > 0 || totalHoldSec > 0,
    met: holdTotalDeduction === 0,
    deduction: holdTotalDeduction,
    max: 15,
    details: holdSegments.length === 0 && totalHoldSec === 0
      ? "بدون أي خروج هولد (15 كاملة)"
      : `مدة الهولد الكلية ${totalHoldSec} ث (خصم مدة: ${durationBracketDeduction}) + ${unjustifiedHoldsCount} بدون داعٍ (خصم: ${unjustifiedDeduction})`,
    evidence: holdSegments.map((h) => ({ time: h.timeStart, quote: `هولد مدته ${h.duration}ث (${h.classification || "بداعي"})` })),
    needsReview: false,
  });

  // ==========================================
  // 4. CLOSING SECTION (الإنهاء - حده 10)
  // ==========================================
  let closingTotalDeduction = 0;

  // 4.1 Further Assistance (عرض خدمات أخرى - 3 درجات)
  const isAssistanceOffered = Boolean(result.furtherAssistanceAnalysis?.isAssistanceOffered);
  const assistanceDeduction = isAssistanceOffered ? 0 : 3;
  closingTotalDeduction += assistanceDeduction;
  items.push({
    id: "further_assistance",
    titleArabic: "عرض خدمات ومساعدات أخرى",
    section: "closing",
    applicable: true,
    met: isAssistanceOffered,
    deduction: assistanceDeduction,
    max: 3,
    details: isAssistanceOffered ? "عرض الزميل المساعدة الإضافية قبل إنهاء الخط" : "لم يعرض الزميل المساعدة في شيء آخر قبل الختام (خصم 3)",
    evidence: result.furtherAssistanceAnalysis?.assistanceTextSnippet ? [{ quote: result.furtherAssistanceAnalysis.assistanceTextSnippet }] : [],
    needsReview: false,
  });

  // 4.2 Closing Phrase (عبارة الإنهاء - 3 درجات)
  const isEndingPhraseUsed = Boolean(result.callEndingAnalysis?.isEndingPhraseUsed);
  const endingPhraseDeduction = isEndingPhraseUsed ? 0 : 3;
  closingTotalDeduction += endingPhraseDeduction;
  items.push({
    id: "closing_phrase",
    titleArabic: "عبارة الختام المعتمدة (شرفتنا / شكراً لاتصالك)",
    section: "closing",
    applicable: true,
    met: isEndingPhraseUsed,
    deduction: endingPhraseDeduction,
    max: 3,
    details: isEndingPhraseUsed ? "استخدم عبارة الختام المعتمدة الموثقة" : "لم يستخدم عبارة الختام المعتمدة (خصم 3)",
    evidence: result.callEndingAnalysis?.endingTextSnippet ? [{ quote: result.callEndingAnalysis.endingTextSnippet }] : [],
    needsReview: false,
  });

  const closingScore = Math.max(0, 10 - closingTotalDeduction);

  // ==========================================
  // 5. UPDATE & ACTION (ثابتتان وكاملتان دائماً: 5 و 25)
  // ==========================================
  items.push({
    id: "update_fixed",
    titleArabic: "تحديث النظام (UPDATE)",
    section: "update",
    applicable: true,
    met: true,
    deduction: 0,
    max: 5,
    details: "درجة ثابتة وكاملة دائماً (5/5)",
    needsReview: false,
  });

  items.push({
    id: "action_fixed",
    titleArabic: "إجراء الطلب (ACTION)",
    section: "action",
    applicable: true,
    met: true,
    deduction: 0,
    max: 25,
    details: "درجة ثابتة وكاملة دائماً (25/25)",
    needsReview: false,
  });

  const updateScore = 5;
  const actionScore = 25;

  // Ignored observations (لا تخصم ولا تؤثر في الـ 100)
  if (result.unprofessionalWordsAnalysis?.hasUnprofessionalWords) {
    ignoredObservations.push({
      topic: "unprofessional_words",
      note: `رُصدت ألفاظ عامية غير رسمية (${(result.unprofessionalWordsAnalysis.detectedWords || []).map((w) => w.word).join("، ")}) — مسجلة كملاحظة فقط دون خصم من الـ 100`,
      score: null,
      countedInTotal: false,
    });
  }

  const totalScore = Math.max(0, Math.min(100, introScore + skillsScore + holdScore + closingScore + updateScore + actionScore));

  return {
    callId,
    agentName,
    customerName,
    callDate,
    duration,
    sections: {
      intro: {
        id: "intro",
        nameArabic: "المقدمة",
        nameEn: "Introduction",
        max: 10,
        deduction: introTotalDeduction,
        score: introScore,
      },
      skills: {
        id: "skills",
        nameArabic: "المهارات",
        nameEn: "Communication Skills",
        max: 35,
        deduction: skillsTotalDeduction,
        score: skillsScore,
      },
      hold: {
        id: "hold",
        nameArabic: "الهولد",
        nameEn: "Hold Compliance",
        max: 15,
        deduction: holdTotalDeduction,
        score: holdScore,
      },
      closing: {
        id: "closing",
        nameArabic: "الإنهاء",
        nameEn: "Call Closing",
        max: 10,
        deduction: closingTotalDeduction,
        score: closingScore,
      },
      update: {
        id: "update",
        nameArabic: "UPDATE",
        nameEn: "System Update",
        max: 5,
        deduction: 0,
        score: updateScore,
        fixed: true,
      },
      action: {
        id: "action",
        nameArabic: "ACTION",
        nameEn: "Order Action",
        max: 25,
        deduction: 0,
        score: actionScore,
        fixed: true,
      },
    },
    items,
    totalScore,
    maxTotalScore: 100,
    ignoredObservations,
  };
}
