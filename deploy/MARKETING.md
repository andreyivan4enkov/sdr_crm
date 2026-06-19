# Маркетинг: роль и интеграции

## Роль «Маркетолог»

Права: лиды (чтение/запись), аналитика, каналы, `marketing.manage`, настройки, команда (чтение).

Демо-логин (только dev): `marketer` / `Marketer1234` (или `MARKETER_PASSWORD`).

## Интеграции

| Источник | Webhook | Настройка в CRM |
|----------|---------|-----------------|
| ВКонтакте | `POST /api/webhooks/marketing/vk?secret=…` | Настройки → Каналы → Рекламные интеграции |
| Яндекс Директ | `POST /api/webhooks/marketing/yandex_direct?secret=…` | то же |
| Авито | `POST /api/webhooks/marketing/avito?secret=…` | то же |
| Яндекс Метрика | без webhook (счётчик ID) | то же |

Секрет генерируется при сохранении интеграции. Включите интеграцию после настройки.

## Миграция

```bash
cd server && npm run db:migrate
```

Файл: `server/drizzle/0008_marketer_role.sql` — роль marketer, записи интеграций, канал «Яндекс Метрика».

На проде при ошибках прав: `GRANT ALL ON integrations TO crm;` (и связанные таблицы при необходимости).

## Деплой

```bash
npm run build
cd server && npm run build
# скопировать dist/ и server/dist/, перезапустить sdr-crm-api
```
