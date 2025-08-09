import type { SQLite3 } from "./sqlite3/sqlite3.ts"

const triggerName = (table: string) => {
  return `trg_${table}_after_update_set_updatedat`
}

const __create_updatedat_trigger = (table: string, pk: string) => {
  const script = `
CREATE TRIGGER "${triggerName(table)}"
AFTER UPDATE ON "${table}"
BEGIN
  UPDATE "${table}"
  SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE "${pk}" = NEW."${pk}";
END;
  `

  return script
}

const __drop_updatedat_trigger = (table: string) => {
  const script = `
DROP TRIGGER "${triggerName(table)}";
  `

  return script
}

export const registerMiscFunctions = (database: SQLite3) => {
  database.createFunction("__create_updatedat_trigger", {}, (table: string) => {
    const tableInfo = database.prepare(`PRAGMA table_info("${table}")`).all()
    if (!tableInfo.length) {
      throw new Error(`empty table_info for "${table}"`)
    }

    const tablePK = tableInfo.find(col => col.pk)!

    const script = __create_updatedat_trigger(table, tablePK.name)
    database.execute(script)
  })

  database.createFunction("__drop_updatedat_trigger", {}, (table: string) => {
    const script = __drop_updatedat_trigger(table)
    database.execute(script)
  })
}
