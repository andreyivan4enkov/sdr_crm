# Безопасность SDR CRM

## Поддерживаемые версии

| Версия | Поддержка        |
|--------|------------------|
| 1.x    | Актуальная ветка |

## Сообщить об уязвимости

**Не создавайте публичный issue** с описанием уязвимости.

Сообщите privately владельцу репозитория. Укажите описание, шаги воспроизведения, версию/коммит и возможное влияние.

## Реализованные меры

### Аутентификация и доступ
- JWT в httpOnly cookie (не localStorage)
- bcrypt для паролей, минимум 8 символов + буквы и цифры
- Регистрация только по invite-ссылке от администратора
- RBAC: роли `admin`, `integrator`, `operator`, `realtor` с гранулярными правами
- Rate limit на login, регистрацию, публичные заявки и webhooks

### Персональные данные (152-ФЗ)
- Явное согласие (`pdConsent`) на форме лендинга
- Политика конфиденциальности: `/privacy` (API: `GET /api/public/privacy`)
- Обезличивание лида: `POST /api/leads/:id/erase` (право `leads.erase`)
- Экспорт ПДн субъекта: `GET /api/leads/:id/export` (право `leads.export`)
- Отзыв согласия: `POST /api/leads/:id/revoke-consent`, публично `POST /api/public/revoke`
- Авто-обезличивание по сроку: `PD_RETENTION_DAYS` + `npm run job:retention`
- 2FA (TOTP) для admin/integrator
- Журнал аудита действий: `GET /api/admin/audit` (право `audit.view`)

### Индексация и публичная видимость
- `robots.txt` — `Disallow: /` для всего CRM
- `<meta name="robots" content="noindex, nofollow">` в `index.html`
- Заголовок `X-Robots-Tag` на статике (Caddy) и API
- CRM не предназначена для поисковиков; публичные формы — только API лендинга (`/api/public/leads`)

### Защита от атак и спама
- Глобальный rate limit API в production (`API_RATE_LIMIT_PER_MIN`, по умолчанию 400/мин на IP)
- Лимит размера тела запроса (`MAX_BODY_BYTES`, по умолчанию 1 МБ)
- Honeypot-поле `website` на публичной форме заявок
- Обязательный webhook secret для телефонии в production
- Валидация аватаров: только `data:image/*`, макс. 500 КБ
- Security headers: CSP, X-Frame-Options DENY, HSTS, Permissions-Policy

### Инфраструктура
- HTTPS через Caddy (продакшен)
- Secure headers (Hono `secure-headers`)
- Структурированное JSON-логирование (`LOG_LEVEL`, `LOG_FILE`), `X-Request-Id` на каждом запросе
- Обработка `uncaughtException` / `unhandledRejection`
- PostgreSQL: ежедневный бэкап с checksum, manifest, verify и restore (`deploy/scripts/`)

## Продакшен (Reg.ru VPS)

Обязательно в `.env`:

```env
NODE_ENV=production
JWT_SECRET=<случайная строка ≥32 символов>
ADMIN_PASSWORD=<сильный пароль>
ALLOW_DEMO_LOGIN=0
API_RATE_LIMIT_PER_MIN=400
CORS_ORIGIN=https://crm.ваш-домен.ru
PD_OPERATOR_EMAIL=privacy@example.ru
DATABASE_URL=postgresql://...
LOG_LEVEL=info
LOG_FILE=/var/log/sdr-crm/api.log
```

Демо-логины (`operator`/`admin`) **не создаются** в production seed.

## Организационные меры (вне кода)

Для соответствия 152-ФЗ оператору ПДн также нужны:
- приказ о назначении ответственного за ПДн;
- утверждённая политика (текст в `server/src/data/privacy-policy.ts` — адаптировать под юрлицо);
- договоры/согласия с сотрудниками, имеющими доступ к CRM;
- регламент реагирования на инциденты и сроки хранения данных.

## Сроки ответа

Ответ на сообщение об уязвимости — в течение 7 рабочих дней.
