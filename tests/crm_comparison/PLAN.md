# План сравнения: Classic CRM vs Advanced bench

## Цель

Сопоставить **CRM на классической стеке** (PostgreSQL/PGlite, Drizzle, Hono REST, RBAC, SQL JOIN, stage automations) с **той же предметной областью на векторных методах** (SDM, VSA, VaCoAl, FPTM, Active Inference, CA) по измеримым метрикам и **отраслевым эталонам** CRM/SaaS/серверного ПО.

## Контекст репозитория

| Слой | Classic (production) | Bench (benchmark) |
|------|---------------------|-----------------|
| API | `server/src/routes/*.ts` | — |
| БД | `server/src/db/schema.ts`, Drizzle | SDM / VaCoAl in-memory |
| Поиск лидов | `LIKE` на name/phone | Hamming recall |
| Граф | FK + JOIN | VaCoAl multi-hop |
| Скоринг | `stage.automations` JSON | FPTM DNF |
| Аудит | `audit_log` + RBAC | Surprisal layer |
| Воронка | SQL `COUNT` по stages | CA Rule 184 |

**Важно:** production CRM сегодня — classic. Bench реализован в `tests/strict_math_refactor/bench-core.ts`. Сравнение — **экспериментальное**, на синтетике и симуляторах classic-паттернов, с явной фиксацией production gap.

---

## Отраслевые эталоны (Industry Baselines)

Источники: Gartner SaaS SLA, OWASP API Security, Salesforce/Heroku performance guides, Fortinet anomaly FP targets, FPTM paper (arXiv:2508.08350), PostgreSQL tuning guides.

| Код | Метрика | Эталон | Область |
|-----|---------|--------|---------|
| IND-API-P95 | REST API p95 latency | ≤ 300 ms | CRM SaaS |
| IND-API-LIST | List/pagination query | ≤ 200 ms | CRM list endpoint |
| IND-SEARCH | Search sub-second | ≤ 1000 ms | CRM search |
| IND-GRAPH | Multi-hop relationship | ≤ 500 ms | Graph traversal |
| IND-UPTIME | SLA availability | ≥ 99.9 % | SaaS contract |
| IND-SCORING | Lead scoring accuracy | ≥ 85 % | ML CRM |
| IND-ANOMALY-FP | False positive rate | ≤ 5 % | SOC / UEBA |
| IND-MODEL-SIZE | Edge classifier | ≤ 51.2 KB | IoT/edge deploy |
| IND-INFERENCE | Bitwise/edge inference | ≥ 100 000 ops/s | Server hot path |
| IND-MEM-10K | RAM per 10k entities | ≤ 50 MB | Small tenant |
| IND-FUZZY | Noisy record match | ≥ 95 % | Data quality |
| IND-COLLISION | Memory collision rate | ≤ 0.05 % | Associative memory |
| IND-VSA-ACC | Attribute unbind | ≥ 98 % | Composite records |
| IND-GRAPH-SPEEDUP | Bench vs SQL speedup | ≥ 1.2× | VaCoAl claim |
| IND-CA-STABILITY | Funnel attractor | ≥ 0.35 LST | Pipeline model |

---

## Матрица сравнения (12 осей + 5 серверных)

### Фаза 1 — Память (MEM)

| ID | Classic реализация | Bench реализация | Bench ref |
|----|-------------------|----------------|-----------|
| CMP-MEM-01 | `Map` exact key + linear scan | SDM store/recall, collision % | MEM-1.1 |
| CMP-MEM-02 | Exact match after 28% bit corruption | Hamming radius recall | MEM-1.2 |
| CMP-MEM-03 | 10× JSON field read/write | VSA bind/unbind accuracy | MEM-1.3 |
| CMP-MEM-04 | `sqlFiveHop` on 20k rows | `VaCoAlIndex.multiHopSearch` | MEM-1.4 |

### Фаза 2 — Tsetlin (TM)

