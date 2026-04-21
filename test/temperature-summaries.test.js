import assert from "node:assert";
import { DATASET_CONFIGS } from "../src/config.js";

const tempModifier = DATASET_CONFIGS.tempC.onRows;

describe("Temperature Summary Injection", () => {
  it("should preserve periodic readings and inject unique max/min points", () => {
    const rows = [
      {
        auroraId: "A",
        generationTime: "2026-04-20T10:00:00Z",
        value: 20.0,
        maximumTempC: 22.5,
        maximumTempLocalTimeUTC: "2026-04-20T09:45:00Z",
        minimumTempC: 18.0,
        minimumTempLocalTimeUTC: "2026-04-20T04:00:00Z",
      },
      {
        auroraId: "A",
        generationTime: "2026-04-20T10:10:00Z",
        value: 21.0,
        maximumTempC: 22.5, // Same as before
        maximumTempLocalTimeUTC: "2026-04-20T09:45:00Z",
        minimumTempC: 18.0,
        minimumTempLocalTimeUTC: "2026-04-20T04:00:00Z",
      },
    ];

    const result = tempModifier(rows);

    // Initial 2 rows + 1 unique Max + 1 unique Min = 4 rows
    assert.strictEqual(result.length, 4);

    // Verify ordering
    assert.strictEqual(result[0].value, 18.0, "Min should be first (04:00)");
    assert.strictEqual(result[1].value, 22.5, "Max should be second (09:45)");
    assert.strictEqual(result[2].value, 20.0, "Periodic 10:00");
    assert.strictEqual(result[3].value, 21.0, "Periodic 10:10");
  });

  it("should detect and inject new peaks when they update", () => {
    const rows = [
      {
        auroraId: "A",
        generationTime: "2026-04-20T10:00:00Z",
        value: 20.0,
        maximumTempC: 22.5,
        maximumTempLocalTimeUTC: "2026-04-20T09:45:00Z",
      },
      {
        auroraId: "A",
        generationTime: "2026-04-20T10:10:00Z",
        value: 23.5,
        maximumTempC: 23.5, // New Max hit!
        maximumTempLocalTimeUTC: "2026-04-20T10:10:00Z",
      },
    ];

    const result = tempModifier(rows);

    // 2 periodic + 1st max + 2nd max = 4 rows
    assert.strictEqual(result.length, 4);
    assert.strictEqual(result.filter(r => r.value === 22.5).length, 1);
    assert.strictEqual(result.filter(r => r.value === 23.5).length, 2); // One periodic, one summary
  });

  it("should handle multiple stations independently", () => {
    const rows = [
      { auroraId: "A", generationTime: "2026-04-20T10:00:00Z", value: 20, maximumTempC: 25, maximumTempLocalTimeUTC: "2026-04-20T09:00:00Z", minimumTempC: null, minimumTempLocalTimeUTC: null },
      { auroraId: "B", generationTime: "2026-04-20T10:00:00Z", value: 30, maximumTempC: 35, maximumTempLocalTimeUTC: "2026-04-20T09:00:00Z", minimumTempC: null, minimumTempLocalTimeUTC: null },
    ];

    const result = tempModifier(rows);
    assert.strictEqual(result.length, 4);
    
    assert.ok(result.find(r => r.auroraId === "A" && r.value === 25));
    assert.ok(result.find(r => r.auroraId === "B" && r.value === 35));
  });
});
