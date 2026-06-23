import { eq } from "drizzle-orm";
import { db } from "./index.js";
import * as schema from "./schema.js";

async function getAdmin() {
  const login = process.env.ADMIN_LOGIN || "admin";
  const [user] = await db.select().from(schema.users).where(eq(schema.users.login, login)).limit(1);
  if (!user) return null;
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1);
  return { user, displayName: profile?.name || user.login };
}

async function upsertLeadByPhone(
  phone: string,
  data: Omit<typeof schema.leads.$inferInsert, "phone"> & { phone: string },
) {
  const [row] = await db.select().from(schema.leads).where(eq(schema.leads.phone, phone)).limit(1);
  if (row) {
    await db.update(schema.leads).set({
      name: data.name,
      comment: data.comment,
      statusId: data.statusId,
      pipelineId: data.pipelineId,
      channelId: data.channelId,
      region: data.region,
      custom: data.custom,
      assignedUserId: data.assignedUserId,
      assignedDealManagerId: data.assignedDealManagerId ?? null,
      updatedAt: new Date(),
    }).where(eq(schema.leads.id, row.id));
    return row.id;
  }
  const [inserted] = await db.insert(schema.leads).values(data).returning({ id: schema.leads.id });
  return inserted!.id;
}

async function ensureTask(
  text: string,
  data: Omit<typeof schema.tasks.$inferInsert, "text"> & { text: string },
) {
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.text, text)).limit(1);
  if (row) {
    await db.update(schema.tasks).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, row.id));
    return row.id;
  }
  await db.insert(schema.tasks).values(data);
}

/** Демо-набор для секвенсора: лиды (в т.ч. сделка), задачи, всё на admin. Идемпотентно. */
export async function ensureSequencerDemoEntities() {
  const admin = await getAdmin();
  if (!admin) {
    console.warn("Sequencer demo: admin user not found, skip");
    return;
  }

  const stages = await db.select().from(schema.stages).orderBy(schema.stages.sortOrder);
  if (!stages.length) return;

  const [pipeline] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.isDefault, true)).limit(1);
  if (!pipeline) return;

  const stageByLabel = (label: string) => stages.find((s: typeof schema.stages.$inferSelect) => s.label === label);
  const stageNew = stageByLabel("Новый лид") ?? stages[0]!;
  const stageDeal = stageByLabel("Сделка") ?? stageByLabel("В работе") ?? stages[stages.length - 2]!;
  const stageQualified = stageByLabel("Квалифицирован") ?? stages[2] ?? stages[0]!;

  const channels = await db.select().from(schema.channels).limit(1);
  const channelId = channels[0]?.id ?? null;

  const { user: adminUser, displayName: adminName } = admin;
  const assign = {
    assignedUserId: adminUser.id,
    assignedDealManagerId: null as string | null,
  };
  const taskAssign = {
    assignee: adminName,
    assigneeUserId: adminUser.id,
    creatorUserId: adminUser.id,
    author: adminName,
  };

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(18, 0, 0, 0);
  const todayEod = new Date(now);
  todayEod.setHours(17, 0, 0, 0);

  const leadNewId = await upsertLeadByPhone("+7 (916) 240-18-77", {
    name: "Артём Соколов",
    phone: "+7 (916) 240-18-77",
    email: "artem@demo.local",
    region: "Москва",
    comment: "Заявка с сайта · тариф «Бизнес»",
    source: "form",
    channelId,
    pipelineId: pipeline.id,
    statusId: stageNew.id,
    pdConsent: true,
    pdConsentAt: hoursAgo(0.1),
    createdAt: hoursAgo(0.07),
    ...assign,
  });

  const leadDealId = await upsertLeadByPhone("+7 (495) 800-12-34", {
    name: "Поставка оборудования",
    phone: "+7 (495) 800-12-34",
    region: "Москва",
    comment: "АО «Уралтех» · сделка ₽ 3 800 000",
    source: "manual",
    channelId,
    pipelineId: pipeline.id,
    statusId: stageDeal.id,
    custom: { f_budget: "3800000", f_object: "Оборудование" },
    pdConsent: true,
    pdConsentAt: hoursAgo(48),
    createdAt: hoursAgo(72),
    ...assign,
  });

  const leadDocId = await upsertLeadByPhone("+7 (495) 111-00-44", {
    name: "Акт сверки № 1184",
    phone: "+7 (495) 111-00-44",
    region: "Москва",
    comment: "Документ: акт сверки с ООО «Север-Логистик», сумма ₽ 1 240 000",
    source: "manual",
    channelId,
    pipelineId: pipeline.id,
    statusId: stageQualified.id,
    pdConsent: true,
    pdConsentAt: hoursAgo(24),
    createdAt: hoursAgo(30),
    ...assign,
  });

  await upsertLeadByPhone("+7 (905) 111-22-33", {
    name: "Иван Демо",
    phone: "+7 (905) 111-22-33",
    region: "Москва",
    comment: "Двушка, бюджет до 12 млн (демо-лид).",
    source: "form",
    channelId,
    pipelineId: pipeline.id,
    statusId: stageQualified.id,
    custom: { f_budget: "12000000", f_object: "Квартира 2к" },
    pdConsent: true,
    pdConsentAt: hoursAgo(5),
    ...assign,
  });

  await ensureTask("Подготовить КП", {
    text: "Подготовить КП",
    description: "Коммерческое предложение для сделки «Поставка оборудования»",
    leadId: leadDealId,
    status: "in_progress",
    priority: "high",
    dueAt: todayEod,
    checklist: [
      { id: crypto.randomUUID(), text: "Бриф от клиента", done: true },
      { id: crypto.randomUUID(), text: "Расчёт стоимости", done: true },
      { id: crypto.randomUUID(), text: "Описание этапов работ", done: true },
      { id: crypto.randomUUID(), text: "Оформление обложки", done: false },
      { id: crypto.randomUUID(), text: "Финальная вычитка", done: false },
    ],
    done: false,
    ...taskAssign,
  });

  await ensureTask("Акт сверки № 1184 — подписать", {
    text: "Акт сверки № 1184 — подписать",
    description: "Документ на согласование и подпись",
    leadId: leadDocId,
    status: "waiting",
    priority: "high",
    dueAt: yesterday,
    done: false,
    ...taskAssign,
  });

  await ensureTask("Приёмка товара на складе", {
    text: "Приёмка товара на складе",
    description: "Сфотографировать приёмку поставки от АО «Уралтех»",
    leadId: leadDealId,
    status: "in_progress",
    priority: "normal",
    dueAt: todayEod,
    done: false,
    ...taskAssign,
  });

  await ensureTask("Перезвонить Ивану Демо", {
    text: "Перезвонить Ивану Демо",
    description: "Связаться по заявке на двушку",
    leadId: leadNewId,
    status: "new",
    priority: "normal",
    dueAt: todayEod,
    done: false,
    ...taskAssign,
  });

  await ensureTask("Согласовать смету по сделке", {
    text: "Согласовать смету по сделке",
    description: "Сделка «Поставка оборудования» — отправить на согласование",
    leadId: leadDealId,
    status: "in_progress",
    priority: "high",
    dueAt: todayEod,
    done: false,
    ...taskAssign,
  });

  console.log(`Sequencer demo synced for admin (${adminUser.login}): leads + tasks`);
}
