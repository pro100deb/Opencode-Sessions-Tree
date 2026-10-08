//--[ Плагин «дерево сессий»: окно /tree плюс боковая панель ]--//
//--[ ]--//
//--[ Окно — штатный диалог выбора, как встроенный список сессий: тот же вид, ]--//
//--[ поиск, действия. В заголовках строк дерево рисуется префиксами. ]--//
//--[ Панель показывает вложенные сессии текущей — только чтение. ]--//

/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { createSessionTreeStore } from "./store.ts";
import { createTreeDialog } from "./tree-dialog.ts";
import { SidebarTree } from "./sidebar.tsx";
import { log } from "./log.ts";

export default Plugin.define({
  id: "session-tree",
  setup(context: Context) {
    const store = createSessionTreeStore(context);
    const dialog = createTreeDialog(context, store);
    log(`setup; opencode=${context.app.version}`);

    const unregisterCommand = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          bindings: ["session-tree.open"],
          commands: [
            {
              id: "session-tree.open",
              title: store.labels.commandTitle,
              description: store.labels.commandDescription,
              group: store.labels.commandGroup,
              bind: "<leader>y",
              slash: { name: "tree", aliases: ["sessiontree", "stree"] },
              palette: true,
              run: () => {
                log("открыто дерево сессий");
                void dialog.open();
              },
            },
          ],
        }));
        return null;
      },
    });

    const unregisterSidebar = context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => (
        <SidebarTree ctx={context} store={store} sessionID={sessionID} />
      ),
    });

    return () => {
      unregisterCommand();
      unregisterSidebar();
      store.cleanup();
      log("dispose");
    };
  },
});
