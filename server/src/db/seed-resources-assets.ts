import { eq, and, sql } from "drizzle-orm";
import { db } from "./index.js";
import * as schema from "./schema.js";
import { createDocument } from "../lib/edo/service.js";

const DEMO_GROUP_PRODUCTS = "Демо · Товары";
const DEMO_GROUP_SERVICES = "Демо · Услуги";
const DEMO_ASSETS_MARKER = "Демо · Офис и мебель";

function lineAmount(qty: number, unitPrice: number, discountPct = 0): number {
  return Math.round(qty * unitPrice * (1 - discountPct / 100) * 100) / 100;
}

async function leadByPhone(phone: string) {
  const [row] = await db.select().from(schema.leads).where(eq(schema.leads.phone, phone)).limit(1);
  return row ?? null;
}

async function ensureLegalEntity(data: {
  inn: string; fullName: string; shortName?: string; entityType?: "ul" | "ip";
  directorName?: string;
}) {
  const [existing] = await db.select().from(schema.legalEntities).where(eq(schema.legalEntities.inn, data.inn)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.legalEntities).values({
    inn: data.inn,
    fullName: data.fullName,
    shortName: data.shortName || null,
    entityType: data.entityType || "ul",
    directorName: data.directorName || null,
    status: "active",
    fnsData: {},
  }).returning();
  return row!;
}

type ResDef = {
  sku: string;
  name: string;
  type: "product" | "service" | "bundle";
  unit: string;
  price: number;
  groupName: typeof DEMO_GROUP_PRODUCTS | typeof DEMO_GROUP_SERVICES;
  track?: boolean;
  stock?: number;
  description?: string;
};

