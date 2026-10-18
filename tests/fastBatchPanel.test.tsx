// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { BatchUploadPanel } from "../src/components/BatchUploadPanel";

const audio = (name: string) =>
  new File([new Uint8Array(50)], name, { type: "audio/mpeg", lastModified: 1 });

describe("BatchUploadPanel Fast Detection Mode UI", () => {
  it("renders complaint, consultation, and long-hold alert badges and top breakdown summary", async () => {
    const mockFastResult = {
      fileName: "call1.mp3",
      customerComplaintAnalysis: {
        hasComplaint: true,
        detectedComplaints: [{ explanation: "شكوى تأخير توصيل" }],
      },
      medicalConsultationAnalysis: {
        isMedicalConsultationPresent: true,
        consultationTopic: "استشارة حساسية الدواء",
      },
      holdTimeSummary: {
        hasExceededDurationHold: true,
        totalHoldSeconds: 110,
        holdSegments: [{ duration: 110, isDurationExceeded: true }],
      },
      cacheHit: false,
    };

    const transcribe = vi.fn(async () => mockFastResult);
    render(<BatchUploadPanel processingMode="fast_detection" transcribe={transcribe as any} />);

    // Expand panel
    fireEvent.click(screen.getByRole("button", { name: /رفع دفعي/ }));

    // Add audio file
    fireEvent.change(screen.getByTestId("batch-input"), {
      target: { files: [audio("call1.mp3")] },
    });

    // Start detection
    fireEvent.click(screen.getByRole("button", { name: /بدء التحليل/ }));

    // Wait until done
    await waitFor(() =>
      expect(screen.getByTestId("batch-status-call1.mp3")).toHaveTextContent("تم")
    );

    // Verify fast detection was called with processingMode: fast_detection
    const firstCallArgs = (transcribe.mock.calls as any[][])[0];
    expect(firstCallArgs?.[1]).toMatchObject({
      processingMode: "fast_detection",
    });

    // Verify badges in the item row
    const list = screen.getByTestId("batch-list");
    expect(within(list).getByText("شكوى")).toBeInTheDocument();
    expect(within(list).getByText("استشارة")).toBeInTheDocument();
    expect(within(list).getByText("هولد طويل")).toBeInTheDocument();

    // Verify "تحليل كامل" button is present
    expect(within(list).getByRole("button", { name: /تحليل كامل/ })).toBeInTheDocument();

    // Verify top summary alert counter
    expect(screen.getByTestId("batch-summary")).toHaveTextContent("3 تنبيه");
  });

  it("triggers separate full analysis when clicking 'تحليل كامل' button", async () => {
    let callCount = 0;
    const transcribe = vi.fn(async (_file: File, opts?: any) => {
      callCount++;
      if (opts?.processingMode === "transcription_with_analysis") {
        return {
          fileName: "call2.mp3",
          overallScore: 92,
          evaluationScorecard: {},
        };
      }
      return {
        fileName: "call2.mp3",
        customerComplaintAnalysis: { hasComplaint: false },
        medicalConsultationAnalysis: { isMedicalConsultationPresent: false },
        holdTimeSummary: { hasExceededDurationHold: false, totalHoldSeconds: 15 },
      };
    });

    const onSelectResult = vi.fn();
    render(
      <BatchUploadPanel
        processingMode="fast_detection"
        transcribe={transcribe as any}
        onSelectResult={onSelectResult}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /رفع دفعي/ }));
    fireEvent.change(screen.getByTestId("batch-input"), {
      target: { files: [audio("call2.mp3")] },
    });
    fireEvent.click(screen.getByRole("button", { name: /بدء التحليل/ }));

    await waitFor(() =>
      expect(screen.getByTestId("batch-status-call2.mp3")).toHaveTextContent("تم")
    );

    // Initial batch run used fast_detection
    const calls = transcribe.mock.calls as any[][];
    expect(calls[0]?.[1]).toMatchObject({
      processingMode: "fast_detection",
    });

    // Now click on demand full analysis
    const fullAnalysisBtn = screen.getByRole("button", { name: /تحليل كامل/ });
    fireEvent.click(fullAnalysisBtn);

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(2));
    const updatedCalls = transcribe.mock.calls as any[][];
    expect(updatedCalls[1]?.[1]).toMatchObject({
      processingMode: "transcription_with_analysis",
    });
    expect(onSelectResult).toHaveBeenCalledWith(
      expect.objectContaining({ overallScore: 92 })
    );
  });
});
