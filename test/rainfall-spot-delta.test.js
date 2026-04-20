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

  it("should reset correctly across 9am boundary", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T08:50:00+10:00", value: 10.0 }, // belongs to yesterday's 9am
      { auroraId: "A", generationTime: "2026-04-20T09:10:00+10:00", value: 0.5 },  // belongs to today's 9am
    ];

    const result = rainfallSpotModifier(rows);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].value, 10.0);
    assert.strictEqual(result[1].value, 0.5, "Should reset to the current cumulative value after 9am boundary");
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
