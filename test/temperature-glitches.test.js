import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { injectTemperatureSummaries } from "../src/config.js";
import { resolveLocalTimeToUtc } from "../src/utils.aurora-dates.js";

describe("Temperature Summary Glitches", () => {
  let rawData;

  before(async () => {
    const jsonPath = path.resolve(process.cwd(), "test/tempc-maxmin.json");
    const jsonText = await fs.readFile(jsonPath, "utf8");
    rawData = JSON.parse(jsonText);
  });

  it("should resolve 'Future Peaks' to yesterday in resolveLocalTimeToUtc", () => {
    // Take the first example from the JSON
    // "generationTime": "2026-04-21T06:51:01+08:00"
    // "maximumTempLocalTime": "1:04 pm"
    // "maximumTempLocalTimeUTC": "2026-04-21T13:04:00+06:30" (This is the broken one in the DB)
    
    const row = rawData[0];
    const resolved = resolveLocalTimeToUtc(row.maximumTempLocalTime, row.generationTime);
    
    const genDate = new Date(row.generationTime);
    const resDate = new Date(resolved);
    
    assert.ok(resDate <= genDate, `Resolved time ${resolved} should be before or equal to generation time ${row.generationTime}`);
    assert.ok(resolved.startsWith("2026-04-20"), `Expected April 20th but got ${resolved}`);
  });

  it("should correctly sort and unique-ify points in injectTemperatureSummaries using re-resolution", () => {
    // Simulate fetching Monday April 20th data, overfetching into Tuesday morning
    const stationRows = [
      {
        auroraId: "loc82a2b1f10de5",
        generationTime: "2026-04-21T02:00:00+10:00",
        value: 18.5,
        maximumTempC: 25.4,
        maximumTempLocalTime: "1:04 pm", // Yesterday's peak
      },
      {
        auroraId: "loc82a2b1f10de5",
        generationTime: "2026-04-21T02:10:00+10:00",
        value: 18.4,
        maximumTempC: 25.4,
        maximumTempLocalTime: "1:04 pm",
      }
    ];

    const result = injectTemperatureSummaries(stationRows);
    
    // Should have 2 periodic + 1 unique Max = 3 rows
    assert.strictEqual(result.length, 3);
    
    // Ensure chronological order
    const times = result.map(r => new Date(r.generationTime).getTime());
    const sortedTimes = [...times].sort((a, b) => a - b);
    assert.deepStrictEqual(times, sortedTimes);
    
    // The Max peak should be from yesterday (x < 0 relative to today's start, 
    // but here we just check it is BEFORE the periodic readings)
    assert.strictEqual(result[0].value, 25.4);
    assert.strictEqual(result[0].generationTime, "2026-04-20T13:04:00+10:00");
  });
});
