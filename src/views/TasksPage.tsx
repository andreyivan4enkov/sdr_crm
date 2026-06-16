import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock, Eye, Flag,
  GripVertical, History, ListTodo, MessageSquare, PanelRightClose, PanelRightOpen, Paperclip, Pin, Plus,
  Search, Send, Trash2, User, Users, AlertTriangle, X, Zap,
} from "lucide-react";
import { api, type AuthUser, type Lead, type Realtor, type Task, type TaskChecklistItem, type TaskComment, type TaskFile, type TaskPriority, type TaskStatus, type TeamMember } from "../api/client";
import type { CrmData } from "../hooks/useCrmData";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { taskStatusContourStyle, taskStatusBadgeStyle, taskStatusPillStyle } from "../lib/stage-colors";
import { GlassDateTimePicker } from "../components/GlassDrumPicker";
import { LeadAssignSection, LeadResponsibleCard, GlassAssigneeChip } from "../components/LeadPeoplePicker";
import { memberById, uniqueWatcherMembers } from "../lib/team-members";

const uid = () => crypto.randomUUID();
const CHAT_WIDTH_KEY = "jbr:taskChatWidth";
const CHAT_OPEN_KEY = "jbr:taskChatOpen";
const DEFAULT_CHAT_WIDTH = 520;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 960;
const MIN_DETAILS_WIDTH = 280;

const STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ждёт",
  deferred: "Отложена",
  completed: "Завершена",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "text-slate-400",
  normal: "text-teal-600",
  high: "text-rose-600",
};

type Filter = "all" | "mine" | "overdue" | "open";
type ChatFilter = "all" | "comments" | "history";
type MobileTaskTab = "details" | "chat";
type ActivityKind = "comment" | "system" | "result";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  text: string;
  author?: string;
  at: string;
  comment?: TaskComment;
};

type Props = {
  t: Record<string, string>;
  data: CrmData;
  user: AuthUser;
  updateData: (patch: Partial<CrmData>) => void;
  onOpenLead: (id: string) => void;
  selectedTaskId?: string | null;
  onSelectTask?: (id: string | null) => void;
  onNavigateBack?: () => void;
  initialTaskId?: string | null;
};