const DEMO_CATALOG: ResDef[] = [
  // ——— Товары ———
  { sku: "PRD-001", name: "Пакет документов для сделки", type: "product", unit: "компл.", price: 8_500, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 120, description: "Комплект бланков для оформления сделки" },
  { sku: "PRD-002", name: "Брошюра «Каталог объектов»", type: "product", unit: "шт.", price: 350, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 500 },
  { sku: "PRD-003", name: "USB-накопитель с материалами", type: "product", unit: "шт.", price: 1_200, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 80 },
  { sku: "PRD-004", name: "Планировка объекта (печать A1)", type: "product", unit: "шт.", price: 2_500, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 200 },
  { sku: "PRD-005", name: "Ключница с логотипом агентства", type: "product", unit: "шт.", price: 890, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 150 },
  { sku: "PRD-006", name: "Папка-клипборд премиум", type: "product", unit: "шт.", price: 450, groupName: DEMO_GROUP_PRODUCTS, track: true, stock: 300 },
  // ——— Услуги ———
  { sku: "SRV-001", name: "Подбор объекта", type: "service", unit: "усл.", price: 50_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-002", name: "Сопровождение сделки", type: "service", unit: "усл.", price: 150_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-003", name: "Ипотечное консультирование", type: "service", unit: "час", price: 5_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-004", name: "Экскурсия по объекту", type: "service", unit: "усл.", price: 8_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-005", name: "Подготовка к показу", type: "service", unit: "усл.", price: 15_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-C01", name: "Комиссия: аренда офиса", type: "service", unit: "усл.", price: 350_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-C02", name: "Комиссия: продажа коммерции", type: "service", unit: "усл.", price: 450_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-L01", name: "Юридическое сопровождение", type: "service", unit: "усл.", price: 45_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "SRV-L02", name: "Оценка объекта", type: "service", unit: "усл.", price: 12_000, groupName: DEMO_GROUP_SERVICES },
  { sku: "BND-01", name: "Пакет «Под ключ»", type: "bundle", unit: "компл.", price: 199_000, groupName: DEMO_GROUP_SERVICES, description: "Подбор + сопровождение + юр. сопровождение" },
];

async function ensureResourceGroup(
  name: string,
  description: string,
  sortOrder: number,
  pipelineIds: string[],
  roleAccess: { role: string; view: boolean; manage: boolean }[],
  roleId: (name: string) => string | undefined,
) {
  const [existing] = await db.select().from(schema.resourceGroups).where(eq(schema.resourceGroups.name, name)).limit(1);
  const group = existing ?? (await db.insert(schema.resourceGroups).values({ name, description, sortOrder }).returning())[0]!;

  for (const pid of pipelineIds) {
    await db.insert(schema.resourceGroupPipelines).values({ groupId: group.id, pipelineId: pid }).onConflictDoNothing();
  }
  for (const ra of roleAccess) {
    const rid = roleId(ra.role);
    if (!rid) continue;
    await db.insert(schema.resourceGroupRoleAccess).values({
      groupId: group.id,
      roleId: rid,
      canView: ra.view,
      canManage: ra.manage,
    }).onConflictDoNothing();
  }
  return group;
}

async function ensureResourceBySku(
  def: ResDef,
  groupId: string,
  createdBy: string | null,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db.select().from(schema.resources).where(eq(schema.resources.sku, def.sku)).limit(1);
  if (existing) {
    if (existing.groupId !== groupId) {
      await db.update(schema.resources).set({ groupId, updatedAt: new Date() }).where(eq(schema.resources.id, existing.id));
    }
    return { id: existing.id, created: false };
  }

  const [row] = await db.insert(schema.resources).values({
    groupId,
    sku: def.sku,
    name: def.name,
    resourceType: def.type,
    unit: def.unit,
    price: def.price,
    vatRate: 20,
    trackInventory: def.track ?? false,
    stockQty: def.stock ?? 0,
    description: def.description ?? null,
    createdBy,
  }).returning({ id: schema.resources.id });
  return { id: row!.id, created: true };
}

/** Каталог товаров и услуг — идемпотентно, добавляет только отсутствующие SKU. */
export async function ensureDemoResourceCatalog() {
  const [pipeline] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.isDefault, true)).limit(1);
  const allPipelines = await db.select().from(schema.pipelines);
  const subprocess = allPipelines.find((p) => p.name.includes("документ") || p.pipelineType === "subprocess");
  const pipelineIds = pipeline ? [pipeline.id, ...(subprocess ? [subprocess.id] : [])] : [];

  const roles = await db.select().from(schema.roles);
  const roleId = (name: string) => roles.find((r) => r.name === name)?.id;
  const [managerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "manager")).limit(1);
  const createdBy = managerUser?.id ?? null;

  const roleAccess = [
    { role: "manager", view: true, manage: true },
    { role: "operator", view: true, manage: false },
    { role: "deal_manager", view: true, manage: false },
    { role: "integrator", view: true, manage: true },
  ];

  const grpProducts = await ensureResourceGroup(
    DEMO_GROUP_PRODUCTS,
    "Демонстрационный каталог товаров агентства",
    0,
    pipelineIds,
    roleAccess,
    roleId,
  );
  const grpServices = await ensureResourceGroup(
    DEMO_GROUP_SERVICES,
    "Демонстрационный каталог услуг агентства",
    1,
    pipelineIds,
    roleAccess,
    roleId,
  );

  const groupByName = new Map([
    [DEMO_GROUP_PRODUCTS, grpProducts.id],
    [DEMO_GROUP_SERVICES, grpServices.id],
  ]);

  let created = 0;
  const resourceBySku = new Map<string, string>();
  for (const def of DEMO_CATALOG) {
    const gid = groupByName.get(def.groupName);
    if (!gid) continue;
    const { id, created: isNew } = await ensureResourceBySku(def, gid, createdBy);
    resourceBySku.set(def.sku, id);
    if (isNew) created++;
  }

  if (created > 0) {
    console.log(`Demo catalog: +${created} позиций (${DEMO_CATALOG.length} SKU всего, ${DEMO_CATALOG.filter((d) => d.type === "product").length} товаров, ${DEMO_CATALOG.filter((d) => d.type === "service" || d.type === "bundle").length} услуг)`);
  }
  return resourceBySku;
}

