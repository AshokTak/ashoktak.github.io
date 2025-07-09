---
title: "Event-Streaming Data Platform"
date: 2025-05-20
tags: ["Kafka", "Spark", "AWS", "Real-Time"]
link: "https://github.com/your-github/event-streaming-platform"
---

A real-time analytics pipeline built to ingest **100 k messages/sec** and expose metrics to downstream applications within **seconds**.

Architecture:

1. **Producers** publish JSON events to _Kafka_ topics
2. **Spark Structured Streaming** reads from Kafka, performs windowed aggregations, and writes parquet to _S3_
3. **Redshift Spectrum** surfaces the data to analysts with <1 s query latency
4. _dbt_ models curate marts consumed by Looker dashboards

Key achievements:

- Auto-scaled consumer groups maintain <200 ms lag during traffic spikes
- Partitioning strategy (date/hour) cut S3 storage costs by **30 %**
- Terraform + GitHub Actions provide fully declarative, push-button deployments

➡️  Explore the source code on GitHub, or watch a demo of the pipeline recovering from a sudden **10× traffic burst** without data loss.