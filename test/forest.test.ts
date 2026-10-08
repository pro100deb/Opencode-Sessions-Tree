//--[ Тесты чистой логики леса сессий ]--//
//--[ Запуск: bun test ~/.config/opencode/tui/session-tree ]--//

import { describe, expect, test } from "bun:test";
import {
  buildForest,
  collectSubtreeIds,
  descendantForest,
  findNode,
  flattenTree,
  familyForest,
  pathToRoot,
  relativeTime,
  sessionLabel,
  treePrefix,
  truncate,
  type SessionMeta,
} from "../forest.ts";
import { detectLanguage, dictionary, parseLocale } from "../i18n.ts";

const s = (
  id: string,
  parentID: string | undefined,
  updated: number,
  title = id,
): SessionMeta => ({ id, parentID, updated, title, created: updated });

describe("buildForest", () => {
  test("вкладывает детей и считает потомков", () => {
    const forest = buildForest([
      s("root", undefined, 100),
      s("child", "root", 200),
      s("grand", "child", 300),
    ]);
    expect(forest).toHaveLength(1);
    expect(forest[0].session.id).toBe("root");
    expect(forest[0].descendantCount).toBe(2);
    expect(forest[0].children[0].session.id).toBe("child");
    expect(forest[0].children[0].descendantCount).toBe(1);
    expect(forest[0].children[0].children[0].session.id).toBe("grand");
    expect(forest[0].children[0].children[0].descendantCount).toBe(0);
  });

  test("сортирует корни и детей по свежести поддерева", () => {
    const forest = buildForest([
      s("old", undefined, 10),
      s("new", undefined, 50),
      s("old-touch", "old", 999),
      s("a", "new", 60),
      s("b", "new", 70),
    ]);
    //--[ Корень old становится свежим из-за потомка (999). ]--//
    expect(forest.map((n) => n.session.id)).toEqual(["old", "new"]);
    expect(forest[1].children.map((n) => n.session.id)).toEqual(["b", "a"]);
  });

  test("сирота без родителя в наборе становится корнем", () => {
    const forest = buildForest([s("orphan", "missing-parent", 5)]);
    expect(forest).toHaveLength(1);
    expect(forest[0].session.id).toBe("orphan");
    expect(forest[0].depth).toBe(0);
  });

  test("переживает цикл в parentID", () => {
    const forest = buildForest([s("a", "b", 1), s("b", "a", 2)]);
    expect(forest.length).toBeGreaterThan(0);
    const total = (nodes: ReturnType<typeof buildForest>): number =>
      nodes.reduce((acc, n) => acc + 1 + total(n.children), 0);
    expect(total(forest)).toBe(2);
  });
});

describe("collectSubtreeIds", () => {
  test("собирает узел и всех потомков", () => {
    const forest = buildForest([
      s("root", undefined, 1),
      s("a", "root", 2),
      s("b", "a", 3),
      s("c", "root", 4),
    ]);
    expect(collectSubtreeIds(forest[0]).sort()).toEqual(
      ["a", "b", "c", "root"].sort(),
    );
    const aNode = forest[0].children.find((n) => n.session.id === "a")!;
    expect(collectSubtreeIds(aNode).sort()).toEqual(["a", "b"].sort());
  });
});

describe("treePrefix", () => {
  test("корневые и вложенные префиксы", () => {
    expect(treePrefix([], true)).toBe("└─ ");
    expect(treePrefix([], false)).toBe("├─ ");
    expect(treePrefix([false], false)).toBe("│  ├─ ");
    expect(treePrefix([true], true)).toBe("   └─ ");
    expect(treePrefix([false, true], false)).toBe("│     ├─ ");
  });
});

