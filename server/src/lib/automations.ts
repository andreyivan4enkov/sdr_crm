import type { StageAutomation } from "../db/schema.js";

type Lead = {
  id: string;
  name: string;
  assignedRealtorId?: string | null;
  assignedUserId?: string | null;
  custom?: Record<string, string>;
};
type Realtor = { id: string; name: string; userId?: string | null };
type Channel = { id: string; name: string };
type StageRef = { id: string; label: string; pipelineId?: string };

export type AutomationResult = {
  extraNotes: { text: string; author: string }[];
  extraTasks: { text: string; assignee: string; author: string; leadId: string; status?: string; priority?: string }[];
  messages: { text: string; leadId: string }[];
  moveToStageId?: string;
  copyTo?: { pipelineId: string; stageId: string };
  assignUserId?: string;
  assignRealtorId?: string;
  fieldPatches?: Record<string, string>;
};

function resolveRecipient(val: string | undefined, lead: Lead, realtors: Realtor[]) {
  if (val === "Ответственный") {
    const r = realtors.find((x) => x.id === lead.assignedRealtorId);
    return r ? r.name : "Ответственный (не назначен)";
  }
  return val || "";
}

function resolveAssignFromRobot(
  a: StageAutomation,
  lead: Lead,
  realtors: Realtor[],
): { assignUserId?: string; assignRealtorId?: string } {
  if (a.assignUserId) return { assignUserId: a.assignUserId };
  if (a.recipient === "Ответственный" && lead.assignedUserId) {
    return { assignUserId: lead.assignedUserId };
  }
  const byName = realtors.find((r) => r.name === a.recipient);
  if (byName) {
    return {
      assignRealtorId: byName.id,
      assignUserId: byName.userId || undefined,
    };
  }
  return {};
}

export function runStageAutomations(
  automations: StageAutomation[],
  stage: StageRef,
  lead: Lead,
  channels: Channel[],
  realtors: Realtor[],
  allStages: StageRef[] = [],
): AutomationResult {
  const result: AutomationResult = {
    extraNotes: [],
    extraTasks: [],
    messages: [],
  };

  for (const a of automations || []) {
    const author = a.author || "Система";
    const rcpt = resolveRecipient(a.recipient, lead, realtors);

    if (a.type === "reply") {
      const ch = channels.find((c) => c.id === a.channelId);
      result.extraNotes.push({
        text: `⚙ Авто-ответ клиенту в «${ch ? ch.name : "канал"}» (от: ${author}): ${a.text || ""}`,
        author: "Автоматизация",
      });
      result.messages.push({ text: `${lead.name}: отправлен ответ в ${ch ? ch.name : "канал"}`, leadId: lead.id });
    } else if (a.type === "task") {
      result.extraTasks.push({
        text: a.text || "Задача",
        assignee: rcpt || "Без исполнителя",
        author,
        leadId: lead.id,
        status: "new",
        priority: "normal",
      });
      result.messages.push({ text: `Задача для «${rcpt || "сотрудника"}»: ${a.text || "Задача"}`, leadId: lead.id });
    } else if (a.type === "notify") {
      result.messages.push({
        text: `${stage.label} — ${lead.name}${a.text ? `: ${a.text}` : ""}${rcpt ? ` (кому: ${rcpt})` : ""}`,
        leadId: lead.id,
      });
    } else if (a.type === "move" && a.targetStageId) {
      const target = allStages.find((s) => s.id === a.targetStageId);
      result.moveToStageId = a.targetStageId;
      result.extraNotes.push({
        text: `⚙ Робот переместил сделку на этап «${target?.label || "этап"}»`,
        author: "Автоматизация",
      });
    } else if (a.type === "copy" && a.targetStageId && a.targetPipelineId) {
      const target = allStages.find((s) => s.id === a.targetStageId);
      result.copyTo = { pipelineId: a.targetPipelineId, stageId: a.targetStageId };
      result.extraNotes.push({
        text: `⚙ Робот создал копию сделки в воронке (этап «${target?.label || "этап"}»)`,
        author: "Автоматизация",
      });
    } else if (a.type === "assign") {
      const assign = resolveAssignFromRobot(a, lead, realtors);
      if (assign.assignUserId) result.assignUserId = assign.assignUserId;
      if (assign.assignRealtorId) result.assignRealtorId = assign.assignRealtorId;
      result.messages.push({
        text: `Назначен ответственный по сделке «${lead.name}»`,
        leadId: lead.id,
      });
    } else if (a.type === "field" && a.fieldKey) {
      result.fieldPatches = result.fieldPatches || {};
      result.fieldPatches[a.fieldKey] = a.fieldValue ?? "";
      result.extraNotes.push({
        text: `⚙ Робот изменил поле «${a.fieldKey}»`,
        author: "Автоматизация",
      });
    }
  }

  return result;
}
