import assert from "node:assert";
import { SCHEMA_MAPPING } from "../src/migrations/01-create-weather_data.js";
import { parseWeatherCsv } from "../scripts/reconstituteDataFromCsv/parseCsv.js";

const header = Object.keys(SCHEMA_MAPPING).join(",");

/** Builds one CSV line from a partial row, leaving every other column empty like the export does */
const csvLine = (values) =>
  Object.keys(SCHEMA_MAPPING)
    .map((column) => values[column] ?? "")
    .join(",");

describe("parseWeatherCsv", () => {
  it("returns no rows for a header-only file", () => {
    assert.deepStrictEqual(parseWeatherCsv(header), { rows: [], skippedCount: 0 });
  });

  it("turns empty cells into null and REAL columns into numbers", () => {
    const { rows } = parseWeatherCsv(
      [header, csvLine({ auroraId: "locA", fetchTime: "2026-10-26T01:00:00Z", tempC: "22.6", windDir: "NE" })].join("\n"),
    );

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].tempC, 22.6);
    assert.strictEqual(rows[0].windDir, "NE");
    assert.strictEqual(rows[0].pressure, null);
  });

  it("keeps quoted values containing commas", () => {
    const { rows } = parseWeatherCsv(
      [header, csvLine({ auroraId: "locA", fetchTime: "t", cloud: '"Few, scattered"' })].join("\n"),
    );

    assert.strictEqual(rows[0].cloud, "Few, scattered");
  });

  it("nulls non-numeric REAL values rather than failing the insert", () => {
    const { rows } = parseWeatherCsv(
      [header, csvLine({ auroraId: "locA", fetchTime: "t", tempC: "n/a" })].join("\n"),
    );

    assert.strictEqual(rows[0].tempC, null);
  });

  it("skips and counts rows missing auroraId or fetchTime", () => {
    const { rows, skippedCount } = parseWeatherCsv(
      [
        header,
        csvLine({ auroraId: "locA", fetchTime: "t" }),
        csvLine({ fetchTime: "t" }),
        csvLine({ auroraId: "locB" }),
      ].join("\n"),
    );

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(skippedCount, 2);
  });
});
