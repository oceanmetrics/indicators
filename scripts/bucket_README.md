# Ocean Metrics Indicators: the published catalog

Any place × any indicator × time, as values only (no geometry). Built daily by
[oceanmetrics/indicators](https://github.com/oceanmetrics/indicators) from what the producers publish; shown by the
viewer at https://oceanmetrics.io/indicators/. This folder is https://storage.oceanmetrics.io/indicators/ (each file a
redirect to the bucket, CORS open) and https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/.

- `indicators.json`: the manifest: every indicator, its category tags (ONMS sections, NaMES themes, GOOS EOVs),
  series, method, dataset, licence, citation and the place collections it covers.
- `coverage.parquet`: place × indicator × grain: time range, periods, last value, sparkline, and the default status
  and trend relative to the place's own record.
- `values/indicator=<id>/coll=<gazetteer collection>/data.parquet`: the contract rows (`place_id, coll, indicator,
  time_grain, time, class, value, n, unit`), with their provenance as JSON in the Parquet metadata (`om:provenance`).

```sql
SELECT place_id, time, value
FROM read_parquet('https://s3.us-east-1.amazonaws.com/oceanmetrics.io-public/indicators/values/indicator=erddap:dhw_5km:CRW_SST:mean/coll=places/data.parquet')
WHERE time_grain = 'year' ORDER BY place_id, time;
```

- `changes/<YYYY-MM-DD>.json` and `.parquet`: what changed in a day's build, one row per place × indicator
  (`kind`: `status` when the status word changed, `new` for a first value, `period` for a later period), with the
  sentence feeds and mails use; `changes/latest.json`: when the catalog was last checked, the last day with a change and
  the last 30 change files. Schemas `changes-row` and `changes-latest` in `@oceanmetrics/catalog`.
- `feeds/`: Atom feeds of the changes: `all.xml`, `coll=<collection>.xml`, `set=<place set>.xml` and
  `place=<place id>.xml` (e.g. `feeds/place=NMS:CINMS.xml`), listed in `feeds/index.json`. Statuses are relative to each
  place's own record, never better or worse.
- `producers/cmems/`: the Copernicus Marine place producer's own output (`index.json`, and `<dataset>/<variable>/<place>/`
  with `data.parquet` and `provenance.json`), for the places a maintainer accepted from a request. It is not the catalog: the
  daily build reads it into `values/`, and the catalog sync never deletes it.

Values are CC BY 4.0; credit the upstream providers as each indicator's `citation` says. Place ids are those of the
[Ocean Metrics gazetteer](https://storage.oceanmetrics.io/gazetteer/).
