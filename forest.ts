//--[ Чистая логика дерева сессий: без TUI, без сети, всё проверяемо тестами ]--//
//--[ ]--//
//--[ Вход — плоский список сессий (как отдаёт GET /api/session: он включает ]--//
//--[ и дочерние). Выход — лес, строки для отрисовки и вспомогательные срезы. ]--//
//--[ ]--//
//--[ Здесь НЕТ импортов от opencode и OpenTUI намеренно: модуль должен ]--//
//--[ запускаться обычным `bun test`. ]--//

export type SessionMeta = {
  id: string;
  parentID?: string;
  title?: string;
  agent?: string;
  created?: number;
  updated?: number;
};

export type TreeNode = {
  session: SessionMeta;
  depth: number;
  children: TreeNode[];
  /** Сколько всего потомков в поддереве (без самого узла). */
  descendantCount: number;
  /** Максимальная отметка активности в поддереве (для сортировки). */
  lastActivity: number;
};

export type TreeRow = {
  kind: "node";
  session: SessionMeta;
  id: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  isLast: boolean;
  /** Для каждого уровня выше: был ли тот узел последним у родителя. */
  ancestorsLast: boolean[];
  /** Готовая строка ветвления, например "│  ├─ ". */
  prefix: string;
  /** Число потомков (для счётчика справа и текста удаления). */
  descendantCount: number;
};

const activityOf = (session: SessionMeta): number =>
  session.updated ?? session.created ?? 0;

const byActivityDesc = (left: TreeNode, right: TreeNode): number =>
  right.lastActivity - left.lastActivity ||
  (left.session.title ?? "").localeCompare(right.session.title ?? "");

