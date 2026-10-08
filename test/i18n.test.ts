//--[ Тесты определения языка и словарей ]--//
//--[ Запуск: bun test ~/.config/opencode/tui/session-tree ]--//

import { describe, expect, test } from "bun:test";
import { detectLanguage, dictionary, parseLocale, SUPPORTED } from "../i18n.ts";

describe("parseLocale", () => {
  test("разбирает типовые значения локали", () => {
    expect(parseLocale("ru_RU.UTF-8")).toBe("ru");
    expect(parseLocale("en_US.UTF-8")).toBe("en");
    expect(parseLocale("en-US")).toBe("en");
    expect(parseLocale("de_DE@euro")).toBe("de");
    expect(parseLocale("ru")).toBe("ru");
  });

  test("служебные и пустые значения — undefined", () => {
    expect(parseLocale(undefined)).toBeUndefined();
    expect(parseLocale("")).toBeUndefined();
    expect(parseLocale("C")).toBeUndefined();
    expect(parseLocale("POSIX")).toBeUndefined();
    expect(parseLocale("C.UTF-8")).toBeUndefined();
  });
});

describe("detectLanguage", () => {
  test("берёт русский из LANG", () => {
    expect(detectLanguage({ LANG: "ru_RU.UTF-8" })).toBe("ru");
  });

  test("английский из LANG", () => {
    expect(detectLanguage({ LANG: "en_US.UTF-8" })).toBe("en");
  });

  test("LC_ALL важнее LANG", () => {
    expect(detectLanguage({ LC_ALL: "en_US.UTF-8", LANG: "ru_RU.UTF-8" })).toBe(
      "en",
    );
  });

  test("LC_MESSAGES важнее LANG", () => {
    expect(
      detectLanguage({ LC_MESSAGES: "ru_RU.UTF-8", LANG: "en_US.UTF-8" }),
    ).toBe("ru");
  });

  test("неизвестный язык → английский", () => {
    expect(detectLanguage({ LANG: "de_DE.UTF-8" })).toBe("en");
    expect(detectLanguage({ LANG: "zh_CN.UTF-8" })).toBe("en");
  });

  test("пустое окружение и C-локаль → английский", () => {
    expect(detectLanguage({})).toBe("en");
    expect(detectLanguage({ LANG: "C" })).toBe("en");
    expect(detectLanguage({ LC_ALL: "POSIX" })).toBe("en");
  });
});

describe("dictionary", () => {
  test("оба языка поддержаны", () => {
    expect(SUPPORTED).toContain("ru");
    expect(SUPPORTED).toContain("en");
  });

  test("строки различаются по языку", () => {
    expect(dictionary("ru").untitled).toBe("(без названия)");
    expect(dictionary("en").untitled).toBe("(untitled)");
    expect(dictionary("ru").deleteOne).toBe("Будет удалена одна сессия.");
    expect(dictionary("en").deleteOne).toBe("One session will be deleted.");
  });

  test("счётчик вложенных подставляется в обоих языках", () => {
    expect(dictionary("ru").deleteNested(3)).toContain("3");
    expect(dictionary("en").deleteNested(3)).toContain("3");
  });

  test("русское склонение числительных", () => {
    const ru = dictionary("ru");
    expect(ru.deleteNested(1)).toBe(
      "Будет удалена сессия и ещё 1 вложенная сессия.",
    );
    expect(ru.deleteNested(2)).toBe(
      "Будет удалена сессия и ещё 2 вложенные сессии.",
    );
    expect(ru.deleteNested(5)).toBe(
      "Будет удалена сессия и ещё 5 вложенных сессий.",
    );
    expect(ru.deleteNested(11)).toBe(
      "Будет удалена сессия и ещё 11 вложенных сессий.",
    );
    expect(ru.deleteNested(21)).toBe(
      "Будет удалена сессия и ещё 21 вложенная сессия.",
    );
  });

  test("английское число: 1 → session, иначе sessions", () => {
    const en = dictionary("en");
    expect(en.deleteNested(1)).toBe(
      "The session and 1 nested session will be deleted.",
    );
    expect(en.deleteNested(2)).toBe(
      "The session and 2 nested sessions will be deleted.",
    );
  });

  test("единицы времени локализованы", () => {
    expect(dictionary("ru").units.days).toBe("д");
    expect(dictionary("en").units.days).toBe("d");
  });

  test("заголовок окна — как у встроенного «Sessions», не переводится", () => {
    expect(dictionary("ru").dialogTitle).toBe("Sessions");
    expect(dictionary("en").dialogTitle).toBe("Sessions");
  });

  test("у словарей совпадает набор ключей", () => {
    const keys = (value: object) => Object.keys(value).sort();
    expect(keys(dictionary("ru"))).toEqual(keys(dictionary("en")));
  });
});
