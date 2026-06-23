import { eq } from "drizzle-orm";
import { emptySiteDocument, defaultBlock } from "@sdr-crm/site-core";
import { db } from "./index.js";
import * as schema from "./schema.js";
import { hashPassword } from "../lib/auth.js";
import { generateEmployeeAvatar } from "../lib/generate-avatar.js";

const demoPassword = process.env.DEMO_PASSWORD || "Operator1234";
const dealManagerPassword = process.env.DEAL_MANAGER_PASSWORD || "DealManager1234";

async function ensureOrgUnit(
  name: string,
  parentId: string | null,
  sortOrder: number,
  description?: string,
  defaultRoleId?: string | null,
) {
  const [existing] = await db.select().from(schema.orgUnits).where(eq(schema.orgUnits.name, name)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.orgUnits).values({
    name,
    parentId,
    sortOrder,
    description: description ?? null,
    defaultRoleId: defaultRoleId ?? null,
  }).returning();
  return row!;
}

async function ensureEmployee(opts: {
  login: string;
  email: string;
  name: string;
  phone: string;
  position: string;
  region: string;
  roleName: "deal_manager" | "operator" | "manager" | "marketer";
  orgUnitId: string | null;
  password?: string;
}) {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, opts.roleName)).limit(1);
  if (!role) return null;

  let [user] = await db.select().from(schema.users).where(eq(schema.users.login, opts.login)).limit(1);
  if (!user) {
    [user] = await db.insert(schema.users).values({
      login: opts.login,
      email: opts.email,
      passwordHash: await hashPassword(opts.password || demoPassword),
      status: "active",
      roleId: role.id,
    }).returning();
    await db.insert(schema.profiles).values({
      userId: user!.id,
      name: opts.name,
      phone: opts.phone,
      region: opts.region,
      position: opts.position,
      orgUnitId: opts.orgUnitId,
      avatar: generateEmployeeAvatar(opts.name),
    });
  } else {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1);
    await db.update(schema.profiles).set({
      name: opts.name,
      phone: opts.phone,
      region: opts.region,
      position: opts.position,
      orgUnitId: opts.orgUnitId,
      ...(profile?.avatar ? {} : { avatar: generateEmployeeAvatar(opts.name) }),
      updatedAt: new Date(),
    }).where(eq(schema.profiles.userId, user.id));
    if (user.roleId !== role.id) {
      await db.update(schema.users).set({ roleId: role.id, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    }
  }

  const [existingDealManager] = await db.select().from(schema.dealManagers).where(eq(schema.dealManagers.userId, user!.id)).limit(1);
  if (!existingDealManager) {
    await db.insert(schema.dealManagers).values({
      name: opts.name,
      region: opts.region,
      phone: opts.phone,
      userId: user!.id,
      orgUnitId: opts.orgUnitId,
      position: opts.position,
      roleId: role.id,
    });
  } else {
    await db.update(schema.dealManagers).set({
      name: opts.name,
      region: opts.region,
      phone: opts.phone,
      orgUnitId: opts.orgUnitId,
      position: opts.position,
      roleId: role.id,
    }).where(eq(schema.dealManagers.id, existingDealManager.id));
  }

  const [dealManager] = await db.select().from(schema.dealManagers).where(eq(schema.dealManagers.userId, user!.id)).limit(1);
  return { user: user!, dealManager: dealManager! };
}

async function upsertLeadByPhone(
  phone: string,
  data: typeof schema.leads.$inferInsert,
) {
  const [row] = await db.select().from(schema.leads).where(eq(schema.leads.phone, phone)).limit(1);
  if (row) {
    await db.update(schema.leads).set({ ...data, updatedAt: new Date() }).where(eq(schema.leads.id, row.id));
    return row.id;
  }
  const [inserted] = await db.insert(schema.leads).values(data).returning({ id: schema.leads.id });
  return inserted!.id;
}

async function ensureField(label: string, type: string, sortOrder: number) {
  const [existing] = await db.select().from(schema.fields).where(eq(schema.fields.label, label)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.fields).values({ label, type, sortOrder }).returning();
  return row!;
}

