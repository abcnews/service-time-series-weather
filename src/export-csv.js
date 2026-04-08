import { initializeDatabase } from "./sqlite.js";
import {
  SCHEMA_MAPPING,
  TABLE_NAME,
} from "./migrations/01-create-weather_data.js";
import { getDayBoundaries } from "./generate-dataset.js";
import fs from "node:fs/promises";
import path from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import logger from "./logger.js";

const TZ = "Australia/Brisbane";

/**
 * Escapes a value for CSV.
 * @param {any} val
 * @returns {string}
 */
function escapeCsv(val) {
  if (val === null || val === undefined) {
    return "";
  }
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports all weather records for a specific day to a CSV file.
 * @param {number} dayOffset - Offset from today (0 = today, -1 = yesterday, etc.)
 */
export async function exportWeatherDayToCsv(dayOffset) {
  const db = await initializeDatabase();
  const { start, end } = getDayBoundaries(dayOffset);

  const columns = Object.keys(SCHEMA_MAPPING);
  const colsListSql = columns.join(", ");

  /**
   * We query based on generationTime which is the timestamp from the source.
   * Converting to unixepoch for consistent filtering across potential string formats.
   */
  const sql = `
      SELECT ${colsListSql}
      FROM ${TABLE_NAME}
      WHERE unixepoch(generationTime) BETWEEN ${Math.round(
        start / 1000,
      )} AND ${Math.round(end / 1000)}
      ORDER BY unixepoch(generationTime) ASC, auroraId ASC
    `;

  const rows = db.prepare(sql).all();

  if (rows.length === 0) {
    logger.warn(
      "No weather records found for CSV export with day offset %d",
      dayOffset,
    );
    return;
  }

  const header = columns.join(",");
  const csvRows = rows.map((row) =>
    columns.map((col) => escapeCsv(row[col])).join(","),
  );

  const csvContent = [header, ...csvRows].join("\n");

  const dateSubstr = formatInTimeZone(new Date(start), TZ, "yyyy-MM-dd");
  const outputPath = path.join("data/assets/csv/", `${dateSubstr}.csv`);

  // Ensure directory exists and write file
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, csvContent);

  logger.info("Daily CSV export generated: %s", outputPath);
}