/** Строит лес из плоского списка. Сироты (родителя нет в наборе) становятся корнями. */
export function buildForest(sessions: SessionMeta[]): TreeNode[] {
  const byId = new Map<string, SessionMeta>();
  for (const session of sessions) byId.set(session.id, session);

  const nodes = new Map<string, TreeNode>();
  for (const session of sessions) {
    nodes.set(session.id, {
      session,
      depth: 0,
      children: [],
      descendantCount: 0,
      lastActivity: activityOf(session),
    });
  }

  const roots: TreeNode[] = [];
  for (const session of sessions) {
    const node = nodes.get(session.id)!;
    const parent =
      session.parentID === undefined ? undefined : nodes.get(session.parentID);
    if (parent === undefined || parent === node) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  //--[ Обход с защитой от циклов: seen не даёт зациклиться. ]--//
  const seen = new Set<string>();
  const finalize = (node: TreeNode, depth: number): number => {
    if (seen.has(node.session.id)) return node.lastActivity;
    seen.add(node.session.id);
    node.depth = depth;
    let last = activityOf(node.session);
    let descendants = 0;
    //--[ Обрыв обратных рёбер: иначе цикл в parentID зациклит обход. ]--//
    const kept: TreeNode[] = [];
    for (const child of node.children) {
      if (seen.has(child.session.id)) continue;
      last = Math.max(last, finalize(child, depth + 1));
      descendants += 1 + child.descendantCount;
      kept.push(child);
    }
    node.descendantCount = descendants;
    node.lastActivity = last;
    node.children = kept.sort(byActivityDesc);
    return last;
  };

  for (const root of roots) finalize(root, 0);

  //--[ Кольцо (a→b→a): после обхода остаются непосещённые — делаем их корнями. ]--//
  const ordered = [...nodes.values()];
  for (const node of ordered) {
    if (seen.has(node.session.id)) continue;
    roots.push(node);
    finalize(node, 0);
  }

  roots.sort(byActivityDesc);
  return roots;
}

/** Число всех потомков узла (без него самого) — по уже построенному лесу. */
export function countDescendants(node: TreeNode): number {
  return node.descendantCount;
}

/** Собирает id узла и всех его потомков (для удаления и подсветки). */
export function collectSubtreeIds(node: TreeNode): string[] {
  const ids: string[] = [];
  const walk = (current: TreeNode): void => {
    ids.push(current.session.id);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return ids;
}

/** Префикс ветвления: вертикали для незакрытых уровней + крючок текущего. */
export function treePrefix(ancestorsLast: boolean[], isLast: boolean): string {
  let prefix = "";
  for (const ancestorIsLast of ancestorsLast) {
    prefix += ancestorIsLast ? "   " : "│  ";
  }
  return `${prefix}${isLast ? "└─ " : "├─ "}`;
}

export type FlattenOptions = {
  /** Свёрнутые узлы: их поддеревья не попадают в строки. */
  collapsed?: ReadonlySet<string>;
  /** Максимальная глубина (0 — только корни). По умолчанию без ограничения. */
  maxDepth?: number;
  /** С какой глубины считать за ноль: детям текущей сессии префикс не нужен. */
  depthBase?: number;
  /** Оставить только узлы, прошедшие фильтр, и их предков. */
  keep?: (session: SessionMeta) => boolean;
};

/**
 * Разворачивает лес в плоский список строк в порядке отображения.
 * Свёрнутые ветки пропускаются, но сам узел остаётся видимым.
 */
export function flattenTree(
  forest: TreeNode[],
  options: FlattenOptions = {},
): TreeRow[] {
  const collapsed = options.collapsed ?? new Set<string>();
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const depthBase = options.depthBase ?? 0;
  const keep = options.keep;
  const rows: TreeRow[] = [];

  //--[ Фильтр: узел нужен, если он сам подходит или подходит кто-то в поддереве. ]--//
  const useful = new Map<string, boolean>();
  const computeUseful = (node: TreeNode): boolean => {
    if (!keep) return true;
    let value = keep(node.session);
    for (const child of node.children) {
      if (computeUseful(child)) value = true;
    }
    useful.set(node.session.id, value);
    return value;
  };

  const walk = (
    node: TreeNode,
    ancestorsLast: boolean[],
    isLast: boolean,
  ): void => {
    if (keep !== undefined && useful.get(node.session.id) !== true) return;
    const relativeDepth = node.depth - depthBase;
    rows.push({
      kind: "node",
      session: node.session,
      id: node.session.id,
      depth: relativeDepth,
      hasChildren: node.children.length > 0,
      collapsed: collapsed.has(node.session.id),
      isLast,
      ancestorsLast,
      prefix: relativeDepth > 0 ? treePrefix(ancestorsLast, isLast) : "",
      descendantCount: node.descendantCount,
    });
    if (collapsed.has(node.session.id) || relativeDepth >= maxDepth) return;
    const childAncestors = relativeDepth < 1 ? [] : [...ancestorsLast, isLast];
    node.children.forEach((child, index) => {
      walk(child, childAncestors, index === node.children.length - 1);
    });
  };

  for (const root of forest) {
    if (keep !== undefined && !computeUseful(root)) continue;
    walk(root, [], true);
  }
  return rows;
}

/** Путь от корня до узла включительно (для подсветки ветки текущей сессии). */
export function pathToRoot(
  sessions: SessionMeta[],
  currentID: string,
): string[] {
  const byId = new Map<string, SessionMeta>();
  for (const session of sessions) byId.set(session.id, session);
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = currentID;
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    path.unshift(cursor);
    cursor = byId.get(cursor)?.parentID;
  }
  return path;
}

/**
 * Лес семьи текущей сессии: от её корня вниз, целиком.
 * Если сессия неизвестна — пустой массив.
 */
export function familyForest(
  sessions: SessionMeta[],
  currentID: string,
): TreeNode[] {
  const path = pathToRoot(sessions, currentID);
  if (path.length === 0) return [];
  const rootID = path[0];
  const forest = buildForest(sessions);
  return forest.filter((node) => node.session.id === rootID);
}

/** Находит узел по id в лесу. */
export function findNode(forest: TreeNode[], id: string): TreeNode | undefined {
  for (const node of forest) {
    if (node.session.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Лес потомков текущей сессии: её дети и глубже.
 * Сама сессия не входит — её название уже показывает встроенная шапка панели.
 */
export function descendantForest(
  sessions: SessionMeta[],
  currentID: string,
): TreeNode[] {
  const node = findNode(buildForest(sessions), currentID);
  return node?.children ?? [];
}

/** Обрезка заголовка по ширине с многоточием. */
export function truncate(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width));
  if (text.length <= width) return text;
  return `${text.slice(0, width - 1)}…`;
}

/** Подпись строки: маркер статуса, заголовок, агент, свежесть. */
export type LabelOptions = {
  status?: "idle" | "running";
  titleWidth: number;
  now: number;
  /** Словарь языка: замена пустого названия и единицы времени. */
  labels: {
    untitled: string;
    units: { seconds: string; minutes: string; hours: string; days: string };
  };
};

export function sessionLabel(
  session: SessionMeta,
  options: LabelOptions,
): string {
  const marker = options.status === "running" ? "●" : "○";
  const rawTitle = session.title?.trim() || options.labels.untitled;
  const parts = [truncate(rawTitle, options.titleWidth)];
  if (session.agent) parts.push(session.agent);
  const relative = relativeTime(
    session.updated ?? session.created,
    options.now,
    options.labels.units,
  );
  if (relative) parts.push(relative);
  return `${marker} ${parts.join(" · ")}`;
}

/** Относительное время: 5м, 3ч, 2д (единицы — из языка пользователя). */
export function relativeTime(
  timestamp: number | undefined,
  now: number,
  units: { seconds: string; minutes: string; hours: string; days: string },
): string {
  if (timestamp === undefined || timestamp <= 0) return "";
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}${units.seconds}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${units.minutes}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${units.hours}`;
  return `${Math.floor(hours / 24)}${units.days}`;
}
