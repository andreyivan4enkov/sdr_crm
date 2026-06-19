# Classic CRM vs SDR CRM — сравнение

Парное сопоставление **классической SDR CRM** (PostgreSQL, Drizzle, Hono, RBAC) и **SDR-методов** (SDM, VSA, VaCoAl, FPTM, Surprisal, CA) по отраслевым эталонам.

## Запуск

```bash
npm run bench:compare   # функциональное сравнение 18 осей
npm run bench:stress    # нагрузка WARMUP→LOAD→STRESS→SOAK
npm run bench:full      # оба прогона
```

| Лог | Содержание |
|-----|------------|
| `logs/comparison.log` | Парные метрики Classic vs SDR |
| `logs/stress-report.log` | Стресс-тест p50/p95/p99, scorecard |

## Документация

| Файл | Содержание |
|------|------------|
| [PLAN.md](./PLAN.md) | Детальный план, матрица осей, критерии вердикта |
| [CHECKLIST.md](./CHECKLIST.md) | Пошаговый чеклист фаз 0–5 |
| [logs/comparison.log](./logs/comparison.log) | **Единый отчёт** (classic / SDR / industry) |

## Оси сравнения (21 метрика)

- **MEM** — коллизии, fuzzy recall, VSA, 5-hop graph
- **TM** — accuracy, inference ops/s, DNF rules, concept drift
- **AI** — insider surprisal, entropy, IPC stub, CA funnel
- **SRV/CRM** — list latency, RAM, model size, FP rate, SLA

## Вердикты

| Код | Значение |
|-----|----------|
| `SDR_WIN` | SDR лучше classic и проходит industry |
| `SDR_WIN_GAP` | SDR лучше в bench, **не в production** |
| `CLASSIC_WIN` | Classic лучше или SDR не проходит эталон |
| `PARITY` | Паритет (<10% разница) |
| `FAIL` | Оба не проходят industry |

## Связь с бенчмарками

| Сравнение | Bench-core |
|-----------|------------|
| CMP-MEM-* | MEM-1.1 … MEM-1.4 |
| CMP-TM-* | TM-2.1 … TM-2.4 |
| CMP-AI-* | AI-3.1 … AI-3.4 |

Production CRM: `server/`, `src/` — classic only.
