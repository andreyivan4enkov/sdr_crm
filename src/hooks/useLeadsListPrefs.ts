import { useEffect, useMemo, useState } from "react";
import type { Field } from "../api/client";
import {
  DEFAULT_VISIBLE_COLUMNS,
  buildLeadColumns,
  type LeadColumnId,
  type LeadListColumn,
  type SortDir,
  resolveVisibleColumns,
} from "../lib/leads-list-columns";

const COLS_KEY = "jbr:leads-list-cols";
const SORT_KEY = "jbr:leads-list-sort-col";
const DIR_KEY = "jbr:leads-list-sort-dir";

function readCols(fallback: LeadColumnId[]): LeadColumnId[] {
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as LeadColumnId[];
    if (!Array.isArray(parsed) || !parsed.length) return fallback;
    return parsed.includes("name") ? parsed : ["name", ...parsed];
  } catch {
    return fallback;
  }
}

function readSort(fallback: LeadColumnId): LeadColumnId {
  try {
    const v = localStorage.getItem(SORT_KEY) as LeadColumnId | null;
    return v || fallback;
  } catch {
    return fallback;
  }
}

function readDir(fallback: SortDir): SortDir {
  try {
    const v = localStorage.getItem(DIR_KEY);
    if (v === "asc" || v === "desc") return v;
  } catch { /* ignore */ }
  return fallback;
}

export function useLeadsListPrefs(fields: Field[]) {
  const allColumns = useMemo(() => buildLeadColumns(fields), [fields]);
  const allowed = useMemo(() => new Set(allColumns.map((c) => c.id)), [allColumns]);

  const [visibleIds, setVisibleIds] = useState<LeadColumnId[]>(() => readCols(DEFAULT_VISIBLE_COLUMNS));
  const [sortCol, setSortCol] = useState<LeadColumnId>(() => readSort("updatedAt"));
  const [sortDir, setSortDir] = useState<SortDir>(() => readDir("desc"));

  useEffect(() => {
    setVisibleIds((prev) => {
      const merged = prev.filter((id) => allowed.has(id));
      if (!merged.includes("name")) merged.unshift("name");
      if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) return prev;
      return merged.length ? merged : DEFAULT_VISIBLE_COLUMNS.filter((id) => allowed.has(id));
    });
    setSortCol((prev) => (allowed.has(prev) ? prev : "updatedAt"));
  }, [allowed]);

  useEffect(() => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(visibleIds)); } catch { /* ignore */ }
  }, [visibleIds]);

  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, sortCol); } catch { /* ignore */ }
  }, [sortCol]);

  useEffect(() => {
    try { localStorage.setItem(DIR_KEY, sortDir); } catch { /* ignore */ }
  }, [sortDir]);

  const visibleColumns: LeadListColumn[] = useMemo(
    () => resolveVisibleColumns(allColumns, visibleIds),
    [allColumns, visibleIds],
  );

  function toggleColumn(id: LeadColumnId) {
    if (id === "name") return;
    setVisibleIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : ["name"];
      }
      const order = allColumns.map((c) => c.id);
      const next = [...prev, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return next;
    });
  }

  function resetColumns() {
    setVisibleIds(DEFAULT_VISIBLE_COLUMNS.filter((id) => allowed.has(id)));
  }

  function toggleSort(col: LeadColumnId) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir(col === "name" || col === "phone" || col === "responsible" ? "asc" : "desc");
    }
  }

  return {
    allColumns,
    visibleColumns,
    visibleIds,
    sortCol,
    sortDir,
    toggleColumn,
    resetColumns,
    toggleSort,
  };
}