| ID | Classic | Bench | Bench ref |
|----|---------|-----|-----------|
| CMP-TM-01 | Heuristic rule engine (stage automations) | FPTM `predict` accuracy | TM-2.1 |
| CMP-TM-02 | JS filter loop on lead features | `bitInfer` throughput | TM-2.2 |
| CMP-TM-03 | Opaque automation JSON | `extractRules` DNF count | TM-2.3 |
| CMP-TM-04 | Full ruleset replace on drift | `eraseStale` + re-seed | TM-2.4 |

### Фаза 3 — AI / Security

| ID | Classic | Bench | Bench ref |
|----|---------|-----|-----------|
| CMP-AI-01 | RBAC passes `lead.export` | Surprisal > threshold | AI-3.1 |
| CMP-AI-02 | `randomBytes` only | Hardware entropy cascade | AI-3.2 |
| CMP-AI-03 | No native bridge | `NativeIPCBridge` stub | AI-3.3 |
| CMP-AI-04 | SQL stage histogram stability | CA Rule 184 LST | AI-3.4 |

### Фаза 4 — Сервер / CRM standards

| ID | Что измеряем | Classic | Bench | Industry |
|----|--------------|---------|-----|----------|
| CMP-SRV-01 | List 5000 leads + notes join sim | ms | SDM batch recall ms | IND-API-LIST |
| CMP-SRV-02 | RSS / bytes per 10k records | row estimate | SDM RSS | IND-MEM-10K |
| CMP-SRV-03 | Rules JSON size vs FPTM bytes | KB | B | IND-MODEL-SIZE |
| CMP-CRM-01 | Insider FP % | RBAC N/A | surprisal FP | IND-ANOMALY-FP |
| CMP-CRM-02 | SLA (documented) | 99.9% target | same | IND-UPTIME |

---

## Порядок выполнения (пошагово)

1. **Запуск** `npx tsx tests/crm_comparison/compare-bench.ts`
2. Скрипт последовательно выполняет CMP-* тесты (classic и Bench на одной машине)
3. Каждый тест пишет в `logs/comparison.log`: метрики, эталон, вердикт
4. Финал: сводная таблица + production gap + рекомендации
5. Обновить `CHECKLIST.md` — все пункты `[x]` после успешного прогона

---

## Критерии вердикта

| Вердикт | Условие |
|---------|---------|
| **BENCH_WIN** | Bench метрика лучше classic И проходит industry |
| **CLASSIC_WIN** | Classic лучше или Bench не проходит industry |
| **PARITY** | Разница < 10%, оба проходят industry |
| **BENCH_WIN_GAP** | Bench лучше в bench, но **не в production** |
| **FAIL** | Оба не проходят industry |

---

## Production Gap (ожидаемый)

После прогона фиксируется:

- `server/src/routes/leads.ts` — нет SDM/Hamming
- `server/src/lib/automations.ts` — нет FPTM
- `server/src/lib/audit.ts` — нет surprisal layer
- `server/src/routes/analytics.ts` — funnel через SQL, не CA

Рекомендации интеграции — в финале `comparison.log`.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `compare-bench.ts` | Функциональное сравнение 18 осей |
| `stress-bench.ts` | Нагрузка WARMUP→LOAD→STRESS→SOAK |
| `CHECKLIST.md` | Чеклист фаз |
| `logs/comparison.log` | Отчёт compare |
| `logs/stress-report.log` | Отчёт stress + scorecard |
| `../strict_math_refactor/bench-core.ts` | Эталон bench math |
| `../../тесты/CRM-система_ Аудит, методы, ТЗ.md` | ТЗ на методы |

## Стресс-протокол (`npm run bench:stress`)

| Фаза | Ops | Назначение |
|------|-----|------------|
| WARMUP | 500 | Прогрев |
| LOAD | 5 000 | Номинальная нагрузка |
| STRESS | 12 000 | Пик 2.4× |
| SOAK | 8 000 | Устойчивость RSS |

Mix: list 40% · search 25% · graph 15% · score 10% · audit 10%  
Датасет: **20 000 лидов** (оба стека, seed=42).
