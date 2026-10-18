/**
 * Detection of genuine symptom-driven consultations.
 * The previous regex only matched phrasings such as "دواء للسخونية" and missed callers who simply
 * described the patient's symptoms ("كان سخن… بدأ يكح… ترجيع…"). Detection now relies on the number of
 * distinct symptom groups the CUSTOMER mentions, so plain product orders ("عايزة بنادول") stay non-consultations.
 */

export const normalizeArabic = (s: string): string =>
  String(s || "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

export const SYMPTOM_GROUPS: Record<string, { label: string; stems: string[] }> = {
  fever: { label: "سخونة", stems: ["سخون", "سخن", "يسخن", "بيسخن", "حرار", "حمي"] },
  cough: { label: "كحة", stems: ["كح", "يكح", "بيكح", "بتكح", "تكح", "سعال", "بلغم"] },
  cold: { label: "برد", stems: ["برد", "زكام", "رشح", "احتقان", "عطس", "انفلونز"] },
  gi: { label: "أعراض هضمية", stems: ["ترجيع", "قيء", "استفراغ", "اسهال", "امساك", "مغص", "غثيان"] },
  pain: { label: "ألم", stems: ["صداع", "وجع", "يوجع", "بيوجع", "بتوجع", "صدع"] },
  skin: { label: "أعراض جلدية", stems: ["حكه", "هرش", "طفح", "احمرار"] },
  dizzy: { label: "دوخة", stems: ["دوخه", "دوار"] },
};

const tokens = (text: string): string[] => normalizeArabic(text).split(/[^\u0621-\u064A]+/).filter(Boolean);

/** a token plus the forms obtained by stripping attached conjunction/preposition prefixes (و، وال، بال، لل، ال) */
const withoutPrefixes = (t: string): string[] => {
  const out = new Set<string>([t]);
  for (const re of [/^و/, /^(?:وال|بال|لل|ال)/, /^و(?:ال)/]) { const x = t.replace(re, ""); if (x.length >= 2) out.add(x); }
  const noWaw = t.replace(/^و/, "");
  const noAl = noWaw.replace(/^(?:ال|بال|لل)/, "");
  if (noAl.length >= 2) out.add(noAl);
  return [...out];
};

/** distinct symptom groups mentioned in a piece of text */
export function symptomGroupsIn(text: string): string[] {
  const toks = tokens(text);
  const found: string[] = [];
  for (const [key, g] of Object.entries(SYMPTOM_GROUPS)) {
    if (toks.some((t) => withoutPrefixes(t).some((v) => g.stems.some((st) => v.startsWith(st)) || (key === "pain" && v === "الم")))) found.push(key);
  }
  return found;
}

const isCustomer = (t: any) => String(t?.speaker || "").includes("العميل");
const isAgent = (t: any) => {
  const s = String(t?.speaker || "");
  return s.includes("موظف") || s.includes("زميل") || s.includes("خدمة العملاء");
};

/** Protocol-style questions an agent asks during a consultation (age, onset, other symptoms, pregnancy, allergy…) */
const AGENT_PROTOCOL_Q =
  /كام\s*سن|السن\s*كام|العمر\s*كام|عمره?\s*كام|أعراض\s*(?:تاني|أخري|اخري)|اعراض\s*(?:تاني|اخري)|بقاله?\s*كام\s*يوم|من\s*امتي|حمل\s*او\s*رضاع|حساسي/u;

/**
 * Check if the caller is explicitly asking whether to use a medication,
 * asking what to take, or asking for recommendation:
 * e.g. "عايز دواء للكحة، هل استخدم بروسبان؟" or "عندي كحة ينفع اخد بروسبان؟"
 */
export function isConsultationInquiry(text: string): boolean {
  const norm = normalizeArabic(text);
  return (
    /(?:هل\s*(?:استخدم|أستخدم|استعمل|أستعمل|اخد|آخد|ينفع)|ينفع\s*(?:استخدم|أستخدم|اخد|آخد)|تنصح|ترشح|اخد\s*ايه|أعمل\s*إيه|اعمل\s*ايه|مش\s*عارف\s*(?:اخد|آخد)\s*ايه)/i.test(norm) ||
    /(?:دواء|دوا|علاج|حاج[ةه])\s*(?:لـ?|عشان|لعلاج)?\s*(?:الكح[ةه]|البرد|السخوني[ةه]|الصداع|المغص|الاسهال)\s+.*?(?:هل|ينفع|تنصح|ترشح|ايه|بروسبان|عارف)/i.test(norm) ||
    /(?:عايز[ةه]?|محتاج[ةه]?)\s*(?:دواء|دوا|علاج|حاج[ةه])\s*(?:لـ?|عشان|لعلاج)\s*(?:الكح[ةه]|البرد|السخوني[ةه]|الصداع|المغص|الاسهال|الحساسي[ةه])/i.test(norm)
  );
}

/**
 * Check if the caller is directly ordering a specific medication by brand name
 * while merely mentioning its indication:
 * e.g. "عايز بروسبان للكحة", "محتاج بنادول للصداع", "عايزة نوفاسي للبرد"
 * (Direct item order, NOT a medical consultation).
 */
export function isDirectItemIndicationOrder(text: string): boolean {
  const norm = normalizeArabic(text);
  if (isConsultationInquiry(text)) return false;
  return /(?:(?:عايز[ةه]?|عاوز[ةه]?|محتاج[ةه]?|ابعتلي|هاتلي|عندك|فيه|ممكن|علب[ةه]|شريط|ازاز[ةه]|قرص|باكت)\s+[^\n.،؟]+?\s+(?:لل|ل|لوجع\s*ال?|لعلاج\s*ال?|عشان\s*ال?)?(?:كح[ةه]|برد|سخوني[ةه]|حرار[ةه]|صداع|مغص|اسنان|احتقان|حساسي[ةه]|تورم|اسهال|امساك|حموض[ةه]|حرقان|رشح|زكام|بلغم))/i.test(norm);
}

export function detectGenuineIllnessConsultation(transcript: any[]): boolean {
  const turns = Array.isArray(transcript) ? transcript : [];
  const custTurns = turns.filter(isCustomer);
  const custText = custTurns.map((t) => String(t.text || "")).join(" ");

  // 1. Explicit consultation inquiry (e.g. "عايز دواء للكحة هل استخدم بروسبان")
  if (isConsultationInquiry(custText)) return true;

  // 2. Direct product order with indication (e.g. "عايز بروسبان للكحة") is NOT a consultation
  if (isDirectItemIndicationOrder(custText)) return false;

  // 3. Multi-symptom description or single symptom with agent protocol questions
  const groups = symptomGroupsIn(custText);
  if (groups.length >= 2) return true;
  if (groups.length === 1) {
    const protocolQs = turns.filter(isAgent).filter((t) => AGENT_PROTOCOL_Q.test(normalizeArabic(String(t.text || "")))).length;
    return protocolQs >= 2;
  }
  return false;
}

/** customer turns that actually describe symptoms (used as the evidence snippet) */
export function symptomTurnsOf(custTurns: any[]): any[] {
  return (custTurns || []).filter((t) => symptomGroupsIn(String(t?.text || "")).length > 0);
}

export function consultationTopicFor(transcript: any[]): string {
  const custText = (transcript || []).filter(isCustomer).map((t) => String(t.text || "")).join(" ");
  const labels = symptomGroupsIn(custText).map((k) => SYMPTOM_GROUPS[k].label);
  return labels.length ? `استشارة طبية لعلاج أعراض: ${labels.join("، ")}` : "استشارة طبية لعلاج أعراض مرضية";
}

export const activeIllnessConsultationRegex =
  /(?:سخن|سخون|حرار|حمي|كح|سعال|بلغم|برد|زكام|رشح|احتقان|عطس|انفلونز|ترجيع|قيء|استفراغ|اسهال|امساك|مغص|غثيان|صداع|وجع|الم|حك|هرش|طفح|احمرار|دوخ|دوار)/ui;

