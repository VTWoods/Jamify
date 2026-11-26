import { describe, expect, it } from "vitest";
import {
  buildCommutePrompt,
  parseCommuteWeekJson,
  trimTracksToTargetDuration,
  type CommuteTrackItem,
} from "./commute-playlists";
import {
  getLocalClockParts,
  shouldRunDailyRotation,
  shouldRunWeeklyGeneration,
} from "./commute-schedule-clock";

describe("commute schedule clock", () => {
  const tz = "America/New_York";

  it("triggers weekly generation on Sunday at 1:00 AM once per week", () => {
    // 2026-11-29 is a Sunday in EST (UTC-5)
    const sun0059 = getLocalClockParts(new Date("2026-11-29T05:59:00Z"), tz);
    expect(sun0059.weekday).toBe(0);
    expect(sun0059.hour).toBe(0);
    expect(shouldRunWeeklyGeneration(sun0059, null)).toBe(false);

    const sun0100 = getLocalClockParts(new Date("2026-11-29T06:00:00Z"), tz);
    expect(sun0100.weekday).toBe(0);
    expect(sun0100.hour).toBe(1);
    expect(sun0100.sundayWeekKey).toBe("2026-11-29");
    expect(shouldRunWeeklyGeneration(sun0100, null)).toBe(true);
    // Already generated for this Sunday week -> must not re-run
    expect(shouldRunWeeklyGeneration(sun0100, "2026-11-29")).toBe(false);

    // Monday should not trigger weekly generation
    const mon0100 = getLocalClockParts(new Date("2026-11-30T06:00:00Z"), tz);
    expect(mon0100.weekday).toBe(1);
    expect(shouldRunWeeklyGeneration(mon0100, null)).toBe(false);
  });

  it("triggers daily rotation on weekdays (Mon–Fri) at 1:00 AM once per day", () => {
    // Monday 00:59 EST -> too early
    const mon0059 = getLocalClockParts(new Date("2026-11-30T05:59:00Z"), tz);
    expect(shouldRunDailyRotation(mon0059, null)).toBe(false);

    // Monday 01:00 EST -> trigger
    const mon0100 = getLocalClockParts(new Date("2026-11-30T06:00:00Z"), tz);
    expect(mon0100.weekday).toBe(1);
    expect(mon0100.dateKey).toBe("2026-11-30");
    expect(shouldRunDailyRotation(mon0100, null)).toBe(true);
    expect(shouldRunDailyRotation(mon0100, "2026-11-30")).toBe(false);

    // Sunday & Saturday -> never rotate
    const sun0100 = getLocalClockParts(new Date("2026-11-29T06:00:00Z"), tz);
    const sat0100 = getLocalClockParts(new Date("2026-11-28T06:00:00Z"), tz);
    expect(shouldRunDailyRotation(sun0100, null)).toBe(false);
    expect(shouldRunDailyRotation(sat0100, null)).toBe(false);
  });
});

describe("commute playlist helpers", () => {
  it("builds a prompt referencing followed artists for both morning and evening commutes", () => {
    const prompt = buildCommutePrompt([
      { name: "Daft Punk", genres: ["electronic"] },
      { name: "Khruangbin", genres: ["psychedelic soul"] },
    ]);
    expect(prompt).toContain("Daft Punk");
    expect(prompt).toContain("Khruangbin");
    expect(prompt).toContain("Morning Commute");
    expect(prompt).toContain("Evening Commute");
  });

  it("trims resolved tracks to approximately 60 minutes", () => {
    const tracks: CommuteTrackItem[] = Array.from({ length: 25 }, (_, i) => ({
      title: `Track ${i + 1}`,
      artist: "Followed Artist",
      durationMs: 240_000, // 4 minutes each -> 15 tracks = 60 minutes
      spotifyUri: `spotify:track:id${i + 1}`,
      spotifyUrl: null,
      albumImageUrl: null,
    }));

    const result = trimTracksToTargetDuration(tracks, 60);
    expect(result.tracks).toHaveLength(15);
    expect(result.totalDurationMs).toBe(60 * 60_000);
  });

  it("parses valid 5-day morning and evening commute JSON", () => {
    const makeDays = (prefix: string) =>
      [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        theme: `${prefix} Day ${weekday}`,
        tracks: Array.from({ length: 12 }, (_, i) => ({
          title: `${prefix} Song ${weekday}-${i + 1}`,
          artist: "Followed Artist",
        })),
      }));

    const parsed = parseCommuteWeekJson(
      JSON.stringify({
        morning: makeDays("Upbeat"),
        evening: makeDays("Chill"),
      }),
    );

    expect(parsed.morning).toHaveLength(5);
    expect(parsed.evening).toHaveLength(5);
    expect(parsed.morning[0].weekday).toBe(1);
    expect(parsed.evening[4].weekday).toBe(5);
  });
});