async function ensureDemoDealLines(resourceBySku: Map<string, string>) {
  type LineDef = { phone: string; lines: { sku: string; qty: number; discount?: number }[] };
  const dealLines: LineDef[] = [
    { phone: "+7 (916) 700-77-88", lines: [{ sku: "SRV-002", qty: 1 }, { sku: "SRV-003", qty: 3 }, { sku: "PRD-001", qty: 1 }] },
    { phone: "+7 (916) 400-44-55", lines: [{ sku: "SRV-C02", qty: 1 }, { sku: "SRV-L01", qty: 1 }] },
    { phone: "+7 (812) 600-66-77", lines: [{ sku: "SRV-C01", qty: 1, discount: 5 }] },
    { phone: "+7 (916) 100-11-22", lines: [{ sku: "SRV-001", qty: 1 }, { sku: "SRV-003", qty: 2 }, { sku: "PRD-002", qty: 2 }] },
  ];

  for (const deal of dealLines) {
    const lead = await leadByPhone(deal.phone);
    if (!lead) continue;
    const [hasLines] = await db.select({ id: schema.leadResourceLines.id })
      .from(schema.leadResourceLines)
      .where(eq(schema.leadResourceLines.leadId, lead.id))
      .limit(1);
    if (hasLines) continue;

    let sort = 0;
    for (const l of deal.lines) {
      const resId = resourceBySku.get(l.sku);
      const [res] = resId
        ? await db.select().from(schema.resources).where(eq(schema.resources.id, resId)).limit(1)
        : [null];
      if (!res) continue;
      const discountPct = l.discount ?? 0;
      const amount = lineAmount(l.qty, res.price, discountPct);
      await db.insert(schema.leadResourceLines).values({
        leadId: lead.id,
        resourceId: res.id,
        name: res.name,
        qty: l.qty,
        unit: res.unit,
        unitPrice: res.price,
        discountPct,
        vatRate: res.vatRate,
        amount,
        sortOrder: sort++,
      });
    }
    await db.insert(schema.leadNotes).values({
      leadId: lead.id,
      text: `📦 Демо: состав сделки (${deal.lines.length} поз.)`,
      author: "Демо",
    });
  }
}

