# WIP: time-series weather data

Use the ABC's Aurora GraphQL database to fetch and collate weather data.

The scripts are wrapped in Commander, so you can run `node . --help` for details.

## Setup

To set up this repo, you must create a geojson object with the locations you wish to track.

1. Make sure au.geo.json is up to date. Data comes from [./stationMapData](./stationMapData)
   and probably doesn't need to be updated again.
1. `npm run fetch:aurora-ids` # Rectify locations with Aurora IDs

## Usage (gather data)

Once the setup steps are done, you can run the following on a cron job to
populate weather.sqlite.

1. `npm run fetch:weather-cron`

## Usage (collate data)

### Single dataset

Output a JSON file containing a series of the given measurements for every
Aurora location. You can use this to correlate with the GeoJSON file.

1. `node . generate-dataset -c tempC -o tempc.json`

This generates a file in this format, with each item in the array corresponding
with the timestamps object:

```javascript
{
  // When the file was written
  updatedDate: "2026-01-14T12:26:20+10:00",

  // The start date and time of the time series, in ISO 8601 format.
  startDate: "2026-01-01T00:00:00+10:00",

  // Each key is an Aurora ID (corresponding to au.geo.json)
  // For compression, the date is represented as minutes offset from midnight
  series: {
    "loc39f58b228284": [
      // [minutes offset from midnight, observation value]
      [1, 24.8],    // 1 minute past midnight, value: 24.8
      [31, 24.3],
      [61, 23.5],
      [101, 22.8],
      [171, 21.8]
    ],
    …
```

### Multiple datasets

Output all your JSON files with `node . generate-datasets --columns tempC,humidity --days 14`. This uses the `--columns` and `--days` options to specify the datasets to generate and the number of days respectively.
