#!/usr/bin/env python3
#--[ Конвертер снимка терминала (ANSI) в самодостаточный HTML. ]--#
#--[ Использование: ansi2html.py <вход.ansi> <выход.html> ]--#
import html
import re
import sys

#--[ Разбор escape-последовательностей: ESC [ параметры ; параметры ... буква ]--#
ESC_RE = re.compile(r"\x1b\[([0-9;]*)([A-Za-z])")

#--[ Параметры: пустая строка — как 0 ]--#
def parse_params(s):
    if not s:
        return [0]
    return [int(x) if x != "" else 0 for x in s.split(";")]

def convert(text):
    #--[ Текущее состояние атрибутов: цвет символа, цвет фона, жирный ]--#
    fg = None
    bg = None
    bold = False
    out = []

    def flush(i, j):
        #--[ Вывод фрагмента с текущими атрибутами (пустые атрибуты не выводить) ]--#
        chunk = text[i:j]
        if not chunk:
            return
        styles = []
        if fg is not None:
            styles.append("color:rgb(%d,%d,%d)" % fg)
        if bg is not None:
            styles.append("background:rgb(%d,%d,%d)" % bg)
        if bold:
            styles.append("font-weight:bold")
        if styles:
            out.append('<span style="%s">%s</span>' % (";".join(styles), html.escape(chunk)))
        else:
            out.append(html.escape(chunk))

    pos = 0
    for m in ESC_RE.finditer(text):
        flush(pos, m.start())
        pos = m.end()
        params = parse_params(m.group(1))
        final = m.group(2)
        if final == "m":
            if not params or 0 in params:
                #--[ ESC[0m — сброс всех атрибутов ]--#
                fg = None
                bg = None
                bold = False
            elif params[0] == 1:
                bold = True
            elif params[0] == 22:
                bold = False
            elif params[0] == 38 and len(params) >= 4 and params[1] == 2:
                fg = (params[2], params[3], params[4])
            elif params[0] == 39:
                fg = None
            elif params[0] == 48 and len(params) >= 4 and params[1] == 2:
                bg = (params[2], params[3], params[4])
            elif params[0] == 49:
                bg = None
        #--[ Неизвестная последовательность — молча проглотить ]--#
    flush(pos, len(text))
    return "".join(out)

def main():
    if len(sys.argv) != 3:
        print("Использование: ansi2html.py <вход.ansi> <выход.html>", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        text = f.read()
    body = convert(text)
    doc = (
        "<!DOCTYPE html>\n"
        '<html lang="ru">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        "<title>Снимок терминала</title>\n"
        "<style>\n"
        "body{background:#040404;margin:0;padding:16px;}\n"
        'pre{font-family:"JetBrains Mono","DejaVu Sans Mono",monospace;white-space:pre;}\n'
        "</style>\n"
        "</head>\n"
        "<body>\n"
        "<pre>" + body + "</pre>\n"
        "</body>\n"
        "</html>\n"
    )
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(doc)

if __name__ == "__main__":
    main()
