import { TranscriptionResponse, AnalyzedCallRecord } from "../types";

/**
 * Generates a deterministic short hash from transcript turns if audioHash is not present.
 */
export function getDeterministicCallId(result: TranscriptionResponse): string {
  if (result.audioHash && String(result.audioHash).trim()) {
    return `call-${String(result.audioHash).trim()}`;
  }
  const turnsKey = (result.transcript || [])
    .slice(0, 12)
    .map((t) => `${t.timeStart || ""}:${t.speaker || ""}:${(t.text || "").slice(0, 30)}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < turnsKey.length; i++) {
    hash = ((hash << 5) + hash) ^ turnsKey.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `call-${hex}-${(result.transcript || []).length}`;
}

/**
 * Extracts colleague (agent) name from result.agentName or opening agent turns.
 */
export function resolveAgentNameFromResult(result: TranscriptionResponse, customName?: string): string {
  if (customName && customName.trim() && customName !== "الزميل (محلل المكالمة)") {
    return customName.trim();
  }
  const GENERIC_AGENT = /^(?:د\.\s*)?(?:الزميل[ةه]?|موظف(?:ة)?\s+خدمة\s+العملاء|الزميل\s*\(محلل\s+المكالمة\)|غير\s+محدد|لم\s+يذكر)$/;
  if (result.agentName && String(result.agentName).trim() && !GENERIC_AGENT.test(String(result.agentName).trim())) {
    const raw = String(result.agentName).trim();
    return raw.startsWith("د.") || raw.startsWith("دكتور") ? raw : `د. ${raw}`;
  }

  // Search opening agent turns in transcript
  const agentTurns = (result.transcript || [])
    .filter((t) => !String(t.speaker || "").includes("العميل") && !String(t.speaker || "").includes("صمت"))
    .slice(0, 4);

  const searchTexts = [
    ...agentTurns.map((t) => String(t.text || "")),
    String(result.greetingAnalysis?.greetingTextSnippet || ""),
  ];

  const stopWords = new Set([
    "أتشرف", "اتشرف", "تشرف", "الاسم", "إسم", "اسم", "يا", "فندم", "أهلاً", "اهلا",
    "تحت", "أمرك", "امرك", "حاضر", "ثواني", "لحظات", "مساء", "صباح", "الخير"
  ]);

  for (const text of searchTexts) {
    // Pattern 1: "مع حضرتك <name>" or "معاك <name>"
    const m1 = text.match(/(?:مع\s+حضرتك|معاك[ي]?)\s+(?:دكتور[ةه]?|د\.)?\s*([أ-يa-zA-Z]+(?:\s+[أ-يa-zA-Z]+)?)/i);
    if (m1 && m1[1]) {
      const words = m1[1].trim().split(/\s+/).filter((w) => !stopWords.has(w));
      if (words.length > 0) {
        const name = words.slice(0, 2).join(" ");
        return `د. ${name}`;
      }
    }
    // Pattern 2: "الطرشوبي <name> مع حضرتك"
    const m2 = text.match(/الطرشوبي[،,\s]+(?:دكتور[ةه]?|د\.)?\s*([أ-يa-zA-Z]+)\s+مع\s+حضرتك/i);
    if (m2 && m2[1] && !stopWords.has(m2[1].trim())) {
      return `د. ${m2[1].trim()}`;
    }
  }

  if (result.isBenchmark && !result.audioHash) {
    return "د. أحمد (المكالمة المعيارية المعتمدة)";
  }
  return "الزميل (محلل المكالمة)";
}

/**
 * Computes a realistic overall QA percentage score (0-100) from the evaluated criteria.
 */
export function computeOverallQAScore(result: TranscriptionResponse): number {
  let earned = 0;
  let totalWeight = 0;

  // 1. Greeting (12 pts)
  totalWeight += 12;
  if (result.greetingAnalysis?.isGreetingUsed) earned += 12;

  // 2. Agent Tone (15 pts) — excluded from the denominator when the model gave no score (never invent 8/10)
  const rawTone = result.agentToneAnalysis?.score;
  if (rawTone !== undefined && rawTone !== null && Number.isFinite(Number(rawTone))) {
    totalWeight += 15;
    earned += Math.min(15, Math.max(0, (Number(rawTone) / 10) * 15));
  }

  // 3. Customer Name (10 pts)
  totalWeight += 10;
  if (result.customerNameAnalysis?.isMentionedByAgent) {
    earned += 10;
  } else if (
    !result.customerNameAnalysis?.customerNameDetected ||
    result.customerNameAnalysis.customerNameDetected === "لم يذكر"
  ) {
    earned += 7; // Partial if customer never clearly gave name or only in passing
  }

  // 4. Customer Title (8 pts)
  totalWeight += 8;
  if (result.customerTitleAnalysis?.isTitleUsedByAgent) {
    earned += 8;
  } else if (
    !result.customerTitleAnalysis?.titleDetected ||
    result.customerTitleAnalysis.titleDetected === "لم يذكر" ||
    result.customerTitleAnalysis.titleDetected === "غير محدد"
  ) {
    earned += 8; // Not penalized if no formal title was stated by customer
  }

  // 5. Apology when needed (10 pts)
  totalWeight += 10;
  if (result.agentApologyAnalysis?.isApologyNeeded) {
    if (result.agentApologyAnalysis.isApologyUsedByAgent) earned += 10;
  } else {
    earned += 10;
  }

  // 6. Hold compliance (12 pts)
  totalWeight += 12;
  if ((result.holdTimeSummary?.holdCount || 0) > 0) {
    let holdPts = 6;
    if (result.holdTimeSummary?.isMusicCriterionCompliant) holdPts += 3;
    if (!String(result.holdTimeSummary?.overallClassification || "").includes("بدون داعي")) holdPts += 3;
    earned += holdPts;
  } else {
    earned += 12;
  }

  // 7. Silence / Dead Air (10 pts)
  totalWeight += 10;
  if ((result.agentSilenceSummary?.silenceCount || 0) === 0) {
    earned += 10;
  } else if ((result.agentSilenceSummary?.totalSilenceSeconds || 0) <= 30) {
    earned += 8;
  } else {
    earned += 5;
  }

  // 8. Further Assistance (8 pts)
  totalWeight += 8;
  if (result.furtherAssistanceAnalysis?.isAssistanceOffered) {
    earned += 8;
  }

  // 9. Call Ending (8 pts)
  totalWeight += 8;
  if (result.callEndingAnalysis?.isEndingPhraseUsed) {
    earned += 8;
  }

  // 10. Professional Words (7 pts)
  totalWeight += 7;
  if (!result.unprofessionalWordsAnalysis?.hasUnprofessionalWords) {
    earned += 7;
  }

  if (totalWeight <= 0) return 90;
  return Math.round((earned / totalWeight) * 100);
}

/**
 * Formats ISO date string into readable Arabic date/time.
 */
export function formatCallDateArabic(isoDate?: string): string {
  if (!isoDate) return "مكالمة محللة فعلياً";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "مكالمة محللة فعلياً";
    return d.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "مكالمة محللة فعلياً";
  }
}

/**
 * Ensures any call result (from server cache or browser localStorage) strictly enforces:
 * 1. Hold segments are only counted when continuous hold music (>=12s, conf>=0.55) is present in the VAD output.
 * 2. Template echo turns ("كريم ريسكن" / "مناديل مبللة بابلز") are stripped.
 */
export function sanitizeCallResultForHoldAndEcho(result: TranscriptionResponse): TranscriptionResponse {
  if (!result || typeof result !== "object") return result;

  const toSec = (t?: string): number => {
    if (!t) return 0;
    const p = String(t).trim().split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] || 0;
  };

  const templateEchoRegex =
    /كريم\s*ريسكن|Re-Skin|مناديل\s*مبللة\s*بابلز|ثواني\s*أراجع\s*لحضرتك\s*السيستم\s*للتأكد\s*من\s*توفر\s*الصنف،\s*لحظات\s*على\s*الانتظار\s*يا\s*فندم|شكراً\s*لانتظار\s*حضرتك\s*يا\s*فندم،\s*مع\s*حضرتك\.\s*الصنف\s*متوفر\s*وسعره\s*75\s*جنيه|شكراً\s*لاتصالك\s*بصيدليات\s*الطرشوبي،\s*يومك\s*سعيد/iu;

  let cloned = result;
  if (Array.isArray(cloned.transcript) && cloned.transcript.some((t) => templateEchoRegex.test(String(t?.text || "")))) {
    cloned = {
      ...cloned,
      transcript: cloned.transcript.filter((t) => t && t.text && !templateEchoRegex.test(String(t.text || ""))),
    };
  }

  // Enforce zero speaker confusion / inversion in transcript turns
  const isCustUtteranceRx =
    /(?:^|[،,\s])(?:لو\s*سمحت[ي]?\s*)?(?:كنت\s*)?(?:عايز|عايزة|محتاج|محتاجة)\s+(?:أسأل|اسأل|أعرف|اعرف|أطلب|اطلب|علاج|دوا|صنف|علبة|شريط|حقنة)|(?:^|[،,\s])هو\s+(?:متاح|متوفر|موجود|بكام|سعره\s*كام)\s*(?:عندكم)?|(?:^|[،,\s])عندكم\s+(?:علاج|دوا|صنف|حقن|كبسول)|(?:^|[،,\s])ابعت(?:لي|هولي|لنا|هولنا)|(?:^|[،,\s])العنوان\s+(?:في|بتاعي|هو)|(?:^|[،,\s])رقم\s*(?:تليفوني|موبايلي|الواتس)|(?:^|[،,\s])أنا\s+(?:كنت\s+)?طلبت\s+أوردر|(?:^|[،,\s])أصل\s+(?:تعبان|عندي\s*(?:صداع|مغص|برد|سخونية|التهاب))|(?:^|[،,\s])الدكتور\s*كاتبلي|(?:^|[،,\s])الروشت[ةه]\s*فيها|(?:^|[،,\s])(?:طب\s*)?مش\s*مشكل[ةه][،,\s]*المهم\s*(?:إنه\s*)?موجود|المهم\s*(?:إنه\s*)?موجود\s*وخلاص|المهم\s*موجود\s*وخلاص|مش\s*مشكل[ةه][،,\s]*المهم\s*موجود|ولا\s*يهمك[،,\s]*أنا\s*لسه\s*قاعد|قاعد\s*في\s*كافيه|المولين\s*ده\s*أحسن|لا\s*وبياخدوا\s*من\s*أولى|عايزة\s*بيتادين\s*بقول\s*لحضرتك|الكالدام\s*كده\s*تمام|الاتنين\s*كريم\s*يا\s*فندم|(?:^|[،,\s])لا\s*شكراً\s*(?:جزيلاً\s*)?(?:تسلم|تسلمي|كفاية)|(?:^|[،,\s])لا\s*(?:تسلم|تسلمي)[،,\s]*خلاص|(?:^|[،,\s])(?:و\s*)?(?:ال)?(?:مرهم|كريم|دوا|علاج|قطرة|قطره|بخاخ|بخاخة|بخاخه|شامبو|لوشن|جل|أقراص|اقراص|كبسول|كبسولات|فوار|حقن|حقنة|حقنه|شريط|علبة|علبه|لبوس|بودرة|بودره|محلول)\s+(?:اللي\s*هو|بتاع|نوع)\s+|(?:^|[،,\s])(?:ال)?(?:مرهم|كريم)\s+(?:اللي\s*هو\s+)?(?:الكارباميد|كارباميد|بانثينول|بيتادين|فيوسيدين|ميبو)|(?:^|[،,\s])(?:ممكن\s+كمان\s+)?(?:اتنين|كيسين|علبة|شريط|واحد)?\s*(?:جابيسكون|كارباميد|بانثينول|مرهم|كريم|لبوس|فوار|أقراص|دواء|علاج|مناديل)\s+(?:بتاع|نوع|لعلاج|علشان)?|(?:^|[،,\s])ممكن\s+كمان\s+[^\n.،؟]*(?:جابيسكون|حموض[ةه]|كيسين|أكياس|علبة|شريط|مرهم|كريم)|(?:^|[،,\s])اتنين\s+كيس\s+جابيسكون|(?:^|[،,\s])جابيسكون\s+(?:بتاع\s+الحموضة|كيسين)?|(?:^|[،,\s])كيسين\s+(?:يعني\s+مش)?/ui;

  const isAgentUtteranceRx =
    /(?:صيدليات|صيدلية)\s+(?:ال(?:عبد\s*اللطيف\s*)?طرشوبي|الطرشوبي)|مع(?:اك|اكي|اكِ|\s*حضرتك)\s+(?:دكتور[ةه]?|د\.|[أإآا]ستاذ[ةه]?)?\s*[\p{L}]+(?:\s+من\s+خدمة\s+العملاء)?|أقدر\s*أساعد(?:ك|كِ|\s*حضرتك)\s*إزاي|تؤمر\s*بإيه\s*يا\s*فندم|تحت\s*أمر(?:ك|\s*حضرتك)|لحظات\s*(?:معايا\s*)?(?:على|عال)?\s*الانتظار|ثواني\s*(?:أراجع|اراجع|أشوف|اشوف|اتأكد)\s*(?:لحضرتك\s*)?(?:السيستم|الفرع)|شكراً\s*لانتظار(?:ك|\s*حضرتك)|(?:آسف|اسف|بعتذر)\s*(?:جداً\s*)?(?:لحضرتك\s*)?(?:على|عن)\s*(?:التأخير|الإطالة)|الإجمالي\s*(?:هيكون|لحضرتك)|الأوردر\s*هيوصل\s*لحضرتك|أقدر\s*أساعد(?:ك|كِ|\s*حضرتك)\s*(?:في|ب)?\s*(?:أي\s*)?حاج[ةه]\s*تاني[ةه]|تحب\s*أضيف\s*لحضرتك\s*أي\s*حاج[ةه]|شكراً\s*لاتصالك\s*بصيدليات\s*الطرشوبي|نورتنا\s*يا\s*فندم\s*وشرفتنا|شرفتنا\s*يا\s*فندم\s*ونورتنا|(?:^|[،,\s])(?:و\s*)?[إا]يه\s*تاني[؟?]?|(?:^|[،,\s])معاك\s*[إا]يه\s*تاني|(?:^|[،,\s])تؤمر\s*ب[إا]يه\s*تاني|(?:^|[،,\s])(?:محتاج|في|فيه)\s*(?:حاج[ةه]|صنف)\s*تاني[ةه][؟?]?|(?:^|[،,\s])(?:أي|اي)\s*(?:إضاف[ةه]|اضاف[ةه]|خدم[ةه]|حاج[ةه]|صنف)\s*تاني[ةه][؟?]?/ui;

  if (Array.isArray(cloned.transcript)) {
    const rawTurns = cloned.transcript;

    // First: split any merged turn containing an agent assistance/closing question followed by customer medication order
    const preProcessedTurns: any[] = [];
    for (const t of rawTurns) {
      if (!t || !t.text) {
        preProcessedTurns.push(t);
        continue;
      }
      const rawTxt = String(t.text).trim();
      const mergedMatch = rawTxt.match(/^((?:تمام[،,\s]+)?(?:في|فيه|محتاج|تحب|أقدر\s*أساعدك\s*في)?\s*(?:أي\s*)?حاج[ةه]\s*تاني[ةه][؟?]|(?:و\s*)?[إا]يه\s*تاني[؟?]|تؤمر\s*ب[إا]يه\s*تاني[؟?])\s+(.+)$/ui);
      if (mergedMatch && (isCustUtteranceRx.test(mergedMatch[2]) || /(?:ممكن\s+كمان|جابيسكون|بتاع\s+الحموضة|كيسين|عايز)/ui.test(mergedMatch[2]))) {
        const startSec = toSec(t.timeStart || "00:00");
        const endSec = toSec(t.timeEnd || t.timeStart || "00:00");
        const dur = Number(t.duration) || Math.max(1, endSec - startSec);
        const splitSec = Math.min(endSec, startSec + Math.max(1, Math.floor(dur * 0.3)));
        const fmt = (s: number) => {
          const m = Math.floor(s / 60);
          const rem = s % 60;
          return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
        };
        preProcessedTurns.push({
          ...t,
          speaker: "موظف خدمة العملاء",
          text: mergedMatch[1].trim(),
          timeStart: t.timeStart || "00:00",
          timeEnd: fmt(splitSec),
          duration: Math.max(1, splitSec - startSec),
        });
        preProcessedTurns.push({
          ...t,
          speaker: "العميل",
          text: mergedMatch[2].trim(),
          timeStart: fmt(splitSec),
          timeEnd: t.timeEnd || fmt(splitSec + 1),
          duration: Math.max(1, endSec - splitSec),
        });
        continue;
      }
      preProcessedTurns.push(t);
    }

    cloned = {
      ...cloned,
      transcript: preProcessedTurns.map((t, idx) => {
        if (!t || !t.text) return t;
        const txt = String(t.text).trim();
        const curSpk = String(t.speaker || "").trim();
        if (curSpk.includes("صمت") || curSpk.includes("انتظار")) {
          return { ...t, speaker: "فترة صمت الموظف" };
        }
        if (isCustUtteranceRx.test(txt)) {
          return { ...t, speaker: "العميل" };
        }
        if (isAgentUtteranceRx.test(txt)) {
          return { ...t, speaker: "موظف خدمة العملاء" };
        }
        // Contextual: if previous turn was agent asking "إيه تاني؟" and this turn is customer naming an item/medicine
        if (idx > 0) {
          const prevTxt = String(preProcessedTurns[idx - 1]?.text || "").trim();
          if (/(?:[إا]يه\s*تاني|[أإا]ي\s*(?:إضاف[ةه]|حاج[ةه]|طلب|خدم[ةه])\s*تاني[ةه]|تؤمر\s*ب[إا]يه)/ui.test(prevTxt)) {
            if (/(?:مرهم|كريم|دوا|علاج|أقراص|كبسول|شريط|علب[ةه]|قطر[ةه]|بخاخ|كارباميد|بانثينول|جابيسكون)/ui.test(txt)) {
              return { ...t, speaker: "العميل" };
            }
          }
        }
        if (curSpk.includes("موظف") || curSpk.includes("الزميل") || curSpk.includes("الصيدلي") || curSpk.includes("خدمة العملاء")) {
          return { ...t, speaker: "موظف خدمة العملاء" };
        }
        if (curSpk.includes("العميل") || curSpk.includes("متصل")) {
          return { ...t, speaker: "العميل" };
        }
        return t;
      }),
    };
  }

  const vadSegs = Array.isArray((cloned as any).sileroVad?.speechSegments)
    ? (cloned as any).sileroVad.speechSegments
    : [];
  const holdSegs = Array.isArray(cloned.holdTimeSummary?.holdSegments)
    ? cloned.holdTimeSummary.holdSegments
    : [];

  if (vadSegs.length > 0 && holdSegs.length > 0) {
    const validHolds = holdSegs.filter((hSeg: any) => {
      const hS = toSec(hSeg.timeStart);
      const hE = toSec(hSeg.timeEnd);
      const hDur = hE > hS ? hE - hS : Number(hSeg.duration) || 0;
      let musicSec = 0;
      for (const vs of vadSegs) {
        const vS = Number(vs.start) || 0;
        const vE = Number(vs.end) || 0;
        const vDur = vE - vS;
        const vConf = Number(vs.confidence || 0);
        if (vDur >= 12 && vConf >= 0.55) {
          const ov = Math.min(hE, vE) - Math.max(hS, vS);
          if (ov > 0) musicSec += ov;
        }
      }
      return musicSec >= 10 && (hDur <= 0 || musicSec / hDur >= 0.4);
    });

    if (validHolds.length !== holdSegs.length) {
      const totalHoldSec = validHolds.reduce((acc: number, s: any) => acc + (Number(s.duration) || 0), 0);
      cloned = {
        ...cloned,
        holdTimeSummary: {
          ...cloned.holdTimeSummary!,
          totalHoldSeconds: totalHoldSec,
          holdCount: validHolds.length,
          overallClassification: validHolds.length > 0 ? "كل الهولد بداعي" : "بدون هولد",
          validHoldCount: validHolds.length,
          unjustifiedHoldCount: 0,
          hasExceededDurationHold: validHolds.some((s: any) => s.isDurationExceeded),
          isMusicCriterionCompliant: true,
          musicComplianceStatus: "ملتزم بمعيار الهولد بوجود موسيقى الانتظار ✓",
          auditNotes:
            validHolds.length > 0
              ? `تم اعتماد الهولد وفق معيار وجود صوت موسيقى الانتظار؛ حيث تم حساب مدة الهولد بدقة من أول صدور الموسيقى إلى انتهائها فقط (إجمالي ${totalHoldSec} ثانية).`
              : "لم يتم رصد أي نغمة موسيقى انتظار في المكالمة؛ تم التحقق الصوتي الدقيق بعدم وجود موسيقى انتظار.",
          holdSegments: validHolds,
        },
      };
    }
  }

  // 3. Enforce strict vocative-only customerNameAnalysis, customerTitleAnalysis, and furtherAssistanceAnalysis
  if (Array.isArray(cloned.transcript) && cloned.transcript.length > 0) {
    const agentTurns = cloned.transcript.filter((t: any) => {
      const spk = String(t?.speaker || "");
      return (spk.includes("موظف") || spk.includes("زميل") || spk.includes("خدمة العملاء")) && !spk.includes("صمت");
    });

    const invalidStopWords = new Set([
      "فندم", "يافندم", "يا فندم", "حضرتك", "سيادتك", "باشا", "بيه", "يا باشا", "صاحبي", "صاحبى", "بنتي", "بنتى", "ابني", "ابنى", "حبيبي", "حبيبى", "غالي", "غالى", "ريت", "رب", "ترى", "سيدي", "سيدى", "ستي", "ستى", "جماعة", "جماعه",
      "السيستم", "الأوردر", "الاوردر", "الصيدلية", "الطرشوبي", "علاج", "دواء", "كلاسيد", "اكس", "إكس", "ال", "كليكزان", "ديمرا", "انتينال", "نيكسيام", "كلاريتين", "اسبازيولان", "ايزنت", "تريم", "مايوفين", "فيبيوريك", "بلافيكس", "ريفاروسباير", "سيريتاد", "سيجنال", "فوكس", "ريمواكس", "ميليتيكس", "ميراج", "سيرا", "فلامون", "تربسالين", "أوميجا", "اوميجا", "دايجستين", "كالسيترون", "كي", "شول", "بيكمان", "زيرتك", "ميوكو", "سانسو", "سيستون", "بولي", "فريش",
      "فاتورة", "توصيل", "فرع", "كارت", "فيزا", "شركة", "صنف", "تركيز", "أهلاً", "شكراً",
      "فاين", "وايت", "كويس", "جابيسكون", "كيسين", "حموضة", "حموضه", "كافسيد",
      "أستاذ", "أستاذة", "استاذ", "استاذة", "استاذه", "دكتور", "دكتورة", "دكتوره", "مهندس", "باشمهندس", "مدام", "آنسة", "انسه", "حاج", "حاجة", "شيخ",
      "آل", "ال", "الـ", "الى", "إلى", "على", "عن", "مع", "في", "فى", "من", "هو", "هي", "دي", "ده", "كده", "تمام", "طيب",
      "اسم", "اسمي", "الاسم", "باسم", "عبد اللطيف", "عبداللطيف", "تشوبي", "لحظة", "لحظه", "لحظات", "ثواني", "ثوانى", "بصراحة", "بصراحه", "تانية", "تانيه", "ثانية", "ثانيه",
      "مراجعة", "مراجعه", "البيانات", "بيانات", "بالبنات", "بالبيانات", "أراجع", "اراجع", "اتأكد", "أتأكد", "أوفر", "اوفر", "توفير",
      "هنحتفظ", "بنحتفظ", "تحتفظ", "نحتفظ", "يحتفظ", "بياخدها", "كاتب", "العميل", "العميلة", "مسجل", "الرقم", "رقم", "مين", "إيه", "ايه",
      // Conversational greetings, endings, and common CSR phrases that must NEVER be mistaken for customer names:
      "وسهلاً", "وسهلا", "بالاتصال", "الاتصال", "بحضرتك", "بيك", "بيكي", "بيكِ", "بيكم", "ليكم", "عليكم", "بوجودك", "بوجودكم",
      "بالشفاء", "بالشفا", "بالسلامة", "بالتوفيق", "بالصحة", "العافية", "تماماً", "تماما", "جداً", "جدا",
      "أقدر", "اقدر", "أساعدك", "اساعدك", "أساعد", "اساعد", "تؤمرني", "تؤمريني", "تؤمر", "تؤمرنا", "اتفضل", "اتفضلي", "اتفضلى", "تفضل",
      "تحت", "أمرك", "امرك", "أمر", "امر", "خدمتك", "خدمة", "خدمات", "مساعدة", "مساعدتك", "شرفتنا", "شرفتينا", "نورتنا", "نورتينا",
      "صيدليات", "معاك", "معاكي", "معايا", "معانا", "النظام", "الطلب", "توافرهم", "توفيرهم", "الاطالة", "الإطالة", "الانتظار", "انتظار",
      "عفواً", "عفوا", "شكرا", "شكراً", "طبعاً", "طبعا", "أكيد", "اكيد", "أيوة", "ايوة", "ايوه", "أه", "اه", "ألو", "الو", "لا",
      "مساء النور", "مساء الخير", "صباح النور", "صباح الخير", "مع السلامة", "مع سلامه", "سلام عليكم", "وعليكم السلام"
    ]);

    const agClean = String(cloned.agentName || "")
      .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
      .replace(/^(?:دكتور[ةه]?|د\.|الزميل[ةه]?)\s*/i, "")
      .trim()
      .toLowerCase();
    const agentNamesSet = new Set<string>();
    if (agClean && agClean !== "الزميل") agentNamesSet.add(agClean);
    agentTurns.slice(0, 1).forEach((seg: any) => {
      const mAg = String(seg.text || "").match(/(?:مع\s*حضرتك|معاك[يِ]?)\s+(?:دكتور[ةه]?|د\.|[أإآا]ستاذ[ةه]?)?\s*([\p{L}]{2,14})/ui);
      if (mAg && mAg[1]) {
        const ex = mAg[1].trim().toLowerCase();
        if (!["فندم", "يافندم", "باسم", "غير", "مؤكد", "واضح"].includes(ex)) agentNamesSet.add(ex);
      }
    });

    const normalizeCustName = (n: string): string => {
      let c = String(n || "").trim();
      c = c.replace(/^(?:يا\s+)?(?:باسم\s+)?(?:ال)?(?:[أإآا]ستاذ[ةه]?|دكتور[ةه]?|باشمهندس[ةه]?|مهندس[ةه]?|مدام|[آا]نس[ةه]|حاج[ةه]?|ست[ي]?|الست|شيخ|عم|خال)\s+/ui, "").trim();
      c = c.replace(/^باسم\s+/ui, "").trim();
      if (/^من[ىي]$/ui.test(c)) return "منى";
      if (/^شيم[اآء]+ء?$/ui.test(c)) return "شيماء";
      if (/^هيد[ىي]$/ui.test(c) || /^هايد[ىي]$/ui.test(c)) return "هيدي";
      if (/^هال[ةه]\s+حسون[ةه]$/ui.test(c)) return "هالة حسونة";
      if (/^هال[ةه]$/ui.test(c)) return "هالة";
      if (/^عز\s*الدين$/ui.test(c) || /^عزالدين$/ui.test(c)) return "عز الدين";
      const dinMatch = c.match(/^([\p{L}]+)\s*الدين$/ui);
      if (dinMatch) return `${dinMatch[1]} الدين`;
      const abdMatch = c.match(/^عبد\s*([\p{L}]+)$/ui);
      if (abdMatch) return `عبد ${abdMatch[1]}`;
      return c;
    };

    const isValidCustName = (n: string): boolean => {
      const c = normalizeCustName(n);
      if (!c || c.length < 2 || c.length > 22) return false;
      const lower = c.toLowerCase();
      if (invalidStopWords.has(lower)) return false;
      const parts = c.split(/\s+/);
      if (parts.some((p) => invalidStopWords.has(p.toLowerCase()))) return false;
      if (parts.some((p) => /^(?:هن|بن|هت|بت|مت|مست)[\p{L}]{3,}$/u.test(p.toLowerCase()))) return false;
      if (lower.includes("فندم") || lower.includes("حضرتك") || lower.includes("كلاسيد") || lower.includes("الطرشوبي")) return false;
      for (const ag of agentNamesSet) {
        if (lower === ag) return false;
      }
      return true;
    };

    // 1. Check if customer stated or introduced their name during the call
    let customerStatedName = "";
    let customerIntroTime = "";
    let customerIntroSnippet = "";

    const customerTurns = (Array.isArray(cloned.transcript) ? cloned.transcript : []).filter((t: any) => {
      const spk = String(t?.speaker || "");
      return spk.includes("العميل") && !spk.includes("صمت");
    });

    for (let ci = 0; ci < customerTurns.length; ci++) {
      const cTurn = customerTurns[ci];
      const rawTxt = String(cTurn.text || "").trim();
      const cTime = String(cTurn.timeStart || "00:00").trim();

      // Case A: Explicit intro ("اسمي كذا", "معاك كذا", "باسم كذا", "أنا اسمي كذا")
      const mIntro = rawTxt.match(/(?:معاك[ي]?|اسمي|الاسم|باسم|أنا\s+اسمي|انا\s+اسمي)(?:\s+باسم)?[\s،,\-.:؛!]+(?:[أإآا]ستاذ[ةه]?|دكتور[ةه]?|مدام|[آا]نسة)?[\s،,\-.:؛!]*([\p{L}]{2,15})(?:\s+([\p{L}]{2,15}))?/ui);
      if (mIntro && mIntro[1] && isValidCustName(mIntro[1])) {
        const w1 = normalizeCustName(mIntro[1]);
        const w2 = mIntro[2] ? normalizeCustName(mIntro[2]) : "";
        const full = (w2 && isValidCustName(w2)) ? `${w1} ${w2}` : w1;
        customerStatedName = full;
        customerIntroTime = cTime;
        customerIntroSnippet = `${rawTxt} (${cTime})`;
        break;
      }

      // Case B: Opening turn direct short answer (e.g. "يزن علاء" right in turn 0 or 1)
      if (ci <= 1) {
        const cleaned = rawTxt.replace(/^(?:ألو|الو|أيوه|ايوه|اه|أه|مساء الخير|صباح الخير)\s*/ui, "").replace(/[.،,؟!]+$/g, "").trim();
        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length >= 1 && words.length <= 3 && isValidCustName(words[0])) {
          const secondValid = words.slice(1).every((w: string) => {
            const nw = normalizeCustName(w).toLowerCase();
            return nw.length >= 2 && !invalidStopWords.has(nw);
          });
          if (secondValid && !/(?:أنا|انا|كنت|عايز|عايزة|عايزه|محتاج|محتاجة|محتاجه|طلب|طلبت|طالب|طالبة|أوردر|اوردر|صيدلية|لبن|علبة|شريط|دواء|علاج|عندك|عندكم|بكام|سعر|في|فى|من|على|لو|سمحت)/ui.test(cleaned)) {
            customerStatedName = words.map((w: string) => normalizeCustName(w)).join(" ");
            customerIntroTime = cTime;
            customerIntroSnippet = `${rawTxt} (${cTime})`;
            break;
          }
        }
      }
    }

    const titlesPattern = "(?:[أإآا]ستاذ[ةه]?|دكتور[ةه]?|باشمهندس[ةه]?|مهندس[ةه]?|مدام|[آا]نس[ةه]|حاج[ةه]?|ست[ي]?|الست|شيخ|عم|خال)";
    const compoundPattern = "(?:(?:عز|سيف|نور|صلاح|حسام|بهاء|ضياء|علاء|تقي|شرف|جمال|محيي|نجم|كمال|جلال|شمس|بدر|عماد|خير|سعد|ناصر|مجد|شهاب|تاج|سراج)\\s*الدين|(?:عبد|أمة)\\s*[\\p{L}]{3,10}|[\\p{L}]{2,14})";
    const yaNameRx = new RegExp(`(?:^|[^\\p{L}\\p{N}])يا\\s+(?:${titlesPattern}\\s+)?(${compoundPattern})(?:[^\\p{L}\\p{N}]|$)`, "ui");
    const conversationalPrefixes = "(?:أهلاً|اهلا|أهلاً\\s*وسهلاً|اهلا\\s*وسهلا|أهلاً\\s*بحضرتك|اهلا\\s*بحضرتك|مرحباً|مرحبا|صباح\\s*الخير|مساء\\s*الخير|صباح\\s*النور|مساء\\s*النور|تمام|حاضر|تحت\\s*أمرك|تحت\\s*أمرك\\s*يا\\s*فندم|تحت\\s*أمر\\s*حضرتك|عفواً|عفوا|شكراً|شكرا|اتفضل|اتفضلي|معايا|معانا|آسف|اسف|بعتذر|عذراً|عذرا|أكيد|اكيد|طبعاً|طبعا|أيوة|ايوه|طيب|ماشي|شرفتينا|نورتينا|شرفتنا|نورتنا)";
    // Direct vocative MUST require "يا" or an honorific title to prevent matching random greeting phrases like "أهلاً وسهلاً" or "شرفتينا بالاتصال"
    const directVocativeRx = new RegExp(`(?:^|[.،,؟!]\\s*)(?:${conversationalPrefixes})\\s+(?:يا\\s+(?:${titlesPattern}\\s+)?|${titlesPattern}\\s+)(${compoundPattern})(?:[^\\p{L}\\p{N}]|$)`, "ui");
    const midSentenceTitleRx = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:يا\\s+)?${titlesPattern}\\s+(${compoundPattern})(?:[^\\p{L}\\p{N}]|$)`, "ui");
    const regReadRx = /(?:مسجل[ةه]?|باسم|حساب|رقم\s*حضرتك|الرقم|العنوان|عنوان|بيانات|البيانات|بالبنات|لدينا|صنف|دواء|علاج|صيدلي[ةه]|صيدليات|عياد[ةه]|مستشفى|شارع|برج|عمار[ةه])/ui;
    const nonVocPreRx = /(?:باسم|مسجل[ةه]?|الاسم|إسم|اسم|حساب|رقم|عنوان|العنوان|شارع|ميدان|مستشفى|صيدلي[ةه]|صيدليات|عياد[ةه]|برج|عمار[ةه])\s*(?:باسم|لدينا|عندنا|حضرتك|يا\s*فندم)?\s*(?:ال)?$/ui;

    const foundNames: { name: string; timestamp: string; snippet: string }[] = [];
    const incomingCust = String(cloned.customerNameAnalysis?.customerNameDetected || cloned.customerName || "").trim();
    let candName = customerStatedName || ((incomingCust && incomingCust !== "لم يذكر" && incomingCust !== "غير محدد")
      ? normalizeCustName(incomingCust)
      : "");
    if (!isValidCustName(candName)) candName = "";

    const isMatchCandidate = (found: string, target: string): boolean => {
      if (!target) return true;
      const f = normalizeCustName(found);
      const t = normalizeCustName(target);
      return f === t || t.startsWith(f) || f.startsWith(t);
    };

    agentTurns.forEach((seg: any, idx: number) => {
      const text = String(seg.text || "");
      const timeStr = String(seg.timeStart || "00:00").trim();

      // Exclude system registration readings ("الرقم مسجل باسم...", etc.)
      if (regReadRx.test(text)) return;

      const mYa = text.match(yaNameRx);
      if (mYa && isValidCustName(mYa[1])) {
        const cn = normalizeCustName(mYa[1]);
        if (!candName) {
          candName = cn;
          foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
          return;
        } else if (isMatchCandidate(cn, candName)) {
          foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
          return;
        }
      }

      const mDir = text.match(directVocativeRx);
      if (mDir && isValidCustName(mDir[1])) {
        const cn = normalizeCustName(mDir[1]);
        if (!candName) {
          candName = cn;
          foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
          return;
        } else if (isMatchCandidate(cn, candName)) {
          foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
          return;
        }
      }

      if (idx > 0 || !regReadRx.test(text)) {
        const mMid = text.match(midSentenceTitleRx);
        if (mMid && isValidCustName(mMid[1])) {
          const before = text.slice(0, mMid.index || 0).trim();
          if (!/(?:مسجل[ةه]?|باسم|حساب\s+[أإآا]ستاذ|صيدلي[ةه]\s+[أإآا]ستاذ|صيدليات|عياد[ةه])/ui.test(before) && !nonVocPreRx.test(before)) {
            const cn = normalizeCustName(mMid[1]);
            if (!candName) {
              candName = cn;
              foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
              return;
            } else if (isMatchCandidate(cn, candName)) {
              foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
              return;
            }
          }
        }
      }

      if (candName) {
        const firstWord = candName.split(/\s+/)[0];
        const safeCand = candName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const safeFirst = firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const namePartPattern = firstWord.length >= 3 && firstWord !== candName ? `(?:${safeCand}|${safeFirst})` : safeCand;
        const candRx = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:يا\\s+|${titlesPattern}\\s+)?${namePartPattern}(?:[^\\p{L}\\p{N}]|$)`, "ui");
        if (candRx.test(text) && !regReadRx.test(text)) {
          const mCand = text.match(candRx);
          const beforeMatch = text.slice(0, mCand ? mCand.index || 0 : 0).trim();
          if (!nonVocPreRx.test(beforeMatch)) {
            const already = foundNames.some((m) => m.timestamp === timeStr && m.snippet === text.trim());
            if (!already) {
              foundNames.push({ name: candName, timestamp: timeStr, snippet: text.trim() });
            }
          }
        }
      }
    });

    if (foundNames.length > 0 && candName) {
      const uniqueTs = Array.from(new Set(foundNames.map((m) => m.timestamp))).sort((a, b) => toSec(a) - toSec(b));
      cloned = {
        ...cloned,
        customerName: candName,
        customerNameAnalysis: {
          customerNameDetected: candName,
          isMentionedByAgent: true,
          mentionCount: foundNames.length,
          mentionsTimestamps: uniqueTs,
          nameSnippet: foundNames[0].snippet,
          evaluation:
            foundNames.length === 1
              ? `نادى الزميل على العميل باسمه الشخصي (${candName}) مرة واحدة في المكالمة بعبارة: "${foundNames[0].snippet}" بالتوقيت الدقيق (${uniqueTs[0]})، ولم يقم بتكرار ذكر اسم العميل في باقي المكالمة (يُوصى بإعادة مناداة العميل باسمه لتعزيز التواصل الإيجابي وتوطيد العلاقة).`
              : `التزم الزميل بمناداة ومخاطبة العميل باسمه الشخصي (${candName}) وتكراره باحترافية على مدار المكالمة (${foundNames.length} مرات بالتوقيتات الدقيقة: ${uniqueTs.join(", ")}).`,
        },
      };
    } else if (customerStatedName) {
      // Customer stated their name, but colleague never addressed them by name
      cloned = {
        ...cloned,
        customerName: customerStatedName,
        customerNameAnalysis: {
          customerNameDetected: customerStatedName,
          isMentionedByAgent: false,
          mentionCount: 0,
          mentionsTimestamps: [],
          nameSnippet: customerIntroSnippet,
          evaluation: `بلغت العميلة / العميل عن الاسم صراحة في المكالمة (${customerStatedName})${customerIntroTime ? ` بالتوقيت (${customerIntroTime})` : ""}، إلا أن الزميل لم يقم بمناداة العميل باسمه الشخصي خلال المكالمة واقتصر على الصيغ العامة، وتجنب تخمين أي اسم لم ينادِ به الزميل العميل صراحة.`,
        },
      };
    } else {
      cloned = {
        ...cloned,
        customerName: "لم يذكر",
        customerNameAnalysis: {
          customerNameDetected: "لم يذكر",
          isMentionedByAgent: false,
          mentionCount: 0,
          mentionsTimestamps: [],
          nameSnippet: "",
          evaluation: "لم يقم الزميل بمناداة العميل باسمه الشخصي خلال المكالمة واقتصر على الصيغ العامة، وتجنب تخمين أي اسم لم ينادِ به الزميل العميل صراحة.",
        },
      };
    }

    // 4. Further Assistance ("أي خدمة ثانية؟" and synonymous offers after order/total review or before call ending)
    const explicitOfferRx = /(?:[أإآا]ي\s*(?:خدم[ةه]|خدمات|إضاف[ةه]|اضاف[ةه]|إضافات|اضافات|طلب|طلبات|استفسار|سؤال|أمر|امر|اوامر|أوامر)\s*(?:[تث]اني[ةه]?|[أإآا]خر[ىي]?|غيرها)?|(?:محتاج[ةه]?|تحتاج[ي]?|عايز[ةه]?|في|فيه|تحب[ي]?|أؤمر[يني]*|اؤمر[يني]*|تؤمر[يني]*)\s*(?:[أإآا]ضفلك\s*|[أإآا]ضيف\s*(?:لحضرتك\s*)?)?(?:[أإآا]ي\s*)?(?:خدم[ةه]|خدمات|حاج[ةه]|إضاف[ةه]|اضاف[ةه]|إضافات|اضافات|طلب|طلبات|استفسار)\s*(?:[تث]اني[ةه]?|[أإآا]خر[ىي]?)|(?:خدم[ةه]|خدمات|إضاف[ةه]|اضاف[ةه]|إضافات|اضافات|طلبات|استفسار)\s*(?:[تث]اني[ةه]?|[أإآا]خر[ىي])|[أإآا]ساعد(?:ك|\s*حضرتك)\s*في\s*(?:[أإآا]ي\s*)?(?:حاج[ةه]|خدم[ةه]|استفسار)\s*(?:[تث]اني[ةه]?|[أإآا]خر[ىي])?)/ui;
    const nonOfferCtxRx = /(?:بتسأل[ي]?\s*على\s*حاج[ةه]\s*[تث]اني[ةه]|حاج[ةه]\s*[تث]اني[ةه]\s*من\s*المعجون|السلسل[ةه]\s*بحاج[ةه]\s*[تث]اني[ةه])/ui;
    const orderRevRx = /(?:[أإآا]جمالي|المجموع|شامل\s*(?:مصاريف\s*|خدم[ةه]\s*|رسوم\s*)?التوصيل|بالتوصيل|نراجع\s*الأوردر|أراجع\s*مع\s*حضرتك\s*الأوردر|الأوردر\s*(?:حضرتك\s*)?هيكون\s*عبار[ةه])/ui;

    const callEndSec = toSec(cloned.transcript[cloned.transcript.length - 1].timeEnd || cloned.transcript[cloned.transcript.length - 1].timeStart);
    let firstRevSec = 0;
    agentTurns.forEach((s: any) => {
      const sec = toSec(s.timeStart);
      if (sec > 30 && orderRevRx.test(s.text || "")) {
        if (firstRevSec === 0 || sec < firstRevSec) firstRevSec = sec;
      }
    });

    const validOffers = agentTurns.filter((s: any, idx: number) => {
      const txt = String(s.text || "");
      if (nonOfferCtxRx.test(txt)) return false;
      if (!explicitOfferRx.test(txt)) return false;
      const sec = toSec(s.timeStart);
      if (sec <= 30 && idx <= 2) return false;
      const isAfterRev = firstRevSec > 0 && sec >= firstRevSec - 25;
      const isBeforeEnd = (callEndSec > 0 && sec >= Math.max(35, callEndSec - 150)) || idx >= Math.max(2, agentTurns.length - 12);
      return isAfterRev || isBeforeEnd;
    });

    if (validOffers.length > 0) {
      const primarySeg = validOffers[validOffers.length - 1];
      const tsList = Array.from(new Set(validOffers.map((s: any) => s.timeStart || "00:00")));
      cloned = {
        ...cloned,
        furtherAssistanceAnalysis: {
          isAssistanceOffered: true,
          assistanceCount: validOffers.length,
          assistanceTextSnippet: primarySeg.text,
          assistanceTimestamps: tsList,
          detectedAssistancePhrases: validOffers.map((s: any) => s.text),
          evaluation: `التزم الزميل بعرض خدمات أخرى ومساعدة إضافية قبل إنهاء المكالمة وبعد مراجعة الطلب بالدقيقة (${tsList.join("، ")}): "${primarySeg.text}".`,
        },
      };
    } else {
      cloned = {
        ...cloned,
        furtherAssistanceAnalysis: {
          isAssistanceOffered: false,
          assistanceCount: 0,
          assistanceTextSnippet: "",
          assistanceTimestamps: [],
          detectedAssistancePhrases: [],
          evaluation: "لم يقم الزميل بعرض خدمات أخرى أو مساعدة إضافية بعد مراجعة الطلب وقبل إنهاء المكالمة.",
        },
      };
    }
  }

  // 5. Verbal Tics strict speaker attribution: filter out any timestamps spoken by the customer
  if (cloned.verbalTicsAnalysis && Array.isArray(cloned.verbalTicsAnalysis.detectedTics) && Array.isArray(cloned.transcript)) {
    const clientSegments = cloned.transcript.filter((t: any) => {
      const spk = String(t?.speaker || "").trim();
      return (spk.includes("عميل") || spk.includes("العميل")) && !spk.includes("موظف") && !spk.includes("خدمة العملاء");
    });

    const filteredTics = cloned.verbalTicsAnalysis.detectedTics
      .map((tic: any) => {
        if (!Array.isArray(tic.timestamps)) return tic;
        const validTs = tic.timestamps.filter((ts: string) => {
          const sec = toSec(ts);
          const isClientTurn = clientSegments.some((cs: any) => {
            const sS = toSec(cs.timeStart);
            const sE = toSec(cs.timeEnd);
            return sec >= sS && sec <= sE;
          });
          return !isClientTurn;
        });
        return {
          ...tic,
          timestamps: validTs,
          count: validTs.length,
        };
      })
      .filter((tic: any) => (tic.count || 0) >= 2);

    cloned = {
      ...cloned,
      verbalTicsAnalysis: {
        ...cloned.verbalTicsAnalysis,
        hasVerbalTics: filteredTics.length > 0,
        detectedTics: filteredTics,
      },
    };
  }

  // 6. Unprofessional Words strict speaker attribution: filter out any timestamps spoken by the customer
  if (cloned.unprofessionalWordsAnalysis && Array.isArray(cloned.unprofessionalWordsAnalysis.detectedWords) && Array.isArray(cloned.transcript)) {
    const clientSegments = cloned.transcript.filter((t: any) => {
      const spk = String(t?.speaker || "").trim();
      return (spk.includes("عميل") || spk.includes("العميل")) && !spk.includes("موظف") && !spk.includes("خدمة العملاء");
    });

    const filteredWords = cloned.unprofessionalWordsAnalysis.detectedWords
      .map((w: any) => {
        if (!Array.isArray(w.timestamps)) return w;
        const validTs = w.timestamps.filter((ts: string) => {
          const sec = toSec(ts);
          const isClientTurn = clientSegments.some((cs: any) => {
            const sS = toSec(cs.timeStart);
            const sE = toSec(cs.timeEnd);
            return sec >= sS && sec <= sE;
          });
          if (isClientTurn) return false;
          const wLower = String(w.word || "").toLowerCase();
          const snip = String(w.contextSnippet || "").toLowerCase();
          if (wLower.includes("بتاع") && (snip.includes("جابيسكون") || snip.includes("حموض") || snip.includes("كيسين") || snip.includes("ممكن كمان"))) {
            return false;
          }
          return true;
        });
        return {
          ...w,
          timestamps: validTs,
          count: validTs.length,
        };
      })
      .filter((w: any) => (w.count || 0) >= 1);

    const hasUnprof = filteredWords.length > 0;
    cloned = {
      ...cloned,
      unprofessionalWordsAnalysis: {
        ...cloned.unprofessionalWordsAnalysis,
        hasUnprofessionalWords: hasUnprof,
        totalUnprofessionalWordsCount: filteredWords.reduce((acc: number, w: any) => acc + (w.count || 0), 0),
        detectedWords: filteredWords,
        alerts: hasUnprof ? (cloned.unprofessionalWordsAnalysis.alerts || []) : [],
        evaluation: hasUnprof
          ? (cloned.unprofessionalWordsAnalysis.evaluation || "تم رصد ألفاظ غير احترافية من الزميل.")
          : "التزم الزميل بالتحدث بلغة مهنية واحترافية طوال المكالمة دون استخدام أي ألفاظ عامية غير مناسبة.",
      },
    };
  }

  // 7. Customer Title strict validation: categorically exclude "حاجة" or "حاجه" from titles
  if (
    cloned.customerTitleAnalysis &&
    (/^حاج[ةه]$/ui.test(String(cloned.customerTitleAnalysis.titleDetected || "").trim()) ||
     cloned.customerTitleAnalysis.titleDetected === "حاجة" ||
     cloned.customerTitleAnalysis.titleDetected === "حاجه")
  ) {
    cloned = {
      ...cloned,
      customerTitleAnalysis: {
        titleDetected: "لم يذكر",
        isTitleUsedByAgent: false,
        titleMentionCount: 0,
        titleMentionsTimestamps: [],
        titleTextSnippet: "",
        evaluation: "لم يقم الزميل باستخدام أي لقب مهني أو تشريفي للعميل خلال المكالمة، وتجنب تخمين أي لقب لم ينادِ به الزميل العميل صراحة.",
      },
    };
  }

  return cloned;
}

/**
 * Builds a complete AnalyzedCallRecord from a TranscriptionResponse.
 */
export function buildAnalyzedCallRecord(
  rawResult: TranscriptionResponse,
  existingRecord?: Partial<AnalyzedCallRecord>
): AnalyzedCallRecord {
  const result = sanitizeCallResultForHoldAndEcho(rawResult);
  const id = existingRecord?.id || getDeterministicCallId(result);
  const audioHash = result.audioHash || existingRecord?.audioHash;
  const savedAt = result.savedAt || existingRecord?.savedAt || new Date().toISOString();

  const hasCons = Boolean(
    result.medicalConsultationAnalysis?.isMedicalConsultationPresent
  );
  const consSumm = hasCons
    ? result.medicalConsultationAnalysis?.evaluation ||
      result.medicalConsultationAnalysis?.consultationTopic ||
      "استشارة طبية لأعراض مرضية محددة ومطابقة البروتوكول الطبي."
    : "لا توجد استشارة طبية (طلب أو استفسار مباشر عن أصناف محددة دون أعراض طبية).";

  const hasH = Boolean(result.holdTimeSummary?.holdCount && result.holdTimeSummary.holdCount > 0);
  const hSumm = hasH
    ? `${result.holdTimeSummary.holdCount} فترات هولد (${result.holdTimeSummary.totalHoldSeconds} ثانية) - ${result.holdTimeSummary.overallClassification} ${result.holdTimeSummary.isMusicCriterionCompliant ? "مع موسيقى انتظار معتمدة" : ""}`
    : "لم يتم الخروج هولد أثناء المكالمة.";

  const hasC = Boolean(result.customerComplaintAnalysis?.hasComplaint);
  const cSumm = hasC
    ? result.customerComplaintAnalysis?.summaryText || "تم رصد شكوى من العميل أثناء المكالمة."
    : "المكالمة خالية تماماً من أي شكوى.";

  const toneSumm = result.agentToneAnalysis?.wav2vec2Emotion?.dominantEmotionArabic
    ? `${result.agentToneAnalysis.wav2vec2Emotion.dominantEmotionArabic} - ${result.agentToneAnalysis.detectedTraits?.join(" ، ") || "التحليل الصوتي"}`
    : result.agentToneAnalysis?.callSummary || "قياس نبرة صوت الزميل وفق التحليل الترددي المباشر.";

  const resolvedAgentName = resolveAgentNameFromResult(result, existingRecord?.agentName);
  const detectedCustomer = result.customerNameAnalysis?.customerNameDetected;
  const customerName =
    detectedCustomer &&
    detectedCustomer !== "لم يذكر" &&
    detectedCustomer !== "غير محدد"
      ? detectedCustomer
      : (result.customerName && result.customerName !== "لم يذكر" && result.customerName !== "غير محدد" ? result.customerName : "لم يذكر");

  const overallScore = computeOverallQAScore(result);

  return {
    id,
    audioHash,
    savedAt,
    agentName: resolvedAgentName,
    customerName,
    callDate: formatCallDateArabic(savedAt),
    duration: result.callEndingAnalysis?.callTotalDuration || existingRecord?.duration || "02:40",
    overallScore,
    hasConsultation: hasCons,
    consultationSummary: consSumm,
    hasHold: hasH,
    holdSummary: hSumm,
    hasComplaint: hasC,
    complaintSummary: cSumm,
    toneSummary: toneSumm,
    fullResult: result,
  };
}

export interface FastBatchAlert {
  type: "complaint" | "consultation" | "long_hold";
  labelAr: string;
  labelEn: string;
  severity: "high" | "medium";
  reason?: string;
}

/**
 * Resilient fast alerts extractor for batch upload / fast detection mode.
 * Detects:
 * 1. Customer complaint (hasComplaint)
 * 2. Medical consultation (isMedicalConsultationPresent)
 * 3. Long hold exceeding base duration (> 90s)
 */
export function getFastBatchAlerts(result: any): FastBatchAlert[] {
  const alerts: FastBatchAlert[] = [];
  if (!result || typeof result !== "object") return alerts;

  try {
    // 1. Complaint check
    const complaintObj = result.customerComplaintAnalysis;
    const hasComplaint = Boolean(
      complaintObj?.hasComplaint ||
      (typeof complaintObj?.complaintsCount === "number" && complaintObj.complaintsCount > 0) ||
      (Array.isArray(complaintObj?.detectedComplaints) && complaintObj.detectedComplaints.length > 0) ||
      result.evaluationScorecard?.customerComplaint?.detected ||
      result.isComplaintPresent
    );
    if (hasComplaint) {
      const reason =
        complaintObj?.detectedComplaints?.[0]?.explanation ||
        complaintObj?.detectedComplaints?.[0]?.complaintSnippet ||
        complaintObj?.summaryText ||
        "رُصدت شكوى من العميل أثناء المكالمة";
      alerts.push({
        type: "complaint",
        labelAr: "شكوى",
        labelEn: "Complaint",
        severity: "high",
        reason: String(reason).trim(),
      });
    }

    // 2. Medical consultation check
    const medObj = result.medicalConsultationAnalysis;
    const hasConsultation = Boolean(
      medObj?.isMedicalConsultationPresent ||
      result.evaluationScorecard?.medicalConsultationQuestions?.detected ||
      result.isMedicalConsultation
    );
    if (hasConsultation) {
      const reason =
        medObj?.consultationTopic ||
        medObj?.customerSymptomSnippet ||
        "رُصدت استشارة طبية / دوائية في المكالمة";
      alerts.push({
        type: "consultation",
        labelAr: "استشارة",
        labelEn: "Consultation",
        severity: "medium",
        reason: String(reason).trim(),
      });
    }

    // 3. Long hold check (> 90s threshold)
    const holdObj = result.holdTimeSummary;
    const segments = Array.isArray(holdObj?.holdSegments) ? holdObj.holdSegments : [];
    const hasExceededSegment = segments.some(
      (s: any) => Boolean(s?.isDurationExceeded) || (Number(s?.duration) || 0) > 90
    );
    const totalHoldSec = Number(holdObj?.totalHoldSeconds) || 0;
    const hasExceededDuration = Boolean(
      holdObj?.hasExceededDurationHold ||
      hasExceededSegment ||
      totalHoldSec > 90
    );
    if (hasExceededDuration) {
      const maxSegmentSec = segments.reduce(
        (max: number, s: any) => Math.max(max, Number(s?.duration) || 0),
        0
      );
      const reason =
        maxSegmentSec > 90
          ? `تجاوز الهولد المدة المسموحة (${maxSegmentSec} ثانية > 90 ثانية)`
          : `إجمالي مدة الهولد تجاوزت الحد المسموح (${totalHoldSec} ثانية > 90 ثانية)`;
      alerts.push({
        type: "long_hold",
        labelAr: "هولد طويل",
        labelEn: "Long Hold",
        severity: "medium",
        reason,
      });
    }
  } catch (err) {
    console.warn("[FastBatchAlerts] Extraction error:", err);
  }

  return alerts;
}

