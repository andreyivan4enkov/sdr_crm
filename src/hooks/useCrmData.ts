import { useState, useEffect, useCallback } from "react";
import { api, normalizeLead, type Lead, type Stage, type Field, type Channel, type Realtor, type Task, type LeadCardLayout, type TeamMember, type Pipeline } from "../api/client";

export type CrmData = {
  leads: ReturnType<typeof normalizeLead>[];
  pipelines: Pipeline[];
  stages: Stage[];
  fields: Field[];
  channels: Channel[];
  realtors: Realtor[];
  employees: TeamMember[];
  tasks: Task[];
  cardLayout?: LeadCardLayout;
};

export function useCrmData(enabled: boolean) {
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const [settings, leadsRes, tasksRes, teamRes] = await Promise.all([
      api.getSettings(),
      api.getLeads({ limit: 200 }),
      api.getTasks(),
      api.getTeam(),
    ]);
    return {
      pipelines: settings.pipelines || [],
      stages: settings.stages,
      fields: settings.fields,
      channels: settings.channels,
      cardLayout: settings.cardLayout,
      leads: leadsRes.leads.map(normalizeLead),
      tasks: tasksRes.tasks,
      realtors: teamRes.realtors,
      employees: teamRes.employees || [],
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await fetchData());
    } catch {
      /* API недоступен — data остаётся null, UI покажет сообщение */
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchData]);

  /** Обновление без экрана «Загрузка CRM…» — для SSE и фонового опроса */
  const reloadSilent = useCallback(async () => {
    if (!enabled) return;
    try {
      setData(await fetchData());
    } catch { /* сеть — оставляем текущие данные */ }
  }, [enabled, fetchData]);

  useEffect(() => { reload(); }, [reload]);

  const updateData = (patch: Partial<CrmData>) => {
    setData((d) => d ? { ...d, ...patch } : d);
  };

  return { data, loading, reload, reloadSilent, updateData, setData };
}

export async function persistStages(stages: Stage[]) {
  const { stages: s } = await api.updateStages(stages);
  return s;
}

export async function persistPipelines(pipelines: Pipeline[]) {
  const { pipelines: p } = await api.updatePipelines(pipelines);
  return p;
}

export async function persistFields(fields: Field[]) {
  const { fields: f } = await api.updateFields(fields);
  return f;
}

export async function persistCardLayout(cardLayout: LeadCardLayout) {
  const { cardLayout: c } = await api.updateCardLayout(cardLayout);
  return c;
}

export async function persistChannels(channels: Partial<Channel>[]) {
  const { channels: c } = await api.updateChannels(channels);
  return c;
}

export async function persistLeadUpdate(id: string, patch: Partial<Lead>) {
  const { lead } = await api.updateLead(id, patch);
  return normalizeLead(lead);
}

export async function persistNewLead(body: Partial<Lead>) {
  const { lead } = await api.createLead(body);
  return normalizeLead(lead);
}
