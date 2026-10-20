# Ocean Metrics Indicators: the published catalog

Any place × any indicator × time, as values only (no geometry). Built daily by
[oceanmetrics/indicators](https://github.com/oceanmetrics/indicators) from what the producers publish; shown by the
viewer at https://oceanmetrics.io/indicators/.

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

Values are CC BY 4.0; credit the upstream providers as each indicator's `citation` says. Place ids are those of the
[Ocean Metrics gazetteer](https://storage.oceanmetrics.io/gazetteer/).
