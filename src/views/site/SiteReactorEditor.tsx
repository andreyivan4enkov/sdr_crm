import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Globe, X, Save, Sparkles, Send, Loader2, Play, Plus, Trash2,
  MousePointer2, Hand, LayoutGrid, Monitor, Code2, Cpu, Link2, ExternalLink,
} from "lucide-react";
import {
  SITE_BLOCK_DEFS, SITE_BLOCK_GROUPS, blockPreviewText, defaultBlock,
  compileFullPage, compileSiteCss, compileSiteBody, renderBlockHtml,
  siteDocumentToManifest, demoKanbanManifest,
  type SiteBlockType, type SiteLinkKind,
} from "@sdr-crm/site-core";
import { ReactorPlanComposer } from "../shared/ReactorPlanComposer";
import { planToComposerText, applyComposerToPlan } from "../shared/reactor-plan-text";
import type { BuildLogEntry, BuildLogKind } from "../blueprint/blueprint-build-animate";
import { UiManifestRenderer, type UiManifestData } from "../../components/ui-manifest/UiManifestRenderer";
import {
  api, type SiteDocument, type SiteSpace, type SiteBuildPlan, type SiteAiMode, type SiteBlock,
  type SiteEntityBinding, type BlueprintSpace,
} from "../../api/client";
import "../blueprint/blueprint-canvas.css";
import "./site-reactor.css";
import { useTheme } from "../../context/ThemeProvider";
import { sanitizeHtmlPreview } from "../../lib/sanitize-html";

type ViewMode = "reactor" | "page" | "manifest" | "code";
type CodeTab = "html" | "css";

const LINK_COLORS: Record<SiteLinkKind, string> = {
  data: "#14b8a6",
  nav: "#f59e0b",
  entity: "#a78bfa",
  flow: "#818cf8",
};

const CANVAS_BLOCK_W = 260;

type Props = {
  spaceId: string;
  onClose: () => void;
  onDeleted?: () => void;
  t: Record<string, string>;
  fields?: { id: string; label: string; type: string }[];
  embedded?: boolean;
  onOpenBlueprint?: (blueprintId: string) => void;
  initialAiPrompt?: string;
  onInitialAiPromptConsumed?: () => void;
};

function blockInlineCss(css?: Record<string, string>): React.CSSProperties {
  if (!css) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(css)) {
    const key = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    out[key] = v;
  }
  return out as React.CSSProperties;
}

function canvasSize(b: SiteBlock) {
  return { w: Math.min(b.w, CANVAS_BLOCK_W), h: Math.min(b.h, 200) };
}

