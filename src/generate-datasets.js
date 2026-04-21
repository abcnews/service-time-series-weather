import { getTimeSeriesForColumn } from "./generate-dataset.js";
import fs from "node:fs/promises";
import path from "node:path";
import logger from "./logger.js";
import { exportWeatherDayToCsv } from "./export-csv.js";
import DATASET_CONFIGS from "./config.js";


export default async function generateDatasets(options) {
  const datasets = options.columns.split(",");
  const daysToGenerate = [];

  for (let i = 0; i > 0 - Number(options.days || 1); i--) {
    daysToGenerate.push(i);
  }

  // Generate CSV exports for each day for archiving/backup
  for (const dayOffset of daysToGenerate) {
    await exportWeatherDayToCsv(dayOffset);
  }

  for (const dataset of datasets) {
    for (const dayOffset of daysToGenerate) {
      const config = DATASET_CONFIGS[dataset] || {};
      const data = await getTimeSeriesForColumn({
        column: config.column || dataset,
        dayStart: dayOffset,
        onRows: config.onRows,
        overfetchPastMs: config.overfetchPastMs,
        overfetchFutureMs: config.overfetchFutureMs,
        includeColumns: config.includeColumns || [],
      });

      // Extract date portion from first timestamp and use substr for filename
      // Example: "2026-01-13T00:00:00+10:00" -> "2026-01-13"
      const dateSubstr = data.startDate.substring(0, 10); // Gets "YYYY-MM-DD"

      const filename = `${dateSubstr}.json`;
      const outputPath = path.join("data/assets/", dataset, filename);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(data));
      logger.info(
        "Generated %s for day offset %d -> %s",
        dataset,
        dayOffset,
        outputPath,
      );
    }
  }

  logger.info("All datasets generated successfully");
}