async function ensureDemoLegalAndEdo() {
  const leRomanova = await ensureLegalEntity({
    inn: "7701234567",
    fullName: "ООО «Ромашка Девелопмент»",
    shortName: "Ромашка",
    directorName: "Романова Е.А.",
  });
  const leKozlov = await ensureLegalEntity({
    inn: "781234567890",
    fullName: "ИП Козлов Павел Сергеевич",
    shortName: "ИП Козлов",
    entityType: "ip",
    directorName: "Козлов П.С.",
  });
  const leGromov = await ensureLegalEntity({
    inn: "7709876543",
    fullName: "ООО «Гром Бизнес Центр»",
    shortName: "Гром БЦ",
    directorName: "Громов А.В.",
  });

  const legalLinks: { phone: string; entityId: string }[] = [
    { phone: "+7 (916) 700-77-88", entityId: leRomanova.id },
    { phone: "+7 (812) 600-66-77", entityId: leKozlov.id },
    { phone: "+7 (916) 400-44-55", entityId: leGromov.id },
  ];
  for (const link of legalLinks) {
    const lead = await leadByPhone(link.phone);
    if (!lead) continue;
    await db.insert(schema.leadLegalEntities).values({ leadId: lead.id, legalEntityId: link.entityId }).onConflictDoNothing();
  }

  const [contactExists] = await db.select().from(schema.crmContacts).where(eq(schema.crmContacts.email, "e.romanova@demo.local")).limit(1);
  if (!contactExists) {
    const [managerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "manager")).limit(1);
    const [contact] = await db.insert(schema.crmContacts).values({
      name: "Екатерина Романова",
      phone: "+7 (916) 700-77-88",
      email: "e.romanova@demo.local",
      position: "Покупатель",
      legalEntityId: leRomanova.id,
      createdBy: managerUser?.id ?? null,
    }).returning();
    const leadR = await leadByPhone("+7 (916) 700-77-88");
    if (leadR && contact) {
      await db.insert(schema.leadCrmContacts).values({ leadId: leadR.id, contactId: contact.id }).onConflictDoNothing();
    }
  }

  const demoPdf = new TextEncoder().encode("%PDF-1.4 demo document CRM\n");
  const docSpecs: { phone: string; title: string; type: "act" | "invoice" | "contract"; legalEntityId: string }[] = [
    { phone: "+7 (916) 700-77-88", title: "Акт оказанных услуг №Д-042", type: "act", legalEntityId: leRomanova.id },
    { phone: "+7 (916) 400-44-55", title: "Счёт на оплату №С-118", type: "invoice", legalEntityId: leGromov.id },
    { phone: "+7 (812) 600-66-77", title: "Договор аренды с выкупом", type: "contract", legalEntityId: leKozlov.id },
  ];

  const [managerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "manager")).limit(1);
  const createdBy = managerUser?.id ?? null;

  for (const spec of docSpecs) {
    const lead = await leadByPhone(spec.phone);
    if (!lead) continue;
    const [exists] = await db.select().from(schema.edoDocuments)
      .where(and(eq(schema.edoDocuments.leadId, lead.id), eq(schema.edoDocuments.title, spec.title))).limit(1);
    if (exists) continue;

    const doc = await createDocument({
      title: spec.title,
      type: spec.type,
      mimeType: "application/pdf",
      fileName: `${spec.type}-demo.pdf`,
      fileData: demoPdf,
      leadId: lead.id,
      legalEntityId: spec.legalEntityId,
      createdBy,
    });

    if (spec.type === "act" || spec.type === "invoice") {
      const lines = await db.select().from(schema.leadResourceLines).where(eq(schema.leadResourceLines.leadId, lead.id));
      let sort = 0;
      for (const l of lines) {
        await db.insert(schema.edoDocumentLines).values({
          documentId: doc.id,
          resourceId: l.resourceId,
          name: l.name,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          amount: l.amount,
          sortOrder: sort++,
        });
      }
    }
  }
}

