import { describe, it, expect } from "vitest";
import { getFastBatchAlerts } from "../src/components/BatchUploadPanel";

describe("getFastBatchAlerts", () => {
  it("returns empty array for null, undefined, or empty objects", () => {
    expect(getFastBatchAlerts(null)).toEqual([]);
    expect(getFastBatchAlerts(undefined)).toEqual([]);
    expect(getFastBatchAlerts({})).toEqual([]);
  });

  it("detects customer complaint from customerComplaintAnalysis.hasComplaint", () => {
    const mock = {
      customerComplaintAnalysis: {
        hasComplaint: true,
        complaintsCount: 1,
        detectedComplaints: [
          {
            category: "order_delay",
            complaintSnippet: "الأوردر اتأخر عليا ساعتين",
            explanation: "تأخير توصيل الطلب",
          },
        ],
      },
    };
    const alerts = getFastBatchAlerts(mock);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "complaint",
      labelAr: "شكوى",
      labelEn: "Complaint",
      severity: "high",
      reason: "تأخير توصيل الطلب",
    });
  });

  it("detects medical consultation from isMedicalConsultationPresent", () => {
    const mock = {
      medicalConsultationAnalysis: {
        isMedicalConsultationPresent: true,
        consultationTopic: "جرعة الباراسيتامول للأطفال",
        customerSymptomSnippet: "عايز اعرف جرعة الباراسيتامول للطفل سنتين",
      },
    };
    const alerts = getFastBatchAlerts(mock);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "consultation",
      labelAr: "استشارة",
      labelEn: "Consultation",
      severity: "medium",
      reason: "جرعة الباراسيتامول للأطفال",
    });
  });

  it("detects long hold exceeding 90 seconds limit", () => {
    const mock = {
      holdTimeSummary: {
        hasExceededDurationHold: true,
        totalHoldSeconds: 120,
        holdSegments: [
          {
            timeStart: "01:00",
            timeEnd: "03:00",
            duration: 120,
            isDurationExceeded: true,
          },
        ],
      },
    };
    const alerts = getFastBatchAlerts(mock);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "long_hold",
      labelAr: "هولد طويل",
      labelEn: "Long Hold",
      severity: "medium",
    });
    expect(alerts[0].reason).toContain("120 ثانية > 90 ثانية");
  });

  it("detects multiple alerts simultaneously when all 3 criteria are triggered", () => {
    const mock = {
      customerComplaintAnalysis: {
        hasComplaint: true,
        detectedComplaints: [{ explanation: "سوء معاملة من الكول سنتر" }],
      },
      medicalConsultationAnalysis: {
        isMedicalConsultationPresent: true,
        consultationTopic: "مضاد حيوي",
      },
      holdTimeSummary: {
        hasExceededDurationHold: true,
        totalHoldSeconds: 150,
      },
    };
    const alerts = getFastBatchAlerts(mock);
    expect(alerts).toHaveLength(3);
    const types = alerts.map((a) => a.type);
    expect(types).toContain("complaint");
    expect(types).toContain("consultation");
    expect(types).toContain("long_hold");
  });

  it("handles malformed or unexpected data resiliently without throwing", () => {
    const malformed = {
      customerComplaintAnalysis: "invalid string",
      medicalConsultationAnalysis: 12345,
      holdTimeSummary: null,
    };
    expect(() => getFastBatchAlerts(malformed)).not.toThrow();
    expect(getFastBatchAlerts(malformed)).toEqual([]);
  });
});