export function SiteReactorEditor({
  spaceId, onClose, onDeleted, t, fields = [], embedded = false, onOpenBlueprint,
  initialAiPrompt, onInitialAiPromptConsumed,
}: Props) {
  const { theme } = useTheme();
  const [space, setSpace] = useState<SiteSpace | null>(null);
  const [doc, setDoc] = useState<SiteDocument>({ pages: [], activePageId: "", blocks: [], links: [], theme: {} });
  const [blueprints, setBlueprints] = useState<BlueprintSpace[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.9);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const [mode, setMode] = useState<"select" | "pan">("select");
  const [palette, setPalette] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("reactor");
  const [codeTab, setCodeTab] = useState<CodeTab>("html");
  const [aiMode, setAiMode] = useState<SiteAiMode>("plan");
  const [plan, setPlan] = useState<SiteBuildPlan | null>(null);
  const [executingPlan, setExecutingPlan] = useState(false);
  const [execStepIdx, setExecStepIdx] = useState<number | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [planText, setPlanText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const [aiHint, setAiHint] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [manifestData, setManifestData] = useState<UiManifestData>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; nx: number; ny: number } | null>(null);
  const suppressDirty = useRef(true);
  const [buildLog, setBuildLog] = useState<BuildLogEntry[]>([]);
  const buildLogRef = useRef<HTMLDivElement>(null);
  const logSeq = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const initialPromptSent = useRef(false);

  panRef.current = pan;
  zoomRef.current = zoom;

  const pageHtml = useMemo(() => compileFullPage(doc as never, space?.name), [doc, space?.name]);
  const pageCss = useMemo(() => compileSiteCss(doc as never), [doc]);
  const pageBody = useMemo(() => compileSiteBody(doc as never), [doc]);
  const bpById = useMemo(() => Object.fromEntries(blueprints.map((b) => [b.id, b])), [blueprints]);

  const load = useCallback(async () => {
    suppressDirty.current = true;
    const [{ space: s }, { reactions: bp }] = await Promise.all([
      api.getSite(spaceId),
      api.listReactions().catch(() => ({ reactions: [] as BlueprintSpace[] })),
    ]);
    setSpace(s);
    setDoc(s.document);
    setBlueprints(bp);
    setDirty(false);
    requestAnimationFrame(() => { suppressDirty.current = false; });
  }, [spaceId]);

  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : "Ошибка")); }, [load]);

  const save = useCallback(async () => {
    if (!space) return false;
    setSaving(true);
    setErr("");
    try {
      const { space: s } = await api.updateSite(space.id, { document: docRef.current });
      setSpace(s);
      setDirty(false);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
      return false;
    } finally {
      setSaving(false);
    }
  }, [space]);

  useEffect(() => {
    if (suppressDirty.current) return;
    setDirty(true);
  }, [doc]);

  useEffect(() => {
    if (!dirty || !space || executingPlan || loading) return;
    const timer = setTimeout(() => { void save(); }, 2500);
    return () => clearTimeout(timer);
  }, [dirty, doc, space, executingPlan, loading, save]);

  const pushBuildLog = useCallback((text: string, kind: BuildLogKind = "info") => {
    logSeq.current += 1;
    setBuildLog((prev) => [...prev, { id: `site-${logSeq.current}`, text, kind }]);
  }, []);

  useEffect(() => {
    buildLogRef.current?.scrollTo({ top: buildLogRef.current.scrollHeight, behavior: "smooth" });
  }, [buildLog]);

  useEffect(() => {
    void api.getSettingsAi().then(({ config }) => {
      const m = (config as { modules?: { site?: { enabled?: boolean } } }).modules?.site;
      if (config.enabled === false || m?.enabled === false) {
        setAiHint("AI сайтов выключен — включите в Настройки → AI → Реактор сайтов.");
      } else if (!(config as { configured?: boolean }).configured) {
        setAiHint("AI не настроен — укажите провайдера в Настройки → AI.");
      } else setAiHint("");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await api.getSettings().catch(() => null);
        if (cancelled || !settings) return;
        const leadsRes = await api.getLeads({ limit: 200 }).catch(() => ({ leads: [] }));
        if (cancelled) return;
        setManifestData({
          pipelines: settings.pipelines?.map((p) => ({ id: p.id, name: p.name })),
          stages: settings.stages?.map((s) => ({ id: s.id, label: s.label, pipelineId: s.pipelineId, color: s.color })),
          leads: (leadsRes.leads || []).slice(0, 200).map((l) => ({
            id: l.id,
            name: l.name,
            statusId: l.statusId,
            pipelineId: l.pipelineId,
          })),
        });
      } catch { /* manifest preview optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || viewMode !== "reactor") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const z0 = zoomRef.current;
      const p0 = panRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const z1 = Math.min(2.5, Math.max(0.25, z0 * factor));
      const wx = (mx - p0.x) / z0;
      const wy = (my - p0.y) / z0;
      const p1 = { x: mx - wx * z1, y: my - wy * z1 };
      panRef.current = p1;
      zoomRef.current = z1;
      setPan(p1);
      setZoom(z1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode]);

  const removeSite = async () => {
    if (!space) return;
    if (!confirm(`Удалить лендинг «${space.name}»? Это действие нельзя отменить.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.deleteSite(space.id);
      if (onDeleted) onDeleted();
      else onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить");
      setSaving(false);
    }
  };

  const addBlock = (type: SiteBlockType) => {
    const id = `b-${Date.now().toString(36)}`;
    const last = doc.blocks[doc.blocks.length - 1];
    const y = last ? last.y + canvasSize(last).h + 28 : 40;
    setDoc((d) => ({ ...d, blocks: [...d.blocks, defaultBlock(type, id, 40, y)] }));
    setSelection(new Set([id]));
    setPalette(false);
  };

  const updateBlock = (id: string, patch: Partial<SiteBlock>) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };

  const updateDoc = (patch: Partial<SiteDocument>) => {
    setDoc((d) => ({ ...d, ...patch }));
  };

  const deleteBlocks = (ids: string[]) => {
    const rm = new Set(ids);
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.filter((b) => !rm.has(b.id)),
      links: d.links.filter((l) => !rm.has(l.from) && !rm.has(l.to)),
    }));
    setSelection(new Set());
  };

  const addLink = (from: string, to: string, kind: SiteLinkKind = "data") => {
    if (from === to) return;
    const id = `l-${from}-${to}`;
    setDoc((d) => ({
      ...d,
      links: [
        ...d.links.filter((l) => l.id !== id),
        { id, from, to, kind, label: SITE_BLOCK_DEFS[d.blocks.find((b) => b.id === from)?.type || "div"]?.label },
      ],
    }));
    setPendingLink(null);
  };

  const onOutPort = (e: React.PointerEvent, blockId: string) => {
    e.stopPropagation();
    setPendingLink((p) => (p === blockId ? null : blockId));
  };

  const onInPort = (e: React.PointerEvent, blockId: string) => {
    e.stopPropagation();
    if (!pendingLink || pendingLink === blockId) {
      setPendingLink(null);
      return;
    }
    const fromBlock = doc.blocks.find((b) => b.id === pendingLink);
    const kind: SiteLinkKind = fromBlock?.type === "blueprint" || doc.blocks.find((b) => b.id === blockId)?.type === "blueprint"
      ? "flow" : fromBlock?.type === "form" ? "entity" : "data";
    addLink(pendingLink, blockId, kind);
  };

  const removeLink = (linkId: string) => {
    setDoc((d) => ({ ...d, links: d.links.filter((l) => l.id !== linkId) }));
  };

  const applyAiDocument = (next: SiteDocument) => {
    setDoc(next);
    suppressDirty.current = false;
    setViewMode(next.blocks.length ? "page" : next.uiManifest ? "manifest" : "page");
  };

  const activeManifest = useMemo(() => {
    if (doc.uiManifest) return doc.uiManifest as never;
    const converted = siteDocumentToManifest(doc as never, space?.name);
    const defaultPipeline = manifestData.pipelines?.[0]?.id;
    if (converted.components.some((c) => c.component === "kanban.pipeline")) return converted;
    if (defaultPipeline) return demoKanbanManifest(defaultPipeline);
    return converted;
  }, [doc, space?.name, manifestData.pipelines]);

  const composerReview = Boolean(plan && !executingPlan);

  const sitePlanToText = (p: SiteBuildPlan) => planToComposerText({
    goal: p.goal,
    reasoning: p.reasoning,
    steps: p.steps.map((s) => ({ title: s.title, detail: [s.goal, s.detail].filter(Boolean).join(" — ") })),
    originalMessage: p.originalMessage,
  });

  const sendAi = async (forcedText?: string) => {
    const text = (forcedText ?? chatInput).trim();
    if (!text || loading) return;
    const refining = composerReview && !!plan;
    setChat((c) => [...c, { role: "user", text }]);
    if (!forcedText) setChatInput("");
    setLoading(true);
    setErr("");
    setReasoning("");
    try {
      const r = await api.siteAi(spaceId, {
        mode: aiMode,
        message: text,
        document: doc,
        selection: [...selection],
        plan: refining && plan ? applyComposerToPlan(plan, planText) : plan || undefined,
      });
      if (r.reasoning) setReasoning(r.reasoning);
      if (r.plan && aiMode === "plan") {
        setPlan(r.plan);
        setPlanText(sitePlanToText(r.plan));
        setChat((c) => [...c, {
          role: "ai",
          text: refining
            ? `План обновлён — ${r.plan!.steps.length} шагов.`
            : `План готов — ${r.plan!.steps.length} шагов. Согласуйте ниже.`,
        }]);
      } else if (r.document) {
        applyAiDocument(r.document);
        setChat((c) => [...c, { role: "ai", text: r.reply || "Страница обновлена." }]);
      }
      if (r.aiError) setAiHint(r.aiError);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка AI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialAiPrompt || initialPromptSent.current || !space || loading) return;
    initialPromptSent.current = true;
    void sendAi(initialAiPrompt).finally(() => onInitialAiPromptConsumed?.());
  }, [initialAiPrompt, space, loading, onInitialAiPromptConsumed]);

  const executePlan = async () => {
    if (!plan?.steps.length) return;
    const approved = applyComposerToPlan(plan, planText);
    setExecutingPlan(true);
    setExecStepIdx(0);
    setBuildLog([]);
    logSeq.current = 0;
    pushBuildLog(`Запуск сборки: ${approved.steps.length} шагов`, "step");
    let currentDoc = doc;
    let currentPlan = approved;
    try {
      for (let i = 0; i < approved.steps.length; i++) {
        setExecStepIdx(i);
        const step = approved.steps[i];
        pushBuildLog(`Шаг ${i + 1}/${approved.steps.length}: ${step?.title ?? "—"}`, "step");
        if (step?.detail) pushBuildLog(step.detail, "info");
        const r = await api.siteAi(spaceId, {
          mode: "execute",
          message: approved.originalMessage,
          document: currentDoc,
          plan: currentPlan,
          stepIndex: i,
        });
        if (r.document) {
          currentDoc = r.document;
          pushBuildLog("Блоки обновлены на канвасе", "info");
        }
        if (r.plan) currentPlan = r.plan;
        if (r.reasoning) setReasoning(r.reasoning);
        if (r.reply) pushBuildLog(r.reply, "info");
      }
      applyAiDocument(currentDoc);
      setPlan(null);
      setPlanText("");
      pushBuildLog("Готово — сохранено", "done");
      setChat((c) => [...c, { role: "ai", text: "План выполнен — страница обновлена." }]);
      await save();
    } catch (e) {
      pushBuildLog(e instanceof Error ? e.message : "Ошибка выполнения", "error");
      setErr(e instanceof Error ? e.message : "Ошибка выполнения плана");
    } finally {
      setExecutingPlan(false);
      setExecStepIdx(null);
    }
  };

  const cancelPlan = () => {
    setPlan(null);
    setPlanText("");
    setBuildLog([]);
  };

  const single = selection.size === 1 ? doc.blocks.find((b) => selection.has(b.id)) : undefined;
  const blockLinks = single
    ? doc.links.filter((l) => l.from === single.id || l.to === single.id)
    : [];

  return (
    <div
      className={`bp-canvas-root flex flex-col ${embedded ? "relative flex-1 min-h-0 rounded-xl overflow-hidden" : "fixed inset-0 z-[200]"} ${t.app}`}
      data-color-mode={theme.colorMode}
      data-ui-skin={theme.uiSkin}
    >
      <header className="bp-topbar">
        <Globe size={18} className="text-teal-600 shrink-0" />
        <span className="bp-topbar-title">{space?.name || "Реактор сайтов"}</span>
        <span className="bp-topbar-meta">
          {doc.blocks.length} блоков · {doc.links.length} связей · {Math.round(zoom * 100)}% · {dirty ? "не сохранено" : "сохранено"}
        </span>
        {doc.blueprintSpaceId && bpById[doc.blueprintSpaceId] && (
          <button
            type="button"
            className="site-bp-chip"
            onClick={() => onOpenBlueprint?.(doc.blueprintSpaceId!)}
            title="Открыть процесс Реактора"
          >
            <Cpu size={12} /> {bpById[doc.blueprintSpaceId].name}
          </button>
        )}
        <div className="flex-1" />
        <div className="site-view-modes bp-seg">
          <button type="button" className={viewMode === "reactor" ? "on" : ""} onClick={() => setViewMode("reactor")} title="Реактор — блоки и связи">
            <LayoutGrid size={13} /> <span className="hidden sm:inline">Реактор</span>
          </button>
          <button type="button" className={viewMode === "page" ? "on" : ""} onClick={() => setViewMode("page")} title="Превью сайта">
            <Monitor size={13} /> <span className="hidden sm:inline">Сайт</span>
          </button>
          <button type="button" className={viewMode === "code" ? "on" : ""} onClick={() => setViewMode("code")} title="HTML и CSS">
            <Code2 size={13} /> <span className="hidden sm:inline">Код</span>
          </button>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving || !!loading || !dirty} className="bp-btn-primary">
          <Save size={14} /> {saving ? "Сохранение…" : dirty ? "Сохранить" : "Сохранено"}
        </button>
        <button
          type="button"
          onClick={() => void removeSite()}
          disabled={saving || !space}
          className="bp-btn-ghost text-rose-500 hover:text-rose-600"
          title="Удалить лендинг"
        >
          <Trash2 size={16} />
        </button>
        <button type="button" onClick={onClose} className="bp-btn-ghost"><X size={18} /></button>
      </header>

      {err && <p className="text-sm text-rose-500 px-4 py-1">{err}</p>}

      <div className="flex flex-1 min-h-0">
        {viewMode === "manifest" && (
          <div className="site-page-frame flex-1 min-h-0 overflow-auto">
            <UiManifestRenderer
              manifest={activeManifest}
              data={manifestData}
              runtimeContext={{
                pipelineId: manifestData.pipelines?.[0]?.id ?? null,
              }}
              onPatchFields={async (entityType, entityId, patches) => {
                const r = await api.agentPatchFields(
                  entityType as "lead" | "task" | "contact" | "legal_entity",
                  entityId,
                  patches,
                );
                if (r.ok) {
                  const leadsRes = await api.getLeads({ limit: 200 }).catch(() => null);
                  if (leadsRes?.leads) {
                    setManifestData((prev) => ({
                      ...prev,
                      leads: leadsRes.leads.slice(0, 200).map((l) => ({
                        id: l.id,
                        name: l.name,
                        statusId: l.statusId,
                        pipelineId: l.pipelineId,
                      })),
                    }));
                  }
                }
                return { ok: r.ok, error: r.errors?.[0]?.message };
              }}
              onRunBlueprint={async (spaceId, leadId) => {
                if (!leadId) return;
                await api.runReaction(spaceId, { leadId });
              }}
            />
          </div>
        )}

        {viewMode === "page" && (
          <div className="site-page-frame flex-1 min-h-0">
            {doc.blocks.length === 0 ? (
              <div className="site-page-empty">
                <p>Добавьте блоки или попросите AI собрать лендинг</p>
              </div>
            ) : (
              <iframe
                key={pageHtml.length}
                title="Превью страницы"
                className="site-page-iframe"
                srcDoc={pageHtml}
                sandbox="allow-same-origin"
              />
            )}
          </div>
        )}

        {viewMode === "code" && (
          <div className="site-code-panel flex-1 min-h-0 flex flex-col">
            <div className="site-code-tabs">
              <button type="button" className={codeTab === "html" ? "on" : ""} onClick={() => setCodeTab("html")}>HTML</button>
              <button type="button" className={codeTab === "css" ? "on" : ""} onClick={() => setCodeTab("css")}>CSS</button>
            </div>
            <textarea
              className="site-code-editor"
              readOnly
              spellCheck={false}
              value={codeTab === "css" ? pageCss : pageBody}
            />
            <details className="site-code-full-doc">
              <summary>Экспорт полного HTML-документа</summary>
              <textarea className="site-code-editor site-code-editor--full" readOnly spellCheck={false} value={pageHtml} />
            </details>
          </div>
        )}

        {viewMode === "reactor" && (
          <div
            ref={canvasRef}
            className="bp-canvas relative flex-1 overflow-hidden"
            style={{ cursor: mode === "pan" ? "grab" : "default" }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).dataset.bg !== "1") return;
              setSelection(new Set());
              setPendingLink(null);
              if (mode === "pan") drag.current = { id: "__pan__", sx: e.clientX, sy: e.clientY, nx: pan.x, ny: pan.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (d.id === "__pan__") {
                setPan({ x: d.nx + e.clientX - d.sx, y: d.ny + e.clientY - d.sy });
                return;
              }
              const dx = (e.clientX - d.sx) / zoom;
              const dy = (e.clientY - d.sy) / zoom;
              updateBlock(d.id, { x: d.nx + dx, y: d.ny + dy });
            }}
            onPointerUp={() => { drag.current = null; }}
            data-bg="1"
          >
            <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", position: "absolute", inset: 0 }} data-bg="1">
              <svg className="site-links-svg" style={{ position: "absolute", overflow: "visible", width: 1, height: 1, pointerEvents: "none" }}>
                {doc.links.map((l) => {
                  const a = doc.blocks.find((b) => b.id === l.from);
                  const b = doc.blocks.find((x) => x.id === l.to);
                  if (!a || !b) return null;
                  const as = canvasSize(a);
                  const bs = canvasSize(b);
                  const x1 = a.x + as.w / 2; const y1 = a.y + as.h;
                  const x2 = b.x + bs.w / 2; const y2 = b.y;
                  const color = LINK_COLORS[l.kind] || LINK_COLORS.data;
                  return (
                    <path
                      key={l.id}
                      d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      opacity={0.65}
                    />
                  );
                })}
              </svg>
              {doc.blocks.map((b) => {
                const def = SITE_BLOCK_DEFS[b.type];
                const sel = selection.has(b.id);
                const previewHtml = renderBlockHtml(b);
                const { w, h } = canvasSize(b);
                const bpName = b.entity?.kind === "blueprint" && b.entity.ref ? bpById[b.entity.ref]?.name : null;
                return (
                  <div
                    key={b.id}
                    className={`site-block site-block--live ${sel ? "sel" : ""} ${pendingLink === b.id ? "link-pending" : ""}`}
                    style={{ left: b.x, top: b.y, width: w, minHeight: h, borderColor: def.color }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = { id: b.id, sx: e.clientX, sy: e.clientY, nx: b.x, ny: b.y };
                      setSelection(new Set([b.id]));
                    }}
                  >
                    <div
                      className="site-port site-port-in"
                      onPointerDown={(e) => onInPort(e, b.id)}
                      title="Вход — связь данных"
                    />
                    <div className="site-block-head" style={{ color: def.color }}>
                      {def.label}
                      {bpName && <span className="site-block-bp-tag">{bpName}</span>}
                    </div>
                    <div
                      className="site-block-live"
                      style={blockInlineCss(b.css)}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtmlPreview(previewHtml) }}
                    />
                    {!b.html?.trim() && (
                      <div className="site-block-fallback">{blockPreviewText(b)}</div>
                    )}
                    <div
                      className="site-port site-port-out"
                      onPointerDown={(e) => onOutPort(e, b.id)}
                      title="Выход — потяните связь к другому блоку"
                    />
                  </div>
                );
              })}
            </div>

            <div className="site-toolbar absolute top-3 left-3 z-10">
              <button type="button" onClick={() => setPalette((p) => !p)} className="bp-mini bp-floating">
                <Plus size={13} className="text-teal-600" /> Блок
              </button>
              <div className="bp-seg bp-floating">
                <button type="button" className={mode === "select" ? "on" : ""} onClick={() => setMode("select")} title="Выделение">
                  <MousePointer2 size={13} />
                </button>
                <button type="button" className={mode === "pan" ? "on" : ""} onClick={() => setMode("pan")} title="Панорама">
                  <Hand size={13} />
                </button>
              </div>
            </div>

            {palette && (
              <div className="absolute top-12 left-3 w-52 bp-floating bp-palette p-1 z-20 site-palette-popup">
                {Object.entries(SITE_BLOCK_GROUPS).map(([gk, g]) => (
                  <div key={gk}>
                    <div className="bp-palette-group" style={{ color: g.color }}>{g.name}</div>
                    {g.types.map((tk) => (
                      <button key={tk} type="button" onClick={() => addBlock(tk)} className="bp-palette-item">
                        <Plus size={12} style={{ color: g.color }} /> {SITE_BLOCK_DEFS[tk].label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {pendingLink && (
              <div className="bp-pending-hint">
                Связь от блока — кликните <span className="text-teal-600 font-medium">вход</span> целевого блока
              </div>
            )}

            {(buildLog.length > 0 || executingPlan) && (
              <div className="bp-build-log">
                <div className="bp-build-log-head">
                  {executingPlan ? <Loader2 size={13} className="bp-build-spin" /> : <Cpu size={13} />}
                  Сборка страницы
                  {executingPlan && execStepIdx != null && plan && (
                    <span className="bp-build-progress">{execStepIdx + 1}/{plan.steps.length}</span>
                  )}
                </div>
                <div className="bp-build-log-scroll" ref={buildLogRef}>
                  {buildLog.map((entry) => (
                    <div key={entry.id} className={`bp-build-log-line bp-build-${entry.kind}`}>{entry.text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <aside className="bp-side">
          <div className="bp-side-head">
            <Sparkles size={14} className="text-teal-600" />
            AI · сайт
            <div className="bp-ai-mode ml-auto">
              <button type="button" className={aiMode === "direct" ? "on" : ""} onClick={() => setAiMode("direct")}>Быстро</button>
              <button type="button" className={aiMode === "plan" ? "on" : ""} onClick={() => setAiMode("plan")}>План</button>
            </div>
          </div>
          <div className="bp-side-body">
            <div className="bp-side-panel flex-1 min-h-0 overflow-y-auto">
              {aiHint && <p className="text-xs text-amber-600">{aiHint}</p>}
              {viewMode === "reactor" && (
                <div className="bp-inspector mb-3">
                  <label className="bp-inspector-label flex items-center gap-1"><Cpu size={12} /> Процесс Реактора (сайт)</label>
                  <select
                    value={doc.blueprintSpaceId || ""}
                    onChange={(e) => updateDoc({ blueprintSpaceId: e.target.value || undefined })}
                    className="bp-input w-full text-xs"
                  >
                    <option value="">— без автоматизации —</option>
                    {blueprints.map((bp) => (
                      <option key={bp.id} value={bp.id}>{bp.name}</option>
                    ))}
                  </select>
                  {doc.blueprintSpaceId && onOpenBlueprint && (
                    <button type="button" className="text-xs text-teal-600 mt-1 flex items-center gap-1" onClick={() => onOpenBlueprint(doc.blueprintSpaceId!)}>
                      <ExternalLink size={11} /> Открыть граф процесса
                    </button>
                  )}
                </div>
              )}

              {single && viewMode === "reactor" && (
                <div className="bp-inspector">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold">{SITE_BLOCK_DEFS[single.type].label}</span>
                    <button type="button" onClick={() => deleteBlocks([single.id])} className="text-rose-500"><Trash2 size={13} /></button>
                  </div>
                  <label className="bp-inspector-label">Текст</label>
                  <textarea value={single.text || ""} onChange={(e) => updateBlock(single.id, { text: e.target.value })} className="bp-input w-full" rows={2} />
                  <label className="bp-inspector-label">HTML</label>
                  <textarea value={single.html || ""} onChange={(e) => updateBlock(single.id, { html: e.target.value })} className="bp-input w-full font-mono text-xs" rows={3} />

                  {(single.type === "entity" || single.type === "form" || single.type === "blueprint") && (
                    <>
                      <label className="bp-inspector-label">CRM / Реактор</label>
                      <select
                        value={single.entity?.kind || ""}
                        onChange={(e) => {
                          const kind = e.target.value as SiteEntityBinding["kind"] | "";
                          updateBlock(single.id, { entity: kind ? { kind } : undefined });
                        }}
                        className="bp-input w-full"
                      >
                        <option value="">— нет —</option>
                        <option value="lead">Лид</option>
                        <option value="pipeline">Воронка</option>
                        <option value="stage">Этап</option>
                        <option value="field">Поле</option>
                        <option value="form">Форма</option>
                        <option value="blueprint">Процесс Реактора</option>
                      </select>
                    </>
                  )}

                  {single.entity?.kind === "field" && (
                    <select
                      value={single.entity.field || ""}
                      onChange={(e) => updateBlock(single.id, { entity: { ...single.entity!, field: e.target.value } })}
                      className="bp-input w-full mt-1"
                    >
                      <option value="">поле…</option>
                      {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  )}

                  {(single.entity?.kind === "blueprint" || single.type === "blueprint") && (
                    <>
                      <select
                        value={single.entity?.ref || doc.blueprintSpaceId || ""}
                        onChange={(e) => updateBlock(single.id, {
                          entity: { kind: "blueprint", ref: e.target.value },
                        })}
                        className="bp-input w-full mt-1"
                      >
                        <option value="">процесс…</option>
                        {blueprints.map((bp) => (
                          <option key={bp.id} value={bp.id}>{bp.name}</option>
                        ))}
                      </select>
                      {single.entity?.ref && onOpenBlueprint && (
                        <button type="button" className="text-xs text-indigo-500 mt-1 flex items-center gap-1" onClick={() => onOpenBlueprint(single.entity!.ref!)}>
                          <ExternalLink size={11} /> Редактировать процесс
                        </button>
                      )}
                    </>
                  )}

                  {blockLinks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--bp-border)]">
                      <label className="bp-inspector-label flex items-center gap-1"><Link2 size={11} /> Связи</label>
                      {blockLinks.map((l) => {
                        const other = l.from === single.id ? l.to : l.from;
                        const otherBlock = doc.blocks.find((b) => b.id === other);
                        return (
                          <div key={l.id} className="flex items-center gap-1 text-xs mt-1">
                            <span className="site-link-kind" style={{ color: LINK_COLORS[l.kind] }}>{l.kind}</span>
                            <span className="truncate flex-1">{otherBlock ? SITE_BLOCK_DEFS[otherBlock.type].label : other}</span>
                            <button type="button" onClick={() => removeLink(l.id)} className="text-rose-400"><Trash2 size={10} /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="bp-side-chat flex-1 min-h-0 flex flex-col">
              <ReactorPlanComposer
                chat={chat}
                chatHint={aiMode === "plan"
                  ? "Опишите страницу — план появится в поле согласования."
                  : "Опишите изменения — блоки обновятся на канвасе."}
                loading={loading && !executingPlan}
                loadingLabel="Составляю план…"
                executing={executingPlan}
                executingLabel={execStepIdx !== null && plan ? `Шаг ${execStepIdx + 1}/${plan.steps.length}` : undefined}
                reviewMode={composerReview && aiMode === "plan"}
                reviewStepCount={plan?.steps.length ?? 0}
                reviewSummary={plan?.reply}
                reviewReasoning={plan?.reasoning || reasoning || undefined}
                planText={planText}
                onPlanTextChange={setPlanText}
                onApprove={() => void executePlan()}
                onCancelReview={cancelPlan}
                approveDisabled={!plan?.steps.length}
                chatInput={chatInput}
                onChatInputChange={setChatInput}
                onSendChat={() => void sendAi()}
                chatPlaceholder={aiMode === "plan" ? "Опишите страницу для плана…" : "Изменить блоки, дизайн…"}
                reviewChatPlaceholder="Уточните в чате — план обновится в поле выше"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
