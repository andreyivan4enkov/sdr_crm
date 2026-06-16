# Подключение Tilda (jbrealty.ru) к JBrealty CRM

Сайт [jbrealty.ru](https://jbrealty.ru/) на Tilda. Форма заявки содержит поля **Имя**, **Телефон**, **Дата** — в webhook Tilda они приходят как `Name`, `Phone`, `Date` ([документация Tilda](https://help.tilda.cc/forms/webhook)).

## 1. Включите интеграцию в CRM

1. Войдите как **администратор** или **интегратор**
2. **Настройки → Каналы и интеграции → Tilda**
3. Маппинг полей (формат `поле_tilda=поле_crm`):

```
Name=name
Phone=phone
Date=preferredTime
pd_consent=pdConsent
```

4. Нажмите **Включить**
5. Скопируйте **Webhook URL** и **Secret**

| Поле Tilda | Поле CRM | Куда попадает в карточке |
|------------|----------|--------------------------|
| `Name` | `name` | Имя клиента |
| `Phone` | `phone` | Телефон |
| `Date` | `preferredTime` | Удобная дата/время |
| `Email` | `email` | Email (если добавите в форму) |
| `Comments` | `comment` | Комментарий |
| `pd_consent` | `pdConsent` | Согласие на обработку ПДн |

Дополнительно CRM автоматически пишет в комментарий `formid` и `tranid` из Tilda (для отладки).

## 2. Согласие на обработку ПДн (152-ФЗ)

В форме Tilda добавьте **чекбокс** согласия со ссылкой на политику (`https://crm.jbrealty.ru/privacy` или страница на jbrealty.ru).

В настройках поля чекбокса укажите **имя переменной**: `pd_consent`.

CRM принимает значения: `yes`, `1`, `true`, `on`, `да`.

## 3. Настройте webhook в Tilda

1. [Tilda](https://tilda.cc) → ваш проект **jbrealty.ru**
2. **Настройки сайта** → **Формы** → **Webhook**
3. URL (Tilda не поддерживает произвольные заголовки — секрет в query):

```
https://crm.jbrealty.ru/api/webhooks/tilda?secret=ВАШ_СЕКРЕТ_ИЗ_CRM
```

Пока HTTPS на `crm.jbrealty.ru` не готов, временно:

```
http://161.104.16.243/api/webhooks/tilda?secret=ВАШ_СЕКРЕТ_ИЗ_CRM
```

4. Сохраните

> Webhook Tilda доступен на **платных** тарифах. См. [help.tilda.cc/forms/webhook](https://help.tilda.cc/forms/webhook).

## 4. Проверка

Тест с сервера (подставьте свой secret):

```bash
curl -X POST 'http://161.104.16.243/api/webhooks/tilda?secret=СЕКРЕТ' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'Name=Тест&Phone=%2B79001234567&Date=08-06-2026&formid=form123&tranid=999&pd_consent=yes'
```

В CRM должен появиться лид: источник `tilda`, канал **Tilda**, этап «Новая заявка».

## 5. Договор с Tilda

Заключите договор поручения на обработку ПДн (или убедитесь, что условия Tilda покрывают передачу в вашу CRM).
