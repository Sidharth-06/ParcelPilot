import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { businessMinutesBetween, IST_CALENDAR, parseLocal } from "@/lib/engines/sla";

function ist(y: number, m: number, d: number, hh: number, mm: number): Date {
  return parseLocal(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
}

describe("business-minutes math (Mon–Fri 09:00–18:00 IST)", () => {
  it("counts time within a single working day", () => {
    const mins = businessMinutesBetween(ist(2026, 8, 17, 10, 0), ist(2026, 8, 17, 11, 30), IST_CALENDAR);
    expect(mins).toBe(90); // Monday
  });

  it("clamps to the working-day window", () => {
    const mins = businessMinutesBetween(ist(2026, 8, 17, 7, 0), ist(2026, 8, 17, 20, 0), IST_CALENDAR);
    expect(mins).toBe(540); // full 9h window regardless of early start / late end
  });

  it("skips weekends", () => {
    const mins = businessMinutesBetween(ist(2026, 8, 14, 17, 0), ist(2026, 8, 17, 10, 0), IST_CALENDAR);
    // Fri 17:00→18:00 = 60; Sat/Sun skipped; Mon 09:00→10:00 = 60
    expect(mins).toBe(120);
  });

  it("returns zero when the window closes before any business time elapses", () => {
    const mins = businessMinutesBetween(ist(2026, 8, 14, 18, 30), ist(2026, 8, 15, 12, 0), IST_CALENDAR);
    expect(mins).toBe(0);
  });

  it("handles multi-week spans deterministically", () => {
    const week = businessMinutesBetween(ist(2026, 8, 3, 9, 0), ist(2026, 8, 10, 9, 0), IST_CALENDAR);
    expect(week).toBe(5 * 540); // Mon→next Mon = exactly one working week
  });
});
