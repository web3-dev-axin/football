# Data Sources

## Local Demo Sources

The local environment uses deterministic demo snapshots so the full flow can run without external credentials:

- `fifa_official`: canonical fixture/team reference snapshot.
- `sports_data_provider`: provider mirror used for mismatch detection.
- `fifa_reference`: odds reference snapshot used by demo odds ingestion.
- `provider_a`: demo odds provider snapshot.

## Commercial Provider Boundary

Production sports and odds providers must be integrated behind provider adapters. Raw payloads must be stored with:

- source/provider name
- source timestamp
- ingestion timestamp
- payload hash
- raw payload
- normalized fixture, event, or odds fields

Provider data cannot become canonical until comparison jobs mark it verified. Critical fixture, live event, or odds mismatches block market creation/result proposal or trigger market pause.

## Current Local Limitation

This repository currently ships demo adapters and schema/report hooks. Real provider credentials, license-specific payload mapping, and hosted SLO monitoring must be supplied in staging/production.
