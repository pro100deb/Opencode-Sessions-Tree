//--[ Состояние дерева сессий: один источник правды для страницы и панели ]--//
//--[ ]--//
//--[ Данные берём напрямую у клиента (`session.list` без parentID отдаёт и ]--//
//--[ дочерние — проверено), статусы — у реактивного слоя плагина. ]--//
//--[ Обновление — по событиям с троттлингом плюс редкий страховочный опрос. ]--//

import { createSignal } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import { buildForest, type SessionMeta, type TreeNode } from "./forest.ts";
import { detectLanguage, dictionary, type Dictionary } from "./i18n.ts";

const POLL_MS = 20_000;
const THROTTLE_MS = 800;
const FETCH_LIMIT = 500;

const EVENTS = [
  "session.created",
  "session.deleted",
  "session.moved",
  "session.renamed",
  "session.metadata.updated",
  "session.forked",
  "session.status",
] as const;

export type SessionTreeStore = ReturnType<typeof createSessionTreeStore>;

export function createSessionTreeStore(context: Context) {
  const [rows, setRows] = createSignal<SessionMeta[]>([]);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [loading, setLoading] = createSignal(false);

  //--[ Язык пользователя по окружению; словарь отдаём наружу для UI. ]--//
  const language = detectLanguage();
  const labels: Dictionary = dictionary(language);

  const synced = new Set<string>();
  let disposed = false;
  let lastFetch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const syncMeta = (id: string): void => {
    if (synced.has(id)) return;
    synced.add(id);
    void context.data.session.sync(id).catch(() => synced.delete(id));
  };

  //--[ Текущий запрос: reload обязан дождаться его и сделать свежий, иначе ]--//
  //--[ при переоткрытии списка в окне мелькают уже удалённые строки. ]--//
  let current: Promise<void> | undefined;

  const doFetch = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await context.client.session.list({
        limit: FETCH_LIMIT,
        order: "desc",
      });
      const mapped: SessionMeta[] = [];
      for (const info of response.data) {
        if (typeof info.id !== "string") continue;
        syncMeta(info.id);
        mapped.push({
          id: info.id,
          parentID:
            typeof info.parentID === "string" ? info.parentID : undefined,
          title: typeof info.title === "string" ? info.title : undefined,
          agent: typeof info.agent === "string" ? info.agent : undefined,
          created: info.time?.created,
          updated: info.time?.updated,
        });
      }
      setRows(mapped);
      //--[ Держим `synced` в размере живых сессий, иначе набор растёт. ]--//
      const alive = new Set(mapped.map((session) => session.id));
      for (const id of synced) if (!alive.has(id)) synced.delete(id);
      setError(undefined);
      lastFetch = Date.now();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  const fetchRows = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (current !== undefined) return current;
    current = doFetch().finally(() => {
      current = undefined;
    });
    return current;
  };

  /** Принудительное обновление: ждём текущий запрос и делаем свежий. */
  const reload = async (): Promise<void> => {
    if (current !== undefined) await current.catch(() => {});
    await fetchRows();
  };

  /** Обновление с троттлингом: события приходят пачками. */
  const refresh = (): void => {
    if (disposed) return;
    const elapsed = Date.now() - lastFetch;
    if (elapsed >= THROTTLE_MS) {
      void fetchRows();
      return;
    }
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void fetchRows();
    }, THROTTLE_MS - elapsed);
  };

  const unsubscribers: Array<() => void> = [];
  for (const type of EVENTS) {
    try {
      const off = context.data.on(type, () => refresh());
      if (typeof off === "function") unsubscribers.push(off);
    } catch {}
  }

  const poll = setInterval(() => refresh(), POLL_MS);

  void fetchRows();

  /** Статус сессии из реактивного слоя: "running" или "idle". */
  const statusOf = (id: string): "idle" | "running" => {
    try {
      return context.data.session.status(id);
    } catch {
      return "idle";
    }
  };

  //--[ Лес всех сессий. Кэш по ссылке на список: `createMemo` здесь нельзя — ]--//
  //--[ `setup` плагина может быть вне реактивного корня. Чтение `rows()` ]--//
  //--[ внутри сохраняет реактивность для вызывающих. ]--//
  let forestSource: SessionMeta[] | undefined;
  let forestCache: TreeNode[] = [];
  const forest = (): TreeNode[] => {
    const current = rows();
    if (forestSource !== current) {
      forestSource = current;
      forestCache = buildForest(current);
    }
    return forestCache;
  };

  //--[ Свёрнутые ветки: durable-хранилище переживает перезапуск TUI. ]--//
  const [collapsed, setCollapsedStore] = context.storage.store<{
    ids: string[];
  }>("collapsed", { initial: { ids: [] } });

  /** Реактивный срез свёрнутых id (для построения Set в отрисовке). */
  const collapsedIds = (): readonly string[] => collapsed.ids;

  const toggleCollapsed = (id: string): void => {
    void setCollapsedStore((draft) => {
      draft.ids = draft.ids.includes(id)
        ? draft.ids.filter((value) => value !== id)
        : [...draft.ids, id];
    });
  };

  const cleanup = (): void => {
    disposed = true;
    clearInterval(poll);
    if (timer !== undefined) clearTimeout(timer);
    for (const off of unsubscribers) off();
  };

  return {
    rows,
    error,
    loading,
    forest,
    refresh,
    reload,
    statusOf,
    collapsedIds,
    toggleCollapsed,
    cleanup,
    language,
    labels,
  };
}