describe("flattenTree", () => {
  const sessions = [
    s("root", undefined, 100),
    s("a", "root", 200),
    s("a1", "a", 210),
    s("a2", "a", 220),
    s("b", "root", 150),
  ];

  test("порядок отображения и глубина", () => {
    const rows = flattenTree(buildForest(sessions));
    expect(rows.map((r) => r.id)).toEqual(["root", "a", "a2", "a1", "b"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1]);
    expect(rows[0].prefix).toBe("");
    expect(rows[1].prefix).toBe("├─ ");
    expect(rows[2].prefix).toBe("│  ├─ ");
    expect(rows[4].prefix).toBe("└─ ");
  });

  test("свёрнутый узел скрывает потомков, но виден сам", () => {
    const rows = flattenTree(buildForest(sessions), {
      collapsed: new Set(["a"]),
    });
    expect(rows.map((r) => r.id)).toEqual(["root", "a", "b"]);
    expect(rows[1].collapsed).toBe(true);
    expect(rows[1].hasChildren).toBe(true);
  });

  test("maxDepth ограничивает вложенность", () => {
    const rows = flattenTree(buildForest(sessions), { maxDepth: 1 });
    expect(rows.map((r) => r.id)).toEqual(["root", "a", "b"]);
  });

  test("фильтр оставляет совпадения и их предков", () => {
    const rows = flattenTree(buildForest(sessions), {
      keep: (session) => session.id === "a1",
    });
    expect(rows.map((r) => r.id)).toEqual(["root", "a", "a1"]);
  });

  test("число потомков в строке для текста удаления", () => {
    const rows = flattenTree(buildForest(sessions));
    expect(rows.find((r) => r.id === "root")?.descendantCount).toBe(4);
    expect(rows.find((r) => r.id === "a")?.descendantCount).toBe(2);
    expect(rows.find((r) => r.id === "b")?.descendantCount).toBe(0);
  });
});

describe("pathToRoot", () => {
  test("путь от корня до узла включительно", () => {
    const sessions = [
      s("root", undefined, 1),
      s("a", "root", 2),
      s("b", "a", 3),
    ];
    expect(pathToRoot(sessions, "b")).toEqual(["root", "a", "b"]);
    expect(pathToRoot(sessions, "root")).toEqual(["root"]);
    expect(pathToRoot(sessions, "нет-такой")).toEqual(["нет-такой"]);
  });
});

describe("familyForest", () => {
  test("отдаёт лес семьи текущей сессии целиком", () => {
    const sessions = [
      s("other", undefined, 1),
      s("root", undefined, 2),
      s("a", "root", 3),
      s("b", "a", 4),
    ];
    const forest = familyForest(sessions, "b");
    expect(forest).toHaveLength(1);
    expect(forest[0].session.id).toBe("root");
    expect(forest[0].descendantCount).toBe(2);
  });
});

describe("descendantForest и findNode", () => {
  test("находит узел в глубине леса", () => {
    const forest = buildForest([
      s("root", undefined, 1),
      s("a", "root", 2),
      s("b", "a", 3),
    ]);
    expect(findNode(forest, "b")?.session.id).toBe("b");
    expect(findNode(forest, "нет")).toBeUndefined();
  });

  test("лес потомков не содержит саму сессию", () => {
    const sessions = [
      s("root", undefined, 1),
      s("a", "root", 2),
      s("b", "a", 3),
      s("c", "root", 4),
    ];
    const forest = descendantForest(sessions, "root");
    expect(forest.map((n) => n.session.id).sort()).toEqual(["a", "c"]);
    expect(descendantForest(sessions, "b")).toEqual([]);
  });
});

describe("truncate и relativeTime", () => {
  test("обрезает с многоточием только длинное", () => {
    expect(truncate("коротко", 20)).toBe("коротко");
    expect(truncate("длинный-заголовок", 8)).toBe("длинный…");
  });

  test("относительное время по ступеням (русские единицы)", () => {
    const ru = { seconds: "с", minutes: "м", hours: "ч", days: "д" };
    expect(relativeTime(1000, 1000 + 5_000, ru)).toBe("5с");
    expect(relativeTime(1000, 1000 + 5 * 60_000, ru)).toBe("5м");
    expect(relativeTime(1000, 1000 + 5 * 3_600_000, ru)).toBe("5ч");
    expect(relativeTime(1000, 1000 + 5 * 86_400_000, ru)).toBe("5д");
    expect(relativeTime(undefined, 1000, ru)).toBe("");
  });

  test("относительное время (английские единицы)", () => {
    const en = { seconds: "s", minutes: "m", hours: "h", days: "d" };
    expect(relativeTime(1000, 1000 + 5_000, en)).toBe("5s");
    expect(relativeTime(1000, 1000 + 5 * 60_000, en)).toBe("5m");
  });

  test("подпись строки берёт замену пустого названия из словаря", () => {
    const ru = dictionary("ru");
    const en = dictionary("en");
    const empty: SessionMeta = { id: "x", updated: 1000 };
    expect(sessionLabel(empty, { titleWidth: 40, now: 1000, labels: ru })).toBe(
      "○ (без названия) · 0с",
    );
    expect(sessionLabel(empty, { titleWidth: 40, now: 1000, labels: en })).toBe(
      "○ (untitled) · 0s",
    );
  });
});
