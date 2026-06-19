# Strict Math Refactor — bench-core.ts

Монолитный стенд бенчмарков CRM (Node.js / TypeScript). Без Python, без разбиения на модули.

## Запуск

```bash
npx tsx tests/strict_math_refactor/bench-core.ts
npx tsx tests/strict_math_refactor/bench-core.ts MEM-1.1
```

## Принципы

- **SDR** = Sparse Distributed Representations (разреженные распределённые представления).
- Детерминированные процессы: без `Math.random()`; синтетика через LFSR / mulberry32.
- **AI-3.4**: истинный 1D клеточный автомат (Rule 184, Local Structure Theory).
- **AI-3.3**: `NativeIPCBridge` — заглушка под нативный демон (C++/Zig), не симуляция в V8.
- **AI-3.1**: информационная сюрпризность (биты), не «термодинамика» wall-time.

Логи: **один файл** — `tests/strict_math_refactor/logs/bench.log`
