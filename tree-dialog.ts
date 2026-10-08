//--[ Окно «Sessions» с деревом сессий — тем же диалогом, что и встроенный ]--//
//--[ список сессий. Дерево рисуется префиксами ├─ └─ │ в заголовках строк. ]--//
//--[ Удаление каскадит: родитель уносит вложенных, ребёнок — свою ветку. ]--//

import type {
  Context,
  DialogSelectAction,
  DialogSelectOption,
} from "@opencode/plugin/tui/context";
import { flattenTree, sessionLabel, type TreeRow } from "./forest.ts";
import type { SessionTreeStore } from "./store.ts";
import { log } from "./log.ts";

const TITLE_WIDTH = 60;

export function createTreeDialog(context: Context, store: SessionTreeStore) {
  let open = false;

  //--[ Текущая открытая сессия — для подсветки строки в списке. ]--//
  const currentSessionID = (): string | undefined => {
    const route = context.ui.router.current();
    return route.type === "session" ? route.sessionID : undefined;
  };

  const options = (rows: TreeRow[]): DialogSelectOption<string>[] => {
    const now = Date.now();
    return rows.map((row) => ({
      title: `${row.prefix}${sessionLabel(row.session, {
        status: store.statusOf(row.id),
        titleWidth: TITLE_WIDTH,
        now,
        labels: store.labels,
      })}`,
      value: row.id,
      description: row.session.agent ?? "",
      footer: row.descendantCount > 0 ? `${row.descendantCount}` : undefined,
    }));
  };

  async function remove(row: TreeRow): Promise<void> {
    const labels = store.labels;
    const nested = row.descendantCount;
    const message = nested > 0 ? labels.deleteNested(nested) : labels.deleteOne;
    const ok = await context.ui.dialog.confirm({
      title: labels.deleteTitle,
      message: `${row.session.title ?? row.id}\n\n${message}`,
      label: { confirm: labels.confirmDelete, cancel: labels.cancel },
    });
    if (ok === true) {
      try {
        await context.client.session.remove({ sessionID: row.id });
        log(`удалена ${row.id}; вложенных ${nested}`);
      } catch (cause) {
        log(`удаление ${row.id} не удалось: ${String(cause)}`);
        context.ui.toast.show({
          title: labels.deleteFailed,
          message: String(cause),
          variant: "error",
        });
      }
      const route = context.ui.router.current();
      if (route.type === "session" && route.sessionID === row.id) {
        context.ui.router.navigate({ type: "home" });
      }
    }
    //--[ Дожидаемся свежих данных: иначе окно переоткроется со старыми строками. ]--//
    await store.reload();
    void openDialog();
  }

  async function rename(row: TreeRow): Promise<void> {
    const title = await context.ui.dialog.prompt({
      title: store.labels.renameTitle,
      value: row.session.title ?? "",
    });
    if (title !== undefined) {
      try {
        await context.client.session.update({ sessionID: row.id, title });
      } catch (cause) {
        log(`переименование ${row.id} не удалось: ${String(cause)}`);
      }
    }
    await store.reload();
    void openDialog();
  }

  const actions = (
    byId: Map<string, TreeRow>,
  ): DialogSelectAction<string>[] => [
    {
      bind: "ctrl+d",
      title: store.labels.actionDelete,
      onTrigger: (value: string) => {
        const row = byId.get(value);
        if (row !== undefined) void remove(row);
      },
    },
    {
      bind: "ctrl+r",
      title: store.labels.actionRename,
      onTrigger: (value: string) => {
        const row = byId.get(value);
        if (row !== undefined) void rename(row);
      },
    },
  ];

  /** Открывает окно и возвращается, когда диалог закрыт. */
  async function openDialog(): Promise<void> {
    if (open) return;
    open = true;
    try {
      //--[ Один проход по лесу на открытие: и для списка, и для действий. ]--//
      const rows = flattenTree(store.forest());
      if (rows.length === 0) {
        await context.ui.dialog.alert({
          title: store.labels.dialogTitle,
          message: store.labels.noSessions,
        });
        return;
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      const value = await context.ui.dialog.select<string>({
        title: store.labels.dialogTitle,
        placeholder: "Search",
        options: options(rows),
        current: currentSessionID(),
        actions: actions(byId),
        search: (query, items) => {
          const needle = query.trim().toLowerCase();
          if (needle === "") return items;
          return items.filter((item) =>
            `${item.title} ${item.description ?? ""}`
              .toLowerCase()
              .includes(needle),
          );
        },
      });
      if (value === undefined) return;
      context.ui.router.navigate({ type: "session", sessionID: value });
    } finally {
      open = false;
    }
  }

  return { open: openDialog };
}
