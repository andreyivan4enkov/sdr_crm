import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Redo2, Sparkles, Undo2 } from "lucide-react";
import { api, hasPermission } from "../../api/client";
import type { ReactorComposePlan, ReactorGraphPreview } from "@sdr-crm/api-client";
import { useAuth } from "../../context/AuthContext";
import { ReactorPlanComposer, type ReactorChatMessage } from "../../views/shared/ReactorPlanComposer";
import { extractMaskStylesFromGraph } from "../../lib/mask-design";
import { loadMaskStylesFromViewGraph } from "./MaskDesignPanel";
import {
  buildMaskComposeMessage,
  canRedoMaskStyles,
  canUndoMaskStyles,
  getMaskEditState,
  mergeMaskStylesFromMap,
  redoMaskStyles,
  subscribeMaskEdit,
  undoMaskStyles,
} from "../../lib/mask-edit-bridge";
import { notifyReactorProductsChanged } from "../../hooks/useReactorProducts";

type Props = {
  slug: string;
};

function livePreviewFromPlan(plan: ReactorComposePlan): number {
  const view = plan.graphs?.view as ReactorGraphPreview | undefined;
  if (!view?.nodes?.length) return 0;
  const styles = extractMaskStylesFromGraph(view);
  const keys = Object.keys(styles);
  if (keys.length) mergeMaskStylesFromMap(styles);
  return keys.length;
}

/** AI-чат режима Маска — закреплён снизу, live-морфинг стилей из plan. */
export function MaskComposePanel({ slug }: Props) {
  const { user } = useAuth();
  const canCompose = hasPermission(user, "reactor.ai");

  const [chat, setChat] = useState<ReactorChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ReactorComposePlan | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [maskHint, setMaskHint] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    return subscribeMaskEdit(() => {
      const { target, productSlug } = getMaskEditState();
      if (target?.component && productSlug === slug) {
        setMaskHint(`Инфоблок ${target.component} — правка всех карточек/элементов этого типа`);
      } else if (target && productSlug === slug) {
        setMaskHint(`Элемент ${target.styleKey}`);
      } else {
        setMaskHint("");
      }
      setCanUndo(canUndoMaskStyles());
      setCanRedo(canRedoMaskStyles());
    });
  }, [slug]);

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || loading || !canCompose) return;
    const { target } = getMaskEditState();
    const composeMsg = target ? buildMaskComposeMessage(msg, target) : msg;
    setChatInput("");
    setChat((c) => [...c, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const r = await api.reactorComposeProduct(slug, {
        message: composeMsg,
        mode: "morph-preview",
        graphKind: "view",
      });
      setPlan(r.plan);
      const styleKeys = livePreviewFromPlan(r.plan);
      setReviewMode(true);
      const morphNote = styleKeys > 0
        ? ` Превью: ${styleKeys} ключ(ей) стилей применено в UI.`
        : "";
      setChat((c) => [...c, { role: "ai", text: `${r.plan.reply}${morphNote}` }]);
    } catch (e) {
      setChat((c) => [...c, { role: "ai", text: e instanceof Error ? e.message : "Ошибка AI" }]);
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading, canCompose, slug]);

  const applyPlan = useCallback(async () => {
    if (!plan || !canCompose) return;
    setLoading(true);
    try {
      livePreviewFromPlan(plan);
      await api.reactorComposeProduct(slug, {
        message: plan.intent,
        mode: "apply",
        plan,
        graphKind: "view",
      });
      setReviewMode(false);
      setPlan(null);
      setChat((c) => [...c, { role: "ai", text: `Маска «${slug}» сохранена.` }]);
      notifyReactorProductsChanged();
      void loadMaskStylesFromViewGraph(slug);
    } catch (e) {
      setChat((c) => [...c, { role: "ai", text: e instanceof Error ? e.message : "Ошибка применения" }]);
    } finally {
      setLoading(false);
    }
  }, [plan, canCompose, slug]);

  const chatHint = useMemo(
    () => "Опишите стиль всего интерфейса (Win98, Star Trek…) или выбранного инфоблока — изменения сразу на экране.",
    [],
  );

  if (!canCompose) {
    return (
      <div className="mask-compose-dock mask-compose-dock--locked">
        <p className="text-xs text-slate-500 px-3 py-2">Нужно право <code>reactor.ai</code> для AI-чата в маске.</p>
      </div>
    );
  }

  return (
    <div className="mask-compose-dock">
      <div className="mask-compose-dock-head">
        <Cpu className="w-4 h-4 text-violet-500" />
        <span>AI Маска</span>
        <Sparkles className="w-3 h-3 text-amber-500 ml-1" />
        <span className="mask-compose-dock-badge">live preview</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            title="Отменить (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => undoMaskStyles()}
            className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            title="Повторить (Ctrl+Y)"
            disabled={!canRedo}
            onClick={() => redoMaskStyles()}
            className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {maskHint && <p className="mask-compose-hint">{maskHint}</p>}
      <ReactorPlanComposer
        className="mask-compose-dock-body"
        chat={chat}
        chatHint={chatHint}
        loading={loading}
        loadingLabel="Морфинг интерфейса…"
        reviewMode={reviewMode}
        reviewStepCount={plan?.steps.length ?? 0}
        reviewSummary={plan?.reply}
        onApprove={() => void applyPlan()}
        onCancelReview={() => { setReviewMode(false); setPlan(null); }}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSendChat={() => void sendChat()}
        chatPlaceholder={maskHint || "Сделай интерфейс в стиле Windows 98 / Star Trek / …"}
        reviewChatPlaceholder="Уточните стиль или нажмите «Применить» для сохранения"
      />
    </div>
  );
}
