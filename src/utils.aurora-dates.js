/**
 * Resolves a local time string (e.g., "10:22 am") to an ISO 8601 string
 * using the date and timezone from a reference ISO string.
 *
 * @param {string} localTimeStr - e.g., "10:22 am"
 * @param {string} referenceIso - e.g., "2025-12-18T17:30:00+11:00"
 * @returns {string} - ISO 8601 string with local offset preserved
 */
export function resolveLocalTimeToUtc(localTimeStr, referenceIso) {
  if (!localTimeStr || !referenceIso) {
    return null;
  }

  // 1. Extract the date part and the timezone offset from the reference ISO string
  const isoMatch = referenceIso.match(
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/,
  );
  if (!isoMatch) {
    throw new Error(`Invalid reference ISO string: ${referenceIso}`);
  }

  const datePart = isoMatch[1];
  const offsetPart = isoMatch[3] === "Z" ? "+00:00" : isoMatch[3];

  // 2. Parse the local time string
  const timeMatch = localTimeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!timeMatch) {
    throw new Error(`Invalid local time format: ${localTimeStr}`);
  }

  let [_, hours, minutes, ampm] = timeMatch;
  let h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);

  if (ampm.toLowerCase() === "pm" && h < 12) {
    h += 12;
  } else if (ampm.toLowerCase() === "am" && h === 12) {
    h = 0;
  }

  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");

  // 3. Combine into a new ISO string with the same date and offset
  const resolvedIso = `${datePart}T${hh}:${mm}:00${offsetPart}`;

  // 4. Handle Midnight Boundary Crossing
  // Example: A reading at 01:00 AM (April 21) reports a Max Temp of "3:00 pm".
  // Since 3:00 PM today is in the future, the peak must have happened yesterday at 3:00 PM (April 20).
  const referenceDate = new Date(referenceIso);
  const resolvedDate = new Date(resolvedIso);

  if (resolvedDate > referenceDate) {
    // Subtract 24 hours to get to the previous day
    const yesterday = new Date(resolvedDate.getTime() - 24 * 60 * 60 * 1000);
    
    // Extract the year/month/day from the yesterday date in the target timezone
    // to reconstruct exactly {yesterdayDate}T{hh}:{mm}:00{offsetPart}
    const isoString = yesterday.toISOString(); // e.g. "2026-04-20T05:04:00Z" (if +8)
    
    // Wait, toISOString is UTC. If we were +10, 13:04 PM today (21st) -> 03:04 AM today (21st) UTC.
    // Subtracting 24h -> 03:04 AM yesterday (20th) UTC.
    // If we just want the date part of the "local" yesterday, we should just subtract a day from the string 
    // or use a more robust Date approach.
    
    // SIMPLEST: Re-parse the datePart and subtract 1 day.
    const [y, m, d] = datePart.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
    const newDatePart = dateObj.toISOString().split("T")[0];

    return `${newDatePart}T${hh}:${mm}:00${offsetPart}`;
  }

  return resolvedIso;
}

/**
 * Filters a set of rows so that only those with a generationTime
 * falling within the [start, end] range are kept.
 *
 * @param {Array} rows - array of objects with generationTime (ISO string)
 * @param {Date} start - target day start boundary
 * @param {Date} end - target day end boundary
 * @returns {Array} - filtered rows
 */
export function clipRowsToDay(rows, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();

  return rows.filter((r) => {
    const time = new Date(r.generationTime).getTime();
    return time >= startMs && time <= endMs;
  });
}
