import { subDays } from "date-fns";

/**
 * Returns the timestamp of the most recent 9am local time at or before the given ISO string's time.
 * Handles different ISO8601 formatting by robustly extracting the timezone offset.
 *
 * @param {string} isoString - e.g. "2026-04-20T11:55:33+10:00"
 * @returns {number} - UTC timestamp ms
 */
export function get9amRef(isoString) {
  const datePart = isoString.substring(0, 10);

  // Extract timezone offset (e.g. +10:00 or Z) to ensure we calculate 9am accurately
  // relative to the station's local time of measurement.
  const offsetMatch = isoString.match(/([+-]\d{2}:?\d{2}|Z)$/);
  const offsetPart = offsetMatch ? offsetMatch[0] : "";

  // ref is 9am on the same calendar day as the measurement
  const ref = new Date(`${datePart}T09:00:00${offsetPart}`);
  const current = new Date(isoString);

  // If the measurement was taken before 9am, its reference period started at 9am yesterday
  if (current < ref) {
    const yesterday = subDays(ref, 1);
    return yesterday.getTime();
  }

  return ref.getTime();
}

/**
 * rainfallSpot modifier: Calculates discrete "rainfall since last measurement".
 * Uses 'rainfall24hr' at the 9am boundary to accurately capture rain that fell
 * between the last measurement and the meteorological reset.
 *
 * @param {Array} rows - raw rows from DB (requires 'value' and 'rainfall24hr')
 * @returns {Array} - rows with 'value' converted to incremental delta
 */
export function calculateIncrementalRainDeltas(rows) {
  // 1. Group readings by station using reduce
  const byStation = rows.reduce((acc, row) => {
    (acc[row.auroraId] ||= []).push(row);
    return acc;
  }, {});

  /** After this point we stop looking for yesterday's total */
  const LAG_WINDOW_MS = 2 * 60 * 60 * 1000;

  // 2. For each station, calculate incremental rain deltas
  return Object.values(byStation).flatMap((stationRows) => {
    let prevValue = null;
    let prev9amRef = null;
    let prevRainfall24hr = null;

    return stationRows.flatMap((row, index) => {
      const current9amRef = get9amRef(row.generationTime);
      const currentValue = row.value;
      const currentRain24 = row.rainfall24hr;
      const points = [];

      // Boundary Detection: If we've crossed 9am, inject the gap-filling delta
      if (prevValue !== null && current9amRef !== prev9amRef) {
        // Search ahead in the currently fetched data for the first reading in this NEW period
        // where rainfall24hr has finally updated (changed from the previous period's value).
        const freshRow = stationRows
          .slice(index)
          .find(
            (r) =>
              get9amRef(r.generationTime) === current9amRef &&
              r.rainfall24hr !== null &&
              r.rainfall24hr !== prevRainfall24hr,
          );

        const timeSinceBoundary = new Date(row.generationTime) - current9amRef;
        const isFresh = !!freshRow;
        const isPastLagWindow = timeSinceBoundary > LAG_WINDOW_MS;

        // Only inject the 9am boundary point if we have fresh data or we've timed out
        // Timeout implies the previous max rain is identical to the current.
        if (isFresh || isPastLagWindow) {
          const definitiveRain24 = isFresh ? freshRow.rainfall24hr : currentRain24;
          const gapDelta = Math.max(0, (definitiveRain24 || 0) - prevValue);

          points.push({
            ...row,
            generationTime: new Date(current9amRef).toISOString(),
            value: Number(gapDelta.toFixed(1)),
          });
        }

        points.push({ ...row, value: Number(currentValue.toFixed(1)) });
      } else {
        // Normal progression: Delta since last measurement
        const isFirstReading = prevValue === null;
        const delta = isFirstReading
          ? currentValue
          : Math.max(0, currentValue - prevValue);

        points.push({ ...row, value: Number(delta.toFixed(1)) });
      }

      prevValue = currentValue;
      prev9amRef = current9amRef;
      if (currentRain24 !== null) {
        prevRainfall24hr = currentRain24;
      }
      return points;
    });
  });
}

/**
 * Temperature modifier: Injects exact Maximum and Minimum points into the
 * periodic time-series based on BOM summary metadata.
 *
 * @param {Array} rows - raw rows from DB (requires 'value', 'maximumTempC', etc.)
 * @returns {Array} - merged and sorted rows
 */
export function injectTemperatureSummaries(rows) {
  // 1. Group readings by station using reduce
  const byStation = rows.reduce((acc, row) => {
    (acc[row.auroraId] ||= []).push(row);
    return acc;
  }, {});

  // 2. For each station, detect changes in Max/Min peaks
  return Object.values(byStation).flatMap((stationRows) => {
    let lastMax = null;
    let lastMaxTime = null;
    let lastMin = null;
    let lastMinTime = null;

    const merged = stationRows.flatMap((row) => {
      const points = [row];

      // Detect New Maximum Point
      if (
        row.maximumTempLocalTimeUTC &&
        (row.maximumTempC !== lastMax ||
          row.maximumTempLocalTimeUTC !== lastMaxTime)
      ) {
        points.push({
          ...row,
          generationTime: row.maximumTempLocalTimeUTC,
          value: row.maximumTempC,
        });
        lastMax = row.maximumTempC;
        lastMaxTime = row.maximumTempLocalTimeUTC;
      }

      // Detect New Minimum Point
      if (
        row.minimumTempLocalTimeUTC &&
        (row.minimumTempC !== lastMin ||
          row.minimumTempLocalTimeUTC !== lastMinTime)
      ) {
        points.push({
          ...row,
          generationTime: row.minimumTempLocalTimeUTC,
          value: row.minimumTempC,
        });
        lastMin = row.minimumTempC;
        lastMinTime = row.minimumTempLocalTimeUTC;
      }

      return points;
    });

    // Ensure strictly chronological order after injection
    return merged.sort(
      (a, b) => new Date(a.generationTime) - new Date(b.generationTime),
    );
  });
}

export const DATASET_CONFIGS = {
  tempC: {
    includeColumns: [
      "maximumTempC",
      "minimumTempC",
      "maximumTempLocalTimeUTC",
      "minimumTempLocalTimeUTC",
    ],
    onRows: injectTemperatureSummaries,
  },
  rainfallSpot: {
    column: "precipitationSince9amMM",
    includeColumns: ["rainfall24hr"],
    overfetchMs: 120 * 60 * 1000,
    onRows: calculateIncrementalRainDeltas,
  },
};

export default DATASET_CONFIGS;
