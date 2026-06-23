# CHANGELOG — CRM v3.3.0

Дата: 2026-06-23

## Критические исправления

### C-1: Неверный тип ребра в rule-based flow
- **Файл:** `server/src/lib/reactor/compose-ai.ts`
- **Изменение:** В `buildRuleBasedGraphs` ребро `probe.out → touch.in` изменено с `kind: "data"` на `kind: "exec"`. Ребро между exec-портами обязано иметь kind=exec.

### C-2: Валидатор не проверял совместимость типов портов
- **Файл:** `packages/reactor-core/src/validate.ts`
- **Изменение:** Добавлен импорт `getV3Ports` и проверка совместимости `kind` ребра с типами портов исходной и целевой ноды. Новая ошибка валидации: `port_kind_mismatch`.

### C-3 + H-2: Silent fallback и отсутствие retry при невалидном JSON от LLM
- **Файл:** `server/src/lib/reactor/compose-ai.ts`
- **Изменение:** При получении невалидного JSON от AI выполняется повторный запрос с уточняющим промптом ("Верни ТОЛЬКО JSON объект без markdown…"). При повторной ошибке пользователь получает явное сообщение: "AI вернул невалидный ответ дважды. Применён локальный сборщик."

### C-4: Нет транзакции при записи нескольких графов
- **Файл:** `server/src/lib/reactor/compose-apply.ts`
- **Изменение:** Весь цикл записи графов обёрнут в `db.transaction()`. Теперь при ошибке валидации или записи второго/третьего графа изменения не сохраняются частично.

### C-5: Неверный порт в data fallback-графе
- **Файл:** `server/src/lib/reactor/compose-ai.ts`
- **Изменение:** В `buildRuleBasedGraphs`, ребро data-графа `probe.out → fold.in` исправлено на `probe.out → fold.src`. Порт `src` — корректный data-вход узла `fold`.

### C-6: mergeMaskStylesNode при action=build смешивал стили
- **Файл:** `server/src/lib/reactor/compose-ai.ts`
- **Изменение:** В функции `mergeAiGraph` при `action=build` теперь вызывается `preserveMaskStylesNode` (сохраняет существующий mask-styles-root), при `action=patch` — `mergeMaskStylesNode` (объединяет стили). Ранее в обоих случаях вызывался `mergeMaskStylesNode`, что приводило к загрязнению нового продукта стилями предыдущего.

## Высокие исправления

### H-5: resolveFaceGraph не фильтровал mask-styles-root
- **Файл:** `packages/reactor-core/src/face-manifest.ts`
- **Изменение:** В цикле обхода нод view-графа добавлен пропуск ноды с `cfg.op === "mask-styles"`. Без этого нода mask-styles-root попадала в UiManifest как компонент и вызывала ошибки рендеринга.

### H-6: История стилей не сбрасывалась при смене продукта
- **Файл:** `src/lib/mask-edit-bridge.ts`
- **Изменение:** В функции `setMaskEditProductSlug` при установке нового slug добавлен вызов `clearStyleHistory()`. Теперь кнопка Undo не активна при переходе к другому продукту.

### H-7: Неверные маппинги событий в desugar
- **Файл:** `packages/reactor-core/src/desugar.ts`
- **Изменение:** Исправлены маппинги в `V3_PULSE_EVENT_MAP`:
  - `mail_received`: "изменение поля" → "получение письма"
  - `edo_signed`: "изменение поля" → "подписание документа"
  - `call_completed`: "изменение поля" → "завершение звонка"

### H-8: Edge-патч не обновлял существующие рёбра
- **Файл:** `packages/reactor-core/src/graph-patch.ts`
- **Изменение:** В `applyGraphPatch` цикл обработки `patch.edges` теперь находит ребро по `id` и заменяет его (аналогично тому, как обновляются ноды). Ранее при наличии ребра с тем же id оно игнорировалось.

## Средние исправления

### M-8: FLOW_PATTERNS содержал ошибочный пример
- **Файл:** `packages/reactor-core/src/compose-prompt.ts`
- **Изменение:** Убрана строка `probe.out→gate(for_each).in [exec — wrong!]` и сопутствующий комментарий из паттерна "ПО РАСПИСАНИЮ". Оставлен только правильный паттерн с `probe.then→gate.in [exec]`.

### M-10: ReactorComposePlan.graphs имел широкий тип
- **Файл:** `packages/api-client/src/types.ts`
- **Изменение:** Тип поля `graphs` сужен с `Record<string, unknown>` до `Partial<Record<"flow" | "view" | "data", ReactorGraphPreview>>`. Обеспечивает типобезопасность на стороне клиента.

## Результаты проверки

- TypeScript: 0 ошибок (`npx tsc --noEmit`)
- Тесты reactor-core: 16 тестов PASS, 0 FAIL
  - actor-spacing: 3/3
  - desugarV3Graph: 1/1
  - applyGraphPatch: 3/3
  - diffGraphs: 1/1
  - summarizeGraphForAi: 1/1
  - layoutExpandedGraph: 1/1
  - mask infoblock style keys: 6/6
