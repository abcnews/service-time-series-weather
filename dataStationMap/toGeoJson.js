import fs from "node:fs";
import { parse } from "csv-parse/sync";

const overrides = new Map(
  parse(
    fs.readFileSync(new URL("./editorial-names.csv", import.meta.url), "utf8"),
    { columns: true, skip_empty_lines: true },
  ).map((r) => [r.METRAID, r["NAME OVERRIDE"]]),
);

const existingPath = new URL("../data/au.geo.json", import.meta.url);
const existing = fs.existsSync(existingPath)
  ? JSON.parse(fs.readFileSync(existingPath, "utf8"))
  : { features: [] };
const auroraMap = new Map(
  existing.features.map((f) => [f.properties.metraId, f.properties]),
);

const stations = parse(
  fs.readFileSync(
    new URL("./weather-stations-fulltable-export.csv", import.meta.url),
    "utf8",
  ),
  {
    columns: ["metraId", "wmoId", "bomId", "name", "point"],
    from_line: 2,
    skip_empty_lines: true,
  },
);

const features = stations.map(({ metraId, wmoId, bomId, name, point }) => {
  const coords = point
    .replace(/POINT\s*\(|\)/g, "")
    .trim()
    .split(" ")
    .map(Number);
  const prev = auroraMap.get(metraId) || {};
  const storyLabName = overrides.get(metraId);

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      metraId,
      wmoId,
      bomId,
      name,
      ...(storyLabName && { storyLabName }),
      ...(prev.auroraId && { auroraId: prev.auroraId }),
      ...(prev.auroraName && { auroraName: prev.auroraName }),
    },
  };
});

fs.writeFileSync(
  existingPath,
  JSON.stringify({ type: "FeatureCollection", features }, null, 2),
);
console.log(`Successfully converted ${features.length} features`);
