//--[ Боковая панель: вложенные сессии текущей, деревом, только чтение ]--//
//--[ ]--//
//--[ Заголовок секции оформлен как встроенные секции ядра (Context, MCP): ]--//
//--[ треугольник, ЖИРНОЕ название, приглушённый счётчик, клик сворачивает. ]--//
//--[ Название текущей сессии НЕ повторяем — его даёт встроенная шапка. ]--//

/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import {
  descendantForest,
  flattenTree,
  pathToRoot,
  sessionLabel,
} from "./forest.ts";
import type { SessionTreeStore } from "./store.ts";
import { log } from "./log.ts";

const TITLE_WIDTH = 22;
const MAX_DEPTH = 6;

export function SidebarTree(props: {
  ctx: Context;
  store: SessionTreeStore;
  sessionID: string;
}) {
  const [now, setNow] = createSignal(Date.now());
  const [hovered, setHovered] = createSignal<string | undefined>(undefined);

  //--[ Часы для относительного времени; снимаем при размонтировании, ]--//
  //--[ иначе при каждой смене сессии остаётся живой таймер. ]--//
  const tick = setInterval(() => setNow(Date.now()), 5_000);
  onCleanup(() => clearInterval(tick));

  //--[ Свёрнутость секции переживает перезапуск TUI. ]--//
  const [view, setView] = props.ctx.storage.store<{ open: boolean }>(
    "session-tree.sidebar",
    { initial: { open: true } },
  );
  const toggleView = (): void => {
    void setView((draft) => {
      draft.open = !draft.open;
    });
  };

  const familyPath = createMemo(
    () => new Set(pathToRoot(props.store.rows(), props.sessionID)),
  );

  const rows = createMemo(() => {
    const collapsed = new Set(props.store.collapsedIds());
    const forest = descendantForest(props.store.rows(), props.sessionID);
    return flattenTree(forest, {
      collapsed,
      maxDepth: MAX_DEPTH,
      depthBase: 1,
    });
  });

  return (
    <box flexDirection="column" width="100%" paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" gap={1} onMouseDown={toggleView}>
        <text fg={props.ctx.theme.text.base}>{view.open ? "▼" : "▶"}</text>
        <text fg={props.ctx.theme.text.base}>
          <b>{props.store.labels.sidebarTitle}</b>
        </text>
        <Show when={rows().length > 0}>
          <text fg={props.ctx.theme.text.muted}>{`(${rows().length})`}</text>
        </Show>
      </box>
      <Show when={view.open}>
        <Show
          when={rows().length > 0}
          fallback={
            <text fg={props.ctx.theme.text.muted}>
              {`  ${props.store.labels.sidebarEmpty}`}
            </text>
          }
        >
          <For each={rows()}>
            {(row) => {
              const onPath = () => familyPath().has(row.id);
              const isHovered = () => hovered() === row.id;
              const background = () =>
                isHovered()
                  ? props.ctx.theme.background.raised.base
                  : props.ctx.theme.background.base;
              return (
                <box
                  flexDirection="row"
                  width="100%"
                  backgroundColor={background()}
                  onMouseOver={() => setHovered(row.id)}
                  onMouseOut={() => setHovered(undefined)}
                  onMouseDown={() => {
                    log(`панель: открываю ${row.id}`);
                    props.ctx.ui.router.navigate({
                      type: "session",
                      sessionID: row.id,
                    });
                  }}
                >
                  <text
                    fg={props.ctx.theme.text.muted}
                    onMouseDown={(event: { stopPropagation?: () => void }) => {
                      event?.stopPropagation?.();
                      if (row.hasChildren) props.store.toggleCollapsed(row.id);
                    }}
                  >
                    {row.hasChildren ? (row.collapsed ? "▸" : "▾") : " "}
                  </text>
                  <text
                    fg={
                      onPath()
                        ? props.ctx.theme.text.base
                        : props.ctx.theme.text.muted
                    }
                    wrapMode="none"
                  >
                    {` ${row.prefix}${sessionLabel(row.session, {
                      status: props.store.statusOf(row.id),
                      titleWidth: TITLE_WIDTH,
                      now: now(),
                      labels: props.store.labels,
                    })}`}
                  </text>
                </box>
              );
            }}
          </For>
        </Show>
      </Show>
    </box>
  );
}