/** Расширенный демо-набор: подразделения, сотрудники, лиды, сайт. Идемпотентно. */
export async function ensureRichDemoContent() {
  const [dealManagerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "deal_manager")).limit(1);
  const dealManagerRoleId = dealManagerRole?.id ?? null;

  let [root] = await db.select().from(schema.orgUnits).where(eq(schema.orgUnits.name, "CRM Demo")).limit(1);
  if (!root) {
    [root] = await db.insert(schema.orgUnits).values({
      name: "CRM Demo",
      sortOrder: 0,
      description: "Демо-компания · универсальная CRM",
      defaultRoleId: dealManagerRoleId,
    }).returning();
  }

  const sales = await ensureOrgUnit("Отдел продаж", root!.id, 1, "Продажи и сделки", dealManagerRoleId);
  const ops = await ensureOrgUnit("Операторский центр", root!.id, 2, "Входящие заявки и квалификация");
  const marketing = await ensureOrgUnit("Маркетинг", root!.id, 3, "Реклама и лидогенерация");
  const legal = await ensureOrgUnit("Юридический отдел", root!.id, 4, "Договоры и согласования");
  await ensureOrgUnit("Финансовый отдел", root!.id, 5, "Согласование условий и оплат", dealManagerRoleId);

  const moscowTeam = await ensureOrgUnit("Менеджеры · Москва", sales.id, 1, "Офис Москва", dealManagerRoleId);
  const spbTeam = await ensureOrgUnit("Менеджеры · Санкт-Петербург", sales.id, 2, "Офис СПб", dealManagerRoleId);
  const outboundTeam = await ensureOrgUnit("Команда обзвона", ops.id, 1, "Обзвон и квалификация");
  const inbound = await ensureOrgUnit("КЦ входящих", ops.id, 2, "Приём звонков и чатов");

  const elena = await ensureEmployee({
    login: "elena.volkova",
    email: "elena@demo.local",
    name: "Елена Волкова",
    phone: "+7 (916) 555-01-01",
    position: "Старший менеджер по сделкам",
    region: "Москва",
    roleName: "deal_manager",
    orgUnitId: moscowTeam.id,
    password: dealManagerPassword,
  });
  const dmitry = await ensureEmployee({
    login: "dmitry.orlov",
    email: "dmitry@demo.local",
    name: "Дмитрий Орлов",
    phone: "+7 (812) 555-02-02",
    position: "Менеджер по сделкам",
    region: "Санкт-Петербург",
    roleName: "deal_manager",
    orgUnitId: spbTeam.id,
    password: dealManagerPassword,
  });
  const anna = await ensureEmployee({
    login: "anna.kuznetsova",
    email: "anna@demo.local",
    name: "Анна Кузнецова",
    phone: "+7 (903) 555-03-03",
    position: "Менеджер по сделкам",
    region: "Москва",
    roleName: "deal_manager",
    orgUnitId: moscowTeam.id,
    password: dealManagerPassword,
  });
  const [operatorUser] = await db.select().from(schema.users).where(eq(schema.users.login, "operator")).limit(1);
  if (operatorUser) {
    await db.update(schema.profiles).set({
      name: "Ольга Соколова",
      orgUnitId: outboundTeam.id,
      position: "Оператор",
      avatar: generateEmployeeAvatar("Ольга Соколова"),
      updatedAt: new Date(),
    }).where(eq(schema.profiles.userId, operatorUser.id));
  }
  const [managerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "manager")).limit(1);
  if (managerUser) {
    await db.update(schema.profiles).set({
      name: "Алексей Морозов",
      orgUnitId: sales.id,
      position: "Руководитель отдела продаж",
      avatar: generateEmployeeAvatar("Алексей Морозов"),
      updatedAt: new Date(),
    }).where(eq(schema.profiles.userId, managerUser.id));
  }
  const [marketerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "marketer")).limit(1);
  if (marketerUser) {
    await db.update(schema.profiles).set({
      name: "Марина Лебедева",
      orgUnitId: marketing.id,
      position: "Маркетолог",
      avatar: generateEmployeeAvatar("Марина Лебедева"),
      updatedAt: new Date(),
    }).where(eq(schema.profiles.userId, marketerUser.id));
  }

  const budgetField = await ensureField("Бюджет", "money", 0);
  const objectField = await ensureField("Тип объекта", "text", 1);
  await ensureField("Срочность", "text", 2);
  await ensureField("Источник обращения", "text", 3);

  const stages = await db.select().from(schema.stages).orderBy(schema.stages.sortOrder);
  const [pipeline] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.isDefault, true)).limit(1);
  if (!stages.length || !pipeline) {
    console.warn("Rich demo: нет воронки/этапов, пропуск лидов");
    return;
  }

  const stage = (label: string) => stages.find((s: typeof schema.stages.$inferSelect) => s.label === label) ?? stages[0]!;
  const channels = await db.select().from(schema.channels);
  const siteCh = channels.find((c: typeof schema.channels.$inferSelect) => c.name.includes("сайт")) ?? channels[0];
  const tildaCh = channels.find((c: typeof schema.channels.$inferSelect) => c.name === "Tilda") ?? siteCh;

  const custom = (budget: string, object: string, extra?: Record<string, string>) => ({
    [budgetField.id]: budget,
    [objectField.id]: object,
    ...extra,
  });

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const assign = (emp: typeof elena) => emp ? {
    assignedUserId: emp.user.id,
    assignedDealManagerId: emp.dealManager.id,
  } : {};

  const leadRows: (typeof schema.leads.$inferInsert)[] = [
    {
      name: "Мария Петрова", phone: "+7 (916) 100-11-22", email: "maria.p@demo.local",
      region: "Москва", comment: "Ищет 3к в Хорошёво-Мнёвниках, ипотека Сбер",
      source: "form", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Новый лид").id,
      ...assign(elena), custom: custom("18000000", "Квартира 3к"), pdConsent: true, pdConsentAt: hoursAgo(1),
    },
    {
      name: "Сергей Никифоров", phone: "+7 (903) 200-22-33", email: "sergey.n@demo.local",
      region: "Москва", comment: "Продажа 2к на Арбате, срочно",
      source: "form", channelId: tildaCh?.id, pipelineId: pipeline.id, statusId: stage("Связались").id,
      ...assign(anna), custom: custom("25000000", "Квартира 2к", { [objectField.id]: "Продажа" }), pdConsent: true, pdConsentAt: hoursAgo(4),
    },
    {
      name: "Ольга Смирнова", phone: "+7 (812) 300-33-44", email: "olga.s@demo.local",
      region: "Санкт-Петербург", comment: "Новостройка у метро Девяткино",
      source: "form", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Квалифицирован").id,
      ...assign(dmitry), custom: custom("9500000", "Квартира 1к"), pdConsent: true, pdConsentAt: hoursAgo(8),
    },
    {
      name: "Алексей Громов", phone: "+7 (916) 400-44-55", email: "alex.g@demo.local",
      region: "Москва", comment: "Коммерция 120 м², БЦ «Сити»",
      source: "manual", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Назначен менеджеру").id,
      ...assign(elena), custom: custom("45000000", "Коммерция"), pdConsent: true, pdConsentAt: hoursAgo(12),
    },
    {
      name: "Татьяна Белова", phone: "+7 (495) 500-55-66", email: "t.belova@demo.local",
      region: "Москва", comment: "Загородный дом, Рублёво-Успенское",
      source: "form", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("В работе").id,
      ...assign(anna), custom: custom("85000000", "Дом"), pdConsent: true, pdConsentAt: hoursAgo(20),
    },
    {
      name: "ИП Козлов", phone: "+7 (812) 600-66-77", email: "kozlov@demo.local",
      region: "Санкт-Петербург", comment: "Офис 200 м², аренда с выкупом",
      source: "manual", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("В работе").id,
      ...assign(dmitry), custom: custom("120000000", "Коммерция"), pdConsent: true, pdConsentAt: hoursAgo(30),
    },
    {
      name: "Екатерина Романова", phone: "+7 (916) 700-77-88", email: "e.romanova@demo.local",
      region: "Москва", comment: "Студия для дочери-студентки",
      source: "form", channelId: tildaCh?.id, pipelineId: pipeline.id, statusId: stage("Сделка").id,
      ...assign(elena), custom: custom("7200000", "Студия"), pdConsent: true, pdConsentAt: hoursAgo(48),
    },
    {
      name: "Виктор Медведев", phone: "+7 (903) 800-88-99", email: "v.medvedev@demo.local",
      region: "Москва", comment: "Отказ — нашёл вариант у конкурента",
      source: "form", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Отказ").id,
      ...assign(anna), custom: custom("11000000", "Квартира 2к"), pdConsent: true, pdConsentAt: hoursAgo(72),
    },
    {
      name: "Наталья Фёдорова", phone: "+7 (812) 900-99-00", email: "n.fedorova@demo.local",
      region: "Санкт-Петербург", comment: "Обмен 2к на 3к, доплата до 5 млн",
      source: "form", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Связались").id,
      ...assign(dmitry), custom: custom("5000000", "Обмен"), pdConsent: true, pdConsentAt: hoursAgo(2),
    },
    {
      name: "Павел Зайцев", phone: "+7 (916) 110-00-11", email: "p.zaitsev@demo.local",
      region: "Москва", comment: "Инвестиция: 2 студии под сдачу",
      source: "manual", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Квалифицирован").id,
      ...assign(elena), custom: custom("14000000", "Студия"), pdConsent: true, pdConsentAt: hoursAgo(6),
    },
    {
      name: "Юлия Кравцова", phone: "+7 (903) 220-11-22", email: "y.kravtsova@demo.local",
      region: "Москва", preferredTime: "Будни после 19:00",
      comment: "Первичка, семейная ипотека",
      source: "form", channelId: tildaCh?.id, pipelineId: pipeline.id, statusId: stage("Новый лид").id,
      assignedUserId: operatorUser?.id ?? null,
      assignedDealManagerId: null,
      custom: custom("15000000", "Квартира 2к"), pdConsent: true, pdConsentAt: hoursAgo(0.5),
    },
    {
      name: "Андрей Чистяков", phone: "+7 (495) 330-22-33", email: "a.chistyakov@demo.local",
      region: "Москва", comment: "Пентхаус, вид на Москву-реку",
      source: "manual", channelId: siteCh?.id, pipelineId: pipeline.id, statusId: stage("Назначен менеджеру").id,
      ...assign(elena), custom: custom("220000000", "Пентхаус"), pdConsent: true, pdConsentAt: hoursAgo(16),
    },
  ];

  for (const row of leadRows) {
    if (!row.phone) continue;
    await upsertLeadByPhone(row.phone, row);
  }

  const [siteExists] = await db.select().from(schema.siteSpaces).limit(1);
  if (!siteExists) {
    const doc = emptySiteDocument();
    doc.pages[0]!.title = "Лендинг агентства";
    doc.theme = { fontFamily: "Inter, sans-serif", accent: "#0d9488", text: "#0f172a", background: "#ffffff" };
    const hero = defaultBlock("hero", "b-hero", 40, 40);
    const text = defaultBlock("text", "b-text", 40, 340);
    const cta = defaultBlock("cta", "b-cta", 40, 520);
    const form = defaultBlock("form", "b-form", 40, 640);
    doc.blocks = [hero, text, cta, form];
    await db.insert(schema.siteSpaces).values({
      name: "Демо-лендинг агентства",
      slug: "demo-agency",
      description: "Пример страницы Реактора сайтов",
      document: doc,
      published: false,
      enabled: true,
    });
  }

  const notes = [
    { phone: "+7 (916) 100-11-22", text: "📞 Первый контакт: интерес к ипотеке 12 млн, отправили чек-лист" },
    { phone: "+7 (903) 200-22-33", text: "⚡ Срочная продажа — назначен выезд оценщика на пятницу" },
    { phone: "+7 (812) 300-33-44", text: "✅ Квалифицирован: бюджет подтверждён, готов к показам" },
  ];
  for (const n of notes) {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.phone, n.phone)).limit(1);
    if (!lead) continue;
    const [note] = await db.select().from(schema.leadNotes).where(eq(schema.leadNotes.leadId, lead.id)).limit(1);
    if (!note) {
      await db.insert(schema.leadNotes).values({ leadId: lead.id, text: n.text, author: "Демо" });
    }
  }

  console.log(
    `Rich demo: подразделений ${await db.select().from(schema.orgUnits).then((r: typeof schema.orgUnits.$inferSelect[]) => r.length)}, `
    + `менеджеров по сделкам 3+, лидов ${await db.select().from(schema.leads).then((r: typeof schema.leads.$inferSelect[]) => r.length)}`,
  );
}
