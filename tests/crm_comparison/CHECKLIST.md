# Чеклист: Classic CRM vs Advanced bench

Отмечайте `[x]` по мере выполнения. Итоговый статус дублируется в `logs/comparison.log`.

## Фаза 0 — Подготовка

- [x] Создана директория `tests/crm_comparison/`
- [x] Зафиксированы отраслевые эталоны (`industry-standards.ts`)
- [x] Описан план сопоставления (`PLAN.md`)
- [x] Настроен единый лог `logs/comparison.log`

## Фаза 1 — Память и поиск (MEM)

- [x] **CMP-MEM-01** Классика: точный поиск / LIKE vs Bench: SDM Hamming recall
- [x] **CMP-MEM-02** Классика: 0% fuzzy при 28% шума vs Bench: ≥99% recall
- [x] **CMP-MEM-03** Классика: JSONB + 10 полей vs Bench: VSA bind/unbind
- [x] **CMP-MEM-04** Классика: SQL 5-hop JOIN vs Bench: VaCoAl multi-hop

## Фаза 2 — Классификация и инференс (TM)

- [x] **CMP-TM-01** Классика: rule-based automations vs Bench: FPTM accuracy
- [x] **CMP-TM-02** Классика: SQL/JS filter loop vs Bench: битовый инференс (ops/s)
- [x] **CMP-TM-03** Классика: непрозрачные automations vs Bench: DNF IF/THEN
- [x] **CMP-TM-04** Классика: полный сброс правил vs Bench: Recognize-and-Erase drift

## Фаза 3 — Безопасность и динамика (AI)

- [x] **CMP-AI-01** Классика: RBAC-only audit vs Bench: surprisal anomaly
- [x] **CMP-AI-02** Классика: CSPRNG only vs Bench: hardware entropy cascade
- [x] **CMP-AI-03** Классика: нет IPC vs Bench: NativeIPCBridge контракт
- [x] **CMP-AI-04** Классика: SQL funnel COUNT vs Bench: CA Rule 184 + LST

## Фаза 4 — Серверные и CRM-стандарты

- [x] **CMP-SRV-01** Latency list-query (симуляция) vs отраслевой p95 ≤300 ms
- [x] **CMP-SRV-02** Память на 10k лидов vs эталон ≤50 MB
- [x] **CMP-SRV-03** Размер модели классификатора vs ≤51.2 KB (edge)
- [x] **CMP-CRM-01** FP rate anomaly vs ≤5% (SOC/IDS)
- [x] **CMP-CRM-02** Uptime SLA reference 99.9% (документировано)

## Фаза 5 — Отчёт

- [x] Сводная таблица Classic / Bench / Industry
- [x] Вердикт по каждой оси (win/loss/parity/gap)
- [x] Матрица «production gap» (что есть в CRM classic, чего нет в API)
- [x] Рекомендации интеграции bench в `server/`

## Фаза 6 — Стресс-тест (`stress-bench.ts`)

- [x] WARMUP / LOAD / STRESS / SOAK (25 500 ops, 20k лидов)
- [x] Mix: list 40% | search 25% | graph 15% | score 10% | audit 10%
- [x] p50 / p95 / p99 / throughput / error rate / RSS
- [x] Объективная scorecard (взвешенная, 100 баллов)
- [x] Отчёт: `logs/stress-report.log`

## Production hybrid (main CRM)

- [x] Пакет `@sdr-crm/sdr-core` (`packages/sdr-core/`)
- [x] `SDR_SEARCH` — fuzzy search через SDM в `GET /api/leads?search=`
- [x] `SDR_INDEX_ON_START` + таблица `lead_sdr_vectors` (персистентность)
- [x] `SDR_AUDIT` — surprisal + badge `anomaly` в журнале
- [x] `SDR_SCORING` — FPTM predict на смене этапа + `GET /api/leads/:id/score`
- [x] `SDR_GRAPH` — `GET /api/leads/:id/graph?hops=`
- [x] `SDR_FUNNEL_CA` — `GET /api/analytics/funnel-ca`
- [x] CLI `npm run sdr:reindex -w @sdr-crm/server`
- [x] Env flags в `server/.env.example`
