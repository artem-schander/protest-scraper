import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  parseGermanDate,
  dedupe,
  withinNextDays,
  type ProtestEvent,
} from "./scrape-protests.js";

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(timezone);
dayjs.extend(utc);

describe("parseGermanDate", () => {
  it("should parse DD.MM.YYYY format", () => {
    const result = parseGermanDate("15.03.2025");
    expect(result).not.toBeNull();
    expect(result?.format("DD.MM.YYYY")).toBe("15.03.2025");
  });

  it("should parse DD.MM.YYYY HH:mm format", () => {
    const result = parseGermanDate("15.03.2025 14:30");
    expect(result).not.toBeNull();
    expect(result?.format("DD.MM.YYYY HH:mm")).toBe("15.03.2025 14:30");
  });

  it("should parse DD.MM HH:mm format", () => {
    const result = parseGermanDate("15.03 14:30");
    expect(result).not.toBeNull();
    // Should use current year
  });

  it("should handle 'Uhr' suffix", () => {
    const result = parseGermanDate("15.03.2025 14:30Uhr");
    expect(result).not.toBeNull();
    expect(result?.format("DD.MM.YYYY HH:mm")).toBe("15.03.2025 14:30");
  });

  it("should handle Oktober abbreviations", () => {
    const result = parseGermanDate("15.Okt.2025");
    expect(result).not.toBeNull();
    expect(result?.month()).toBe(9); // 0-indexed, 9 = October
  });

  it("should return null for invalid dates", () => {
    const result = parseGermanDate("invalid date");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = parseGermanDate("");
    expect(result).toBeNull();
  });
});

describe("withinNextDays", () => {
  const baseDate = dayjs("2025-10-11T12:00:00Z");

  it("should return true for dates within range", () => {
    const futureDate = baseDate.add(5, "day").toISOString();
    expect(withinNextDays(futureDate, 10, baseDate)).toBe(true);
  });

  it("should return false for dates in the past", () => {
    const pastDate = baseDate.subtract(5, "day").toISOString();
    expect(withinNextDays(pastDate, 10, baseDate)).toBe(false);
  });

  it("should return false for dates beyond range", () => {
    const farFutureDate = baseDate.add(15, "day").toISOString();
    expect(withinNextDays(farFutureDate, 10, baseDate)).toBe(false);
  });

  it("should return false for null dates", () => {
    expect(withinNextDays(null, 10, baseDate)).toBe(false);
  });

  it("should handle edge case at range boundary", () => {
    const boundaryDate = baseDate.add(10, "day").toISOString();
    expect(withinNextDays(boundaryDate, 10, baseDate)).toBe(false);
  });
});

describe("dedupe", () => {
  it("should remove duplicate events", () => {
    const events: ProtestEvent[] = [
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Different Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
    ];

    const result = dedupe(events);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Test Event");
    expect(result[1].title).toBe("Different Event");
  });

  it("should handle case-insensitive title matching", () => {
    const events: ProtestEvent[] = [
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "TEST EVENT",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
    ];

    const result = dedupe(events);
    expect(result).toHaveLength(1);
  });

  it("should keep events with same title but different dates", () => {
    const events: ProtestEvent[] = [
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-16T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
    ];

    const result = dedupe(events);
    expect(result).toHaveLength(2);
  });

  it("should keep events with same title but different cities", () => {
    const events: ProtestEvent[] = [
      {
        source: "Berlin Police",
        city: "Berlin",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
      {
        source: "Dresden City",
        city: "Dresden",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: null,
      },
    ];

    const result = dedupe(events);
    expect(result).toHaveLength(2);
  });

  it("should return empty array for empty input", () => {
    const result = dedupe([]);
    expect(result).toHaveLength(0);
  });
});
