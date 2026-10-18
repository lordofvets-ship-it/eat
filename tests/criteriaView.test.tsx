// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CallQualityCriteriaView } from "../src/components/CallQualityCriteriaView";
import { DEFAULT_MEASUREMENT_SETTINGS } from "../src/types";

describe("CallQualityCriteriaView", () => {
  it("renders the 6 standard columns accurately without changing logic", () => {
    render(
      <CallQualityCriteriaView
        result={null}
        measurementSettings={DEFAULT_MEASUREMENT_SETTINGS}
      />
    );

    // Verify main page title
    expect(
      screen.getByText(/بنود ومعايير تقييم جودة المكالمة/i)
    ).toBeInTheDocument();

    // Verify all 6 mandatory table headers
    expect(screen.getByText("1. بند التقييم")).toBeInTheDocument();
    expect(screen.getByText("2. المعيار المعتمد")).toBeInTheDocument();
    expect(screen.getByText("3. التوقيت")).toBeInTheDocument();
    expect(screen.getByText("4. طريقة القياس")).toBeInTheDocument();
    expect(screen.getByText("5. الوزن أو الدرجة")).toBeInTheDocument();
    expect(screen.getByText("6. النتيجة")).toBeInTheDocument();

    // Verify presence of all key rubric items
    expect(screen.getByText(/التحية والافتتاحية وسرعة الرد/)).toBeInTheDocument();
    expect(screen.getByText(/نبرة الابتسامة في الترحيب والمقدمة/)).toBeInTheDocument();
    expect(screen.getByText(/نبرة الصوت والابتسامة أثناء المكالمة/)).toBeInTheDocument();
    expect(screen.getByText(/فترات الصمت المفرط/)).toBeInTheDocument();
    expect(screen.getByText(/مناداة اسم العميل ولقبه المفضل/)).toBeInTheDocument();
    expect(screen.getByText(/الاعتذار الصريح عند وجود شكوى أو تأخير/)).toBeInTheDocument();
    expect(screen.getByText(/بروتوكول الاستشارة الطبية/)).toBeInTheDocument();
    expect(screen.getByText(/إظهار التعاطف الصريح مع العميل/)).toBeInTheDocument();
    expect(screen.getByText(/اللازمات اللفظية وتكرار الأسئلة/)).toBeInTheDocument();
    expect(screen.getByText(/شروط ومدة الهولد وموسيقى الانتظار/)).toBeInTheDocument();
    expect(screen.getByText(/عرض خدمات ومساعدات أخرى/)).toBeInTheDocument();
    expect(screen.getByText(/عبارة الختام المعتمدة/)).toBeInTheDocument();
    expect(screen.getByText(/تحديث بيانات النظام \(UPDATE\)/)).toBeInTheDocument();
    expect(screen.getByText(/إجراء وتنفيذ الطلب \(ACTION\)/)).toBeInTheDocument();

    // Verify un-evaluated state: result shows "— (غير محدد)" rather than invented defaults
    const unspecResults = screen.getAllByText("— (غير محدد)");
    expect(unspecResults.length).toBeGreaterThan(0);
  });

  it("filters criteria properly using the search input", () => {
    render(
      <CallQualityCriteriaView
        result={null}
        measurementSettings={DEFAULT_MEASUREMENT_SETTINGS}
      />
    );

    const searchInput = screen.getByPlaceholderText(/بحث في اسم البند أو المعيار/);
    fireEvent.change(searchInput, { target: { value: "الهولد" } });

    expect(screen.getByText(/شروط ومدة الهولد وموسيقى الانتظار/)).toBeInTheDocument();
    expect(screen.queryByText(/التحية والافتتاحية وسرعة الرد/)).toBeNull();
  });

  it("filters criteria by category properly", () => {
    render(
      <CallQualityCriteriaView
        result={null}
        measurementSettings={DEFAULT_MEASUREMENT_SETTINGS}
      />
    );

    const pharmaBtn = screen.getByRole("button", { name: "المعايير الصيدلانية" });
    fireEvent.click(pharmaBtn);

    expect(screen.getByText(/بروتوكول الاستشارة الطبية/)).toBeInTheDocument();
    expect(screen.queryByText(/التحية والافتتاحية وسرعة الرد/)).toBeNull();
  });
});