async function ensureDemoAssets() {
  const [existing] = await db.select().from(schema.assetGroups).where(eq(schema.assetGroups.name, DEMO_ASSETS_MARKER)).limit(1);
  if (existing) return;

  const [managerUser] = await db.select().from(schema.users).where(eq(schema.users.login, "manager")).limit(1);
  const createdBy = managerUser?.id ?? null;

  const [agOffice] = await db.insert(schema.assetGroups).values({
    name: DEMO_ASSETS_MARKER,
    kind: "tangible",
    description: "Москва, ул. Тверская",
    sortOrder: 0,
  }).returning();

  const [agIt] = await db.insert(schema.assetGroups).values({
    name: "Демо · IT и НМА",
    kind: "intangible",
    description: "ПО, лицензии, домены",
    sortOrder: 1,
  }).returning();

  type AssetDef = {
    name: string; groupId: string; kind: "tangible" | "intangible"; cls: string;
    inv?: string; location?: string; cost: number; life?: number; intangibleType?: string; expiry?: string;
  };
  const assets: AssetDef[] = [
    { name: "Стол переговорный Oak 240", groupId: agOffice.id, kind: "tangible", cls: "furniture", inv: "OS-001", location: "Переговорная 1", cost: 185_000, life: 84 },
    { name: "Кресло офисное ErgoChair", groupId: agOffice.id, kind: "tangible", cls: "furniture", inv: "OS-002", location: "Open space", cost: 42_000, life: 60 },
    { name: "Шкаф архивный", groupId: agOffice.id, kind: "tangible", cls: "furniture", inv: "OS-003", location: "Архив", cost: 28_000, life: 120 },
    { name: "MacBook Pro 14\" (менеджер)", groupId: agOffice.id, kind: "tangible", cls: "it", inv: "IT-014", location: "Отдел продаж", cost: 249_000, life: 36 },
    { name: "МФУ Canon imageRUNNER", groupId: agOffice.id, kind: "tangible", cls: "equipment", inv: "OS-010", location: "Копировальная", cost: 156_000, life: 48 },
    { name: "Лицензия CRM (год)", groupId: agIt.id, kind: "intangible", cls: "software", inv: "NMA-001", cost: 360_000, life: 12, intangibleType: "software_license", expiry: "2027-06-01" },
    { name: "Домен sdr-crm.demo", groupId: agIt.id, kind: "intangible", cls: "domain", inv: "NMA-002", cost: 2_500, life: 12, intangibleType: "domain", expiry: "2026-12-01" },
    { name: "Товарный знак «CRM»", groupId: agIt.id, kind: "intangible", cls: "trademark", inv: "NMA-003", cost: 45_000, life: 120, intangibleType: "trademark" },
  ];

  for (const a of assets) {
    const [row] = await db.insert(schema.companyAssets).values({
      groupId: a.groupId,
      inventoryNumber: a.inv || null,
      name: a.name,
      assetClass: a.cls,
      assetKind: a.kind,
      location: a.location || null,
      responsibleUserId: managerUser?.id ?? null,
      purchaseDate: "2024-01-15",
      purchaseCost: a.cost,
      currentValue: a.cost,
      usefulLifeMonths: a.life ?? null,
      expiryDate: a.expiry || null,
      intangibleType: a.intangibleType || null,
      createdBy,
    }).returning();
    await db.insert(schema.assetMovements).values({
      assetId: row!.id,
      movementType: "purchase",
      amount: a.cost,
      notes: "Демо: поступление",
      createdBy,
    });
    if (a.kind === "tangible" && a.life && a.life >= 36) {
      const monthly = Math.round((a.cost * 0.8 / a.life) * 100) / 100;
      await db.insert(schema.assetMovements).values({
        assetId: row!.id,
        movementType: "depreciation",
        amount: monthly * 6,
        notes: "Демо: амортизация за 6 мес.",
        createdBy,
      });
      await db.update(schema.companyAssets).set({
        accumulatedDepreciation: monthly * 6,
        currentValue: a.cost - monthly * 6,
      }).where(eq(schema.companyAssets.id, row!.id));
    }
  }

  const [existingAssetField] = await db.select().from(schema.fields)
    .where(sql`entity_types @> '["asset"]'::jsonb`).limit(1);
  if (!existingAssetField) {
    const [fSerial] = await db.insert(schema.fields).values({
      label: "Серийный номер",
      type: "text",
      sortOrder: 100,
      entityTypes: ["asset"],
      meta: { required: { always: true } },
    }).returning();
    const [fPhoto] = await db.insert(schema.fields).values({
      label: "Фото актива",
      type: "image",
      sortOrder: 101,
      entityTypes: ["asset"],
      meta: { bindings: { assetGroupIds: [agOffice!.id, agIt!.id] } },
    }).returning();
    const assetRows = await db.select().from(schema.companyAssets).limit(2);
    if (fSerial && assetRows[0]) {
      await db.insert(schema.entityFieldValues).values({
        entityType: "asset",
        entityId: assetRows[0].id,
        fieldId: fSerial.id,
        value: "SN-DEMO-001",
      });
    }
    if (fPhoto && assetRows[1]) {
      await db.insert(schema.entityFieldValues).values({
        entityType: "asset",
        entityId: assetRows[1].id,
        fieldId: fPhoto.id,
        value: "",
      });
    }
  }

  console.log(`Resources/assets demo: ${assets.length} активов компании`);
}

/** Демо: ресурсы, активы, строки сделок, юр. лица, документы ЭДО — идемпотентно. */
export async function ensureResourcesAssetsDemo() {
  const resourceBySku = await ensureDemoResourceCatalog();
  await ensureDemoDealLines(resourceBySku);
  await ensureDemoLegalAndEdo();
  await ensureDemoAssets();
}
