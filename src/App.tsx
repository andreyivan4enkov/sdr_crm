import { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { storageGet, storageSet } from "./storage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useCrmData, persistLeadUpdate, persistNewLead, persistStages, persistPipelines, persistFields, persistCardLayout, persistChannels } from "./hooks/useCrmData";
import { useLeadFieldDraft } from "./hooks/useLeadFieldDraft";
import { formatPhoneInput, formatPhoneDisplay, isValidRuPhone, PHONE_FORMAT_HINT } from "./lib/phone";
import { useCrmNavStack } from "./hooks/useCrmNavStack";
import { useIsMobile } from "./hooks/useMediaQuery";
import { useSwipeBack } from "./hooks/useSwipeBack";
import { useSse } from "./hooks/useSse";
import { useAutoRefresh } from "./hooks/useAutoRefresh";
import { api, hasPermission, normalizeLead, canEditLead, canAssignLead } from "./api/client";
import { RegisterPage } from "./views/RegisterPage";
import { PrivacyPage } from "./views/PrivacyPage";
import { AdminAudit } from "./views/admin/AdminAudit";
import { SettingsHub, canAccessSettings } from "./views/SettingsHub";
import { AnalyticsPage } from "./views/AnalyticsPage";
import { TasksPage, LeadTasksBlock } from "./views/TasksPage";
import { CallsPage, LeadCallHistory } from "./components/LeadCallHistory";
import { MobileCrmNav } from "./components/MobileCrmNav";
import { MobileMoreSheet } from "./components/MobileMoreSheet";
import { CrmNavSidebar } from "./components/CrmNavSidebar";
import { MobileInstallGuide } from "./components/MobileInstallGuide";
import { LeadCardFieldsGrid } from "./components/LeadCardFieldsGrid";
import { LeadAssignSection } from "./components/LeadPeoplePicker";
import { LeadHistoryTab } from "./components/LeadHistoryTab";
import { LeadsListView } from "./components/LeadsListView";
import { GlassDatePicker, GlassDateTimePicker, GlassPreferredTimePicker, formatPreferredTimeDisplay } from "./components/GlassDrumPicker";
import { EmployeeAvatar, EmployeeChip } from "./components/EmployeeChip";
import { leadResponsibleMember, uniqueWatcherMembers } from "./lib/team-members";
import { TeamPage } from "./views/TeamPage";
import { getTokens, loadThemePrefs, topBarBg, type ColorMode, type ThemeState } from "./theme";
import { buildCrmNav, CRM_NAV_LABELS, NAV_LAYOUT_KEY, type NavLayout } from "./lib/crm-nav";
import {
  getStoredPipelineId, setStoredPipelineId, resolveActivePipeline,
  stagesForPipeline, leadsForPipeline,
} from "./lib/crm-pipelines";
import {
  STAGE_COLORS, harmonyHint, recommendStageColor, stageHex, stagePillStyle, statusContourStyle,
  stagePipelineStyle, bioNoteStyle,
} from "./lib/stage-colors";
import {
  Phone, Users, LogOut, Search, Plus, ChevronLeft, MapPin, Clock, MessageSquare,
  Send, Building2, TrendingUp, Shield, Headphones, CheckCircle2, X, Trash2, UserPlus,
  PhoneCall, Sun, Moon, Bell, Columns, Tag, Type, Hash, Banknote, MapPinned,
  CalendarClock, Calendar, User, Zap, Plug, GripVertical, ListTodo, Check, Pencil, Globe, Eye,
  Megaphone, MessageCircle, Link2, Settings, List, BarChart3, SlidersHorizontal, ExternalLink,
  ScrollText, Eraser, Download, PanelLeft, Menu, GitBranch, ArrowRightLeft, Copy, Mail,
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
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { user, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname.startsWith("/crm") ? "crm" : "auth";
  const { data, loading: dataLoading, reload, reloadSilent, updateData, setData } = useCrmData(!!user);
  const [theme, setTheme] = useState<ThemeState>({ colorMode: "light", brandOn: false });
  const [notifs, setNotifs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [crmView, setCrmView] = useState("crm");
  const [crmSub, setCrmSub] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "list" : "kanban",
  );
  const [selectedId, setSelectedId] = useState(null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "pipelines" | "fields" | "channels" | "roles" | "notifications" | "security" | "backup" | undefined>();
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null);
  const [navLayout, setNavLayout] = useState<NavLayout>("horizontal");
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const taskId = params.get("task");
    const leadId = params.get("lead");
    if (taskId) {
      setCrmView("tasks");
      setTaskFocusId(taskId);
    }
    if (leadId) {
      setCrmView("crm");
      setSelectedId(leadId);
    }
  }, [location.search]);

  function goCrmView(v: string, tab?: typeof settingsTab) {
    if (v === "users") v = "team";
    navStack.clearStack();
    if (v === "integrations" || v === "channels") {
      setCrmView("settings");
      setSettingsTab("channels");
    } else if (v === "roles") {
      setCrmView("settings");
      setSettingsTab("roles");
    } else if (v === "settings") {
      setCrmView("settings");
      setSettingsTab(tab);
    } else {
      setCrmView(v);
      setSettingsTab(undefined);
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
    void loadThemePrefs(storageGet).then(setTheme);
    void storageGet(NAV_LAYOUT_KEY).then((v) => {
      if (v === "horizontal" || v === "vertical") setNavLayout(v);
    });
  }, []);

  const t = getTokens(theme);

  function setColorMode(colorMode: ColorMode) {
    setTheme((prev) => {
      const next = { ...prev, colorMode };
      void storageSet("jbr:colorMode", colorMode);
      return next;
    });
  }
  function toggleBrand() {
    setTheme((prev) => {
      const next = { ...prev, brandOn: !prev.brandOn };
      void storageSet("jbr:brand", next.brandOn ? "1" : "0");
      return next;
    });
  }
  function setNavLayoutPref(layout: NavLayout) {
    setNavLayout(layout);
    void storageSet(NAV_LAYOUT_KEY, layout);
    if (layout === "horizontal") setNavDrawerOpen(false);
  }

  const crmNav = useMemo(() => buildCrmNav(user), [user]);

  useSse(!!user, (event, payload) => {
    if (event === "notification") {
      const p = payload as { text: string; leadId?: string; taskId?: string };
      notify(p.text, p.leadId, true, p.taskId);
      void reloadSilent();
    }
    if (event === "incoming_call") {
      const p = payload as { phone: string; lead?: { name: string; id?: string }; event?: string };
      const label = p.event === "outgoing_call" ? "Исходящий" : "Входящий";
      notify(`${label} звонок: ${p.phone}${p.lead ? ` (${p.lead.name})` : ""}`, p.lead?.id);
      window.dispatchEvent(new Event("crm:calls-refresh"));
    }
    if (event === "call_transcript") {
      const p = payload as { call?: { phone: string }; leadId?: string };
      notify(`Расшифровка готова: ${p.call?.phone || "звонок"}`, p.leadId);
      window.dispatchEvent(new Event("crm:calls-refresh"));
      void reloadSilent();
    }
    if (event === "call_recording") {
      const p = payload as { text?: string; leadId?: string };
      if (p.text) notify(p.text, p.leadId);
      window.dispatchEvent(new Event("crm:calls-refresh"));
    }
    if (event === "lead_created") {
      const p = payload as { lead?: import("@jbrealty/api-client").Lead };
      if (p.lead) {
        const lead = normalizeLead(p.lead);
        setData((d) => d ? { ...d, leads: [lead, ...d.leads.filter((l) => l.id !== lead.id)] } : d);
        notify(`Новая заявка: ${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`, lead.id);
      }
      void reloadSilent();
    }
    if (event === "lead_updated") {
      const p = payload as { lead?: import("@jbrealty/api-client").Lead };
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

  useAutoRefresh(!!user && location.pathname.startsWith("/crm"), reloadSilent);

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

  async function addLead(input, source, channelId) {
    const siteCh = data?.channels.find((c) => c.name === "Форма на сайте") || data?.channels[0];
    const lead = await persistNewLead({
      ...input, source, channelId: channelId || siteCh?.id,
      createdBy: source === "form" ? "Форма с лендинга" : `Звонок 8-800 (${user?.name || ""})`,
    });
    setData((d) => d ? { ...d, leads: [lead, ...d.leads] } : d);
  }
  async function moveLead(leadId, stageId) {
    let rollback;
    setData((d) => {
      if (!d) return d;
      rollback = d.leads.find((l) => l.id === leadId);
      return {
        ...d,
        leads: d.leads.map((l) => (l.id === leadId ? { ...l, status: stageId } : l)),
      };
    });
    try {
      const lead = await persistLeadUpdate(leadId, { statusId: stageId });
      setData((d) => d ? { ...d, leads: d.leads.map((l) => l.id === leadId ? lead : l) } : d);
    } catch (e) {
      if (rollback) {
        const prev = rollback;
        setData((d) => d ? { ...d, leads: d.leads.map((l) => (l.id === leadId ? prev : l)) } : d);
      } else {
        void reloadSilent();
      }
      throw e;
    }
  }
  async function updateLead(id, patch) {
    const apiPatch = { ...patch };
    if (patch.status) { apiPatch.statusId = patch.status; delete apiPatch.status; }
    try {
      const lead = await persistLeadUpdate(id, apiPatch);
      setData((d) => d ? { ...d, leads: d.leads.map((l) => l.id === id ? lead : l) } : d);
      return lead;
    } catch (e) {
      pushToast((e as Error).message || "Не удалось сохранить изменения");
      throw e;
    }
  }
  async function addNote(id, text) {
    await api.addNote(id, text);
    reload();
  }
  async function updateDataAsync(patch) {
    if (patch.pipelines) { const p = await persistPipelines(patch.pipelines); updateData({ pipelines: p }); return; }
    if (patch.stages) { const s = await persistStages(patch.stages); updateData({ stages: s }); return; }
    if (patch.fields) { const f = await persistFields(patch.fields); updateData({ fields: f }); return; }
    if (patch.channels) { const c = await persistChannels(patch.channels); updateData({ channels: c }); return; }
    if (patch.tasks) {
      updateData({ tasks: patch.tasks });
      return;
    }
    if (patch.realtors) {
      updateData(patch);
      reload();
      return;
    }
    updateData(patch);
  }

  const scrollCss = `
    .nice-scroll::-webkit-scrollbar{height:10px;width:10px}
    .nice-scroll::-webkit-scrollbar-track{background:transparent}
    .nice-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:9999px;border:3px solid transparent;background-clip:padding-box}
    .nice-scroll::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,.65);background-clip:padding-box}
    .nice-scroll{scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.4) transparent}
  `;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-slate-400 text-sm">Загрузка…</div>;

  return (
    <div data-crm-app data-brand={theme.brandOn ? "true" : undefined} data-color-mode={theme.colorMode} className={`min-h-screen transition-colors duration-300 overflow-x-hidden max-w-full ${t.app} ${t.text}`}>
      <style>{scrollCss}</style>
      <TopBar t={t} theme={theme} scrolled={scrolled} mode={mode} user={user}
        onLogout={async () => { await logout(); navigate("/login"); }}
        setColorMode={setColorMode} toggleBrand={toggleBrand} notifs={notifs} setNotifs={setNotifs} openLead={openLead} openTask={openTask}
        crmView={crmView} setCrmView={goCrmView} nav={crmNav} navLayout={navLayout} setNavLayout={setNavLayoutPref}
        onOpenNavDrawer={() => setNavDrawerOpen(true)}
        navigate={navigate} />

      <div className="crm-app-shell">
      <Routes>
        <Route path="/" element={user ? <Navigate to="/crm" replace /> : <Navigate to="/login" replace />} />
        <Route path="/privacy" element={<PrivacyPage t={t} />} />
        <Route path="/login" element={user ? <Navigate to="/crm" replace /> : <Login t={t} onSuccess={() => navigate("/crm")} />} />
        <Route path="/register" element={<RegisterPage t={t} Btn={Btn} TInput={TInput} Labeled={Labeled} />} />
        <Route path="/crm" element={
          user ? (
            dataLoading && !data ? <div className={`p-8 text-center text-sm text-slate-400 ${navLayout === "vertical" ? "pb-8" : "pb-24 md:pb-8"}`}>Загрузка CRM…</div>
              : !data ? <div className={`p-8 text-center text-sm text-rose-500 ${navLayout === "vertical" ? "pb-8" : "pb-24 md:pb-8"}`}>Не удалось загрузить данные. <button type="button" className="underline ml-1" onClick={() => reload()}>Повторить</button></div>
              : <div className={`flex flex-col min-h-[calc(100dvh-var(--crm-header-h)-var(--crm-mobile-nav-h))] md:min-h-[calc(100dvh-6.25rem)] w-full min-w-0 max-w-full overflow-x-hidden ${
                  navLayout === "vertical" ? "md:pl-56 pb-0" : "pb-[calc(var(--crm-mobile-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
                }`}><Crm t={t} user={user} data={data}
                crmView={crmView} crmSub={crmSub} setCrmSub={setCrmSub}
                selectedId={selectedId} setSelectedId={setSelectedId}
                settingsMode={settingsMode} setSettingsMode={setSettingsMode}
                moveLead={moveLead} updateLead={updateLead} addNote={addNote} addLead={addLead}
                updateData={updateDataAsync} reload={reload} settingsTab={settingsTab} goCrmView={goCrmView}
                taskFocusId={taskFocusId} setTaskFocusId={setTaskFocusId}
                onOpenTask={openTask} onOpenLead={navStack.navigateToLead}
                navigateBack={navStack.navigateBack} /></div>
          ) : <Navigate to="/login" />
        } />
      </Routes>
      </div>

      {mode === "crm" && user && (
        <>
          {navLayout === "horizontal" && (
            <>
              <MobileCrmNav crmView={crmView} setCrmView={goCrmView} onMore={() => setMobileMoreOpen(true)} t={t} />
              <MobileMoreSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)} crmView={crmView} setCrmView={goCrmView} user={user} t={t} />
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
    </div>
  );
}

function TopBar({ t, theme, scrolled, mode, user, onLogout, setColorMode, toggleBrand, notifs, setNotifs, openLead, openTask, crmView, setCrmView, nav, navLayout, setNavLayout, onOpenNavDrawer, navigate }) {
  const [bell, setBell] = useState(false);
  const isMobile = useIsMobile();
  const unread = notifs.filter((n) => !n.read).length;
  const bg = topBarBg(theme, scrolled);

  return (
    <div className={`fixed md:sticky top-0 inset-x-0 z-40 w-full max-w-full backdrop-blur-md border-b transition-all duration-300 overflow-hidden ${t.border} ${bg}`}>
      <div className="w-full max-w-full px-2 sm:px-3 md:px-4 min-h-12 md:min-h-14 py-1 flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1 shrink-0 min-w-0 overflow-hidden">
          {mode === "crm" && user && navLayout === "vertical" && (
            <button
              type="button"
              title="Открыть меню"
              onClick={onOpenNavDrawer}
              className={`md:hidden w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${t.hover}`}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            title="На главную CRM"
            onClick={() => {
              if (mode === "crm" && user) setCrmView("crm");
              else navigate(user ? "/crm" : "/login");
            }}
            className="flex items-center gap-1.5 min-w-0 rounded-lg -ml-1 px-1 py-0.5 transition hover:opacity-90 active:scale-[0.98] overflow-hidden max-w-[52vw] sm:max-w-none"
          >
            <img
              src="/icons/logo-full.png"
              alt="JB Realty"
              className="h-8 sm:h-10 md:h-12 w-auto max-h-[2.5rem] sm:max-h-[3rem] object-contain object-center shrink-0 dark:brightness-0 dark:invert"
              draggable={false}
            />
            <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
              <span className="hidden sm:inline font-bold text-sm md:text-base tracking-tight truncate">JBrealty</span>
              <span className={`text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${t.chip}`}>
                {isMobile && mode === "crm" ? (CRM_NAV_LABELS[crmView] || "CRM") : "CRM"}
              </span>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
          {mode === "crm" && user && (
            <button
              type="button"
              title={`${user.name || user.login} — мой профиль`}
              onClick={() => setCrmView("settings")}
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
            <div className="relative">
              <button onClick={() => { setBell(!bell); if (!bell) setNotifs((n) => n.map((x) => ({ ...x, read: true }))); }}
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 ${t.hover}`}>
                <Bell className="w-4 h-4" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500" />}
              </button>
              {bell && (
                <div className={`absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border shadow-xl overflow-hidden ${t.surface} ${t.border}`}>
                  <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border}`}>Уведомления</div>
                  <div className={`max-h-80 overflow-y-auto nice-scroll divide-y ${t.divide}`}>
                    {notifs.length === 0 && <p className={`px-4 py-6 text-sm text-center ${t.muted}`}>Пока пусто.</p>}
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
                title={navLayout === "vertical" ? "Горизонтальное меню" : "Вертикальное меню слева"}
                onClick={() => setNavLayout(navLayout === "vertical" ? "horizontal" : "vertical")}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
                  navLayout === "vertical" ? `${t.surface} shadow-sm text-teal-500` : t.muted
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
            <button type="button" title="Дневная тема" onClick={() => setColorMode("light")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.colorMode === "light" ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button type="button" title="Ночная тема" onClick={() => setColorMode("dark")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.colorMode === "dark" ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button type="button" title={theme.brandOn ? "Выключить корпоративные цвета" : "Включить корпоративные цвета JB Realty"} onClick={toggleBrand}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${theme.brandOn ? `${t.surface} shadow-sm text-teal-500` : t.muted}`}>
              <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {mode === "crm" && user && (
            <button onClick={onLogout} title="Выйти" className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition shrink-0 ${t.hover} ${t.muted} hover:text-rose-500`}>
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
function Btn({ children, onClick, variant = "primary", t, className = "" }) {
  const styles = {
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    soft: `${t.chip} ${t.hover}`,
    ghost: `border ${t.border} ${t.hover}`,
    danger: "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10",
  };
  return <button onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium transition shadow-sm ${styles[variant]} ${className}`}>{children}</button>;
}
function Stage({ stage }) {
  const hex = stageHex(stage.color);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
      {stage.label}
    </span>
  );
}

const DEMO_META = [
  { login: "manager", name: "Руководитель", icon: BarChart3, desc: "Все сделки и команда" },
  { login: "operator", name: "Оператор", icon: Headphones, desc: "Свои назначенные сделки" },
  { login: "marketer", name: "Маркетолог", icon: Megaphone, desc: "Реклама и каналы" },
  { login: "integrator", name: "Интегратор", icon: Plug, desc: "CRM и приглашения" },
  { login: "admin", name: "Администратор", icon: Shield, desc: "Полный доступ" },
];

/* ---------- LOGIN ---------- */
function Login({ t, onSuccess }) {
  const { login: doLogin } = useAuth();
  const [login, setLogin] = useState(""); const [pass, setPass] = useState(""); const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [err, setErr] = useState("");
  const [demoLogin, setDemoLogin] = useState(false);
  const [demoUsers, setDemoUsers] = useState<{ login: string; password: string; name: string }[]>([]);
  useEffect(() => {
    api.getAuthConfig().then((r) => {
      setDemoLogin(r.demoLogin);
      if (r.demoUsers?.length) setDemoUsers(r.demoUsers);
    }).catch(() => {});
  }, []);
  async function submitWith(credentials?: { login: string; password: string; totpCode?: string }) {
    const l = credentials?.login ?? login.trim();
    const p = credentials?.password ?? pass.trim();
    const tc = credentials?.totpCode ?? (needsTotp ? totp.trim() : undefined);
    setErr("");
    try {
      const r = await doLogin(l, p, tc);
      if (r.requiresTotp) { setNeedsTotp(true); return; }
      onSuccess();
    } catch (e) {
      const ex = e as Error & { status?: number; data?: { status?: string } };
      if (ex.status === 403 && ex.data?.status === "pending") setErr("Аккаунт ожидает подтверждения администратором");
      else setErr(ex.message || "Неверный логин или пароль");
    }
  }
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className={`rounded-2xl border shadow-sm p-7 ${t.surface} ${t.border}`}>
        <div className="flex items-center gap-2 text-lg font-bold"><Building2 className="w-5 h-5 text-teal-600" /> Вход в CRM</div>
        <div className="mt-5 space-y-3">
          <Labeled label="Логин" t={t}><TInput t={t} value={login} onChange={setLogin} placeholder="operator или admin" /></Labeled>
          <Labeled label="Пароль" t={t}><TInput t={t} type="password" value={pass} onChange={setPass} placeholder="••••" onKeyDown={(e) => e.key === "Enter" && submitWith()} /></Labeled>
          {needsTotp && <Labeled label="Код 2FA" t={t}><TInput t={t} value={totp} onChange={setTotp} placeholder="000000" onKeyDown={(e) => e.key === "Enter" && submitWith()} /></Labeled>}
          {err && <p className="text-sm text-rose-500">{err}</p>}
          <Btn t={t} onClick={() => submitWith()} className="w-full">Войти</Btn>
        </div>
        {demoLogin && demoUsers.length > 0 && (
          <div className={`mt-6 border-t pt-4 ${t.border}`}>
            <p className={`text-xs font-medium ${t.muted} mb-2`}>Демо-доступы (только dev):</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {demoUsers.map((u) => {
                const meta = DEMO_META.find((m) => m.login === u.login) || DEMO_META[0];
                return (
                <button key={u.login} onClick={() => submitWith({ login: u.login, password: u.password })}
                  className={`text-left border rounded-lg p-3 transition ${t.border} ${t.hover}`}>
                  <div className="flex items-center gap-2 font-medium text-sm"><meta.icon className="w-4 h-4 text-teal-600" /> {u.name}</div>
                  <div className={`text-xs ${t.muted} mt-1`}>{meta.desc}</div>
                </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- CRM SHELL ---------- */
function Crm({ t, user, data, crmView, crmSub, setCrmSub, selectedId, setSelectedId, settingsMode, setSettingsMode, moveLead, updateLead, addNote, addLead, updateData, reload, settingsTab, goCrmView, taskFocusId, setTaskFocusId, onOpenTask, onOpenLead, navigateBack }) {
  const selected = data.leads.find((l) => l.id === selectedId) || null;
  const [adding, setAdding] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    setPipelineId(resolveActivePipeline(data.pipelines || [], getStoredPipelineId()));
  }, [data.pipelines]);
  const activePipelineId = pipelineId || resolveActivePipeline(data.pipelines || [], null);
  const shellPad = crmView === "tasks"
    ? "px-2 py-2"
    : "px-2 py-2 sm:px-3 sm:py-3";
  return (
    <div className={`w-full min-w-0 flex-1 flex flex-col ${shellPad}`}>
      {crmView === "crm" && (
        selected ? (
          <LeadDetail t={t} user={user} lead={selected} data={data} onBack={navigateBack} updateLead={updateLead} addNote={addNote} moveLead={moveLead} reload={reload} updateData={updateData} onOpenTask={onOpenTask} onNotify={notify} />
        ) : (
          <div>
            {(data.pipelines?.length > 0) && (
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className={`w-4 h-4 shrink-0 ${t.muted}`} />
                <select
                  value={activePipelineId || ""}
                  onChange={(e) => { setPipelineId(e.target.value); setStoredPipelineId(e.target.value); }}
                  className={`rounded-lg border px-3 py-2 text-sm outline-none focus:border-teal-500 min-w-[10rem] ${t.input}`}
                >
                  {(data.pipelines || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " ★" : ""}</option>
                  ))}
                </select>
                {hasPermission(user, "stages.manage") && (
                  <button type="button" onClick={() => goCrmView("settings", "pipelines")}
                    className={`text-xs ${t.muted} hover:text-teal-600 underline underline-offset-2`}>
                    Управление воронками
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 md:mb-4">
              <div className={`flex items-center gap-1 rounded-lg p-1 ${t.chip} w-full sm:w-auto`}>
                <button onClick={() => setCrmSub("kanban")} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-sm transition ${crmSub === "kanban" ? `${t.surface} shadow-sm font-medium ${t.text}` : t.muted}`}><Columns className="w-4 h-4" /> Канбан</button>
                <button onClick={() => setCrmSub("list")} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-sm transition ${crmSub === "list" ? `${t.surface} shadow-sm font-medium ${t.text}` : t.muted}`}><List className="w-4 h-4" /> Список</button>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {crmSub === "kanban" && hasPermission(user, "stages.manage") && (
                  <button onClick={() => setSettingsMode(!settingsMode)}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${settingsMode ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" : `${t.border} ${t.muted} ${t.hover}`}`}>
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Режим настройки</span>
                    <span className="sm:hidden">Настройка</span>
                  </button>
                )}
                <Btn t={t} variant="soft" className="flex-1 sm:flex-none" onClick={() => setAdding(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Лид со звонка</span>
                  <span className="sm:hidden">+ Лид</span>
                </Btn>
              </div>
            </div>
            {adding && <ManualLead t={t} onCancel={() => setAdding(false)} onSave={(d) => { addLead(d, "phone", "ch_site"); setAdding(false); }} />}
            {crmSub === "kanban"
              ? <Kanban t={t} user={user} data={data} pipelineId={activePipelineId} moveLead={moveLead} updateData={updateData} onOpen={onOpenLead} settingsMode={settingsMode && hasPermission(user, "stages.manage")} isMobile={isMobile} />
              : <LeadsListView t={t} data={data} pipelineId={activePipelineId} onOpen={onOpenLead} />}
          </div>
        )
      )}
      {crmView === "analytics" && <AnalyticsPage t={t} data={data} user={user} StageBadge={Stage} />}
      {crmView === "tasks" && (
        <TasksPage
          t={t}
          data={data}
          user={user}
          updateData={updateData}
          onOpenLead={onOpenLead}
          selectedTaskId={taskFocusId}
          onSelectTask={setTaskFocusId}
          onNavigateBack={navigateBack}
        />
      )}
      {crmView === "calls" && hasPermission(user, "calls.view") && (
        <CallsPage t={t} user={user} onOpenLead={onOpenLead} />
      )}
      {crmView === "team" && <TeamPage t={t} user={user} data={data} reload={reload} Btn={Btn} TInput={TInput} Labeled={Labeled} Sel={Sel} />}
      {crmView === "settings" && (
        <SettingsHub t={t} user={user} data={data} updateData={updateData} reload={reload}
          Btn={Btn} TInput={TInput} Labeled={Labeled} initialTab={settingsTab} />
      )}
      {crmView === "audit" && hasPermission(user, "audit.view") && <AdminAudit t={t} />}
    </div>
  );
}

/* ---------- KANBAN ---------- */
function Kanban({ t, user, data, pipelineId, moveLead, updateData, onOpen, settingsMode, isMobile }) {
  const [dragLead, setDragLead] = useState(null);
  const [dragStage, setDragStage] = useState(null);
  const [over, setOver] = useState(null);
  const [edit, setEdit] = useState(null);
  const pipelineStages = stagesForPipeline(data.stages, pipelineId);
  const [mobileStageId, setMobileStageId] = useState(pipelineStages[0]?.id ?? null);
  const userRealtorId = data.realtors.find((r) => r.userId === user?.id)?.id ?? null;
  const stageIds = useMemo(() => new Set(pipelineStages.map((s) => s.id)), [pipelineStages]);
  const pipelineLeads = leadsForPipeline(data.leads, pipelineId, stageIds);
  const leadsOf = (sid) => pipelineLeads.filter((l) => l.status === sid);
  const canMoveLead = (lead) => canEditLead(user, lead, userRealtorId);

  useEffect(() => {
    if (!pipelineStages.some((s) => s.id === mobileStageId)) {
      setMobileStageId(pipelineStages[0]?.id ?? null);
    }
  }, [pipelineStages, mobileStageId]);

  function saveStage(s) {
    const stage = { ...s, pipelineId: s.pipelineId || pipelineId };
    if (stage.id) updateData({ stages: data.stages.map((x) => x.id === stage.id ? stage : x) });
    else updateData({ stages: [...data.stages, { ...stage, id: uid() }] });
    setEdit(null);
  }
  function deleteStage(id) {
    if (pipelineStages.length <= 1) return;
    const rest = pipelineStages.filter((s) => s.id !== id);
    const otherStages = data.stages.filter((s) => s.pipelineId !== pipelineId);
    const nextStages = [...otherStages, ...rest];
    updateData({
      stages: nextStages,
      leads: data.leads.map((l) => l.status === id ? { ...l, status: rest[0].id } : l),
    });
    setEdit(null);
  }
  function reorder(dragId, targetId) {
    const arr = [...pipelineStages];
    const from = arr.findIndex((s) => s.id === dragId), to = arr.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    const otherStages = data.stages.filter((s) => s.pipelineId !== pipelineId);
    updateData({ stages: [...otherStages, ...arr] });
  }
  function drop(targetId) {
    if (dragStage && dragStage !== targetId) reorder(dragStage, targetId);
    else if (dragLead) {
      const lead = data.leads.find((l) => l.id === dragLead);
      if (lead && canMoveLead(lead)) void moveLead(dragLead, targetId);
    }
    setDragLead(null); setDragStage(null); setOver(null);
  }

  function renderColumn(s: { id: string; label: string; color: string }, mobile = false) {
    const colW = mobile ? "w-full" : "w-72 shrink-0";
    return (
      <div key={s.id}
        onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
        onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
        onDrop={() => drop(s.id)}
        className={`${colW} rounded-2xl ${t.board} ${over === s.id ? "ring-2 ring-teal-400/35" : "ring-0"} transition-[box-shadow,ring-color] duration-200 ease-out`}
        style={statusContourStyle(s.color)}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2 font-medium text-sm">
            {settingsMode && (
              <span draggable onDragStart={() => { setDragStage(s.id); setDragLead(null); }} className={`cursor-grab ${t.muted}`}><GripVertical className="w-4 h-4" /></span>
            )}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageHex(s.color) }} />{s.label}
            <span className={`text-xs ${t.muted}`}>{leadsOf(s.id).length}</span>
          </div>
          {settingsMode && <button onClick={() => setEdit(s)} className={`${t.muted} hover:text-teal-500`}><Pencil className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="px-2 pb-2 space-y-2 min-h-12">
          {leadsOf(s.id).map((l) => {
            const responsible = leadResponsibleMember(l, data.employees || [], data.realtors);
            const editable = canMoveLead(l);
            return (
              <div key={l.id} draggable={!isMobile && editable} onDragStart={(e) => { if (!editable) return; e.stopPropagation(); setDragLead(l.id); setDragStage(null); }} onDragEnd={() => setDragLead(null)}
                onClick={() => onOpen(l.id)}
                className={`rounded-2xl border p-3 h-[5.75rem] flex flex-col cursor-pointer transition-all duration-200 ease-out group ${t.surface} active:scale-[0.99] ${
                  dragLead === l.id ? "opacity-45 scale-[0.98] shadow-none" : "opacity-100 hover:shadow-md"
                }`}
                style={statusContourStyle(s.color)}>
                <div className="flex items-start gap-2 min-h-0 flex-1">
                  {!isMobile && <GripVertical className={`w-4 h-4 ${t.muted} mt-0.5 shrink-0 opacity-0 group-hover:opacity-100`} />}
                  <div className="min-w-0 flex-1 flex flex-col h-full crm-data">
                    <div className="font-medium text-sm truncate leading-snug">{l.name || "Без имени"}</div>
                    <div className={`text-xs ${t.muted} truncate mt-0.5 leading-4`}>{l.phone || "—"}</div>
                    <div className="mt-auto flex items-center gap-1 min-h-[1.375rem] pt-1.5 overflow-hidden">
                      {l.region ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded truncate max-w-[48%] shrink-0 ${t.chip}`}>{l.region}</span>
                      ) : (
                        <span className="flex-1 min-w-0" />
                      )}
                      {responsible && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 ml-auto shrink-0 max-w-[52%]">
                          <EmployeeAvatar member={responsible} size="xs" />
                          <span className="truncate">{responsible.name.split(" ")[0]}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {settingsMode && <p className="text-xs md:text-sm text-teal-600 dark:text-teal-400 mb-3 flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Режим настройки этапов и роботов</p>}

      {isMobile && !settingsMode ? (
        <>
          <div className={`flex gap-1.5 overflow-x-auto nice-scroll pb-2 -mx-0.5 px-0.5`}>
            {pipelineStages.map((s) => (
              <button key={s.id} type="button" onClick={() => setMobileStageId(s.id)}
                className="shrink-0 px-3 py-2 rounded-full text-xs font-medium border transition"
                style={stagePillStyle(s.color, mobileStageId === s.id)}>
                {s.label}
                <span className="ml-1 opacity-80">{leadsOf(s.id).length}</span>
              </button>
            ))}
          </div>
          {pipelineStages.filter((s) => s.id === mobileStageId).map((s) => renderColumn(s, true))}
        </>
      ) : (
        <div className={`flex gap-3 md:gap-4 overflow-x-auto nice-scroll pb-3 ${isMobile ? "snap-x snap-mandatory" : ""}`}>
          {pipelineStages.map((s) => (
            <div key={s.id} className={isMobile ? "snap-center shrink-0 w-[min(85vw,24rem)]" : ""}>
              {renderColumn(s, false)}
            </div>
          ))}
          {settingsMode && (
            <button onClick={() => setEdit({ pipelineId, label: "", color: recommendStageColor(pipelineStages.length, pipelineStages.length + 1), automations: [] })}
              className={`${isMobile ? "w-[min(85vw,24rem)] shrink-0 snap-center" : "w-72 shrink-0"} rounded-xl border-2 border-dashed ${t.border} ${t.muted} hover:text-teal-500 hover:border-teal-400 flex items-center justify-center gap-2 text-sm py-6 transition`}>
              <Plus className="w-4 h-4" /> Добавить этап
            </button>
          )}
        </div>
      )}
      {edit && <StageModal t={t} stage={edit} data={data} pipelineId={pipelineId} onClose={() => setEdit(null)} onSave={saveStage} onDelete={deleteStage} canDelete={pipelineStages.length > 1} />}
    </div>
  );
}

function StageModal({ t, stage, data, pipelineId, onClose, onSave, onDelete, canDelete }) {
  const [s, setS] = useState({ ...stage, automations: stage.automations || [] });
  const localStages = stagesForPipeline(data.stages, pipelineId || stage.pipelineId);
  const stageIndex = stage.id ? localStages.findIndex((x) => x.id === stage.id) : localStages.length;
  const totalStages = localStages.length + (stage.id ? 0 : 1);
  const recommended = recommendStageColor(stageIndex, totalStages);
  const hint = harmonyHint(stageIndex, totalStages);
  const connected = data.channels.filter((c) => c.connected);
  const authors = ["Система", ...data.realtors.map((r) => r.name)];
  const fieldOptions = [
    { key: "name", label: "Имя" },
    { key: "phone", label: "Телефон" },
    { key: "email", label: "Email" },
    { key: "region", label: "Регион" },
    { key: "preferredTime", label: "Удобное время" },
    { key: "comment", label: "Комментарий" },
    ...data.fields.map((f) => ({ key: f.id, label: f.label })),
  ];
  function addAuto() { setS({ ...s, automations: [...s.automations, { id: uid(), type: "notify", author: "Система", recipient: "Ответственный", text: "" }] }); }
  function upd(id, patch) { setS({ ...s, automations: s.automations.map((a) => a.id === id ? { ...a, ...patch } : a) }); }
  function del(id) { setS({ ...s, automations: s.automations.filter((a) => a.id !== id) }); }
  function recipientOptions(type) {
    if (type === "reply") return ["Клиент"];
    if (type === "task" || type === "assign") return ["Ответственный", ...data.realtors.map((r) => r.name)];
    return ["Ответственный", "Все", ...data.realtors.map((r) => r.name)];
  }
  function stagesInPipeline(pid) {
    return stagesForPipeline(data.stages, pid);
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-lg rounded-2xl border shadow-2xl ${t.surface} ${t.border} max-h-[88vh] overflow-y-auto nice-scroll`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.border} sticky top-0 ${t.surface}`}>
          <h3 className="font-semibold">{stage.id ? "Настройка этапа" : "Новый этап"}</h3>
          <button onClick={onClose} className={t.muted}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <Labeled label="Название этапа" t={t}><TInput t={t} value={s.label} onChange={(v) => setS({ ...s, label: v })} placeholder="Например, Назначен показ" /></Labeled>
          <div>
            <label className={`text-xs font-medium ${t.muted}`}>Цвет</label>
            <p className={`text-[11px] ${t.muted} mt-1`}>
              Рекомендация:{" "}
              <button type="button" onClick={() => setS({ ...s, color: recommended })}
                className="text-teal-600 dark:text-teal-400 underline underline-offset-2">
                {recommended}
              </button>
              {" "}— {hint.toLowerCase()}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {STAGE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setS({ ...s, color: c })}
                  title={c === recommended ? "Рекомендуемый" : c}
                  className={`w-7 h-7 rounded-full transition relative ${s.color === c ? "ring-2 ring-offset-2 ring-teal-500 dark:ring-offset-slate-800" : ""}`}
                  style={{ backgroundColor: stageHex(c) }}>
                  {c === recommended && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white border border-teal-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-medium ${t.muted}`}>Роботы при попадании на этап</label>
              <button onClick={addAuto} className="text-teal-600 text-sm inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Добавить робота</button>
            </div>
            <div className="space-y-3 mt-2">
              {s.automations.length === 0 && <p className={`text-sm ${t.muted}`}>Нет роботов. Добавьте уведомление, задачу, перемещение или копирование сделки.</p>}
              {s.automations.map((a) => (
                <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${t.border} ${t.soft}`}>
                  <div className="flex items-center gap-2">
                    <Sel t={t} value={a.type} onChange={(v) => upd(a.id, {
                      type: v,
                      recipient: v === "reply" ? "Клиент" : "Ответственный",
                      targetStageId: undefined,
                      targetPipelineId: undefined,
                      assignUserId: undefined,
                      fieldKey: undefined,
                    })}>
                      {AUTO_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </Sel>
                    <button onClick={() => del(a.id)} className="text-rose-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {["reply", "task", "notify"].includes(a.type) && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Labeled label="Автор" t={t}>
                          <Sel t={t} value={a.author || "Система"} onChange={(v) => upd(a.id, { author: v })}>
                            {authors.map((x) => <option key={x} value={x}>{x}</option>)}
                          </Sel>
                        </Labeled>
                        <Labeled label="Адресат" t={t}>
                          <Sel t={t} value={a.recipient || recipientOptions(a.type)[0]} onChange={(v) => upd(a.id, { recipient: v })}>
                            {recipientOptions(a.type).map((x) => <option key={x} value={x}>{x}</option>)}
                          </Sel>
                        </Labeled>
                      </div>
                      {a.type === "reply" && (
                        <Labeled label="Канал" t={t}>
                          <Sel t={t} value={a.channelId || ""} onChange={(v) => upd(a.id, { channelId: v })}>
                            <option value="">Выберите канал…</option>
                            {connected.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Sel>
                        </Labeled>
                      )}
                      <TInput t={t} value={a.text || ""} onChange={(v) => upd(a.id, { text: v })}
                        placeholder={a.type === "reply" ? "Текст сообщения клиенту" : a.type === "task" ? "Что сделать" : "Текст уведомления"} />
                    </>
                  )}
                  {a.type === "move" && (
                    <Labeled label="Целевой этап" t={t}>
                      <Sel t={t} value={a.targetStageId || ""} onChange={(v) => upd(a.id, { targetStageId: v })}>
                        <option value="">Выберите этап…</option>
                        {data.stages.map((st) => (
                          <option key={st.id} value={st.id}>
                            {(data.pipelines?.find((p) => p.id === st.pipelineId)?.name || "Воронка")} → {st.label}
                          </option>
                        ))}
                      </Sel>
                    </Labeled>
                  )}
                  {a.type === "copy" && (
                    <>
                      <Labeled label="Воронка" t={t}>
                        <Sel t={t} value={a.targetPipelineId || ""} onChange={(v) => upd(a.id, { targetPipelineId: v, targetStageId: "" })}>
                          <option value="">Выберите воронку…</option>
                          {(data.pipelines || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Sel>
                      </Labeled>
                      <Labeled label="Этап" t={t}>
                        <Sel t={t} value={a.targetStageId || ""} onChange={(v) => upd(a.id, { targetStageId: v })}>
                          <option value="">Выберите этап…</option>
                          {stagesInPipeline(a.targetPipelineId).map((st) => (
                            <option key={st.id} value={st.id}>{st.label}</option>
                          ))}
                        </Sel>
                      </Labeled>
                    </>
                  )}
                  {a.type === "assign" && (
                    <Labeled label="Сотрудник" t={t}>
                      <Sel t={t} value={a.assignUserId || ""} onChange={(v) => upd(a.id, { assignUserId: v || undefined })}>
                        <option value="">Ответственный (текущий)</option>
                        {(data.employees || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </Sel>
                    </Labeled>
                  )}
                  {a.type === "field" && (
                    <>
                      <Labeled label="Поле" t={t}>
                        <Sel t={t} value={a.fieldKey || ""} onChange={(v) => upd(a.id, { fieldKey: v })}>
                          <option value="">Выберите поле…</option>
                          {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </Sel>
                      </Labeled>
                      <TInput t={t} value={a.fieldValue || ""} onChange={(v) => upd(a.id, { fieldValue: v })} placeholder="Новое значение" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`flex items-center justify-between px-5 py-3 border-t ${t.border} sticky bottom-0 ${t.surface}`}>
          {stage.id && canDelete ? <Btn t={t} variant="danger" onClick={() => onDelete(stage.id)}><Trash2 className="w-4 h-4" /> Удалить</Btn> : <span />}
          <Btn t={t} onClick={() => s.label.trim() && onSave(s)}><Check className="w-4 h-4" /> Сохранить</Btn>
        </div>
      </div>
    </div>
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
  if (field.type === "employee")
    return <Sel t={t} value={value || ""} onChange={onChange}><option value="">—</option>{data.realtors.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Sel>;
  if (field.type === "link")
    return <div className="flex gap-2">
      <TInput t={t} type="url" value={value || ""} onChange={onChange} onBlur={onBlur} placeholder="https://" />
      {value && <a href={value} target="_blank" rel="noreferrer" className="px-2 flex items-center text-teal-600 shrink-0"><ExternalLink className="w-4 h-4" /></a>}
    </div>;
  if (field.type === "date")
    return <GlassDatePicker value={value || ""} onChange={onChange} />;
  if (field.type === "datetime")
    return <GlassDateTimePicker value={value || ""} onChange={onChange} />;
  if (field.type === "phone") {
    return <TInput t={t} type="tel" inputMode="tel" value={value || ""}
      onChange={(v) => onChange(formatPhoneInput(v))}
      onBlur={onBlur}
      placeholder={PHONE_FORMAT_HINT} />;
  }
  const typeMap = { number: "number", money: "number" };
  return <TInput t={t} type={typeMap[field.type] || "text"} value={value || ""} onChange={onChange} onBlur={onBlur} placeholder={field.type === "money" ? "₽" : ""} />;
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
    <Labeled label={field.label} t={t}>
      <CustomFieldInput field={field} data={data} t={t}
        value={draft.value}
        onChange={draft.setValue}
        onBlur={field.type === "phone" ? draft.onBlur : undefined}
      />
      <FieldError msg={draft.error} t={t} />
    </Labeled>
  );
}

function LeadDetail({ t, user, lead, data, onBack, updateLead, addNote, moveLead, reload, updateData, onOpenTask, onNotify }) {
  const [note, setNote] = useState("");
  const [erasing, setErasing] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [detailTab, setDetailTab] = useState<"card" | "history">("card");
  const canErase = hasPermission(user, "leads.erase") && !lead.erasedAt;
  const canExport = hasPermission(user, "leads.export") && !lead.erasedAt;
  const canLayout = hasPermission(user, "fields.manage");
  const userRealtorId = data.realtors.find((r) => r.userId === user?.id)?.id ?? null;
  const canEdit = canEditLead(user, lead, userRealtorId);
  const canAssign = canAssignLead(user);
  const stage = data.stages.find((s) => s.id === lead.status);
  const employees = data.employees || [];
  const responsibleMember = leadResponsibleMember(lead, employees, data.realtors);
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
    validate: (v) => (!String(v).trim() ? "Имя обязательно" : null),
  });

  const phoneField = useLeadFieldDraft({
    leadId: lead.id,
    serverValue: lead.phone ? formatPhoneDisplay(lead.phone) : "",
    onSave: (v) => patchLead({ phone: v }),
    validate: (v) => {
      if (!String(v).trim()) return "Телефон обязателен";
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
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Некорректный email";
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

  return (
    <div className="space-y-3 md:space-y-4">
      <button onClick={onBack} className={`inline-flex items-center gap-1 text-sm py-1 ${t.muted} hover:text-teal-500`}><ChevronLeft className="w-4 h-4" /> Назад</button>
      <div className="flex flex-wrap gap-1.5 py-1">
        {data.stages.map((s, i) => {
          const active = i === sIdx, done = i < sIdx;
          const btnStyle = stagePipelineStyle(s.color, active, done);
          if (!canEdit) {
            return (
              <span key={s.id} title={s.label}
                className="shrink-0 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap"
                style={btnStyle}>
                {s.label}
              </span>
            );
          }
          return (
            <button key={s.id} onClick={() => moveLead(lead.id, s.id)} title={s.label}
              className="shrink-0 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={btnStyle}>
              {s.label}
            </button>
          );
        })}
      </div>
      <div className={`rounded-2xl bio-card p-3 md:p-4 flex flex-col lg:flex-row gap-4 ${t.surface}`}>
        <LeadAssignSection
          t={t}
          label="Ответственный"
          icon={User}
          assignedMembers={responsibleMember ? [responsibleMember] : []}
          pickPool={employees.filter((m) => !(lead.watchers || []).includes(m.id))}
          editable={canAssign}
          onAdd={canAssign ? (id) => updateLead(lead.id, { assignedUserId: id }) : undefined}
          onRemove={canAssign ? () => updateLead(lead.id, { assignedUserId: null, assignedRealtorId: null }) : undefined}
        />
        <LeadAssignSection
          t={t}
          label="Наблюдатели"
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
          { id: "card" as const, label: "Карточка", icon: Building2 },
          { id: "history" as const, label: "История", icon: ScrollText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDetailTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
              detailTab === id ? "bg-teal-600 text-white shadow-sm" : `${t.muted} ${t.hover}`
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
      <div
        className={`rounded-2xl overflow-hidden ${t.surface}`}
        style={stage ? statusContourStyle(stage.color, true) : undefined}
      >
        <div className="grid lg:grid-cols-3 gap-4 p-3 md:p-4">
        <div className="lg:col-span-2 space-y-4">
          <div className={`rounded-2xl p-3 md:p-5 bio-card ${t.surface}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {canEdit ? (
                  <>
                    <div className="text-lg md:text-xl font-bold">
                      <TInput t={t} value={nameField.value} onChange={nameField.setValue} onBlur={nameField.onBlur} placeholder="Имя клиента" />
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
              {stage && <Stage stage={stage} />}
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
          <div className={`rounded-2xl p-5 bio-card ${t.surface}`}>
            <LeadTasksBlock t={t} leadId={lead.id} tasks={data.tasks} allTasks={data.tasks} realtors={data.realtors} leads={data.leads} user={user} updateData={updateData} onOpenTask={onOpenTask} />
          </div>
        </div>
        <div className={`rounded-2xl p-4 md:p-5 bio-card ${t.surface} lg:sticky lg:top-4 lg:self-start space-y-4`}>
          <LeadCallHistory
            t={t}
            user={user}
            leadId={lead.id}
            phone={lead.phone}
            sidebar
            onDial={handleDial}
            dialing={dialing}
          />
          <div className="bio-divide" />
          <h3 className="font-semibold flex items-center gap-2 text-sm"><MessageSquare className="w-4 h-4 text-teal-600" /> Заметки</h3>
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
        </div>
        </div>
      </div>
      )}
    </div>
  );
}
function Info({ icon: Icon, label, value, t }) {
  return <div className="flex items-start gap-2"><Icon className={`w-4 h-4 ${t.muted} mt-0.5`} /><div><div className={`text-xs ${t.muted}`}>{label}</div><div className={`${t.subtle} crm-data`}>{value}</div></div></div>;
}

