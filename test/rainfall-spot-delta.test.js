import assert from "node:assert";
import { subDays } from "date-fns";

import { get9amRef, DATASET_CONFIGS } from "../src/config.js";

const rainfallSpotModifier = DATASET_CONFIGS.rainfallSpot.onRows;

describe("Rainfall Spot Delta Logic", () => {
  it("should calculate correctly for entries in the same 9am period", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T10:00:00+10:00", value: 1.0 },
      { auroraId: "A", generationTime: "2026-04-20T11:00:00+10:00", value: 2.5 },
      { auroraId: "A", generationTime: "2026-04-20T12:00:00+10:00", value: 2.5 },
    ];

    const result = rainfallSpotModifier(rows);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].value, 1.0, "First reading should be the cumulative value since 9am");
    assert.strictEqual(result[1].value, 1.5, "Second reading should be the delta (2.5 - 1.0)");
    assert.strictEqual(result[2].value, 0.0, "Third reading should be 0 delta");
  });

  it("should reset correctly across 9am boundary and inject a gap-filling row", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T08:50:00+10:00", value: 10.0 }, // belongs to yesterday's 9am
      { auroraId: "A", generationTime: "2026-04-20T09:10:00+10:00", value: 0.5, rainfall24hr: 11.2 },  // belongs to today's 9am
    ];

    const result = rainfallSpotModifier(rows);

    assert.strictEqual(result.length, 3, "Should have 3 rows: original pre-9am, injected 9am, and original post-9am");
    assert.strictEqual(result[0].value, 10.0);
    assert.strictEqual(result[1].value, 1.2, "Injected 9am row should capture the gap (11.2 - 10.0)");
    assert.strictEqual(result[1].generationTime, "2026-04-19T23:00:00.000Z", "Injected point should be exactly at local 9am (UTC -10h)");
    assert.strictEqual(result[2].value, 0.5, "Should reset to the current cumulative value after 9am boundary");
  });

  it("should wait for fresh rainfall24hr if BOM update is lagging", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T08:50:00+10:00", value: 10.0, rainfall24hr: 5.0 }, // yesterday
      { auroraId: "A", generationTime: "2026-04-20T09:05:00+10:00", value: 0.1, rainfall24hr: 5.0 },  // 9:05, still showing stale 5.0
      { auroraId: "A", generationTime: "2026-04-20T09:15:00+10:00", value: 0.3, rainfall24hr: 12.0 }, // 9:15, finally updated to 12.0
    ];

    const result = rainfallSpotModifier(rows);

    // Reading 1: 10.0 delta (since it's first in fetch)
    // Reading 2: 9am injected delta (12.0 - 10.0 = 2.0)
    // Reading 2 (original): 0.1
    // Reading 3 (original): 0.2 (0.3 - 0.1)
    
    assert.strictEqual(result.length, 4, "Should have injected the 9am point because a fresh 12.0 was found later in the set");
    const injected9am = result.find(r => r.generationTime === "2026-04-19T23:00:00.000Z");
    assert.ok(injected9am, "9am injection should exist");
    assert.strictEqual(injected9am.value, 2.0, "Gap should be calculated using the fresh 12.0 value found at 9:15");
  });

  it("should handle multiple stations correctly", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T10:00:00+10:00", value: 1.0 },
      { auroraId: "B", generationTime: "2026-04-20T10:00:00+10:00", value: 5.0 },
      { auroraId: "A", generationTime: "2026-04-20T11:00:00+10:00", value: 1.5 },
    ];

    const result = rainfallSpotModifier(rows);
    const stationA = result.filter(r => r.auroraId === "A");
    const stationB = result.filter(r => r.auroraId === "B");

    assert.strictEqual(stationA[0].value, 1.0);
    assert.strictEqual(stationA[1].value, 0.5);
    assert.strictEqual(stationB[0].value, 5.0);
  });
});
