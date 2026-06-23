import { useState, useEffect, useCallback, useRef } from "react";
import { api, normalizeLead, type Lead, type Stage, type Field, type Channel, type DealManager, type Task, type LeadCardLayout, type LeadCardBlock, type TeamMember, type Pipeline } from "../api/client";

export type CrmData = {
  leads: ReturnType<typeof normalizeLead>[];
  pipelines: Pipeline[];
  stages: Stage[];
  fields: Field[];
  channels: Channel[];
  dealManagers: DealManager[];
  employees: TeamMember[];
  tasks: Task[];
  cardLayout?: LeadCardLayout;
  hiddenCardFields?: string[];
  leadCardBlocks?: LeadCardBlock[];
};

const DB_RECOVER_HINT = /повреждена|dev:recover|перезапускается|could not seek|Aborted/i;

export function useCrmData(enabled: boolean) {
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const seqRef = useRef(0);

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
      hiddenCardFields: settings.hiddenCardFields,
      leadCardBlocks: settings.leadCardBlocks,
      leads: leadsRes.leads.map(normalizeLead),
      tasks: tasksRes.tasks,
      dealManagers: teamRes.dealManagers,
      employees: teamRes.employees || [],
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++seqRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await fetchData();
      if (id === seqRef.current) setData(next);
    } catch (e) {
      if (id !== seqRef.current) return;
      const msg = e instanceof Error ? e.message : "Не удалось загрузить данные";
      if (DB_RECOVER_HINT.test(msg)) {
        try {
          const r = await api.recoverDevDatabase();
          if (r.ok && id === seqRef.current) {
            setData(await fetchData());
            return;
          }
        } catch { /* fall through */ }
      }
      if (id === seqRef.current) setLoadError(msg);
    } finally {
      if (id === seqRef.current) setLoading(false);
    }
  }, [enabled, fetchData]);

  /** Обновление без экрана «Загрузка CRM…» — для SSE и фонового опроса */
  const reloadSilent = useCallback(async () => {
    if (!enabled) return;
    const id = ++seqRef.current;
    try {
      const next = await fetchData();
      if (id === seqRef.current) setData(next);
    } catch { /* сеть — оставляем текущие данные */ }
  }, [enabled, fetchData]);

  useEffect(() => { reload(); }, [reload]);

  const updateData = (patch: Partial<CrmData>) => {
    setData((d) => d ? { ...d, ...patch } : d);
  };

  return { data, loading, loadError, reload, reloadSilent, updateData, setData };
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

export async function persistLeadCardBlocks(blocks: LeadCardBlock[]) {
  const { leadCardBlocks } = await api.updateLeadCardBlocks(blocks);
  return leadCardBlocks;
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
