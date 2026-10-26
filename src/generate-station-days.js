import fs from "node:fs/promises";
import path from "node:path";
import { eachLimit } from "async";
import logger from "./logger.js";

const GEOJSON_URL = new URL("../data/au.geo.json", import.meta.url);
const STATIONS_DIR = "data/assets/stations/";

/**
 * Splits one day's all-station series into one small file per station, so a
 * page showing a single station only downloads that station's data instead of
 * the whole country.
 *
 * @param {Record<string, Array<[number, number]>>} series - [minute, value] pairs keyed by Aurora ID
 * @param {object} geojson - au.geo.json, used to map Aurora IDs to BOM IDs and names
 * @returns {Array<{ bomId: string, name: string, data: Array<[number, number]> }>}
 */
export function buildStationDays({ series, geojson }) {
  return geojson.features
    .filter(({ properties: { auroraId, bomId } }) => auroraId && bomId)
    .map(({ properties: { auroraId, bomId, storyLabName } }) => ({
      bomId,
      name: storyLabName,
      data: series[auroraId],
    }))
    // Stations without readings today would just be empty files
    .filter(({ data }) => data?.length);
}

/**
 * Writes `data/assets/stations/<dataset>/<yyyy-mm-dd>/<bomId>.json` for every
 * station with readings. Anything under data/assets/ is uploaded by `upload-s3`.
 *
 * Each file has the same `updatedDate`/`startDate` header as the all-station
 * dataset files, so one reader can handle both.
 *
 * @param {string} dataset - Dataset name, e.g. tempC or rainfallSpot
 * @param {Record<string, Array<[number, number]>>} series
 * @param {string} date - Brisbane day, yyyy-mm-dd
 * @param {string} updatedDate - When the dataset was generated, ISO 8601
 * @param {string} startDate - Start of the day, ISO 8601 (e.g. 2026-09-27T00:00:00+10:00)
 */
export async function writeStationDays({ dataset, series, date, updatedDate, startDate }) {
  const geojson = JSON.parse(await fs.readFile(GEOJSON_URL, "utf8"));
  const stations = buildStationDays({ series, geojson });

  const dayDir = path.join(STATIONS_DIR, dataset, date);
  await fs.mkdir(dayDir, { recursive: true });

  await eachLimit(stations, 20, async ({ bomId, name, data }) =>
    fs.writeFile(
      path.join(dayDir, `${bomId}.json`),
      JSON.stringify({ name, updatedDate, startDate, series: data }),
    ),
  );

  logger.info("Generated %d station files -> %s", stations.length, dayDir);
}
