# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [3.3.1] - 2026-06-23

### Изменено

- Универсальное позиционирование CRM (без отраслевой привязки к недвижимости)
- Переименование `realtor` → `deal_manager`: таблица `deal_managers`, поля `assignedDealManagerId`, `isDealManager`, роль `deal_manager` (UI: «Менеджер по сделкам»)
- Миграция: `server/drizzle/0035_rename_realtor_to_deal_manager.sql`
- Демо-аккаунт: `elena.volkova` / `DealManager1234` (`DEAL_MANAGER_PASSWORD`)

### Добавлено

- Обратная совместимость API: `server/src/lib/api-legacy-fields.ts` — принимает `assignedRealtorId`, дублирует `realtors`, `isRealtor`, `realtor` в ответах
- Документация API: `ai_docs/crm-team-api.md`
- Deprecated aliases в `@sdr-crm/api-client`: `createRealtor`, `Realtor`, `assignedRealtorId`

## [3.2.0] - 2026-06-22

### Добавлено

- **Реактор v3.2** — три режима редактора продукта: Реактор (flow), Данные (data), Маска (живой UX)
- **Режим Маска** — выбор элементов UI (`data-mask-id`), панель ручного дизайна (цвета, формы, типографика)
- **mask-styles-root** — нода view-графа для хранения CSS-стилей элементов маски
- **BI-агрегация** — полноценный модуль Reactor (preset `aggregation`) вместо заглушки
- **AI Compose + graphKind** — `graphKind: "view"` для правок маски без перезаписи flow/data
- JIT-документация `ai_docs/reactor-mask-design.md`

### Изменено

- `compose` API: при `graphKind` apply записывает только указанный граф
- AI compose сохраняет `mask-styles-root` при редактировании view (`preserveMaskStylesNode`)
- Пресеты Reactor синхронизируются при каждом старте API
- Версия monorepo: `3.2.0`; релизный снимок: `Для релиза/v3.2.0/`

### Исправлено

- Режим «Данные»: видимость акторов и связей при переключении режимов
- Dev workflow: `npm run dev:all` только из корня репозитория (pack → release)

## [1.0.0] - 2026-06-20

### Добавлено

- Monorepo CRM: React/Vite SPA, Hono API, PostgreSQL/PGlite, Drizzle ORM
- Модули: Blueprint Reactor, Site Reactor, AIboard, EDO (Астрал), универсальные коннекторы
- i18n (`ru`, `en`, `zh`, `fr`, `de`) через `@sdr-crm/i18n`
- JWT + RBAC, 2FA, audit log, GDPR (отзыв/экспорт/обезличивание)
- Webhook HMAC, Cloudflare Turnstile, Redis rate limit
- Agent API (`/api/agent/*`) и JIT-документация `ai_docs/`
- Docker/Caddy deploy, CI (`npm test`, `build:all`)

### Исправлено

- Blueprint wait-нода: парсинг `2d`/`2д`, паузы >1 мин → WAITING + cron resume
- Blueprint branch: статический `walkExec` обходит обе ветки
- JS-ноды blueprint: только `isolated-vm` (без небезопасного vm fallback)
- Seed: запрет дефолтных паролей при `SEED_DEMO_USERS=1`
- Tilda webhook: `?secret=` + опциональный HMAC для платформы без заголовков

### Безопасность

- `JWT_SECRET` ≥32 символов обязателен в production (fail-fast в `env.ts`)
- PostgreSQL в docker-compose привязан к `127.0.0.1:5432`
