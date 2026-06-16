# JBrealty CRM

Персональная CRM для риэлторского агентства: лендинг, воронка лидов, канбан, задачи, RBAC, интеграции (Tilda, телефония).

## Стек

- **Frontend:** React 19, Vite 6, Tailwind CSS 4, React Router
- **Backend:** Hono, Drizzle ORM, PostgreSQL (prod) / PGlite (local dev)
- **Deploy:** Caddy, systemd, Reg.ru VPS — см. [deploy/REGRU.md](deploy/REGRU.md)

## Быстрый старт (разработка)

Требуется Node.js 20+.

```bash
git clone https://gitverse.ru/Corpuscul/JBrealty-CRM.git
cd JBrealty-CRM
cp deploy/.env.example server/.env
npm install
npm run db:migrate && npm run db:seed
npm run dev:all
```

- Frontend: http://localhost:5173  
- API health: http://localhost:3000/api/health

### Демо-логины

После `npm run db:seed` доступны тестовые аккаунты (без реальных данных):

| Роль | Логин | Пароль |
|------|-------|--------|
| Администратор | `admin` | `Admin1234` |
| Руководитель | `manager` | `Operator1234` |
| Оператор | `operator` | `Operator1234` |
| Интегратор | `integrator` | `Integrator1234` |
| Маркетолог | `marketer` | `Marketer1234` |

На экране входа есть кнопки быстрого входа (`ALLOW_DEMO_LOGIN=1` в `.env`).

Для production задайте `ALLOW_DEMO_LOGIN=0` и `SEED_DEMO_USERS=0`, смените пароли.

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev:all` | API + Vite |
| `npm run build:all` | Сборка API и frontend |
| `npm run db:migrate` | Миграции БД |
| `npm run db:seed` | Начальные данные |
| `npm run db:backup` | Бэкап PGlite (local) |
| `npm run db:backup:prod` | Бэкап PostgreSQL (VPS) |
| `npm run ops:install` | logrotate + backup timer (root) |

## Деплой production

```bash
bash deploy/scripts/deploy.sh
```

Полная инструкция: [deploy/REGRU.md](deploy/REGRU.md)

## Структура

```
├── server/           # Hono API, Drizzle, миграции
├── src/              # React SPA
├── deploy/           # Caddy, systemd, скрипты бэкапа
├── dist/             # Сборка frontend (после npm run build)
└── deploy/REGRU.md   # Деплой на Reg.ru VPS
```

## Безопасность и 152-ФЗ

- [SECURITY.md](SECURITY.md) — меры защиты, политика уязвимостей
- Согласие ПДн на лендинге, политика `/privacy`, обезличивание, журнал аудита
- Организационные документы (уведомление РКН, приказы) — ответственность оператора

## Лицензия

[MIT](LICENSE) © Corpuscul
