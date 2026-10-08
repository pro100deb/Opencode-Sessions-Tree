//--[ Диагностический лог плагина: console.log в лог службы не попадает ]--//
//--[ (проверено на autocontinue), поэтому пишем короткий файл в /tmp. ]--//

import { appendFileSync } from "node:fs";

const LOG = "/tmp/opencode/session-tree.log";

export const log = (line: string): void => {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {}
};
