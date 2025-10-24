import { describe, it, expect, afterEach } from "vitest";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import {
  parseGermanDate,
  dedupe,
  withinNextDays,
  parseAttendees,
  saveCSV,
  saveJSON,
  type ProtestEvent,
} from "@/scraper/scrape-protests.js";

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

describe("parseAttendees", () => {
  it("should parse simple attendee count", () => {
    expect(parseAttendees("500 Teilnehmer")).toBe(500);
    expect(parseAttendees("1000 Personen")).toBe(1000);
    expect(parseAttendees("2000 Menschen")).toBe(2000);
  });

  it("should parse approximate attendee counts", () => {
    expect(parseAttendees("ca. 500 Teilnehmer")).toBe(500);
    expect(parseAttendees("etwa 1000 Personen")).toBe(1000);
    expect(parseAttendees("bis zu 2000 Menschen")).toBe(2000);
  });

  it("should parse attendee ranges (use higher number)", () => {
    expect(parseAttendees("500-1000 Teilnehmer")).toBe(1000);
    expect(parseAttendees("1000–2000 Personen")).toBe(2000);
  });

  it("should parse numbers with thousand separators", () => {
    expect(parseAttendees("1.000 Teilnehmer")).toBe(1000);
    expect(parseAttendees("10 000 Personen")).toBe(10000);
    expect(parseAttendees("5.000-10.000 Menschen")).toBe(10000);
  });

  it("should handle gender-inclusive forms", () => {
    expect(parseAttendees("1000 Teilnehmer*innen")).toBe(1000);
    expect(parseAttendees("500 Leute")).toBe(500);
  });

  it("should return null for text without attendee info", () => {
    expect(parseAttendees("Demo für Klimaschutz")).toBeNull();
    expect(parseAttendees("")).toBeNull();
    expect(parseAttendees("Some random text")).toBeNull();
  });

  it("should handle multiple matches (return first)", () => {
    const text = "Erwartet werden ca. 500 Teilnehmer, bis zu 1000 Personen möglich";
    const result = parseAttendees(text);
    expect(result).toBe(500);
  });
});

describe("saveCSV", () => {
  afterEach(() => {
    // Clean up test files
    if (fs.existsSync("output/test.csv")) {
      fs.unlinkSync("output/test.csv");
    }
  });

  it("should save events to CSV file", () => {
    const events: ProtestEvent[] = [
      {
        source: "test-source",
        city: "Berlin",
        country: "DE",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: 500,
      },
    ];

    saveCSV(events, "test.csv");

    expect(fs.existsSync("output/test.csv")).toBe(true);
    const content = fs.readFileSync("output/test.csv", "utf8");
    expect(content).toContain("Test Event");
    expect(content).toContain("Berlin");
  });

  it("should handle empty events array gracefully", () => {
    saveCSV([], "empty.csv");
    // Should not create file or should handle gracefully
    expect(fs.existsSync("output/empty.csv")).toBe(false);
  });

  it("should escape quotes in CSV values", () => {
    const events: ProtestEvent[] = [
      {
        source: "test",
        city: "Berlin",
        country: "DE",
        title: 'Event with "quotes"',
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test",
        url: "https://example.com",
        attendees: null,
      },
    ];

    saveCSV(events, "test-quotes.csv");

    const content = fs.readFileSync("output/test-quotes.csv", "utf8");
    expect(content).toContain('""quotes""'); // Quotes should be escaped
  });
});

describe("saveJSON", () => {
  afterEach(() => {
    if (fs.existsSync("output/test.json")) {
      fs.unlinkSync("output/test.json");
    }
  });

  it("should save events to JSON file", () => {
    const events: ProtestEvent[] = [
      {
        source: "test-source",
        city: "Berlin",
        country: "DE",
        title: "Test Event",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test Location",
        url: "https://example.com",
        attendees: 500,
      },
    ];

    saveJSON(events, "test.json");

    expect(fs.existsSync("output/test.json")).toBe(true);
    const content = fs.readFileSync("output/test.json", "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Test Event");
  });

  it("should create output directory if it doesn't exist", () => {
    // Remove output directory if it exists
    if (fs.existsSync("output")) {
      fs.rmSync("output", { recursive: true });
    }

    const events: ProtestEvent[] = [
      {
        source: "test",
        city: "Berlin",
        country: "DE",
        title: "Test",
        start: "2025-10-15T14:00:00.000Z",
        end: null,
        location: "Test",
        url: "https://example.com",
        attendees: null,
      },
    ];

    saveJSON(events, "test-create-dir.json");

    expect(fs.existsSync("output")).toBe(true);
    expect(fs.existsSync("output/test-create-dir.json")).toBe(true);

    // Clean up
    fs.unlinkSync("output/test-create-dir.json");
  });
});
