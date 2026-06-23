# CRM API — команда и лиды (deal_manager)

> Agent doc id: `crm-team-api` | Версия: v3.3.1

## Переименование (v3.3.1)

| Было | Стало |
|------|-------|
| роль `realtor` | `deal_manager` (UI: «Менеджер по сделкам») |
| таблица `realtors` | `deal_managers` |
| `assignedRealtorId` | `assignedDealManagerId` |
| `GET /api/team` → `realtors[]` | `dealManagers[]` |
| `POST /api/team` → `{ realtor }` | `{ dealManager }` |
| `isRealtor` в профиле/invite | `isDealManager` |

**Обратная совместимость (deprecated):** сервер принимает `assignedRealtorId` в теле лида; в ответах дублирует `realtors`, `assignedRealtorId`, `isRealtor`, `realtor` там, где раньше были эти поля.

Миграция БД: `server/drizzle/0035_rename_realtor_to_deal_manager.sql`.

## Команда (`/api/team`)

Требует auth + `team.read` (или `team.manage` / `leads.read` для GET).

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/team` | `TeamPayload`: orgUnits, **dealManagers**, roles, employees |
| POST | `/api/team` | Создать сотрудника → `{ dealManager }` |
| PATCH | `/api/team/:id` | Обновить → `{ dealManager }` |
| DELETE | `/api/team/:id` | Удалить сотрудника |

### DealManager

```json
{
  "id": "uuid",
  "name": "Елена Волкова",
  "region": "Москва",
  "phone": "+7 …",
  "userId": "uuid",
  "orgUnitId": "uuid",
  "position": "Менеджер по сделкам",
  "roleId": "uuid",
  "roleName": "Менеджер по сделкам",
  "orgUnitName": "Отдел продаж",
  "userLogin": "elena.volkova"
}
```

## Лиды — назначение ответственного

| Поле | Тип | Описание |
|------|-----|----------|
| `assignedUserId` | uuid \| null | Пользователь CRM (приоритет для RBAC) |
| `assignedDealManagerId` | uuid \| null | Запись в `deal_managers` (связана с userId) |

При `PATCH` с `assignedUserId` или `assignedDealManagerId` сервер синхронизирует оба поля через `resolveAssigneeFromUser` / `resolveAssigneeFromDealManager`.

## Auth / профиль

| Endpoint | Поле |
|----------|------|
| `GET /api/auth/invite/verify` | `isDealManager: boolean` |
| `GET /api/auth/profile` | `account.isDealManager` |

Роль `deal_manager` требует `region` при регистрации и в профиле.

## api-client (`@sdr-crm/api-client`)

```ts
api.getTeam()           // TeamPayload.dealManagers
api.createDealManager() // { dealManager }
api.updateDealManager()
api.deleteDealManager()

// deprecated aliases:
api.createRealtor()     // → createDealManager, ответ { realtor }
api.updateRealtor()
api.deleteRealtor()
// типы: Realtor = DealManager; TeamPayload.realtors; Lead.assignedRealtorId
```

## Демо

| Роль | Логин | Пароль (dev) |
|------|-------|--------------|
| Менеджер по сделкам | `elena.volkova` | `DealManager1234` (env `DEAL_MANAGER_PASSWORD`) |

Связанные docIds: `crm-frontend-structure`, `agent-schema`, `lead-search-analytics`.