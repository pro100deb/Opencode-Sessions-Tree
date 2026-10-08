//--[ Мультиязычность плагина: язык берём из окружения пользователя ]--//
//--[ ]--//
//--[ TUI-контекст языка не отдаёт (App = version/channel), поэтому смотрим ]--//
//--[ переменные локали — тем же порядком, что и сам opencode: ]--//
//--[ LC_ALL → LC_MESSAGES → LANG. Неизвестный язык → английский. ]--//
//--[ ]--//
//--[ Модуль чистый: окружение передаётся параметром, поэтому детект ]--//
//--[ покрывается тестами без TUI. ]--//

export type Language = "ru" | "en";

export const SUPPORTED: readonly Language[] = ["ru", "en"];
export const FALLBACK: Language = "en";

const UNITS: Record<
  Language,
  { seconds: string; minutes: string; hours: string; days: string }
> = {
  ru: { seconds: "с", minutes: "м", hours: "ч", days: "д" },
  en: { seconds: "s", minutes: "m", hours: "h", days: "d" },
};

export type Dictionary = {
  /** Заголовок секции боковой панели. */
  sidebarTitle: string;
  /** Надпись, когда вложенных сессий нет. */
  sidebarEmpty: string;
  /** Замена пустого названия сессии. */
  untitled: string;
  /** Заголовок диалога удаления. */
  deleteTitle: string;
  /** Вопрос при удалении ветки с вложенными. */
  deleteNested: (count: number) => string;
  /** Вопрос при удалении одной сессии. */
  deleteOne: string;
  /** Кнопка подтверждения удаления. */
  confirmDelete: string;
  /** Кнопка отмены. */
  cancel: string;
  /** Заголовок тоста при неудачном удалении. */
  deleteFailed: string;
  /** Заголовок диалога переименования. */
  renameTitle: string;
  /** Заголовок окна со списком — как у встроенного «Sessions», не переводится. */
  dialogTitle: string;
  /** Заголовок, когда список сессий пуст. */
  noSessions: string;
  /** Действие «удалить» в футере диалога. */
  actionDelete: string;
  /** Действие «переименовать» в футере диалога. */
  actionRename: string;
  /** Название команды в палитре. */
  commandTitle: string;
  /** Описание команды в палитре. */
  commandDescription: string;
  /** Группа команды в палитре. */
  commandGroup: string;
  /** Единицы относительного времени. */
  units: { seconds: string; minutes: string; hours: string; days: string };
};

const ru: Dictionary = {
  sidebarTitle: "Session Tree",
  sidebarEmpty: "нет вложенных",
  untitled: "(без названия)",
  deleteTitle: "Удалить сессию?",
  //--[ Склонение по правилам русского: 1 → «вложенная», 2-4 → «вложенных», ]--//
  //--[ 5-20 и 0 → «вложенных». Исключение — 11-14. ]--//
  deleteNested: (count) => {
    const tail = count % 100;
    const last = count % 10;
    const word =
      tail >= 11 && tail <= 14
        ? "вложенных сессий"
        : last === 1
          ? "вложенная сессия"
          : last >= 2 && last <= 4
            ? "вложенные сессии"
            : "вложенных сессий";
    return `Будет удалена сессия и ещё ${count} ${word}.`;
  },
  deleteOne: "Будет удалена одна сессия.",
  confirmDelete: "Удалить",
  cancel: "Отмена",
  deleteFailed: "Удаление не удалось",
  renameTitle: "Переименовать сессию",
  dialogTitle: "Sessions",
  noSessions: "Сессий нет",
  actionDelete: "удалить",
  actionRename: "переименовать",
  commandTitle: "Session Tree",
  commandDescription: "Дерево сессий: родитель и вложенные",
  commandGroup: "Сессии",
  units: UNITS.ru,
};

const en: Dictionary = {
  sidebarTitle: "Session Tree",
  sidebarEmpty: "no nested sessions",
  untitled: "(untitled)",
  deleteTitle: "Delete session?",
  //--[ Правильное единственное/множественное число по-английски. ]--//
  deleteNested: (count) =>
    count === 1
      ? "The session and 1 nested session will be deleted."
      : `The session and ${count} nested sessions will be deleted.`,
  deleteOne: "One session will be deleted.",
  confirmDelete: "Delete",
  cancel: "Cancel",
  deleteFailed: "Delete failed",
  renameTitle: "Rename session",
  dialogTitle: "Sessions",
  noSessions: "No sessions",
  actionDelete: "delete",
  actionRename: "rename",
  commandTitle: "Session Tree",
  commandDescription: "Session tree: parent and nested",
  commandGroup: "Session",
  units: UNITS.en,
};

const DICTIONARIES: Record<Language, Dictionary> = { ru, en };

/** Разбирает значение локали ("ru_RU.UTF-8", "en-US", "C") в базовый код. */
export function parseLocale(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const base = value
    .split(".")[0]
    .split("@")[0]
    .split(/[_-]/)[0]
    .trim()
    .toLowerCase();
  if (base === "" || base === "c" || base === "posix") return undefined;
  return base;
}

/** Определяет язык пользователя по переменным окружения. */
export function detectLanguage(
  env: Record<string, string | undefined> = process.env,
): Language {
  const candidates = [env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const candidate of candidates) {
    const base = parseLocale(candidate);
    if (base !== undefined && (SUPPORTED as readonly string[]).includes(base)) {
      return base as Language;
    }
    //--[ Осмысленная, но неподдерживаемая локаль (например, de_DE) → английский. ]--//
    if (base !== undefined) return FALLBACK;
  }
  return FALLBACK;
}

/** Словарь для языка. */
export function dictionary(language: Language): Dictionary {
  return DICTIONARIES[language] ?? DICTIONARIES[FALLBACK];
}
