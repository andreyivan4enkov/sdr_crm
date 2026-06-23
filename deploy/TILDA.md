# Подключение Tilda (example.com) к CRM

Сайт на Tilda. Форма заявки: **Имя**, **Телефон**, **Дата** — в webhook приходят как `Name`, `Phone`, `Date` ([документация Tilda](https://help.tilda.cc/forms/webhook)).

## 1. Включите интеграцию в CRM

1. Войдите как **администратор** или **интегратор**
2. **Настройки → Каналы и интеграции → Tilda**
3. Маппинг полей (`поле_tilda=поле_crm`):

```
Name=name
Phone=phone
Date=preferredTime
pd_consent=pdConsent
```

4. **Включить** → скопируйте **Webhook URL** и **Secret**

| Поле Tilda | Поле CRM | Карточка |
|------------|----------|----------|
| `Name` | `name` | Имя |
| `Phone` | `phone` | Телефон |
| `Date` | `preferredTime` | Дата/время |
| `pd_consent` | `pdConsent` | Согласие ПДн |

## 2. Согласие ПДн (152-ФЗ)

Чекбокс в форме Tilda, переменная `pd_consent`. CRM принимает: `yes`, `1`, `true`, `on`, `да`.

## 3. Webhook в Tilda

Tilda **не поддерживает произвольные HTTP-заголовки** — секрет передаётся в query:

```
https://crm.example.com/api/webhooks/tilda?secret=ВАШ_СЕКРЕТ_ИЗ_CRM
```

> Webhook Tilda — на **платных** тарифах.

## 4. Проверка (curl)

Ручной тест с заголовком (рекомендуется для отладки):

```bash
curl -X POST 'https://crm.example.com/api/webhooks/tilda' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'X-Webhook-Secret: СЕКРЕТ' \
  -d 'Name=Тест&Phone=%2B79001234567&Date=08-06-2026&formid=form123&tranid=999&pd_consent=yes'
```

Эмуляция Tilda (секрет в URL, без HMAC):

```bash
curl -X POST 'https://crm.example.com/api/webhooks/tilda?secret=СЕКРЕТ' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'Name=Тест&Phone=%2B79001234567&Date=08-06-2026&formid=form123&tranid=999&pd_consent=yes'
```

## 5. Договор с Tilda

Договор поручения на обработку ПДн или условия Tilda, покрывающие передачу в CRM.
