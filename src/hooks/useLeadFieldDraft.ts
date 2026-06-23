import { useCallback, useEffect, useRef, useState } from "react";
import { pushUndo } from "./useUndoStack";

type Options<T> = {
  leadId: string;
  serverValue: T;
  onSave: (value: T) => Promise<void>;
  validate?: (value: T) => string | null;
  /** Сохранять при каждом изменении (с debounce). false — только по onBlur */
  immediate?: boolean;
  debounceMs?: number;
};

export function useLeadFieldDraft<T>({
  leadId,
  serverValue,
  onSave,
  validate,
  immediate = true,
  debounceMs = immediate ? 500 : 0,
}: Options<T>) {
  const [value, setValueState] = useState(serverValue);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValueState(serverValue);
    setError("");
  }, [leadId, serverValue]);

  const flush = useCallback(async (next: T) => {
    const msg = validate?.(next) ?? null;
    if (msg) {
      setError(msg);
      return;
    }
    if (next === serverValue) return;
    const prev = serverValue;
    setSaving(true);
    try {
      await onSave(next);
      setError("");
      pushUndo("изменение поля", () => { void onSave(prev); });
    } catch (e) {
      setError((e as Error).message || "Не удалось сохранить");
      setValueState(serverValue);
    } finally {
      setSaving(false);
    }
  }, [onSave, serverValue, validate]);

  const setValue = useCallback((next: T) => {
    setValueState(next);
    if (!immediate) return;
    if (timer.current) clearTimeout(timer.current);
    if (debounceMs > 0) {
      timer.current = setTimeout(() => { void flush(next); }, debounceMs);
      return;
    }
    void flush(next);
  }, [debounceMs, flush, immediate]);

  const onBlur = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void flush(value);
  }, [flush, value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { value, setValue, setValueState, error, saving, onBlur };
}
