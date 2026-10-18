import { describe, it, expect } from "vitest";
import {
  detectGenuineIllnessConsultation,
  isDirectItemIndicationOrder,
  isConsultationInquiry,
} from "../src/utils/medicalConsultation";
import {
  CUSTOMER_COMPLAINT_REGEX,
  ROUTINE_URGENCY_REGEX,
  isCustomerCommunicationComplaint,
} from "../src/utils/complaintDetection";

describe("Medical Consultation & Item Indication Rules", () => {
  it("does NOT count ordering an item with indication (e.g. عايز بروسبان للكحة) as a consultation", () => {
    const text1 = "عايز بروسبان للكحة لو سمحت";
    const text2 = "محتاج بنادول للصداع";
    const text3 = "عايزة علبة نوفاسي للبرد";
    const text4 = "ابعتلي كتافلام لوجع الأسنان";

    expect(isDirectItemIndicationOrder(text1)).toBe(true);
    expect(isDirectItemIndicationOrder(text2)).toBe(true);
    expect(isDirectItemIndicationOrder(text3)).toBe(true);
    expect(isDirectItemIndicationOrder(text4)).toBe(true);

    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text1 }])).toBe(false);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text2 }])).toBe(false);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text3 }])).toBe(false);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text4 }])).toBe(false);
  });

  it("DOES count asking whether to use the drug (e.g. عايز دواء للكحة هل استخدم بروسبان) as a consultation", () => {
    const text1 = "عايز دواء للكحة، هل استخدم بروسبان؟";
    const text2 = "عايز دواء للكحة هل استخدم بروسبان";
    const text3 = "عندي كحة ينفع استخدم بروسبان؟";
    const text4 = "عايز علاج للكحة ومش عارف اخد ايه";

    expect(isConsultationInquiry(text1)).toBe(true);
    expect(isConsultationInquiry(text2)).toBe(true);
    expect(isConsultationInquiry(text3)).toBe(true);
    expect(isConsultationInquiry(text4)).toBe(true);

    expect(isDirectItemIndicationOrder(text1)).toBe(false);
    expect(isDirectItemIndicationOrder(text2)).toBe(false);

    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text1 }])).toBe(true);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text2 }])).toBe(true);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text3 }])).toBe(true);
    expect(detectGenuineIllnessConsultation([{ speaker: "العميل", text: text4 }])).toBe(true);
  });
});

describe("Customer Complaint Detection for WhatsApp & Communication Issues", () => {
  it("detects the customer's exact complaint about WhatsApp and disconnected call", () => {
    const customerQuote =
      "كنت كتبت على الواتساب من شوية، وفي حد أستاذة هاجر ردت، يعني عرفتني بنفسها وخلصت، والخط قطع، ما كلمتنيش أو ما بعتتليش تاني يعني.";

    expect(CUSTOMER_COMPLAINT_REGEX.test(customerQuote)).toBe(true);
    expect(isCustomerCommunicationComplaint(customerQuote)).toBe(true);
  });

  it("detects WhatsApp unresponsiveness and lack of callback complaints", () => {
    expect(CUSTOMER_COMPLAINT_REGEX.test("بعت على الواتس ومحدش رد عليا")).toBe(true);
    expect(CUSTOMER_COMPLAINT_REGEX.test("الخط قطع ومحدش رجع كلمني تاني")).toBe(true);
    expect(CUSTOMER_COMPLAINT_REGEX.test("كتبت على الواتساب ومحدش تواصل معايا")).toBe(true);
    expect(isCustomerCommunicationComplaint("بعت على الواتس ومحدش رد عليا")).toBe(true);
    expect(isCustomerCommunicationComplaint("الخط قطع ومحدش رجع كلمني تاني")).toBe(true);
  });

  it("differentiates routine urgency from genuine complaints", () => {
    const routineUrgency = "لو سمحت بس أوردر مستعجل عشان مسافر";
    expect(ROUTINE_URGENCY_REGEX.test(routineUrgency)).toBe(true);
    expect(CUSTOMER_COMPLAINT_REGEX.test(routineUrgency)).toBe(false);
  });
});