function teamUsers(realtors: Realtor[], user: AuthUser) {
  const map = new Map<string, string>();
  for (const r of realtors) {
    if (r.userId) map.set(r.userId, r.name);
  }
  if (!map.has(user.id)) map.set(user.id, user.name || user.login);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function taskEmployees(data: CrmData, user: AuthUser): TeamMember[] {
  if (data.employees?.length) return data.employees;
  return teamUsers(data.realtors, user).map(({ id, name }) => ({
    id,
    name,
    avatar: null,
    roleName: null,
    position: null,
    region: null,
  }));
}

function membersByIds(employees: TeamMember[], ids?: string[]) {
  return uniqueWatcherMembers(employees, ids);
}

function normalizeTask(raw: Task): Task {
  return {
    ...raw,
    status: raw.status || (raw.done ? "completed" : "new"),
    priority: raw.priority || "normal",
    checklist: raw.checklist || [],
    watchers: raw.watchers || [],
    coExecutors: raw.coExecutors || [],
    tags: raw.tags || [],
    files: raw.files || [],
    creatorUserId: raw.creatorUserId,
    reviewerUserId: raw.reviewerUserId,
    comments: raw.comments || [],
    notifyParticipants: raw.notifyParticipants !== false,
    requireSummary: raw.requireSummary ?? false,
  };
}

function isOverdue(task: Task) {
  return task.dueAt && !task.done && task.status !== "completed" && new Date(task.dueAt).getTime() < Date.now();
}

function formatDue(dueAt?: string) {
  if (!dueAt) return "";
  return new Date(dueAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatShortTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function initials(name?: string) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}

function addBusinessDays(days: number) {
  const d = new Date();
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

function taskRole(task: Task, userId: string): string | null {
  if (task.assigneeUserId === userId) return "Исполнитель";
  if ((task.coExecutors || []).includes(userId)) return "Соисполнитель";
  if ((task.watchers || []).includes(userId)) return "Наблюдатель";
  return null;
}

function lastPreview(task: Task): string {
  const comments = task.comments || [];
  if (comments.length) return comments[comments.length - 1].text;
  if (task.pinnedResult) return `✓ ${task.pinnedResult.text}`;
  if (task.statusSummary) return task.statusSummary;
  if (task.description) return task.description;
  return STATUS_LABELS[task.status];
}

function buildActivityFeed(task: Task): ActivityItem[] {
  const items: ActivityItem[] = [
    {
      id: `created-${task.id}`,
      kind: "system",
      text: "Задача создана",
      author: task.author,
      at: task.createdAt,
    },
  ];
  if (task.completedAt) {
    items.push({
      id: `done-${task.id}`,
      kind: "system",
      text: "Задача завершена",
      at: task.completedAt,
    });
  }
  if (task.pinnedResult) {
    items.push({
      id: `pin-${task.pinnedResult.agreedAt}`,
      kind: "result",
      text: task.pinnedResult.text,
      author: task.pinnedResult.agreedByName,
      at: task.pinnedResult.agreedAt,
    });
  }
  for (const c of task.comments || []) {
    items.push({ id: c.id, kind: "comment", text: c.text, author: c.author, at: c.createdAt, comment: c });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
}

function checklistProgress(task: Task) {
  const total = task.checklist.length;
  if (!total) return null;
  const done = task.checklist.filter((c) => c.done).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}


export function TasksPage({
  t, data, user, updateData, onOpenLead,
  selectedTaskId, onSelectTask, onNavigateBack, initialTaskId,
}: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedTaskId ?? initialTaskId ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const selectedId = onSelectTask ? (selectedTaskId ?? null) : internalSelectedId;
  const setSelectedId = onSelectTask ?? setInternalSelectedId;
  const handleBack = onNavigateBack ?? (() => setSelectedId(null));

  useEffect(() => {
    if (!onSelectTask && initialTaskId) setInternalSelectedId(initialTaskId);
  }, [initialTaskId, onSelectTask]);

  const members = useMemo(() => taskEmployees(data, user), [data.employees, data.realtors, user]);
  const tasks = useMemo(() => data.tasks.map(normalizeTask), [data.tasks]);
  const myName = user.name || user.login;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...tasks];
    if (filter === "mine") {
      list = list.filter((x) =>
        x.assigneeUserId === user.id
        || x.assignee === myName
        || (x.coExecutors || []).includes(user.id)
        || (x.watchers || []).includes(user.id),
      );
    }
    if (filter === "overdue") list = list.filter(isOverdue);
    if (filter === "open") list = list.filter((x) => !x.done && x.status !== "completed");
    if (q) {
      list = list.filter((x) => {
        const lead = data.leads.find((l) => l.id === x.leadId);
        const hay = [x.text, x.description, x.assignee, x.author, lead?.name, ...(x.comments || []).map((c) => c.text)].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    list.sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ac = (a.comments || []).length;
      const bc = (b.comments || []).length;
      const al = a.comments?.[ac - 1]?.createdAt || a.updatedAt || a.createdAt;
      const bl = b.comments?.[bc - 1]?.createdAt || b.updatedAt || b.createdAt;
      if (al !== bl) return new Date(bl).getTime() - new Date(al).getTime();
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [tasks, filter, user.id, myName, search, data.leads]);

  const selected = tasks.find((x) => x.id === selectedId) ?? null;
  const lead = (id?: string | null) => data.leads.find((l) => l.id === id);

  async function patchTask(id: string, body: Partial<Task>) {
    const { task } = await api.updateTask(id, body);
    const norm = normalizeTask(task);
    updateData({ tasks: data.tasks.map((x) => (x.id === id ? norm : x)) });
    return norm;
  }

  function refreshTask(task: Task) {
    const norm = normalizeTask(task);
    updateData({ tasks: data.tasks.map((x) => (x.id === norm.id ? norm : x)) });
    return norm;
  }

  const createTask = useCallback(async (body: Partial<Task> & { text: string }) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const payload = {
        dueAt: body.dueAt ?? addBusinessDays(5),
        assigneeUserId: body.assigneeUserId ?? user.id,
        assignee: body.assignee ?? members.find((m) => m.id === (body.assigneeUserId ?? user.id))?.name ?? myName,
        status: "new" as const,
        ...body,
      };
      const { task } = await api.createTask(payload);
      const norm = normalizeTask(task);
      updateData({ tasks: [norm, ...data.tasks] });
      setSelectedId(norm.id);
      setCreateOpen(false);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [data.tasks, members, myName, updateData, user.id]);

  async function removeTask(id: string) {
    await api.deleteTask(id);
    updateData({ tasks: data.tasks.filter((x) => x.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  async function quickToggle(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    const done = !task.done;
    await patchTask(task.id, { status: done ? "completed" : "new", done });
  }

  const filters: { k: Filter; label: string }[] = [
    { k: "open", label: "В работе" },
    { k: "mine", label: "Мои" },
    { k: "overdue", label: "Просрочены" },
    { k: "all", label: "Все" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <ListTodo className="w-5 h-5 text-teal-600" />
          <h2 className="font-semibold">Задачи</h2>
        </div>
        <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${t.border} ${t.surface}`}>
          <Search className={`w-4 h-4 shrink-0 ${t.muted}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            className={`flex-1 bg-transparent border-0 outline-none text-sm min-w-0 ${t.text} placeholder:opacity-50`}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className={t.muted}><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
        <div className={`flex gap-1 rounded-xl p-1 ${t.chip} overflow-x-auto nice-scroll w-full sm:w-auto`}>
          {filters.map((f) => (
            <button key={f.k} type="button" onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition flex-1 sm:flex-none ${
                filter === f.k ? `${t.surface} shadow-sm font-medium` : t.muted
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick create — компактнее на мобильных */}
      {!selectedId && (
        <QuickCreateBar t={t} members={members} user={user} saving={creating} onCreate={createTask} onMore={() => setCreateOpen(true)} />
      )}

      {createOpen && (
        <CreateTaskModal
          t={t}
          leads={data.leads}
          members={members}
          user={user}
          saving={creating}
          onClose={() => setCreateOpen(false)}
          onCreate={createTask}
        />
      )}

      {/* Main workspace: list + detail/chat */}
      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border ${t.surface} ${t.border}`}>
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Task chat list (messenger style) */}
          <div className={`w-full lg:w-[260px] xl:w-[280px] shrink-0 flex flex-col border-r ${t.border} min-h-0 ${selected ? "hidden lg:flex" : "flex"}`}>
            <div className={`px-4 py-2.5 text-xs font-medium border-b ${t.border} ${t.muted} flex items-center justify-between`}>
              <span>Чаты задач</span>
              <span className={`px-1.5 py-0.5 rounded-full ${t.chip}`}>{filtered.length}</span>
            </div>
            <div className={`flex-1 overflow-y-auto nice-scroll divide-y ${t.divide}`}>
              {filtered.length === 0 ? (
                <div className={`p-8 text-center ${t.muted}`}>
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Задач нет</p>
                  <p className="text-xs mt-1">Создайте быструю задачу выше</p>
                </div>
              ) : filtered.map((task) => (
                <TaskListItem
                  key={task.id}
                  t={t}
                  task={task}
                  active={selectedId === task.id}
                  leadName={lead(task.leadId)?.name}
                  role={taskRole(task, user.id)}
                  members={members}
                  onSelect={() => setSelectedId(task.id)}
                  onToggle={(e) => void quickToggle(task, e)}
                />
              ))}
            </div>
          </div>

          {/* Detail + chat */}
          <div className={`flex-1 min-w-0 flex flex-col ${!selected ? "hidden lg:flex" : "flex"}`}>
            {selected ? (
              <TaskWorkspace
                t={t}
                task={selected}
                leads={data.leads}
                lead={lead(selected.leadId)}
                members={members}
                user={user}
                onBack={handleBack}
                onPatch={(body) => patchTask(selected.id, body)}
                onRefresh={refreshTask}
                onDelete={() => void removeTask(selected.id)}
                onOpenLead={onOpenLead}
              />
            ) : (
              <div className={`flex-1 flex flex-col items-center justify-center p-10 text-center ${t.muted}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${t.chip}`}>
                  <MessageSquare className="w-8 h-8 opacity-40" />
                </div>
                <p className={`text-base font-medium ${t.text}`}>Выберите задачу</p>
                <p className="text-sm mt-2 max-w-sm opacity-80">
                  Как в Битрикс24: слева — чаты задач, справа — детали и обсуждение в одном окне
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskListItem({ t, task, active, leadName, role, members, onSelect, onToggle }: {
  t: Record<string, string>;
  task: Task;
  active: boolean;
  leadName?: string;
  role: string | null;
  members: { id: string; name: string }[];
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const assigneeName = members.find((m) => m.id === task.assigneeUserId)?.name || task.assignee;
  const preview = lastPreview(task);
  const commentCount = (task.comments || []).length;
  const progress = checklistProgress(task);

  return (
    <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}
      className={`w-full text-left px-3 py-3 transition flex gap-2.5 cursor-pointer mx-1 my-0.5 rounded-lg border ${active ? "bg-teal-50/90 dark:bg-teal-500/10" : t.hover}`}
      style={taskStatusContourStyle(task.status, active)}>
      <button type="button" onClick={onToggle}
        className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
          task.done ? "bg-teal-600 border-teal-600 text-white" : `${t.border} hover:border-teal-400`
        }`}>
        {task.done ? <Check className="w-3 h-3" /> : <Circle className="w-2.5 h-2.5 opacity-30" />}
      </button>
      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
        active ? "bg-teal-600 text-white" : "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200"
      }`}>
        {initials(assigneeName)}
      </div>
      <div className="flex-1 min-w-0 crm-data">
        <div className="flex items-start gap-1.5">
          <span className={`text-sm font-medium truncate flex-1 ${task.done ? "line-through opacity-60" : ""}`}>{task.text}</span>
          <span className={`text-[10px] shrink-0 ${t.muted}`}>{formatShortTime(task.comments?.[commentCount - 1]?.createdAt || task.updatedAt || task.createdAt)}</span>
        </div>
        <p className={`text-xs truncate mt-0.5 ${t.muted} crm-data`}>{preview}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" style={taskStatusBadgeStyle(task.status)}>{STATUS_LABELS[task.status]}</span>
          {isOverdue(task) && <span className="text-[10px] text-rose-600 font-medium">Просрочена</span>}
          {task.dueAt && !task.done && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(task) ? "text-rose-600" : t.muted}`}>
              <Clock className="w-3 h-3" /> {formatDue(task.dueAt)}
            </span>
          )}
          {commentCount > 0 && (
            <span className={`text-[10px] flex items-center gap-0.5 ${t.muted}`}>
              <MessageSquare className="w-3 h-3" /> {commentCount}
            </span>
          )}
          {task.pinnedResult && <Pin className="w-3 h-3 text-teal-600" />}
          {progress && <span className={`text-[10px] ${t.muted}`}>{progress.done}/{progress.total}</span>}
          {leadName && <span className={`text-[10px] truncate max-w-[80px] ${t.muted}`}>· {leadName}</span>}
          {role && <span className="text-[10px] text-teal-600 dark:text-teal-400">{role}</span>}
        </div>
      </div>
      <Flag className={`w-3 h-3 mt-1 shrink-0 ${PRIORITY_COLOR[task.priority]}`} />
    </div>
  );
}

function QuickCreateBar({ t, members, user, saving, onCreate, onMore }: {
  t: Record<string, string>;
  members: TeamMember[];
  user: AuthUser;
  saving: boolean;
  onCreate: (body: Partial<Task> & { text: string }) => Promise<void>;
  onMore: () => void;
}) {
  const [text, setText] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState(user.id);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!text.trim() || saving || submitting) return;
    setSubmitting(true);
    try {
      const assignee = members.find((m) => m.id === assigneeUserId)?.name || user.name;
      await onCreate({ text: text.trim(), assigneeUserId, assignee });
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bio-glass-bar flex items-center gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5 min-w-0">
      <Zap className="w-4 h-4 text-teal-500 shrink-0" strokeWidth={2.25} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder="Быстрая задача…"
        className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-sm ${t.text} placeholder:opacity-45`}
      />
      <div className="flex items-center gap-1.5 shrink-0">
        <GlassAssigneeChip
          t={t}
          member={memberById(members, assigneeUserId)}
          pool={members}
          onChange={setAssigneeUserId}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || submitting || !text.trim()}
          className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 shadow-sm shadow-teal-600/20 transition"
        >
          {submitting ? "…" : "Создать"}
        </button>
        <button
          type="button"
          onClick={onMore}
          title="Подробнее"
          className={`hidden sm:inline-flex px-3 py-1.5 rounded-full text-xs font-medium bio-glass-chip ${t.muted} hover:text-teal-600 transition`}
        >
          Подробнее
        </button>
        <button
          type="button"
          onClick={onMore}
          title="Подробнее"
          className={`sm:hidden w-8 h-8 rounded-full inline-flex items-center justify-center bio-glass-chip ${t.muted}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TaskWorkspace({ t, task, leads, lead, members, user, onBack, onPatch, onRefresh, onDelete, onOpenLead }: {
  t: Record<string, string>;
  task: Task;
  leads: Lead[];
  lead?: Lead;
  members: TeamMember[];
  user: AuthUser;
  onBack: () => void;
  onPatch: (body: Partial<Task>) => Promise<Task>;
  onRefresh: (task: Task) => void;
  onDelete: () => void;
  onOpenLead: (id: string) => void;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isLg = useMediaQuery("(min-width: 1024px)");
  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem(CHAT_OPEN_KEY) !== "0");
  const [mobileTab, setMobileTab] = useState<MobileTaskTab>("details");
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = localStorage.getItem(CHAT_WIDTH_KEY);
    if (!saved) return DEFAULT_CHAT_WIDTH;
    const n = Number(saved);
    if (!Number.isFinite(n)) return DEFAULT_CHAT_WIDTH;
    return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, Math.max(n, DEFAULT_CHAT_WIDTH)));
  });
  const resizing = useRef(false);
  const widthRef = useRef(chatWidth);

  useEffect(() => { widthRef.current = chatWidth; }, [chatWidth]);
  useEffect(() => { setMobileTab("details"); }, [task.id]);

  function toggleChat() {
    if (!isLg) {
      setMobileTab((tab) => (tab === "chat" ? "details" : "chat"));
      return;
    }
    setChatOpen((v) => {
      const next = !v;
      localStorage.setItem(CHAT_OPEN_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (!isLg) return;
    function maxChatWidth() {
      if (!workspaceRef.current) return MAX_CHAT_WIDTH;
      const w = workspaceRef.current.clientWidth;
      return Math.min(MAX_CHAT_WIDTH, Math.floor(w * 0.5), w - MIN_DETAILS_WIDTH - 8);
    }
    function clampWidth() {
      const maxW = maxChatWidth();
      if (maxW >= MIN_CHAT_WIDTH && chatWidth > maxW) setChatWidth(maxW);
    }
    clampWidth();
    window.addEventListener("resize", clampWidth);
    return () => window.removeEventListener("resize", clampWidth);
  }, [chatWidth, chatOpen, isLg]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const maxW = Math.min(MAX_CHAT_WIDTH, Math.floor(rect.width * 0.5), rect.width - MIN_DETAILS_WIDTH - 8);
      const w = rect.right - e.clientX;
      setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(maxW, w)));
    }
    function onUp() {
      if (resizing.current) {
        resizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem(CHAT_WIDTH_KEY, String(widthRef.current));
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const commentCount = (task.comments || []).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border m-0.5"
      style={taskStatusContourStyle(task.status, true)}>
      {/* Header */}
      <div className={`px-3 sm:px-4 py-2.5 sm:py-3 border-b ${t.border} shrink-0`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className={`lg:hidden p-1.5 rounded-lg shrink-0 ${t.muted} ${t.hover}`}>
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className={`text-sm sm:text-base font-semibold truncate crm-data ${task.done ? "line-through opacity-60" : ""}`}>{task.text}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium lg:hidden"
                style={taskStatusBadgeStyle(task.status)}
              >
                {STATUS_LABELS[task.status]}
              </span>
              <p className={`text-[10px] sm:text-xs ${t.muted} truncate`}>
                {new Date(task.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {task.author ? ` · ${task.author}` : ""}
              </p>
            </div>
          </div>
          {isLg && (
            <button type="button" onClick={toggleChat} title={chatOpen ? "Скрыть чат" : "Показать чат"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
                chatOpen ? "border-teal-500/50 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200" : `${t.border} ${t.muted} ${t.hover}`
              }`}>
              {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              Чат
              {commentCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] leading-none">{commentCount}</span>
              )}
            </button>
          )}
        </div>
        <div className="hidden lg:flex flex-wrap gap-1 mt-2">
          <TaskStatusPills task={task} onPatch={onPatch} />
        </div>
      </div>

      {/* Desktop: sidebar + chat */}
      {isLg ? (
        <div
          ref={workspaceRef}
          className="flex-1 min-h-0 overflow-hidden relative"
          style={{
            display: "grid",
            gridTemplateColumns: chatOpen
              ? `minmax(${MIN_DETAILS_WIDTH}px, 1fr) 4px ${chatWidth}px`
              : "1fr",
          }}
        >
          <TaskSidebar
            t={t} task={task} leads={leads} lead={lead} members={members} user={user}
            onPatch={onPatch} onDelete={onDelete} onOpenLead={onOpenLead}
            chatOpen={chatOpen} showStatusPills
          />
          {chatOpen && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={() => {
                  resizing.current = true;
                  document.body.style.cursor = "col-resize";
                  document.body.style.userSelect = "none";
                }}
                className={`cursor-col-resize flex items-center justify-center hover:bg-teal-500/20 active:bg-teal-500/30 ${t.border} border-l border-r`}
              >
                <GripVertical className={`w-3 h-3 ${t.muted} opacity-50 pointer-events-none`} />
              </div>
              <div className={`h-full flex flex-col min-h-0 overflow-hidden ${t.surface} border-l ${t.border}`}>
                <TaskChat t={t} task={task} user={user} onRefresh={onRefresh} onClose={toggleChat} />
              </div>
            </>
          )}
          {!chatOpen && (
            <button type="button" onClick={toggleChat}
              className="absolute right-3 bottom-4 z-10 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white shadow-lg hover:bg-teal-700">
              <MessageSquare className="w-4 h-4" />
              Чат
              {commentCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{commentCount}</span>
              )}
            </button>
          )}
        </div>
      ) : (
        /* Mobile: вкладки Детали / Чат */
        <>
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobileTab === "details" ? (
              <TaskSidebar
                t={t} task={task} leads={leads} lead={lead} members={members} user={user}
                onPatch={onPatch} onDelete={onDelete} onOpenLead={onOpenLead}
                showStatusPills
              />
            ) : (
              <TaskChat t={t} task={task} user={user} onRefresh={onRefresh} />
            )}
          </div>
          <div className={`shrink-0 grid grid-cols-2 border-t ${t.border} ${t.surface}`}>
            <button type="button" onClick={() => setMobileTab("details")}
              className={`py-3 text-sm font-medium transition border-b-2 ${
                mobileTab === "details" ? "border-teal-600 text-teal-600" : `border-transparent ${t.muted}`
              }`}>
              Детали
            </button>
            <button type="button" onClick={() => setMobileTab("chat")}
              className={`py-3 text-sm font-medium transition border-b-2 flex items-center justify-center gap-1.5 ${
                mobileTab === "chat" ? "border-teal-600 text-teal-600" : `border-transparent ${t.muted}`
              }`}>
              <MessageSquare className="w-4 h-4" />
              Чат
              {commentCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] leading-none">{commentCount}</span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TaskStatusPills({ task, onPatch }: { task: Task; onPatch: (body: Partial<Task>) => Promise<Task> }) {
  const statuses = (Object.keys(STATUS_LABELS) as TaskStatus[]).filter((s) => s !== "completed" || task.status === "completed");
  const visible = task.status === "completed" ? (["completed"] as TaskStatus[]) : statuses.filter((s) => s !== "completed");
  return (
    <div className="flex flex-wrap gap-1 shrink-0">
      {visible.map((s) => (
        <button key={s} type="button"
          onClick={() => void onPatch({ status: s, done: s === "completed" })}
          className="px-2.5 py-1 rounded-full text-xs transition"
          style={taskStatusPillStyle(s, task.status === s)}>
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function TaskSidebar({ t, task, leads, lead, members, user, onPatch, onDelete, onOpenLead, chatOpen, showStatusPills }: {
  t: Record<string, string>;
  task: Task;
  leads: Lead[];
  lead?: Lead;
  members: TeamMember[];
  user: AuthUser;
  onPatch: (body: Partial<Task>) => Promise<Task>;
  onDelete: () => void;
  onOpenLead: (id: string) => void;
  chatOpen?: boolean;
  showStatusPills?: boolean;
}) {
  const [summaryDraft, setSummaryDraft] = useState(task.statusSummary || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const progress = checklistProgress(task);

  useEffect(() => { setSummaryDraft(task.statusSummary || ""); }, [task.id, task.statusSummary]);

  async function save(patch: Partial<Task>) {
    setSaving(true);
    setErr("");
    try { await onPatch(patch); } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function complete() {
    if (task.requireSummary && !summaryDraft.trim() && !task.statusSummary) {
      setErr("Добавьте результат перед завершением");
      return;
    }
    await save({ status: "completed", done: true, statusSummary: summaryDraft.trim() || task.statusSummary });
  }

  function toggleChecklistItem(itemId: string) {
    void save({ checklist: task.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) });
  }

  function addChecklistItem(text: string) {
    if (!text.trim()) return;
    void save({ checklist: [...task.checklist, { id: uid(), text: text.trim(), done: false }] });
  }

  const assigneeMember = memberById(members, task.assigneeUserId);
  const reviewerMember = memberById(members, task.reviewerUserId);
  const creatorMember = memberById(members, task.creatorUserId);
  const coExecutorList = membersByIds(members, task.coExecutors);
  const watcherList = membersByIds(members, task.watchers);
  const assigneeExclude = [
    ...(task.watchers || []),
    ...(task.coExecutors || []),
    ...(task.reviewerUserId ? [task.reviewerUserId] : []),
  ];

  return (
    <div
      className={`min-w-0 overflow-y-auto nice-scroll p-3 sm:p-4 space-y-4 min-h-0 h-full w-full ${
        chatOpen ? `border-r ${t.border}` : ""
      }`}
      style={chatOpen ? { minWidth: MIN_DETAILS_WIDTH } : undefined}
    >
      {err && <p className="text-xs text-rose-500">{err}</p>}

      {showStatusPills && (
        <div className="lg:hidden">
          <TaskStatusPills task={task} onPatch={onPatch} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 lg:items-stretch">
        {/* Левый модуль: люди, сроки, уведомления */}
        <div className={`rounded-xl border p-3 space-y-3 h-full ${t.border} ${t.surface}`}>
          <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-teal-600" /> Участники</h4>

          <label className="block">
            <span className={`text-[10px] font-medium uppercase tracking-wide ${t.muted}`}>Постановщик</span>
            {creatorMember || task.author ? (
              <div className="mt-1">
                <LeadResponsibleCard t={t} member={creatorMember || { id: task.creatorUserId || "author", name: task.author || "—", avatar: null }} />
              </div>
            ) : (
              <p className={`mt-1 text-sm px-2 py-1.5 rounded-lg ${t.soft}`}>—</p>
            )}
          </label>

          <LeadAssignSection
            t={t}
            label="Исполнитель"
            icon={User}
            assignedMembers={assigneeMember ? [assigneeMember] : []}
            pickPool={members.filter((m) => !assigneeExclude.includes(m.id))}
            editable
            onAdd={(id) => void save({ assigneeUserId: id, assignee: memberById(members, id)?.name })}
          />

          <LeadAssignSection
            t={t}
            label="Соисполнители"
            icon={Users}
            assignedMembers={coExecutorList}
            pickPool={members.filter((m) => m.id !== task.assigneeUserId)}
            multiple
            editable
            onAdd={(id) => void save({ coExecutors: [...new Set([...(task.coExecutors || []), id])] })}
            onRemove={(id) => void save({ coExecutors: (task.coExecutors || []).filter((x) => x !== id) })}
          />

          <LeadAssignSection
            t={t}
            label="Наблюдатели"
            icon={Eye}
            assignedMembers={watcherList}
            pickPool={members.filter((m) => m.id !== task.assigneeUserId)}
            multiple
            editable
            onAdd={(id) => void save({ watchers: [...new Set([...(task.watchers || []), id])] })}
            onRemove={(id) => void save({ watchers: (task.watchers || []).filter((x) => x !== id) })}
          />

          <LeadAssignSection
            t={t}
            label="Проверяющий"
            icon={CheckCircle2}
            assignedMembers={reviewerMember ? [reviewerMember] : []}
            pickPool={members.filter((m) => m.id !== task.assigneeUserId)}
            editable
            onAdd={(id) => void save({ reviewerUserId: id })}
            onRemove={() => void save({ reviewerUserId: null })}
          />

          <div className={`pt-2 border-t ${t.border} space-y-2`}>
            <h5 className="text-xs font-semibold flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-teal-600" /> Сроки</h5>
            <div className="flex flex-wrap gap-2">
              <MetaChip icon={Flag} label={PRIORITY_LABELS[task.priority]} className={PRIORITY_COLOR[task.priority]}>
                <select value={task.priority} onChange={(e) => void save({ priority: e.target.value as TaskPriority })}
                  className="bg-transparent border-0 outline-none text-xs cursor-pointer">
                  {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </MetaChip>
              <MetaChip icon={Calendar} label="Срок">
                <GlassDateTimePicker
                  inline
                  value={task.dueAt ? task.dueAt.slice(0, 16) : ""}
                  onChange={(v) => void save({ dueAt: v ? new Date(v).toISOString() : undefined })}
                />
              </MetaChip>
            </div>
            {isOverdue(task) && (
              <p className="text-xs text-rose-600 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10">
                <AlertTriangle className="w-3.5 h-3.5" /> Просрочена
              </p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={task.notifyParticipants !== false}
                onChange={(e) => void save({ notifyParticipants: e.target.checked })} className="accent-teal-600" />
              <Bell className="w-3.5 h-3.5 text-teal-600" /> Уведомлять участников
            </label>
          </div>
        </div>

        {/* Правый модуль: описание, теги, сделка */}
        <div className={`rounded-xl border p-3 flex flex-col gap-3 h-full min-h-0 ${t.border} ${t.surface}`}>
          <h4 className="text-sm font-semibold flex items-center gap-2 shrink-0"><MessageSquare className="w-4 h-4 text-teal-600" /> Содержание</h4>

          <label className="flex flex-col flex-1 min-h-0 gap-1">
            <span className={`text-[10px] font-medium uppercase tracking-wide ${t.muted}`}>Описание</span>
            <textarea value={task.description || ""} onChange={(e) => void save({ description: e.target.value })}
              placeholder="Подробности задачи…"
              className={`w-full flex-1 min-h-[6rem] mt-0 rounded-lg border px-2 py-1.5 text-sm resize-none ${t.input}`} />
          </label>

          <div className="shrink-0 space-y-3">
            <TaskTagEditor t={t} tags={task.tags || []} onChange={(tags) => void save({ tags })} />

            <label className="block">
              <span className={`text-[10px] font-medium uppercase tracking-wide ${t.muted}`}>Связанный лид</span>
              <select value={task.leadId || ""} onChange={(e) => void save({ leadId: e.target.value || null })}
                className={`w-full mt-1 rounded-lg border px-2 py-1.5 text-sm ${t.input}`}>
                <option value="">Без привязки</option>
                {leads.slice(0, 100).map((l) => <option key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ""}</option>)}
              </select>
              {lead && (
                <button type="button" onClick={() => onOpenLead(lead.id)}
                  className="mt-2 text-xs text-teal-600 hover:underline">Открыть карточку →</button>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* Ниже на всю ширину: чек-лист, файлы, результат */}
      <CollapsibleSection t={t} title={`Чек-лист${progress ? ` (${progress.done}/${progress.total})` : ""}`} icon={Check}
        defaultOpen={task.checklist.length > 0}>
        {progress && (
          <div className="mb-2 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        )}
        <div className="space-y-1">
          {task.checklist.map((item) => (
            <label key={item.id} className={`flex items-center gap-2 text-sm px-1 py-1 rounded-lg ${t.hover}`}>
              <button type="button" onClick={() => toggleChecklistItem(item.id)}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.done ? "bg-teal-600 border-teal-600 text-white" : t.border}`}>
                {item.done && <Check className="w-2.5 h-2.5" />}
              </button>
              <span className={`text-xs ${item.done ? "line-through opacity-60" : ""}`}>{item.text}</span>
            </label>
          ))}
          <ChecklistAdd onAdd={addChecklistItem} t={t} />
        </div>
      </CollapsibleSection>

      <TaskFilesPanel t={t} files={task.files || []} onChange={(files) => void save({ files })} />

      <CollapsibleSection t={t} title="Результат" icon={Pin} defaultOpen={!!task.pinnedResult || task.requireSummary}
        highlight={task.requireSummary}>
        {task.pinnedResult ? (
          <div className="rounded-lg border border-teal-400/40 bg-teal-50/50 dark:bg-teal-500/10 p-2.5 text-xs">
            <p className="whitespace-pre-wrap crm-data">{task.pinnedResult.text}</p>
            <p className={`${t.muted} mt-1`}>Согласовано: {task.pinnedResult.agreedByName}</p>
          </div>
        ) : (
          <p className={`text-xs ${t.muted}`}>Проверяющий или наблюдатель закрепляет результат в чате</p>
        )}
        <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)}
          onBlur={() => { if (summaryDraft !== (task.statusSummary || "")) void save({ statusSummary: summaryDraft }); }}
          rows={2} placeholder="Промежуточный итог…" className={`w-full mt-2 rounded-lg border px-2 py-1.5 text-xs resize-none ${t.input}`} />
        <label className="flex items-center gap-2 mt-2 text-xs">
          <input type="checkbox" checked={task.requireSummary} onChange={(e) => void save({ requireSummary: e.target.checked })} className="accent-teal-600" />
          Требовать результат при завершении
        </label>
      </CollapsibleSection>

      <div className="flex gap-2 pt-1">
        {task.status !== "completed" && !task.done && (
          <button type="button" onClick={() => void complete()} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-teal-600 text-white hover:bg-teal-700">
            <CheckCircle2 className="w-4 h-4" /> Завершить
          </button>
        )}
        <button type="button" onClick={onDelete} className={`p-2 rounded-lg border ${t.border} ${t.muted} hover:text-rose-500`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TaskTagEditor({ t, tags, onChange }: {
  t: Record<string, string>;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function addTag() {
    const v = draft.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setDraft("");
  }
  return (
    <div>
      <span className={`text-[10px] font-medium uppercase tracking-wide ${t.muted}`}>Теги</span>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {tags.map((tag) => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${t.chip}`}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== tag))} className={t.muted}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()}
          placeholder="Новый тег" className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${t.input}`} />
        <button type="button" onClick={addTag} className="text-xs px-2 py-1 rounded-lg bg-teal-600 text-white">+</button>
      </div>
    </div>
  );
}

const MAX_TASK_FILE_BYTES = 400_000;

function TaskFilesPanel({ t, files, onChange }: {
  t: Record<string, string>;
  files: TaskFile[];
  onChange: (files: TaskFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function onPick(file?: File | null) {
    if (!file) return;
    if (file.size > MAX_TASK_FILE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange([...files, {
        id: uid(),
        name: file.name,
        mimeType: file.type,
        dataUrl: String(reader.result),
        createdAt: new Date().toISOString(),
      }]);
    };
    reader.readAsDataURL(file);
  }
  return (
    <CollapsibleSection t={t} title={`Файлы (${files.length})`} icon={Paperclip} defaultOpen={files.length > 0}>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`text-xs px-3 py-1.5 rounded-lg border ${t.border} ${t.hover}`}>
        Прикрепить файл
      </button>
      <ul className="mt-2 space-y-1">
        {files.map((f) => (
          <li key={f.id} className={`flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg ${t.soft}`}>
            {f.dataUrl ? (
              <a href={f.dataUrl} download={f.name} className="truncate text-teal-600 hover:underline">{f.name}</a>
            ) : (
              <span className="truncate">{f.name}</span>
            )}
            <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="text-rose-500 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}

function MetaChip({ icon: Icon, label, className, children }: {
  icon: typeof Flag;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs ${className || ""}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="opacity-70">{label}:</span>
      {children}
    </div>
  );
}

function CollapsibleSection({ t, title, icon: Icon, children, defaultOpen = false, highlight = false }: {
  t: Record<string, string>;
  title: string;
  icon: typeof User;
  children: ReactNode;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border overflow-hidden ${highlight ? "border-amber-300/50" : t.border}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium ${t.hover} ${highlight ? "bg-amber-50/50 dark:bg-amber-500/5" : ""}`}>
        <Icon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
        <span className="flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 ${t.muted} transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function TaskChat({ t, task, user, onRefresh, onClose }: {
  t: Record<string, string>;
  task: Task;
  user: AuthUser;
  onRefresh: (task: Task) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isWatcher = (task.watchers || []).includes(user.id);
  const feed = useMemo(() => buildActivityFeed(task), [task]);

  const visible = useMemo(() => {
    if (chatFilter === "comments") return feed.filter((x) => x.kind === "comment");
    if (chatFilter === "history") return feed.filter((x) => x.kind !== "comment");
    return feed;
  }, [feed, chatFilter]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.length, task.id]);

  async function sendComment() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setErr("");
    try {
      const { task: updated } = await api.addTaskComment(task.id, text);
      setDraft("");
      onRefresh(updated);
    } catch (e) { setErr((e as Error).message); }
    finally { setSending(false); }
  }

  async function pinAsResult(comment: TaskComment) {
    if (pinningId) return;
    setPinningId(comment.id);
    setErr("");
    try {
      const { task: updated } = await api.pinTaskResult(task.id, { text: comment.text, commentId: comment.id });
      onRefresh(updated);
    } catch (e) { setErr((e as Error).message); }
    finally { setPinningId(null); }
  }

  const filters: { k: ChatFilter; label: string; icon: typeof MessageSquare }[] = [
    { k: "all", label: "Всё", icon: MessageSquare },
    { k: "comments", label: "Сообщения", icon: MessageSquare },
    { k: "history", label: "История", icon: History },
  ];

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-hidden ${t.surface}`}>
      <div className={`px-3 sm:px-4 py-2.5 sm:py-3 border-b ${t.border} shrink-0`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-sm font-semibold flex items-center gap-2 ${t.text}`}>
            <MessageSquare className="w-4 h-4 text-teal-600" /> Чат
          </h3>
          <div className="flex items-center gap-1.5">
            <div className={`flex gap-0.5 rounded-lg p-0.5 ${t.chip}`}>
              {filters.map((f) => (
                <button key={f.k} type="button" onClick={() => setChatFilter(f.k)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                    chatFilter === f.k ? `${t.surface} shadow-sm` : t.muted
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} title="Скрыть чат"
                className={`hidden lg:flex p-1.5 rounded-lg ${t.muted} ${t.hover}`}>
                <PanelRightClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {task.pinnedResult && chatFilter !== "history" && (
        <div className="mx-3 mt-3 p-3 rounded-xl border-2 border-teal-400/60 bg-teal-50/90 dark:bg-teal-500/10 shrink-0">
          <div className="text-xs font-semibold text-teal-800 dark:text-teal-200 flex items-center gap-1.5 mb-1">
            <Pin className="w-3.5 h-3.5" /> Согласованный результат
          </div>
          <p className={`text-sm whitespace-pre-wrap crm-data ${t.text}`}>{task.pinnedResult.text}</p>
          <p className={`text-[10px] ${t.muted} mt-1.5`}>
            {task.pinnedResult.agreedByName} · {new Date(task.pinnedResult.agreedAt).toLocaleString("ru-RU")}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto nice-scroll p-3 space-y-2 min-h-[100px]">
        {visible.length === 0 ? (
          <p className={`text-xs text-center py-8 ${t.muted}`}>
            {chatFilter === "comments" ? "Напишите первое сообщение" : "История появится по мере работы"}
          </p>
        ) : visible.map((item) => {
          if (item.kind === "comment" && item.comment) {
            const c = item.comment;
            const pinned = task.pinnedResult?.commentId === c.id;
            const mine = c.authorUserId === user.id;
            return (
              <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  pinned ? "border-2 border-teal-400/60 bg-teal-50 dark:bg-teal-500/10"
                    : mine ? "bg-teal-600 text-white rounded-br-md" : `${t.surface} border ${t.border} rounded-bl-md`
                }`}>
                  {!mine && <div className="text-[10px] font-medium opacity-70 mb-0.5">{c.author}</div>}
                  <p className="whitespace-pre-wrap crm-data">{c.text}</p>
                  <div className={`flex items-center justify-between gap-2 mt-1 ${mine && !pinned ? "text-white/70" : t.muted}`}>
                    <span className="text-[10px]">{formatShortTime(c.createdAt)}</span>
                    {isWatcher && !pinned && (
                      <button type="button" disabled={pinningId === c.id} onClick={() => void pinAsResult(c)}
                        className={`text-[10px] flex items-center gap-0.5 hover:underline disabled:opacity-50 ${mine ? "text-white/90" : "text-teal-600"}`}>
                        <Pin className="w-2.5 h-2.5" /> Результат
                      </button>
                    )}
                    {pinned && <span className="text-[10px] flex items-center gap-0.5 text-teal-600"><Pin className="w-2.5 h-2.5" /> Закреплено</span>}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={item.id} className="flex justify-center">
              <div className={`text-[10px] px-3 py-1 rounded-full ${t.chip} ${item.kind === "result" ? "text-teal-700 dark:text-teal-300" : t.muted}`}>
                {item.kind === "result" && <Pin className="w-3 h-3 inline -mt-0.5 mr-1" />}
                {item.kind === "system" && <History className="w-3 h-3 inline -mt-0.5 mr-1" />}
                {item.text}
                {item.author && ` · ${item.author}`}
                <span className="opacity-60 ml-1">{formatShortTime(item.at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {err && <p className="px-3 text-xs text-rose-500 shrink-0">{err}</p>}

      <div className={`p-2.5 sm:p-3 border-t ${t.border} shrink-0`}>
        <div className={`flex gap-2 items-end rounded-xl border px-3 py-2 ${t.surface} ${t.border}`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendComment(); }
            }}
            rows={1}
            placeholder="Сообщение…"
            className={`flex-1 bg-transparent border-0 outline-none text-sm resize-none max-h-24 ${t.text}`}
          />
          <button type="button" onClick={() => void sendComment()} disabled={sending || !draft.trim()}
            className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
        {isWatcher && (
          <p className={`text-[10px] mt-1.5 ${t.muted} hidden sm:block`}>Наблюдатель может закрепить сообщение как результат</p>
        )}
      </div>
    </div>
  );
}

function ChecklistAdd({ onAdd, t }: { onAdd: (text: string) => void; t: Record<string, string> }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-1.5 mt-1">
      <input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text); setText(""); } }}
        placeholder="+ пункт"
        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${t.input}`} />
    </div>
  );
}

function CreateTaskModal({ t, leads, members, user, saving, onClose, onCreate, defaultLeadId }: {
  t: Record<string, string>;
  leads: Lead[];
  members: TeamMember[];
  user: AuthUser;
  saving: boolean;
  onClose: () => void;
  onCreate: (body: Partial<Task> & { text: string }) => Promise<void>;
  defaultLeadId?: string;
}) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState(defaultLeadId || "");
  const [assigneeUserId, setAssigneeUserId] = useState(user.id);
  const [coExecutors, setCoExecutors] = useState<string[]>([]);
  const [watchers, setWatchers] = useState<string[]>([]);
  const [reviewerUserId, setReviewerUserId] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState(() => addBusinessDays(5).slice(0, 16));
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [leadQ, setLeadQ] = useState("");
  const [expanded, setExpanded] = useState(!!defaultLeadId);
  const [submitting, setSubmitting] = useState(false);

  const leadOptions = useMemo(() => {
    const q = leadQ.trim().toLowerCase();
    if (!q) return leads.slice(0, 50);
    return leads.filter((l) => (l.name + (l.phone || "")).toLowerCase().includes(q)).slice(0, 50);
  }, [leads, leadQ]);

  async function submit() {
    if (!text.trim() || saving || submitting) return;
    setSubmitting(true);
    try {
      const assignee = members.find((m) => m.id === assigneeUserId)?.name || user.name;
      await onCreate({
        text: text.trim(),
        description: description.trim() || undefined,
        leadId: leadId || null,
        assigneeUserId: assigneeUserId || user.id,
        assignee,
        coExecutors,
        watchers,
        reviewerUserId,
        priority,
        notifyParticipants,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        status: "new",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 max-h-[90vh] overflow-y-auto nice-scroll ${t.surface} ${t.border}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">Новая задача</h3>
            <p className={`text-xs ${t.muted}`}>Основные поля — сразу, остальное по желанию</p>
          </div>
          <button type="button" onClick={onClose} className={t.muted}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className={`text-xs font-medium ${t.muted}`}>Название *</span>
            <input value={text} onChange={(e) => setText(e.target.value)} autoFocus
              className={`w-full mt-1 rounded-xl border px-3 py-2.5 text-sm ${t.input}`} placeholder="Что нужно сделать" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LeadAssignSection
              t={t}
              label="Исполнитель"
              icon={User}
              assignedMembers={memberById(members, assigneeUserId) ? [memberById(members, assigneeUserId)!] : []}
              pickPool={members.filter((m) => !watchers.includes(m.id) && !coExecutors.includes(m.id) && m.id !== reviewerUserId)}
              editable
              onAdd={setAssigneeUserId}
            />
            <label className="block">
              <span className={`text-xs font-medium ${t.muted}`}>Срок</span>
              <div className="mt-2">
                <GlassDateTimePicker inline value={dueAt} onChange={setDueAt} />
              </div>
            </label>
          </div>
          <button type="button" onClick={() => setExpanded(!expanded)}
            className={`text-xs flex items-center gap-1 ${t.muted} hover:text-teal-600`}>
            <ChevronDown className={`w-3.5 h-3.5 transition ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Скрыть детали" : "Описание, участники, сделка…"}
          </button>
          {expanded && (
            <div className="space-y-3 pt-1 border-t border-dashed">
              <label className="block">
                <span className={`text-xs font-medium ${t.muted}`}>Описание</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
              </label>
              <label className="block">
                <span className={`text-xs font-medium ${t.muted}`}>Сделка</span>
                <input value={leadQ} onChange={(e) => setLeadQ(e.target.value)} placeholder="Поиск…"
                  className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`} />
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)}
                  className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`}>
                  <option value="">Без привязки</option>
                  {leadOptions.map((l) => <option key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ""}</option>)}
                </select>
              </label>
              <div className={`rounded-xl border p-3 space-y-3 ${t.border} ${t.surface}`}>
                <LeadAssignSection
                  t={t}
                  label="Соисполнители"
                  icon={Users}
                  assignedMembers={membersByIds(members, coExecutors)}
                  pickPool={members.filter((m) => m.id !== assigneeUserId)}
                  multiple
                  editable
                  onAdd={(id) => setCoExecutors((prev) => [...new Set([...prev, id])])}
                  onRemove={(id) => setCoExecutors((prev) => prev.filter((x) => x !== id))}
                />
                <LeadAssignSection
                  t={t}
                  label="Наблюдатели"
                  icon={Eye}
                  assignedMembers={membersByIds(members, watchers)}
                  pickPool={members.filter((m) => m.id !== assigneeUserId)}
                  multiple
                  editable
                  onAdd={(id) => setWatchers((prev) => [...new Set([...prev, id])])}
                  onRemove={(id) => setWatchers((prev) => prev.filter((x) => x !== id))}
                />
                <LeadAssignSection
                  t={t}
                  label="Проверяющий"
                  icon={CheckCircle2}
                  assignedMembers={memberById(members, reviewerUserId) ? [memberById(members, reviewerUserId)!] : []}
                  pickPool={members.filter((m) => m.id !== assigneeUserId)}
                  editable
                  onAdd={setReviewerUserId}
                  onRemove={() => setReviewerUserId(null)}
                />
              </div>
              <label className="block">
                <span className={`text-xs font-medium ${t.muted}`}>Приоритет</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className={`w-full mt-1 rounded-lg border px-3 py-2 text-sm ${t.input}`}>
                  {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notifyParticipants} onChange={(e) => setNotifyParticipants(e.target.checked)} className="accent-teal-600" />
                <Bell className="w-4 h-4 text-teal-600" /> Уведомить участников
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className={`px-4 py-2 text-sm ${t.muted}`}>Отмена</button>
          <button type="button" onClick={() => void submit()} disabled={saving || submitting || !text.trim()}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving || submitting ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Компактный блок задач в карточке сделки */
export function LeadTasksBlock({ t, leadId, tasks, realtors, user, updateData, allTasks, leads, onOpenTask }: {
  t: Record<string, string>;
  leadId: string;
  tasks: Task[];
  allTasks: Task[];
  realtors: Realtor[];
  leads: Lead[];
  user: AuthUser;
  updateData: (patch: Partial<CrmData>) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const members = useMemo(() => teamUsers(realtors, user), [realtors, user]);
  const leadTasks = tasks.filter((x) => x.leadId === leadId).map(normalizeTask);

  async function createTask(body: Partial<Task> & { text: string }) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const { task } = await api.createTask({ ...body, leadId, dueAt: body.dueAt ?? addBusinessDays(5) });
      updateData({ tasks: [normalizeTask(task), ...allTasks] });
      setCreateOpen(false);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function toggle(task: Task) {
    const { task: updated } = await api.updateTask(task.id, { status: task.done ? "new" : "completed", done: !task.done });
    updateData({ tasks: allTasks.map((x) => (x.id === task.id ? normalizeTask(updated) : x)) });
  }

  return (
    <div className={`rounded-xl border ${t.surface} ${t.border}`}>
      <div className={`px-4 py-2.5 text-sm font-medium border-b ${t.border} flex items-center gap-2`}>
        <ListTodo className="w-4 h-4 text-teal-600" />
        Задачи
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.chip}`}>{leadTasks.filter((x) => !x.done).length}</span>
      </div>
      <div className="p-3 space-y-2">
        <button type="button" onClick={() => setCreateOpen(true)}
          className="w-full py-2 rounded-lg border border-dashed text-sm text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10">
          + Быстрая задача по сделке
        </button>
        {createOpen && (
          <CreateTaskModal
            t={t}
            leads={leads.filter((l) => l.id === leadId)}
            members={members}
            user={user}
            saving={creating}
            onClose={() => setCreateOpen(false)}
            onCreate={createTask}
            defaultLeadId={leadId}
          />
        )}
        {leadTasks.length === 0 ? (
          <p className={`text-xs ${t.muted} text-center py-2`}>Нет задач</p>
        ) : leadTasks.map((task) => (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenTask?.(task.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenTask?.(task.id); }}
            className={`flex items-center gap-2 text-sm px-2.5 py-2.5 rounded-2xl border cursor-pointer transition hover:brightness-[1.02] active:scale-[0.99] ${task.done ? "opacity-60" : ""}`}
            style={taskStatusContourStyle(task.status, true)}
          >
            <button type="button" onClick={(e) => { e.stopPropagation(); void toggle(task); }}
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${task.done ? "bg-teal-600 border-teal-600 text-white" : t.border}`}>
              {task.done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3 h-3 opacity-40" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate crm-data ${task.done ? "line-through" : ""}`}>{task.text}</div>
              {task.dueAt && (
                <div className={`text-[10px] mt-0.5 ${isOverdue(task) ? "text-rose-600" : t.muted}`}>
                  <Clock className="w-3 h-3 inline" /> {formatDue(task.dueAt)}
                </div>
              )}
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
              style={taskStatusBadgeStyle(task.status)}
            >
              {STATUS_LABELS[task.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
