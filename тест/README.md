# Серия бенчмарков CRM

Единый скрипт на **Node.js / TypeScript** — тот же runtime, что у API CRM (Hono). Не требует Python, не конфликтует с интеграциями.

Источник требований: [`тесты/CRM-система_ Аудит, методы, ТЗ.md`](../тесты/CRM-система_%20Аудит,%20методы,%20ТЗ.md)

## Файл

| Файл | Назначение |
|------|------------|
| [`bench-all.ts`](bench-all.ts) | Все 12 бенчмарков, библиотеки, конфиг, runner |
| `logs/{CODE}/` | `run.log`, `errors.log`, `report.md` на каждый тест |
| `logs/suite-report.md` | Сводка серии |

## Запуск

```bash
npm run bench              # все 12 тестов
npm run bench -- MEM-1.1   # один тест
npm run bench:AI-3.2       # алиас
```

На сервере достаточно Node 20+ (уже стоит для CRM API).

## Энтропия (AI-3.2)

```bash
export BENCH_ASIC_DEVICE=/dev/ttyUSB0   # опционально BM1366
npm run bench:AI-3.2
```

Каскад: ASIC → OS CSPRNG → `/dev/hwrng` → hwmon → timer jitter. PRNG запрещены.

## Конфигурация

Параметры тестов — объект `CONFIG` в начале [`bench-all.ts`](bench-all.ts).
