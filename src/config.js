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
 * Normal data provides "precipitation since 9am" (cumulative).
 * This modifier converts it into deltas for better time-series visualization.
 *
 * @param {Array} rows - raw rows from DB
 * @returns {Array} - rows with 'value' converted to incremental delta
 */
export function calculateIncrementalRainDeltas(rows) {
  // 1. Group readings by station using reduce
  const byStation = rows.reduce((acc, row) => {
    (acc[row.auroraId] ||= []).push(row);
    return acc;
  }, {});

  // 2. For each station, calculate incremental rain deltas using flatMap and map
  return Object.values(byStation).flatMap((stationRows) => {
    let prevValue = null;
    let prev9amRef = null;

    return stationRows.map((row) => {
      const current9amRef = get9amRef(row.generationTime);
      const currentValue = row.value;

      // Detect if we've crossed the 9am boundary or started a new series
      const isNewPeriod = prevValue === null || current9amRef !== prev9amRef;

      const spotValue = isNewPeriod
        ? currentValue // First reading or new 9am period
        : Math.max(0, currentValue - prevValue); // Delta since last reading

      // Update tracking state for next iteration
      prevValue = currentValue;
      prev9amRef = current9amRef;

      return {
        ...row,
        value: spotValue,
      };
    });
  });
}

export const DATASET_CONFIGS = {
  rainfallSpot: {
    column: "precipitationSince9amMM",
    overfetchMs: 120 * 60 * 1000, // Fetch 2 hours of extra data for midnight delta accuracy
    onRows: calculateIncrementalRainDeltas,
  },
};

export default DATASET_CONFIGS;
