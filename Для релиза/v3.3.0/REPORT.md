# Отчёт тестирования — CRM v3.3.0

**Дата:** 2026-06-23  
**Ветка:** main  
**TypeScript:** `npx tsc --noEmit`

---

## Результаты TypeScript

```
✅ 0 ошибок
✅ 0 предупреждений
```

---

## Результаты тестов reactor-core

```
TAP version 13
# tests 16
# suites 7
# pass 16
# fail 0
# cancelled 0
# skipped 0

Пакеты:
  ✅ actor-spacing          3/3 pass
  ✅ desugarV3Graph         1/1 pass
  ✅ applyGraphPatch        3/3 pass  ← затронут H-8 (edge update)
  ✅ diffGraphs             1/1 pass
  ✅ summarizeGraphForAi    1/1 pass
  ✅ mask infoblock styles  5/5 pass  ← затронут mask-styles fixes
  ✅ layoutExpandedGraph    2/2 pass

Пропущен (pre-existing, vitest не установлен):
  ⚠️  expand-graph.test.ts — ERR_MODULE_NOT_FOUND vitest
```

---

## Применённые исправления (все верифицированы)

| # | Код | Файл | Статус |
|---|-----|------|--------|
| 1 | C-1 | compose-ai.ts | ✅ probe.out→touch.in: kind exec, port then |
| 2 | C-2 | validate.ts | ✅ Проверка типов портов через getV3Ports |
| 3 | C-3+H-2 | compose-ai.ts | ✅ Retry + уведомление пользователя |
| 4 | C-4 | compose-apply.ts | ✅ db.transaction() на всю запись |
| 5 | C-5 | compose-ai.ts | ✅ probe.out→fold.src (data port) |
| 6 | C-6 | compose-ai.ts | ✅ build=preserve, patch=merge mask-styles |
| 7 | H-5 | face-manifest.ts | ✅ skip mask-styles в resolveFaceGraph |
| 8 | H-6 | mask-edit-bridge.ts | ✅ clearStyleHistory при смене продукта |
| 9 | H-7 | desugar.ts | ✅ mail/edo/call маппинги исправлены |
| 10 | H-8 | graph-patch.ts | ✅ Edge update по id в patch |
| 11 | M-8 | compose-prompt.ts | ✅ Убран [exec — wrong!] пример |
| 12 | M-10 | api-client/types.ts | ✅ ReactorComposePlan.graphs сужен |

### Дополнительные исправления (обнаружены в ходе верификации C-2)

Валидатор C-2 выявил дополнительные port-mismatch в `buildRuleBasedGraphs`, которые ранее проходили молча:

| # | Файл | Было | Стало |
|---|------|------|-------|
| A | compose-ai.ts:97 | probe.out→touch.in exec | probe.then→touch.in exec + probe.out→touch.ctx data |
| B | compose-ai.ts:105 | probe.out→gate.in exec | probe.then→gate.in exec + probe.out→gate.cond data |
| C | compose-ai.ts:130 | probe.out→fold.in data + fold.out→touch.in exec | probe.then→fold.in exec + probe.out→fold.src data + fold.then→touch.in exec + fold.out→touch.ctx data |
| D | compose-ai.ts:158 | wire.out→face.in data | wire.out→face.data data |

---

## Отложенные задачи

| Код | Описание | Целевой релиз |
|-----|----------|---------------|
| H-1 | json_mode для compose LLM | v3.4.0 |
| H-3 | SQL LIKE вместо full scan crmMeta | v3.4.0 |
| H-4 | Circuit breaker → Redis | v3.5.0 |
| M-4 | LRU для expandCache | v3.4.0 |
| M-5 | Декомпозиция ReactorProductEditor | v3.5.0 |
| M-7 | Атомарный инкремент usage-ledger | v3.4.0 |
| — | Версионирование графов (history table) | v4.0.0 |
| — | Structured output / tool calling | v4.0.0 |

---

## Итог

**v3.3.0 готов к деплою.**  
TypeScript: 0 ошибок. Тесты: 16/16 PASS.  
Все критические и 5 из 8 высоких проблем устранены.
