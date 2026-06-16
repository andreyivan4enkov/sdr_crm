import { useCallback, useRef } from "react";
import type { CrmNavFrame } from "../lib/crm-nav-stack";
import { shouldPushNav } from "../lib/crm-nav-stack";

type Args = {
  crmView: string;
  setCrmView: (v: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  taskFocusId: string | null;
  setTaskFocusId: (id: string | null) => void;
  crmSub: "kanban" | "list";
  setCrmSub?: (v: "kanban" | "list") => void;
  settingsTab?: string;
  setSettingsTab?: (v: string | undefined) => void;
  navigate: (path: string) => void;
};

export function useCrmNavStack({
  crmView,
  setCrmView,
  selectedId,
  setSelectedId,
  taskFocusId,
  setTaskFocusId,
  crmSub,
  setCrmSub,
  settingsTab,
  setSettingsTab,
  navigate,
}: Args) {
  const stackRef = useRef<CrmNavFrame[]>([]);

  const snapshot = useCallback((): CrmNavFrame => ({
    view: crmView,
    leadId: selectedId,
    taskId: taskFocusId,
    crmSub,
    settingsTab,
  }), [crmView, selectedId, taskFocusId, crmSub, settingsTab]);

  const applyFrame = useCallback((frame: CrmNavFrame) => {
    setCrmView(frame.view);
    setSelectedId(frame.leadId ?? null);
    setTaskFocusId(frame.taskId ?? null);
    if (frame.crmSub && setCrmSub) setCrmSub(frame.crmSub);
    if (setSettingsTab) setSettingsTab(frame.settingsTab as never);
    navigate("/crm");
  }, [setCrmView, setSelectedId, setTaskFocusId, setCrmSub, setSettingsTab, navigate]);

  const clearStack = useCallback(() => {
    stackRef.current = [];
  }, []);

  const goToFrame = useCallback((next: CrmNavFrame) => {
    const cur = snapshot();
    if (shouldPushNav(cur, next)) {
      stackRef.current.push(cur);
    }
    applyFrame(next);
  }, [snapshot, applyFrame]);

  const navigateToLead = useCallback((leadId: string) => {
    goToFrame({
      view: "crm",
      leadId,
      taskId: null,
      crmSub,
      settingsTab: undefined,
    });
  }, [goToFrame, crmSub]);

  const navigateToTask = useCallback((taskId: string) => {
    goToFrame({
      view: "tasks",
      taskId,
      leadId: null,
      crmSub,
      settingsTab: undefined,
    });
  }, [goToFrame, crmSub]);

  const openLeadInCrm = useCallback((leadId: string) => {
    navigateToLead(leadId);
  }, [navigateToLead]);

  const navigateBack = useCallback(() => {
    if (stackRef.current.length > 0) {
      const prev = stackRef.current.pop()!;
      applyFrame(prev);
      return true;
    }
    if (crmView === "crm" && selectedId) {
      setSelectedId(null);
      return true;
    }
    if (crmView === "tasks" && taskFocusId) {
      setTaskFocusId(null);
      return true;
    }
    return false;
  }, [applyFrame, crmView, selectedId, taskFocusId, setSelectedId, setTaskFocusId]);

  const canNavigateBack = useCallback(() => {
    if (stackRef.current.length > 0) return true;
    if (crmView === "crm" && selectedId) return true;
    if (crmView === "tasks" && taskFocusId) return true;
    return false;
  }, [crmView, selectedId, taskFocusId]);

  return {
    navigateToLead,
    navigateToTask,
    openLeadInCrm,
    navigateBack,
    canNavigateBack,
    clearStack,
  };
}
