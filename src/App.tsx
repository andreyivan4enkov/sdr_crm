import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { storageGet, storageSet } from "./storage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useCrmData, persistFields, persistCardLayout, persistLeadCardBlocks } from "./hooks/useCrmData";
import { LeadCardSectionLayout } from "./components/LeadCardSectionLayout";
import { normalizeLeadCardBlocks, type LeadCardBlock } from "./lib/lead-card-blocks";
import { useCrmMutations } from "./features/crm/useCrmMutations";
import { LoginPage } from "./features/crm/LoginPage";
import { useLeadFieldDraft } from "./hooks/useLeadFieldDraft";
import { CrmFieldInput } from "./components/CrmFieldInput";
import { isFieldRequired } from "./lib/crm-field-types";
import { formatPhoneInput, formatPhoneDisplay, isValidRuPhone, PHONE_FORMAT_HINT } from "./lib/phone";
import { useCrmNavStack } from "./hooks/useCrmNavStack";
import { useIsMobile } from "./hooks/useMediaQuery";
import { useSwipeBack } from "./hooks/useSwipeBack";
import { useSse } from "./hooks/useSse";
import { useAutoRefresh } from "./hooks/useAutoRefresh";
import { popAndUndo } from "./hooks/useUndoStack";
import { api, hasPermission, normalizeLead, canEditLead, canAssignLead } from "./api/client";
import { RegisterPage } from "./views/RegisterPage";
import { PrivacyPage } from "./views/PrivacyPage";
import { KanbanBoard as Kanban } from "./views/KanbanBoard";
import { NetworkBanner } from "./components/NetworkBanner";
import { CrmErrorBoundary } from "./components/CrmErrorBoundary";
import { CrmSkeleton } from "./components/CrmSkeleton";
import { AdminAudit } from "./views/admin/AdminAudit";
import { SettingsHub, canAccessSettings } from "./views/SettingsHub";
import { ProfileHub, type ProfileTab } from "./views/ProfileHub";
import { type ReactorTab } from "./views/reactor/ReactorUnifiedHub";
import { ReactorShell } from "./views/reactor/ReactorShell";
import { FaceProductShell } from "./components/face/FaceProductShell";
import { FaceRuntimeProvider, type FaceRuntimeContextValue } from "./components/face/FaceRuntimeContext";
import { canAccessReactor } from "./lib/crm-nav";
import { AnalyticsHub } from "./views/analytics/AnalyticsHub";
import { TasksPage, LeadTasksBlock } from "./views/TasksPage";
import { CallsPage, LeadCallHistory } from "./components/LeadCallHistory";
import { MobileCrmNav } from "./components/MobileCrmNav";
import { MobileMoreSheet } from "./components/MobileMoreSheet";
import { CrmNavSidebar } from "./components/CrmNavSidebar";
import { MobileInstallGuide } from "./components/MobileInstallGuide";
import { QrLoginShare } from "./components/QrLoginShare";
import { AuthQrPage } from "./views/AuthQrPage";
import { LeadCardFieldsGrid } from "./components/LeadCardFieldsGrid";
import { LeadAssignSection } from "./components/LeadPeoplePicker";
import { LeadHistoryTab } from "./components/LeadHistoryTab";
import { LeadsListView } from "./components/LeadsListView";
import { GlassDatePicker, GlassDateTimePicker, GlassPreferredTimePicker, formatPreferredTimeDisplay } from "./components/GlassDrumPicker";
import { EmployeeAvatar, EmployeeChip } from "./components/EmployeeChip";
import { leadResponsibleMember, uniqueWatcherMembers } from "./lib/team-members";
import { TeamPage } from "./views/TeamPage";
import { EdoHub, LeadDocumentsPanel } from "./views/edo/EdoHub";
import { MailHub, LeadMailPanel } from "./views/mail/MailHub";
import { CrmEntitiesHub, LeadEntitiesPanel } from "./views/entities/CrmEntitiesHub";
import { ResourcesHub, LeadResourcesPanel } from "./views/resources/ResourcesHub";
import { PipelineMapView } from "./views/blueprint/PipelineMapView";
import { topBarBg } from "./theme";
import { ThemeProvider, useTheme } from "./context/ThemeProvider";
import { skinBtn, isNeoTheme } from "./lib/neo-ui";
import { SequencerMode } from "./views/SequencerMode";
import { useCrmNavPrefs } from "./hooks/useCrmNavPrefs";
import { navLabel, NAV_LAYOUT_KEY, type NavLayout } from "./lib/crm-nav";
import { useUiT } from "./lib/i18n-labels";
import {
  getStoredPipelineId, setStoredPipelineId, resolveActivePipeline,
  stagesForPipeline, leadsForPipeline,
} from "./lib/crm-pipelines";
import { buildCrmSearch, crmSearchEqual, parseCrmSearch } from "./lib/crm-route";
import {
  STAGE_COLORS, harmonyHint, recommendStageColor, stageHex, stagePillStyle, entityCardAccentVars,
  stagePipelineStyle, bioNoteStyle,
} from "./lib/stage-colors";
import {
  Phone, Users, LogOut, Search, Plus, ChevronLeft, MapPin, Clock, MessageSquare,
  Send, Building2, TrendingUp, Shield, Headphones, CheckCircle2, X, Trash2, UserPlus,
  PhoneCall, Sun, Moon, Bell, Columns, Tag, Type, Hash, Banknote, MapPinned,
  CalendarClock, Calendar, User, Zap, Plug, GripVertical, ListTodo, Check, Pencil, Globe, Eye,
  Megaphone, MessageCircle, Link2, Settings, List, BarChart3, SlidersHorizontal, ExternalLink,
  ScrollText, Eraser, Download, PanelLeft, Menu, GitBranch, ArrowRightLeft, Copy, Mail, Radar, QrCode, Cpu,
} from "lucide-react";

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

const FIELD_TYPES = [
  { key: "text", label: "Текст", icon: Type },
  { key: "number", label: "Число", icon: Hash },
  { key: "money", label: "Деньги", icon: Banknote },
  { key: "phone", label: "Телефон", icon: Phone },
  { key: "link", label: "Ссылка", icon: Link2 },
  { key: "address", label: "Адрес", icon: MapPinned },
  { key: "date", label: "Дата", icon: Calendar },
  { key: "datetime", label: "Дата и время", icon: CalendarClock },
  { key: "employee", label: "Сотрудник", icon: User },
];

const AUTO_TYPES = [
  { key: "reply", label: "Ответ клиенту в канал", icon: MessageCircle },
  { key: "task", label: "Задача сотруднику", icon: ListTodo },
  { key: "notify", label: "Уведомление", icon: Bell },
  { key: "move", label: "Переместить на этап", icon: ArrowRightLeft },
  { key: "copy", label: "Создать копию сделки", icon: Copy },
  { key: "assign", label: "Назначить ответственного", icon: UserPlus },
  { key: "field", label: "Изменить поле", icon: Tag },
];

