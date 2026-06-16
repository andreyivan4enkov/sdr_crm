# Деплой JBrealty CRM на Reg.ru VPS

## Что нужно заказать на Reg.ru

**VPS** (не виртуальный хостинг PHP) — минимум:
- 1 vCPU, 1–2 GB RAM, 10–20 GB SSD
- Ubuntu 22.04 или 24.04
- Домен, привязанный к VPS (A-запись на IP сервера)

---

## 1. Подключение по SSH

В панели Reg.ru → VPS → скопируйте IP и root-пароль (или добавьте SSH-ключ).

```bash
ssh root@ВАШ_IP
```

---

## 2. Установка зависимостей на сервере

```bash
apt update && apt upgrade -y
apt install -y curl git postgresql postgresql-contrib util-linux fail2ban ufw

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Caddy (HTTPS + прокси)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

---

## 3. PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER jbrealty WITH PASSWORD 'НАДЁЖНЫЙ_ПАРОЛЬ';
CREATE DATABASE jbrealty OWNER jbrealty;
SQL
```

---

## 4. Код проекта

```bash
mkdir -p /var/www/jbrealty
cd /var/www/jbrealty

# Вариант A: git clone (если репозиторий публичный или настроен deploy key)
git clone https://gitverse.ru/Corpuscul/JBrealty-CRM.git .

# Вариант B: загрузить с компьютера
# scp -r ./JBrealty-CRM/* root@ВАШ_IP:/var/www/jbrealty/
```

---

## 5. Настройка `.env` (продакшен)

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Пример для VPS:

```env
# Без PGlite — только PostgreSQL
DATABASE_URL=postgresql://jbrealty:НАДЁЖНЫЙ_ПАРОЛЬ@localhost:5432/jbrealty

JWT_SECRET=случайная-строка-минимум-32-символа

ADMIN_EMAIL=admin@ваш-домен.ru
ADMIN_LOGIN=admin
ADMIN_PASSWORD=смените-на-сильный-пароль
ADMIN_NAME=Администратор

PD_OPERATOR_NAME=ООО «Ваша компания»
PD_OPERATOR_EMAIL=privacy@ваш-домен.ru

PORT=3000
NODE_ENV=production
ALLOW_DEMO_LOGIN=0
CORS_ORIGIN=https://crm.ваш-домен.ru
PUBLIC_URL=https://crm.ваш-домен.ru
LOG_LEVEL=info
LOG_FILE=/var/log/jbrealty/api.log
PD_RETENTION_DAYS=1095
```

Скопируйте env для API:

```bash
cp deploy/.env server/.env
```

Уберите или закомментируйте `USE_PGLITE` в `server/.env`.

---

## 6. Права и сборка

```bash
cd /var/www/jbrealty
chown -R www-data:www-data /var/www/jbrealty
bash deploy/scripts/deploy.sh
```

Или вручную: `npm ci && npm run build:api && npm run db:migrate && npm run db:seed && npm run build`

При первом деплое от root `deploy.sh` вызовет `install-ops.sh` (бэкапы, logrotate).

---

## 7. Systemd (автозапуск API)

```bash
cp deploy/jbrealty-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable jbrealty-api
systemctl start jbrealty-api
systemctl status jbrealty-api
```

---

## 8. Caddy (HTTPS + статика + API)

В `deploy/Caddyfile` замените `YOUR_DOMAIN` на `crm.ваш-домен.ru`.

```bash
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy сам получит Let's Encrypt сертификат, если домен указывает на IP сервера.

---

## 9. Проверка

- `https://crm.ваш-домен.ru` — лендинг
- `https://crm.ваш-домен.ru/api/health` — `{"ok":true}`
- Вход: `admin` / пароль из `ADMIN_PASSWORD`

---

## Обновление после изменений в коде

```bash
cd /var/www/jbrealty
git pull          # или загрузить файлы заново
bash deploy/scripts/deploy.sh
```

---

## Tilda и телефония

- Tilda: [deploy/TILDA.md](TILDA.md)
- Webhook Tilda: `https://crm.ваш-домен.ru/api/webhooks/tilda`
- Телефония: `https://crm.ваш-домен.ru/api/webhooks/telephony/generic`

---

## Логирование и мониторинг

API пишет **структурированные JSON-логи** (уровни `debug` / `info` / `warn` / `error`).

```bash
# Установка logrotate + systemd timer бэкапов
sudo bash /var/www/jbrealty/deploy/scripts/install-ops.sh

# Просмотр логов API
journalctl -u jbrealty-api -f
tail -f /var/log/jbrealty/api.log

# Ошибки за последний час
journalctl -u jbrealty-api --since "1 hour ago" -p err
```

В `.env` сервера:

```env
LOG_LEVEL=info
LOG_FILE=/var/log/jbrealty/api.log
```

Каждый ответ API содержит заголовок `X-Request-Id` — используйте его при разборе инцидентов.

---

## Резервное копирование PostgreSQL

Автоматически (рекомендуется):

```bash
sudo bash /var/www/jbrealty/deploy/scripts/install-ops.sh
# Таймер: ежедневно 03:00, после бэкапа — проверка целостности
systemctl list-timers jbrealty-backup.timer
```

Вручную:

```bash
sudo /var/www/jbrealty/deploy/scripts/backup-db.sh
sudo /var/www/jbrealty/deploy/scripts/backup-verify.sh latest
```

Восстановление:

```bash
sudo /var/www/jbrealty/deploy/scripts/restore-db.sh /var/backups/jbrealty/jbrealty_YYYYMMDD_HHMMSS.sql.gz
```

Что делает бэкап:
- блокировка `flock` (без параллельных запусков)
- `pg_dump` → gzip, проверка архива
- SHA-256 checksum (`.sha256`)
- манифест `latest.json` + `.meta.json`
- ротация старше 14 дней (`RETENTION_DAYS`)

Переменные: `BACKUP_DIR`, `RETENTION_DAYS`, `ENV_FILE`, `BACKUP_LOG_FILE`.

---

## Усиление VPS (опционально)

```bash
sudo bash /var/www/jbrealty/deploy/scripts/harden-vps.sh
```

Открыты порты: 22, 80, 443. Включены ufw и fail2ban для sshd.

---

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| 502 Bad Gateway | `systemctl status jbrealty-api`, проверить `server/.env` |
| CORS / не входит | `CORS_ORIGIN` = точный URL с `https://` |
| 500 при логине | `npm run db:migrate && npm run db:seed`, проверить PostgreSQL |
| PGlite на сервере | Удалите `USE_PGLITE` из `.env`, используйте PostgreSQL |
