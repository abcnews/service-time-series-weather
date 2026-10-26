import { parse } from "csv-parse/sync";
import { SCHEMA_MAPPING } from "../../src/migrations/01-create-weather_data.js";

const REQUIRED_COLUMNS = ["auroraId", "fetchTime"];

/**
 * The export writes nulls as empty cells. REAL columns must be numbers (the
 * table is STRICT), so anything non-numeric becomes null instead of failing the insert.
 */
function parseCell(value, type) {
  if (value === "" || value === undefined) {
    return null;
  }
  if (!type.startsWith("REAL")) {
    return value;
  }
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

/**
 * Turns one day's CSV export (see src/export-csv.js) back into rows for weather_data.
 * Rows missing a NOT NULL key are dropped and counted.
 *
 * @param {string} text - CSV file contents
 * @returns {{ rows: Array<Record<string, string | number | null>>, skippedCount: number }}
 */
export function parseWeatherCsv(text) {
  const rows = parse(text, { columns: true, skip_empty_lines: true }).map(
    (record) =>
      Object.fromEntries(
        Object.entries(SCHEMA_MAPPING).map(([column, type]) => [
          column,
          parseCell(record[column], type),
        ]),
      ),
  );

  const validRows = rows.filter((row) =>
    REQUIRED_COLUMNS.every((column) => row[column] !== null),
  );

  return { rows: validRows, skippedCount: rows.length - validRows.length };
}