const CHANNEL_ICONS = { site: Globe, messenger: MessageCircle, ad: Megaphone };

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { user, loading: authLoading, logout } = useAuth();
  const { tr, locale } = useUiT();
  const location = useLocation();
  const navigate = useNavigate();
  const initialRoute = useMemo(() => parseCrmSearch(location.search), []);
  const mode = location.pathname.startsWith("/crm") ? "crm" : "auth";
  const { data, loading: dataLoading, loadError: dataLoadError, reload, reloadSilent, updateData, setData } = useCrmData(!!user);
  const { theme, tokens: t, setColorMode, toggleBrand } = useTheme();
  const [sequencerOpen, setSequencerOpen] = useState(false);
  const [qrShareOpen, setQrShareOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [crmView, setCrmView] = useState(initialRoute.view || "crm");
  const [crmSub, setCrmSub] = useState<"kanban" | "list">(() =>
    initialRoute.sub
    ?? (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "list" : "kanban"),
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialRoute.lead ?? null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(
    initialRoute.settings,
  );
  const [profileTab, setProfileTab] = useState<ProfileTab | undefined>(initialRoute.profile as ProfileTab | undefined);
  const [reactorTab, setReactorTab] = useState<ReactorTab | undefined>(initialRoute.reactor);
  const [blueprintCtx, setBlueprintCtx] = useState<{ stageId?: string; pipelineId?: string; reactionId?: string; siteId?: string } | null>(() =>
    (initialRoute.stage || initialRoute.pipeline || initialRoute.reaction || initialRoute.site)
      ? {
        stageId: initialRoute.stage,
        pipelineId: initialRoute.pipeline,
        reactionId: initialRoute.reaction,
        siteId: initialRoute.site,
      }
      : null,
  );
  const [taskFocusId, setTaskFocusId] = useState<string | null>(initialRoute.task ?? null);
  const [navLayout, setNavLayout] = useState<NavLayout>("horizontal");
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [peekLeadId, setPeekLeadId] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseCrmSearch(location.search);
    if (parsed.view) setCrmView(parsed.view);
    if (parsed.sub) setCrmSub(parsed.sub);
    if (parsed.lead) {
      setSelectedId(parsed.lead);
      setTaskFocusId(null);
    } else if (parsed.task) {
      setTaskFocusId(parsed.task);
      setSelectedId(null);
    } else if (!parsed.lead && !parsed.task && parsed.view && parsed.view !== "crm") {
      setSelectedId(null);
      setTaskFocusId(null);
    }
    if (parsed.settings) setSettingsTab(parsed.settings as typeof settingsTab);
    if (parsed.profile) setProfileTab(parsed.profile as ProfileTab);
    if (parsed.reactor) setReactorTab(parsed.reactor);
    if (parsed.stage || parsed.pipeline || parsed.reaction || parsed.site) {
      setBlueprintCtx({
        stageId: parsed.stage,
        pipelineId: parsed.pipeline,
        reactionId: parsed.reaction,
        siteId: parsed.site,
      });
    }
  }, [location.search]);

  useEffect(() => {
    if (!location.pathname.startsWith("/crm")) return;
    const next = buildCrmSearch({
      view: crmView,
      lead: crmView === "crm" ? (selectedId ?? undefined) : undefined,
      task: crmView === "tasks" ? (taskFocusId ?? undefined) : undefined,
      sub: crmView === "crm" && !selectedId ? crmSub : undefined,
      settings: crmView === "settings" ? settingsTab : undefined,
      profile: crmView === "profile" ? profileTab : undefined,
      reactor: crmView === "reactor" ? reactorTab : undefined,
      pipeline: crmView === "reactor" ? blueprintCtx?.pipelineId : undefined,
      stage: crmView === "reactor" ? blueprintCtx?.stageId : undefined,
      reaction: crmView === "reactor" && reactorTab === "blueprint" ? blueprintCtx?.reactionId : undefined,
      site: crmView === "reactor" && reactorTab === "site" ? blueprintCtx?.siteId : undefined,
    });
    if (!crmSearchEqual(location.search, next)) {
      navigate({ pathname: "/crm", search: next }, { replace: true });
    }
  }, [crmView, selectedId, taskFocusId, crmSub, settingsTab, profileTab, reactorTab, blueprintCtx, location.pathname, location.search, navigate]);

  function goCrmView(v: string, tab?: string) {
    if (v === "users") v = "team";
    if (v === "assets") v = "resources";
    navStack.clearStack();
    if (v === "integrations" || v === "channels") {
      setCrmView("settings");
      setSettingsTab("channels");
    } else if (v === "roles") {
      setCrmView("settings");
      setSettingsTab("roles");
    } else if (v === "profile") {
      setCrmView("profile");
      setProfileTab(tab as ProfileTab | undefined);
      setSettingsTab(undefined);
      setReactorTab(undefined);
    } else if (v === "reactor") {
      setCrmView("reactor");
      const reactorModule = (tab === "pipelines" || tab === "pipeline" ? "blueprint" : tab) as ReactorTab | undefined;
      setReactorTab(reactorModule ?? "blueprint");
      setSettingsTab(undefined);
      setProfileTab(undefined);
      if (tab) {
        setBlueprintCtx((ctx) => ({ ...ctx, pipelineId: ctx?.pipelineId, stageId: ctx?.stageId }));
      }
    } else if (v === "settings") {
      setCrmView("settings");
      setSettingsTab(tab as typeof settingsTab);
      setProfileTab(undefined);
      setReactorTab(undefined);
    } else {
      setCrmView(v);
      setSettingsTab(undefined);
      setProfileTab(undefined);
      setReactorTab(undefined);
    }
    setSelectedId(null);
    setTaskFocusId(null);
    setMobileMoreOpen(false);
    setNavDrawerOpen(false);
  }

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => {
    void storageGet(NAV_LAYOUT_KEY).then((v) => {
      if (v === "horizontal" || v === "vertical") setNavLayout(v);
    });
  }, []);
  function setNavLayoutPref(layout: NavLayout) {
    setNavLayout(layout);
    void storageSet(NAV_LAYOUT_KEY, layout);
    if (layout === "horizontal") setNavDrawerOpen(false);
  }

  const { crmNav, products: reactorProducts } = useCrmNavPrefs(user);

  useSse(!!user, (event, payload) => {
    if (event === "notification") {
      const p = payload as { text: string; leadId?: string; taskId?: string };
      notify(p.text, p.leadId, true, p.taskId);
      void reloadSilent();
    }
    if (event === "incoming_call") {
      const p = payload as { phone: string; lead?: { name: string; id?: string }; event?: string };
      const label = p.event === "outgoing_call" ? tr("outgoingCall", undefined, "crm") : tr("incomingCall", undefined, "crm");
      notify(`${label} звонок: ${p.phone}${p.lead ? ` (${p.lead.name})` : ""}`, p.lead?.id);
      window.dispatchEvent(new Event("crm:calls-refresh"));
    }
    if (event === "call_transcript") {
      const p = payload as { call?: { phone: string }; leadId?: string };
      notify(tr("transcriptionReady", { phone: p.call?.phone || "—" }, "crm"), p.leadId);
      window.dispatchEvent(new Event("crm:calls-refresh"));
      void reloadSilent();
    }
    if (event === "call_recording") {
      const p = payload as { text?: string; leadId?: string };
      if (p.text) notify(p.text, p.leadId);
      window.dispatchEvent(new Event("crm:calls-refresh"));
    }
    if (event === "lead_created") {
      const p = payload as { lead?: import("@sdr-crm/api-client").Lead };
      if (p.lead) {
        const lead = normalizeLead(p.lead);
        setData((d) => d ? { ...d, leads: [lead, ...d.leads.filter((l) => l.id !== lead.id)] } : d);
        notify(`Новая заявка: ${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`, lead.id);
      }
      void reloadSilent();
    }
    if (event === "lead_updated") {
      const p = payload as { lead?: import("@sdr-crm/api-client").Lead };
      if (p.lead) {
        const lead = normalizeLead(p.lead);
        setData((d) => d ? { ...d, leads: d.leads.map((l) => l.id === lead.id ? lead : l) } : d);
      }
      void reloadSilent();
    }
    if (event === "lead_deleted") {
      const p = payload as { id?: string };
      if (p.id) setData((d) => d ? { ...d, leads: d.leads.filter((l) => l.id !== p.id) } : d);
      void reloadSilent();
    }
  });

  const onReactorBindingChange = useCallback((b: {
    module?: import("./views/reactor/ReactorUnifiedHub").ReactorTab;
    pipelineId?: string;
    stageId?: string;
    blueprintId?: string;
    siteId?: string;
  }) => {
    setReactorTab(b.module);
    setBlueprintCtx({
      pipelineId: b.pipelineId,
      stageId: b.stageId,
      reactionId: b.blueprintId,
      siteId: b.siteId,
    });
  }, []);

  useAutoRefresh(!!user && location.pathname.startsWith("/crm"), reloadSilent);

  useEffect(() => {
    const onPeek = (e: Event) => setPeekLeadId((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("crm:peek-lead", onPeek);
    return () => window.removeEventListener("crm:peek-lead", onPeek);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        const label = popAndUndo();
        if (label) notify(`Отменено: ${label}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navStack = useCrmNavStack({
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
  });

  const detailEntityOpen = (crmView === "crm" && selectedId) || (crmView === "tasks" && taskFocusId);
  useSwipeBack(() => { navStack.navigateBack(); }, { enabled: !!detailEntityOpen, edgeOnly: true });

  function pushToast(text) { const id = uid(); setToasts((x) => [...x, { id, text }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3800); }
  function notify(text, leadId = null, toast = true, taskId = null) {
    setNotifs((n) => [{ id: uid(), text, leadId, taskId, date: now(), read: false }, ...n].slice(0, 60));
    if (toast) pushToast(text);
  }
  function openLead(leadId: string) { navStack.navigateToLead(leadId); }
  function openTask(taskId: string) { navStack.navigateToTask(taskId); }

  const { addLead, moveLead, updateLead, addNote, updateDataAsync } = useCrmMutations({
    data, setData, updateData, reload, reloadSilent, pushToast, user,
  });

  const scrollCss = `
    .nice-scroll::-webkit-scrollbar{height:10px;width:10px}
    .nice-scroll::-webkit-scrollbar-track{background:transparent}
    .nice-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:9999px;border:3px solid transparent;background-clip:padding-box}
    .nice-scroll::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,.65);background-clip:padding-box}
    .nice-scroll{scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.4) transparent}
  `;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 text-sm" data-color-mode="light">{tr("loading", undefined, "common")}</div>;

  return (
    <div data-crm-app data-brand={theme.brandOn ? "true" : undefined} data-color-mode={theme.colorMode} data-ui-skin={theme.uiSkin} className={`min-h-screen transition-colors duration-300 overflow-x-hidden max-w-full ${t.app} ${t.text}`}>
      <style>{scrollCss}</style>
      <NetworkBanner />
      <TopBar t={t} theme={theme} scrolled={scrolled} mode={mode} user={user}
        onLogout={async () => { await logout(); navigate("/login"); }}
        setColorMode={setColorMode} toggleBrand={toggleBrand} notifs={notifs} setNotifs={setNotifs} openLead={openLead} openTask={openTask}
        crmView={crmView} setCrmView={goCrmView} nav={crmNav} navLayout={navLayout} setNavLayout={setNavLayoutPref}
        onOpenNavDrawer={() => setNavDrawerOpen(true)}
        onOpenSequencer={() => setSequencerOpen(true)}
        onOpenQrShare={() => setQrShareOpen(true)}
        navigate={navigate} />

      <div className="crm-app-shell">
      <Routes>
        <Route path="/" element={user ? <Navigate to="/crm" replace /> : <Navigate to="/login" replace />} />
        <Route path="/privacy" element={<PrivacyPage t={t} />} />
        <Route path="/login" element={user ? <Navigate to="/crm" replace /> : <LoginPage t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} onSuccess={() => navigate("/crm")} />} />
        <Route path="/auth/qr" element={<AuthQrPage t={t} />} />
        <Route path="/register" element={<RegisterPage t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />} />
        <Route path="/crm" element={
          user ? (
            dataLoading && !data ? <CrmSkeleton />
              : !data ? <div className={`p-8 text-center text-sm text-rose-500 ${navLayout === "vertical" ? "pb-8" : "pb-24 md:pb-8"}`}>
                {dataLoadError || tr("loadDataFailed", undefined, "crm")}
                {/повреждена|dev:recover/i.test(dataLoadError) && (
                  <span className="block mt-2 text-slate-500 text-xs">
                    {tr("recoverHint", undefined, "crm")}
                  </span>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                  {/повреждена|dev:recover/i.test(dataLoadError) && (
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                      onClick={async () => {
                        try {
                          await api.recoverDevDatabase();
                          reload();
                        } catch {
                          reload();
                        }
                      }}
                    >
                      {tr("recoverDb", undefined, "crm")}
                    </button>
                  )}
                  <button type="button" className="text-sm underline" onClick={() => reload()}>{tr("retry", undefined, "common")}</button>
                </div>
              </div>
              : <div className={`flex flex-col min-h-[calc(100dvh-var(--crm-header-h)-var(--crm-mobile-nav-h))] md:min-h-[calc(100dvh-6.25rem)] w-full min-w-0 max-w-full overflow-x-hidden ${
                  navLayout === "vertical" ? "md:pl-56 pb-0" : "pb-[calc(var(--crm-mobile-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
                }`}><CrmErrorBoundary label={tr("crmError", undefined, "crm")}><Crm t={t} user={user} data={data}
                crmView={crmView} crmSub={crmSub} setCrmSub={setCrmSub}
                selectedId={selectedId} setSelectedId={setSelectedId}
                settingsMode={settingsMode} setSettingsMode={setSettingsMode}
                moveLead={moveLead} updateLead={updateLead} addNote={addNote} addLead={addLead}
                updateData={updateDataAsync} reload={reload} settingsTab={settingsTab}
                profileTab={profileTab} reactorTab={reactorTab}
                blueprintCtx={blueprintCtx} setBlueprintCtx={setBlueprintCtx} goCrmView={goCrmView}
                onReactorBindingChange={onReactorBindingChange}
                reactorProducts={reactorProducts}
                taskFocusId={taskFocusId} setTaskFocusId={setTaskFocusId}
                onOpenTask={openTask} onOpenLead={navStack.navigateToLead}
                onNotify={notify}
                navigateBack={navStack.navigateBack} /></CrmErrorBoundary></div>
          ) : <Navigate to="/login" />
        } />
      </Routes>
      </div>

      {mode === "crm" && user && (
        <>
          {navLayout === "horizontal" && (
            <>
              <MobileCrmNav crmView={crmView} setCrmView={goCrmView} nav={crmNav} onMore={() => setMobileMoreOpen(true)} t={t} />
              <MobileMoreSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)} crmView={crmView} setCrmView={goCrmView} nav={crmNav} t={t} />
            </>
          )}
          <CrmNavSidebar
            nav={crmNav}
            crmView={crmView}
            setCrmView={goCrmView}
            t={t}
            layout={navLayout}
            onLayoutChange={setNavLayoutPref}
            mobile
            open={navDrawerOpen}
            onClose={() => setNavDrawerOpen(false)}
          />
          <CrmNavSidebar
            nav={crmNav}
            crmView={crmView}
            setCrmView={goCrmView}
            t={t}
            layout={navLayout}
            onLayoutChange={setNavLayoutPref}
          />
          <MobileInstallGuide t={t} />
          <SequencerMode open={sequencerOpen} onClose={() => setSequencerOpen(false)} data={data} />
          <QrLoginShare open={qrShareOpen} onClose={() => setQrShareOpen(false)} t={t} userName={user?.name || user?.login} />
        </>
      )}

      <div className={`fixed right-4 z-50 space-y-2 w-72 max-w-[min(18rem,calc(100%-2rem))] ${
        mode === "crm" && user
          ? navLayout === "vertical" ? "bottom-4" : "bottom-20 md:bottom-4"
          : "bottom-4"
      }`}>
        {toasts.map((x) => (
          <div key={x.id} className={`rounded-xl border shadow-lg px-4 py-3 text-sm flex items-start gap-2 ${t.surface} ${t.border} ${t.text}`}>
            <Zap className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" /> <span>{x.text}</span>
          </div>
        ))}
      </div>

      {peekLeadId && data && (() => {
        const peekLead = data.leads.find((l) => l.id === peekLeadId);
        if (!peekLead) return null;
        return (
          <div className="fixed inset-0 z-[200] flex items-stretch justify-end" onClick={(e) => { if (e.target === e.currentTarget) setPeekLeadId(null); }}>
            <div className={`w-full max-w-xl flex flex-col shadow-2xl border-l overflow-hidden ${t.surface} ${t.border}`} style={{ backdropFilter: "blur(12px)" }} onClick={(e) => e.stopPropagation()}>
              <LeadDetail
                t={t} user={user} lead={peekLead} data={data}
                onBack={() => setPeekLeadId(null)}
                updateLead={updateLead} addNote={addNote} moveLead={moveLead}
                reload={reload} updateData={updateDataAsync}
                onOpenTask={openTask} onNotify={notify} goCrmView={goCrmView}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TopBar({ t, theme, scrolled, mode, user, onLogout, setColorMode, toggleBrand, notifs, setNotifs, openLead, openTask, crmView, setCrmView, nav, navLayout, setNavLayout, onOpenNavDrawer, onOpenSequencer, onOpenQrShare, navigate }) {
  const { tr, locale } = useUiT();
  const [bell, setBell] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const unread = notifs.filter((n) => !n.read).length;
  const bg = topBarBg(theme, scrolled);

  useEffect(() => {
    if (!bell) return;
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bell]);

  return (
    <div className={`fixed md:sticky top-0 inset-x-0 z-40 w-full max-w-full backdrop-blur-md border-b transition-all duration-300 ${t.border} ${bg}`}>
      <div className="w-full max-w-full px-2 sm:px-3 md:px-4 min-h-12 md:min-h-14 py-1 flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1 shrink-0 min-w-0 overflow-hidden">
          {mode === "crm" && user && navLayout === "vertical" && (
            <button
              type="button"
              title={tr("openMenu", undefined, "crm")}
              onClick={onOpenNavDrawer}
              className={`md:hidden w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${t.hover}`}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            title={tr("goHomeCrm", undefined, "crm")}
            onClick={() => {
              if (mode === "crm" && user) setCrmView("crm");
              else navigate(user ? "/crm" : "/login");
            }}
            className="flex items-center gap-1.5 min-w-0 rounded-lg -ml-1 px-1 py-0.5 transition hover:opacity-90 active:scale-[0.98] overflow-hidden max-w-[52vw] sm:max-w-none"
          >
            <div className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
              <span className="font-bold text-sm md:text-base tracking-tight truncate">CRM</span>
              <span className={`text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${t.chip}`}>
                {isMobile && mode === "crm" ? (navLabel(crmView, locale) || "CRM") : "CRM"}
              </span>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
          {mode === "crm" && user && (
            <button
              type="button"
              title={tr("qrLoginTitle", undefined, "crm")}
              onClick={onOpenQrShare}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 ${t.hover}`}
            >
              <QrCode className="w-4 h-4" />
            </button>
          )}
          {mode === "crm" && user && isMobile && (
            <button
              type="button"
              title={tr("flowModeTitle", undefined, "crm")}
              onClick={onOpenSequencer}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 text-teal-600 dark:text-teal-400 ${t.hover}`}
            >
              <Radar className="w-4 h-4" />
            </button>
          )}
          {mode === "crm" && user && (
            <button
              type="button"
              title={tr("myProfile", { name: user.name || user.login }, "crm")}
              onClick={() => setCrmView("profile")}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border shrink-0 transition hover:ring-2 hover:ring-teal-500/30 ${t.border}`}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200 text-xs font-semibold">
                  {(user.name || user.login || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}
          {mode === "crm" && user && (
            <div ref={bellRef} className="relative z-50">
              <button onClick={() => { setBell(!bell); if (!bell) setNotifs((n) => n.map((x) => ({ ...x, read: true }))); }}
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 ${t.hover}`}>
                <Bell className="w-4 h-4" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500" />}
              </button>
              {bell && (
                <div className={`absolute right-0 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border shadow-2xl overflow-hidden bio-glass-panel z-50 ${t.surface} ${t.border}`}>
                  <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border} ${t.text}`}>{tr("notificationsTitle", undefined, "crm")}</div>
                  <div className={`max-h-80 overflow-y-auto nice-scroll divide-y ${t.divide}`}>
                    {notifs.length === 0 && <p className={`px-4 py-6 text-sm text-center ${t.muted}`}>{tr("notificationsEmpty", undefined, "crm")}</p>}
                    {notifs.map((n) => (
                      <button key={n.id} onClick={() => {
                        if (n.leadId) { setBell(false); openLead(n.leadId); }
                        else if (n.taskId) { setBell(false); openTask(n.taskId); }
                      }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition flex items-start gap-2 ${(n.leadId || n.taskId) ? t.hover : ""}`}>
                        <span className="flex-1"><span className={t.subtle}>{n.text}</span>
                          <span className={`block text-xs ${t.muted} mt-0.5`}>{new Date(n.date).toLocaleTimeString("ru-RU")}</span></span>
                        {(n.leadId || n.taskId) && <ExternalLink className={`w-3.5 h-3.5 ${t.muted} mt-0.5`} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={`hidden sm:flex items-center gap-0.5 rounded-lg p-0.5 sm:p-1 ${t.chip}`}>
            {mode === "crm" && user && (
              <button
                type="button"
                title={navLayout === "vertical" ? tr("horizontalMenu", undefined, "crm") : tr("verticalMenu", undefined, "crm")}
                onClick={() => setNavLayout(navLayout === "vertical" ? "horizontal" : "vertical")}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
                  navLayout === "vertical" ? `${t.surface} shadow-sm text-teal-500` : t.muted
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
            <button type="button" title={tr("themeLightTitle", undefined, "crm")} onClick={() => setColorMode("light")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.colorMode === "light" ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button type="button" title={tr("themeDarkTitle", undefined, "crm")} onClick={() => setColorMode("dark")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.colorMode === "dark" ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button type="button" title={theme.brandOn ? tr("brandOn", undefined, "crm") : tr("brandOff", undefined, "crm")} onClick={toggleBrand}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.brandOn ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {mode === "crm" && user && (
            <button onClick={onLogout} title={tr("logout", undefined, "auth")} className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 ${t.hover} ${t.muted} hover:text-rose-500`}>
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {mode === "crm" && user && navLayout === "horizontal" && (
        <div className={`hidden md:block border-t ${t.border}`}>
          <div className="w-full px-2 sm:px-3 md:px-4 flex items-center gap-1 overflow-x-auto nice-scroll">
            {nav.map((n) => (
              <button key={n.k} onClick={() => setCrmView(n.k)}
                className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${crmView === n.k ? "border-teal-500 text-teal-600 dark:text-teal-400" : `border-transparent ${t.muted} hover:${t.text}`}`}>
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- inputs ---------- */
function TInput({ value, onChange, placeholder = "", type = "text", t, onKeyDown = undefined, onBlur = undefined, className = "", inputMode = undefined }) {
  return <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} onBlur={onBlur}
    className={`crm-data w-full rounded-2xl border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400/60 ${t.input} ${className}`} />;
}
function FieldError({ msg, t }) {
  if (!msg) return null;
  return <p className="text-xs text-rose-500 mt-1 crm-data">{msg}</p>;
}
function Sel({ value, onChange, children, t }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-2xl border px-3 py-2 text-sm outline-none focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20 ${t.input}`}>{children}</select>;
}
function Labeled({ label, children, t }) {
  return <div><label className={`text-xs font-medium ${t.muted}`}>{label}</label><div className="mt-1">{children}</div></div>;
}
function Btn({ children, onClick, variant = "primary", t, className = "", ...rest }) {
  const { theme } = useTheme();
  const base = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium transition disabled:opacity-40";
  const variantClass = {
    primary: `${skinBtn(theme, "primary")}${isNeoTheme(theme) ? "" : " text-white"}`,
    soft: `${skinBtn(theme, "soft")} ${t.text}`,
    ghost: `${skinBtn(theme, "ghost")} ${t.text}`,
    danger: skinBtn(theme, "danger"),
  }[variant];
  return (
    <button type="button" onClick={onClick} className={`${base} ${variantClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}
function Stage({ stageId, stages }: { stageId: string; stages: import("./api/client").Stage[] }) {
  const { theme } = useTheme();
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return null;
  return (
    <span
      className="bio-stage-badge inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={entityCardAccentVars(stage.color, true, theme.colorMode)}
    >
      <span className="bio-stage-badge-dot w-2 h-2 rounded-full shrink-0" />
      {stage.label}
    </span>
  );
}

/* ---------- CRM SHELL ---------- */
function Crm({ t, user, data, crmView, crmSub, setCrmSub, selectedId, setSelectedId, settingsMode, setSettingsMode, moveLead, updateLead, addNote, addLead, updateData, reload, settingsTab, profileTab, reactorTab, blueprintCtx, setBlueprintCtx, goCrmView, taskFocusId, setTaskFocusId, onOpenTask, onOpenLead, onNotify, navigateBack, onReactorBindingChange, reactorProducts }) {
  const productBySlug = useMemo(() => {
    const m = new Map<string, import("@sdr-crm/api-client").ReactorProductSummary>();
    for (const p of reactorProducts ?? []) m.set(p.slug, p);
    return m;
  }, [reactorProducts]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  useEffect(() => {
    setPipelineId(resolveActivePipeline(data.pipelines || [], getStoredPipelineId(), data.stages || []));
  }, [data.pipelines, data.stages]);
  const activePipelineId = pipelineId || resolveActivePipeline(data.pipelines || [], null, data.stages || []);
  const manifestData = useMemo(() => ({
    leads: data.leads.map((l) => ({
      id: l.id,
      name: l.name,
      statusId: l.statusId,
      pipelineId: l.pipelineId,
    })),
    stages: data.stages,
    pipelines: data.pipelines,
    tasks: data.tasks.map((tk) => ({
      id: tk.id,
      text: tk.text,
      status: tk.status,
      priority: tk.priority,
      dueAt: tk.dueAt,
      assignee: tk.assignee,
    })),
  }), [data.leads, data.stages, data.pipelines, data.tasks]);

  const isMobile = useIsMobile();
  const faceRuntime = useMemo((): FaceRuntimeContextValue => ({
    slug: crmView,
    user,
    data,
    t,
    pipelineId: activePipelineId,
    setPipelineId,
    leadId: crmView === "crm" ? selectedId : null,
    taskId: crmView === "tasks" ? taskFocusId : null,
    crmSub,
    setCrmSub,
    selectedLeadId: selectedId,
    settingsMode,
    setSettingsMode,
    settingsTab,
    profileTab,
    reactorTab,
    taskFocusId,
    setTaskFocusId,
    isMobile,
    reload,
    updateData,
    moveLead,
    updateLead,
    addNote,
    addLead,
    goCrmView,
    onOpenLead,
    onOpenTask,
    onNotify,
    navigateBack,
    onReactorBindingChange,
    reactorProducts,
    Btn,
    TInput,
    Labeled,
    Sel,
    Stage,
    LeadDetail: LeadDetail as unknown as React.ComponentType<Record<string, unknown>>,
    ManualLead: ManualLead as unknown as React.ComponentType<Record<string, unknown>>,
    onNavigate: (href) => {
      const state = parseCrmSearch(href.startsWith("?") ? href : `?${href}`);
      if (state.view) goCrmView(state.view, state.settings || state.profile || state.reactor);
      if (state.lead) onOpenLead(state.lead);
      if (state.task) setTaskFocusId(state.task);
    },
    onPatchFields: async (entityType, entityId, patches) => {
      const r = await api.agentPatchFields(
        entityType as "lead" | "task" | "contact" | "legal_entity",
        entityId,
        patches.map((p) => ({ field: p.field, value: p.value })),
      );
      if (r.ok) void reload?.();
      return { ok: r.ok, error: r.errors?.[0]?.message };
    },
  }), [
    crmView, user, data, t, activePipelineId, selectedId, taskFocusId, crmSub, settingsMode,
    settingsTab, profileTab, reactorTab, isMobile, reload, reactorProducts,
    moveLead, updateLead, addNote, addLead, goCrmView, onOpenLead, onOpenTask, onNotify, navigateBack,
    onReactorBindingChange, setCrmSub, setSettingsMode, setTaskFocusId,
  ]);

  const productSlug = crmView.startsWith("p:") ? crmView.slice(2) : crmView;
  const productNav = productBySlug.get(productSlug);
  const shellPad = crmView === "tasks" ? "px-2 py-2" : "px-2 py-2 sm:px-3 sm:py-3";

  if (crmView === "reactor" && canAccessReactor(user)) {
    return (
      <FaceRuntimeProvider value={faceRuntime}>
        <div className={`w-full min-w-0 flex-1 flex flex-col min-h-0 ${shellPad}`}>
          <ReactorShell
            t={t}
            user={user}
            data={data}
            updateData={updateData}
            reload={reload}
            Btn={Btn}
            TInput={TInput}
            Labeled={Labeled}
            products={reactorProducts ?? []}
            initialTab={reactorTab}
            embedded
          />
        </div>
      </FaceRuntimeProvider>
    );
  }

  const showProduct = productBySlug.has(productSlug)
    || ["crm", "tasks", "analytics", "calls", "team", "edo", "mail", "entities", "resources", "profile", "settings", "audit", "reactor"].includes(productSlug);

  return (
    <FaceRuntimeProvider value={faceRuntime}>
      <div className={`w-full min-w-0 flex-1 flex flex-col min-h-0 ${shellPad}`}>
        {showProduct && (
          <FaceProductShell
            slug={productSlug}
            product={productNav}
            user={user}
            t={t}
            context={{
              pipelineId: activePipelineId,
              leadId: crmView === "crm" ? selectedId ?? undefined : undefined,
              taskId: crmView === "tasks" ? taskFocusId ?? undefined : undefined,
            }}
            data={manifestData}
            onNavigate={faceRuntime.onNavigate}
            onPatchFields={faceRuntime.onPatchFields}
          />
        )}
      </div>
    </FaceRuntimeProvider>
  );
}

function ManualLead({ t, onCancel, onSave }) {
  const [f, setF] = useState({ name: "", phone: "", region: "", preferredTime: "", comment: "" });
  const [pdConsent, setPdConsent] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className={`rounded-xl border p-5 mb-4 ${t.surface} border-teal-300`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><PhoneCall className="w-4 h-4 text-teal-600" /> Лид со звонка 8-800</h3>
        <button onClick={onCancel} className={t.muted}><X className="w-5 h-5" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Labeled label="Имя" t={t}><TInput t={t} value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Labeled>
        <Labeled label="Телефон" t={t}>
          <TInput t={t} type="tel" inputMode="tel" value={f.phone}
            onChange={(v) => setF({ ...f, phone: formatPhoneInput(v) })}
            placeholder={PHONE_FORMAT_HINT} />
        </Labeled>
        <Labeled label="Регион" t={t}><TInput t={t} value={f.region} onChange={(v) => setF({ ...f, region: v })} /></Labeled>
        <Labeled label="Удобное время" t={t}>
          <GlassPreferredTimePicker
            value={f.preferredTime}
            onChange={(v) => setF({ ...f, preferredTime: v })}
          />
        </Labeled>
      </div>
      <label className={`flex items-start gap-2 text-xs ${t.subtle} mt-2 cursor-pointer`}>
        <input type="checkbox" checked={pdConsent} onChange={(e) => setPdConsent(e.target.checked)} className="mt-0.5" />
        <span>Устное согласие клиента на обработку ПДн зафиксировано</span>
      </label>
      {err && <p className="text-sm text-rose-500 mt-2">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Btn t={t} onClick={() => {
          if (!f.name.trim()) { setErr("Имя обязательно"); return; }
          if (!f.phone.trim() || !isValidRuPhone(f.phone)) { setErr(`Телефон в формате ${PHONE_FORMAT_HINT}`); return; }
          if (!pdConsent) { setErr("Подтвердите согласие на обработку ПДн"); return; }
          onSave({ ...f, phone: formatPhoneDisplay(f.phone), pdConsent: true });
        }}>Сохранить</Btn>
        <Btn t={t} variant="ghost" onClick={onCancel}>Отмена</Btn>
      </div>
    </div>
  );
}

/* ---------- LEAD DETAIL ---------- */
function CustomFieldInput({ field, value, onChange, onBlur, data, t }) {
  return (
    <CrmFieldInput
      field={{ ...field, meta: field.meta ?? {} }}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      t={t}
      TInput={TInput}
      Sel={Sel}
      dealManagers={data.dealManagers}
    />
  );
}

function LeadCustomFieldEditor({ field, lead, data, t, patchLead }) {
  const raw = String((lead.custom || {})[field.id] ?? "");
  const draft = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: field.type === "phone" && raw ? formatPhoneDisplay(raw) : raw,
    onSave: (v) => patchLead({ custom: { ...(lead.custom || {}), [field.id]: v } }),
    validate: field.type === "phone"
      ? (v) => (v && !isValidRuPhone(v) ? `Формат: ${PHONE_FORMAT_HINT}` : null)
      : undefined,
    immediate: field.type !== "phone",
  });
  return (
    <Labeled label={isFieldRequired(field, { stageId: lead.statusId }) ? `${field.label} *` : field.label} t={t}>
      <CustomFieldInput field={field} data={data} t={t}
        value={draft.value}
        onChange={draft.setValue}
        onBlur={field.type === "phone" ? draft.onBlur : undefined}
      />
      <FieldError msg={draft.error} t={t} />
    </Labeled>
  );
}

function LeadDetail({ t, user, lead, data, onBack, updateLead, addNote, moveLead, reload, updateData, onOpenTask, onNotify, goCrmView }) {
  const { tr } = useUiT();
  const { theme } = useTheme();
  const [note, setNote] = useState("");
  const [erasing, setErasing] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [detailTab, setDetailTab] = useState<"card" | "history">("card");
  const [blocksLayoutMode, setBlocksLayoutMode] = useState(false);
  const [cardBlocks, setCardBlocks] = useState<LeadCardBlock[]>(() => normalizeLeadCardBlocks(data.leadCardBlocks));
  const canErase = hasPermission(user, "leads.erase") && !lead.erasedAt;
  const canExport = hasPermission(user, "leads.export") && !lead.erasedAt;
  const canLayout = hasPermission(user, "fields.manage");
  const userDealManagerId = data.dealManagers.find((r) => r.userId === user?.id)?.id ?? null;
  const canEdit = canEditLead(user, lead, userDealManagerId);
  const canAssign = canAssignLead(user);
  const stage = data.stages.find((s) => s.id === lead.status);
  const employees = data.employees || [];
  const responsibleMember = leadResponsibleMember(lead, employees, data.dealManagers);
  const watcherList = uniqueWatcherMembers(employees, lead.watchers);
  const sIdx = data.stages.findIndex((s) => s.id === lead.status);

  const patchLead = useCallback((patch) => updateLead(lead.id, patch), [lead.id, updateLead]);

  const handleDial = useCallback(async () => {
    if (!lead.phone || dialing) return;
    setDialing(true);
    try {
      const r = await api.dial(lead.phone, lead.id);
      if (r.message && onNotify) onNotify(r.message, lead.id);
      window.dispatchEvent(new Event("crm:calls-refresh"));
      if (r.telUri && !r.callId) window.open(r.telUri, "_self");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDialing(false);
    }
  }, [lead.phone, lead.id, dialing]);

  const nameField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.name,
    onSave: (v) => patchLead({ name: String(v).trim() }),
    validate: (v) => (!String(v).trim() ? tr("nameRequired", undefined, "crm") : null),
  });

  const phoneField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.phone ? formatPhoneDisplay(lead.phone) : "",
    onSave: (v) => patchLead({ phone: v }),
    validate: (v) => {
      if (!String(v).trim()) return tr("phoneRequired", undefined, "crm");
      if (!isValidRuPhone(v)) return `Формат: ${PHONE_FORMAT_HINT}`;
      return null;
    },
    immediate: false,
  });

  const emailField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.email || "",
    onSave: (v) => patchLead({ email: String(v).trim() || null }),
    validate: (v) => {
      const s = String(v).trim();
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return tr("invalidEmail", undefined, "crm");
      return null;
    },
    immediate: false,
  });

  const regionField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.region || "",
    onSave: (v) => patchLead({ region: String(v).trim() || null }),
  });

  const commentField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.comment || "",
    onSave: (v) => patchLead({ comment: String(v) }),
    debounceMs: 600,
  });

  async function saveFieldLayout(cardLayout, fieldsWithGrid) {
    const [fieldsSaved, layoutSaved] = await Promise.all([
      persistFields(fieldsWithGrid),
      persistCardLayout(cardLayout),
    ]);
    updateData({ fields: fieldsSaved, cardLayout: layoutSaved });
  }

  useEffect(() => {
    setCardBlocks(normalizeLeadCardBlocks(data.leadCardBlocks));
  }, [data.leadCardBlocks]);

  async function saveCardBlocks(next: LeadCardBlock[]) {
    setCardBlocks(next);
    if (!canLayout) return;
    const saved = await persistLeadCardBlocks(next);
    updateData({ leadCardBlocks: saved });
  }

  function blockVisible(block: LeadCardBlock) {
    if (block.type === "edo") return hasPermission(user, "edo.view");
    if (block.type === "legal") return hasPermission(user, "legal.view");
    if (block.type === "deal") return hasPermission(user, "resources.view");
    if (block.type === "mail") return hasPermission(user, "mail.view");
    return true;
  }

  function renderLeadBlock(block: LeadCardBlock) {
    if (block.type === "custom") return null;
    const wrap = (children: React.ReactNode) => (
      <div className={`rounded-2xl p-5 bio-card ${t.surface}`}>{children}</div>
    );
    if (block.type === "tasks") {
      return wrap(<LeadTasksBlock t={t} leadId={lead.id} tasks={data.tasks} allTasks={data.tasks} dealManagers={data.dealManagers} leads={data.leads} user={user} updateData={updateData} onOpenTask={onOpenTask} />);
    }
    if (block.type === "edo") {
      return wrap(<LeadDocumentsPanel t={t} user={user} Btn={Btn} TInput={TInput} Labeled={Labeled} initialLeadId={lead.id} compact />);
    }
    if (block.type === "legal") {
      return wrap(<LeadEntitiesPanel t={t} user={user} Btn={Btn} TInput={TInput} Labeled={Labeled} initialLeadId={lead.id} compact />);
    }
    if (block.type === "deal") {
      return wrap(<LeadResourcesPanel t={t} user={user} pipelines={data.pipelines} Btn={Btn} TInput={TInput} Labeled={Labeled} initialLeadId={lead.id} compact />);
    }
    if (block.type === "calls") {
      return wrap(
        <LeadCallHistory t={t} user={user} leadId={lead.id} phone={lead.phone} sidebar onDial={handleDial} dialing={dialing} />,
      );
    }
    if (block.type === "mail") {
      return wrap(<LeadMailPanel t={t} user={user} Btn={Btn} initialLeadId={lead.id} onOpenMail={() => goCrmView("mail")} />);
    }
    if (block.type === "notes") {
      return wrap(
        <>
          <h3 className="font-semibold flex items-center gap-2 text-sm mb-3"><MessageSquare className="w-4 h-4 text-teal-600" /> Заметки</h3>
          <div className="space-y-2.5 mb-4 max-h-[min(70vh,32rem)] overflow-y-auto nice-scroll">
            {lead.notes.length === 0 && <p className={`text-sm ${t.muted}`}>Пока нет записей.</p>}
            {lead.notes.map((n) => (
              <div key={n.id} style={bioNoteStyle(stage?.color)} className="crm-data">
                <p className={`text-sm ${t.subtle}`}>{n.text}</p>
                <p className={`text-xs ${t.muted} mt-0.5`}>{n.author} · {new Date(n.date).toLocaleString("ru-RU")}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <>
                <TInput t={t} value={note} onChange={setNote} placeholder="Итог звонка, договорённости…"
                  onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { addNote(lead.id, note.trim()); setNote(""); } }} />
                <Btn t={t} onClick={() => { if (note.trim()) { addNote(lead.id, note.trim()); setNote(""); } }}><Send className="w-4 h-4" /></Btn>
              </>
            ) : (
              <p className={`text-xs ${t.muted}`}>Добавлять записи могут ответственный и пользователи с правом редактирования сделок.</p>
            )}
          </div>
        </>,
      );
    }
    return null;
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <button onClick={onBack} className={`inline-flex items-center gap-1 text-sm py-1 ${t.muted} hover:text-teal-500`}><ChevronLeft className="w-4 h-4" /> {tr("back", undefined, "common")}</button>
      <div className="flex flex-wrap gap-1.5 py-1">
        {data.stages.map((s, i) => {
          const active = i === sIdx, done = i < sIdx;
          const btnStyle = stagePipelineStyle(s.color, active, done, theme.colorMode);
          if (!canEdit) {
            return (
              <span key={s.id} title={s.label}
                className="bio-stage-pipeline shrink-0 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap"
                style={btnStyle}>
                {s.label}
              </span>
            );
          }
          return (
            <button key={s.id} onClick={() => moveLead(lead.id, s.id)} title={s.label}
              className="bio-stage-pipeline shrink-0 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap hover:scale-[1.01] active:scale-[0.99]"
              style={btnStyle}>
              {s.label}
            </button>
          );
        })}
      </div>
      <div className={`rounded-2xl bio-card p-3 md:p-4 flex flex-col lg:flex-row gap-4 ${t.surface}`}>
        <LeadAssignSection
          t={t}
          label={tr("assignee", undefined, "crm")}
          icon={User}
          assignedMembers={responsibleMember ? [responsibleMember] : []}
          pickPool={employees.filter((m) => !(lead.watchers || []).includes(m.id))}
          editable={canAssign}
          onAdd={canAssign ? (id) => updateLead(lead.id, { assignedUserId: id }) : undefined}
          onRemove={canAssign ? () => updateLead(lead.id, { assignedUserId: null, assignedDealManagerId: null }) : undefined}
        />
        <LeadAssignSection
          t={t}
          label={tr("watchers", undefined, "crm")}
          icon={Eye}
          assignedMembers={watcherList}
          pickPool={employees.filter((m) => m.id !== responsibleMember?.id)}
          multiple
          editable={canAssign}
          onAdd={canAssign ? (id) => updateLead(lead.id, { watchers: [...new Set([...(lead.watchers || []), id])] }) : undefined}
          onRemove={canAssign ? (id) => updateLead(lead.id, { watchers: (lead.watchers || []).filter((w) => w !== id) }) : undefined}
        />
      </div>
      <div className={`inline-flex gap-1 p-1 rounded-2xl bio-card ${t.surface}`}>
        {([
          { id: "card" as const, label: tr("tabCard", undefined, "crm"), icon: Building2 },
          { id: "history" as const, label: tr("tabHistory", undefined, "crm"), icon: ScrollText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDetailTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
              detailTab === id ? "bio-tab-active" : `${t.muted} ${t.hover}`
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
      {detailTab === "history" ? (
        <LeadHistoryTab
          t={t}
          leadId={lead.id}
          createdAt={lead.createdAt}
          createdBy={lead.createdBy}
        />
      ) : (
      <>
      {canLayout && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setBlocksLayoutMode((v) => !v)}
            className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${
              blocksLayoutMode ? "bg-teal-600 text-white border-teal-500/40" : `${t.border} ${t.muted} ${t.hover}`
            }`}
          >
            {blocksLayoutMode ? "Готово" : "Раскладка блоков"}
          </button>
        </div>
      )}
      <div
        className={`rounded-2xl overflow-hidden bio-status-panel bio-status-panel--strong ${t.surface}`}
        style={stage ? entityCardAccentVars(stage.color, true, theme.colorMode) : undefined}
      >
        <div className="grid lg:grid-cols-3 gap-4 p-3 md:p-4">
        <div className="lg:col-span-2 space-y-4">
          <div className={`rounded-2xl p-3 md:p-5 bio-card ${t.surface}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {canEdit ? (
                  <>
                    <div className="text-lg md:text-xl font-bold">
                      <TInput t={t} value={nameField.value} onChange={nameField.setValue} onBlur={nameField.onBlur} placeholder={tr("clientName", undefined, "crm")} />
                      <FieldError msg={nameField.error} t={t} />
                    </div>
                    <div className="mt-1">
                      <TInput t={t} type="tel" inputMode="tel" value={phoneField.value}
                        onChange={(v) => phoneField.setValue(formatPhoneInput(v))}
                        onBlur={phoneField.onBlur}
                        placeholder={PHONE_FORMAT_HINT} />
                      <FieldError msg={phoneField.error} t={t} />
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg md:text-xl font-bold truncate crm-data">{lead.name}</h2>
                    <button type="button" onClick={() => void handleDial()} disabled={dialing}
                      className="text-teal-600 font-medium inline-flex items-center gap-1.5 mt-1 hover:underline crm-data">
                      <Phone className="w-4 h-4" /> {lead.phone}
                    </button>
                  </>
                )}
              </div>
              {stage && <Stage stageId={stage.id} stages={[stage]} />}
            </div>
            {lead.createdAt && (
              <p className={`text-xs ${t.muted} mb-3 crm-data`}>
                Создана {new Date(lead.createdAt).toLocaleString("ru-RU")}
                {lead.createdBy ? ` · ${lead.createdBy}` : ""}
              </p>
            )}
            <LeadCardFieldsGrid
              t={t}
              fields={data.fields}
              cardLayout={data.cardLayout}
              hiddenCardFields={data.hiddenCardFields}
              editable={canLayout}
              onSaveLayout={saveFieldLayout}
              renderBuiltin={(key) => {
                if (key === "email") {
                  if (canEdit) return (
                    <Labeled label="Email" t={t}>
                      <TInput t={t} type="email" value={emailField.value} onChange={emailField.setValue} onBlur={emailField.onBlur} placeholder="name@example.ru" />
                      <FieldError msg={emailField.error} t={t} />
                    </Labeled>
                  );
                  return <Info icon={Mail} label="Email" value={lead.email || "—"} t={t} />;
                }
                if (key === "region") {
                  if (canEdit) return (
                    <Labeled label="Регион" t={t}>
                      <TInput t={t} value={regionField.value} onChange={regionField.setValue} onBlur={regionField.onBlur} />
                      <FieldError msg={regionField.error} t={t} />
                    </Labeled>
                  );
                  return <Info icon={MapPin} label="Регион" value={lead.region || "—"} t={t} />;
                }
                if (key === "preferredTime") {
                  if (canEdit) return <Labeled label="Удобное время" t={t}><GlassPreferredTimePicker value={lead.preferredTime || ""} onChange={(v) => patchLead({ preferredTime: v })} /></Labeled>;
                  return <Info icon={Clock} label="Удобное время" value={formatPreferredTimeDisplay(lead.preferredTime)} t={t} />;
                }
                return <Info icon={Globe} label="Канал" value={(data.channels.find((c) => c.id === lead.channelId) || {}).name || "—"} t={t} />;
              }}
              renderCustom={(f) => (
                canEdit ? (
                  <LeadCustomFieldEditor field={f} lead={lead} data={data} t={t} patchLead={patchLead} />
                ) : (
                  <Labeled label={f.label} t={t}>
                    <div className={`text-sm ${t.subtle} py-2 crm-data`}>{(lead.custom || {})[f.id] || "—"}</div>
                  </Labeled>
                )
              )}
            />
            {lead.erasedAt && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">ПДн обезличены {new Date(lead.erasedAt).toLocaleString("ru-RU")} (152-ФЗ)</p>}
            {canEdit ? (
              <Labeled label="Комментарий" t={t}>
                <textarea value={commentField.value} onChange={(e) => commentField.setValue(e.target.value)} onBlur={commentField.onBlur}
                  rows={3} className={`crm-data w-full rounded-xl border px-3 py-2 text-sm ${t.border} ${t.surface} ${t.subtle}`} />
                <FieldError msg={commentField.error} t={t} />
              </Labeled>
            ) : lead.comment && (
              <div className={`mt-4 rounded-2xl p-3 text-sm ${t.soft} ${t.subtle} shadow-inner crm-data`}>{lead.comment}</div>
            )}
            {(canExport || canErase) && (
              <div className="mt-4 pt-4 flex flex-wrap gap-2">
                <div className="bio-divide w-full mb-2" />
                {canExport && (
                  <Btn t={t} variant="soft" className="text-sm" onClick={async () => {
                    try { await api.exportLead(lead.id); } catch (e) { alert((e as Error).message); }
                  }}><Download className="w-4 h-4" /> Выгрузить ПДн</Btn>
                )}
                {canErase && !lead.pdConsentRevoked && (
                  <Btn t={t} variant="ghost" className="text-sm" onClick={async () => {
                    if (!confirm("Отозвать согласие и обезличить данные?")) return;
                    try { await api.revokeLeadConsent(lead.id, true); reload(); onBack(); } catch (e) { alert((e as Error).message); }
                  }}>Отозвать согласие</Btn>
                )}
                {canErase && (
                  <Btn t={t} variant="danger" className="text-sm" onClick={async () => {
                    if (!confirm("Обезличить персональные данные лида? Действие необратимо.")) return;
                    setErasing(true);
                    try { await api.eraseLead(lead.id); reload(); onBack(); } catch (e) { alert((e as Error).message); }
                    finally { setErasing(false); }
                  }}><Eraser className="w-4 h-4" /> {erasing ? "…" : "Обезличить ПДн"}</Btn>
                )}
              </div>
            )}
          </div>
          <LeadCardSectionLayout
            t={t}
            column="main"
            blocks={cardBlocks}
            layoutMode={blocksLayoutMode}
            canEdit={canLayout}
            onChange={(next) => void saveCardBlocks(next)}
            isBlockVisible={blockVisible}
            renderBlock={renderLeadBlock}
          />
        </div>
        <div className={`rounded-2xl p-4 md:p-5 bio-card ${t.surface} lg:sticky lg:top-4 lg:self-start space-y-4`}>
          <LeadCardSectionLayout
            t={t}
            column="sidebar"
            blocks={cardBlocks}
            layoutMode={blocksLayoutMode}
            canEdit={canLayout}
            onChange={(next) => void saveCardBlocks(next)}
            isBlockVisible={blockVisible}
            renderBlock={renderLeadBlock}
          />
        </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
function Info({ icon: Icon, label, value, t }) {
  return <div className="flex items-start gap-2"><Icon className={`w-4 h-4 ${t.muted} mt-0.5`} /><div><div className={`text-xs ${t.muted}`}>{label}</div><div className={`${t.subtle} crm-data`}>{value}</div></div></div>;
}

