/**
 * @file
 * Backfills weather.sqlite from the daily CSV exports written by src/export-csv.js.
 * Starts at today (Brisbane) and walks back in batches of 5 parallel downloads until a CSV is missing.
 * Inserts are INSERT OR IGNORE against UNIQUE (auroraId, generationTime), so it's safe to re-run.
 */
import { mapLimit } from "async";
import { formatInTimeZone } from "date-fns-tz";
import { closeDatabase, initializeDatabase } from "../../src/sqlite.js";
import {
  SCHEMA_MAPPING,
  TABLE_NAME,
} from "../../src/migrations/01-create-weather_data.js";
import logger from "../../src/logger.js";
import { parseWeatherCsv } from "./parseCsv.js";

const TZ = "Australia/Brisbane";
const MAX_DOWNLOADS = 5;
const BASE_URL =
  "https://abcnewsdata.sgp1.digitaloceanspaces.com/data-time-series-weather/assets/csv/";

/** Plain UTC date arithmetic so the process timezone can't shift the day */
function daysBefore(date, days) {
  const earlier = new Date(`${date}T00:00:00Z`);
  earlier.setUTCDate(earlier.getUTCDate() - days);
  return earlier.toISOString().slice(0, 10);
}

/** @returns {number} rows actually inserted (existing rows are ignored) */
function insertRows(db, rows) {
  const columns = Object.keys(SCHEMA_MAPPING);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ${TABLE_NAME} (${columns.join(", ")})
    VALUES (${columns.map(() => "?").join(", ")})`);

  // One transaction per day: far faster than a commit per row
  db.exec("BEGIN");
  try {
    const inserted = rows.reduce(
      (total, row) => total + Number(insert.run(...columns.map((column) => row[column])).changes),
      0,
    );
    db.exec("COMMIT");
    return inserted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * @returns {Promise<{ date: string, status: number, text: string | null }>} text is null for any non-OK response
 */
async function fetchCsv(date) {
  const url = `${BASE_URL}${date}.csv`;
  const response = await fetch(url);
  const isMissingOrForbidden = [403, 404].includes(response.status);

  // Anything other than a missing file is a real failure, not the end of history
  if (!response.ok && !isMissingOrForbidden) {
    throw new Error(`Fetching ${url} failed: ${response.status} ${response.statusText}`);
  }
  return {
    date,
    status: response.status,
    text: response.ok ? await response.text() : null,
  };
}

export default async function reconstituteDataFromCsv() {
  const db = await initializeDatabase();
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");

  let insertedTotal = 0;
  let earliestDate = null;
  let isFinished = false;

  // Each day is requested speculatively (we can't list the bucket), so work in batches of
  // days: download a batch in parallel, then process it newest-first and stop at the first gap.
  for (let batchStart = today; !isFinished; batchStart = daysBefore(batchStart, MAX_DOWNLOADS)) {
    const dates = Array.from({ length: MAX_DOWNLOADS }, (_, i) => daysBefore(batchStart, i));
    const downloads = await mapLimit(dates, MAX_DOWNLOADS, fetchCsv);

    for (const { date, status, text } of downloads) {
      if (text === null) {
        // Spaces answers 403 (not 404) for a missing file when the bucket can't be listed.
        // A 403 before any success is a real permissions problem, not the end of the history.
        if (status === 403 && earliestDate === null) {
          throw new Error(`Fetching the CSV for ${date} was forbidden (403)`);
        }
        logger.info("No CSV for %s (%d), stopping", date, status);
        isFinished = true;
        break;
      }

      const { rows, skippedCount } = parseWeatherCsv(text);
      const inserted = insertRows(db, rows);
      insertedTotal += inserted;
      earliestDate = date;

      logger.info(
        "%s: %d rows, %d inserted, %d already present, %d skipped",
        date,
        rows.length,
        inserted,
        rows.length - inserted,
        skippedCount,
      );
    }
  }

  logger.info(
    "Backfill complete: %d rows inserted, earliest day restored: %s",
    insertedTotal,
    earliestDate ?? "none",
  );
  closeDatabase();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await reconstituteDataFromCsv();
}
