import type { SQLite3 } from "./sqlite3.ts"

const defaultIndexName = (table: string, columns: string[]) => {
  return `idx_${table}_${columns.join("_")}`
}

const __create_index = (table: string, columns: string | string[], where?: string) => {
  if (typeof columns === "string") {
    columns = columns.split(",")
  }

  const script = `
CREATE INDEX "${defaultIndexName(table, columns)}" ON "${table}" (${columns.join(",")}) ${where ?? ""};
  `

  return script
}

const __drop_index = (table: string, columns: string | string[]) => {
  if (typeof columns === "string") {
    columns = columns.split(",")
  }

  const script = `
DROP INDEX "${defaultIndexName(table, columns)}";
  `

  return script
}

const updatedatTriggerName = (table: string) => {
  return `trg_${table}_after_update_set_updatedat`
}

const __create_updatedat_trigger = (table: string, pk: string) => {
  const script = `
CREATE TRIGGER "${updatedatTriggerName(table)}"
AFTER UPDATE ON "${table}" FOR EACH ROW
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
DROP TRIGGER "${updatedatTriggerName(table)}";
  `

  return script
}

export const registerMiscFunctions = (database: SQLite3) => {
  database.createFunction("__create_index", {}, (table: string, columns: string) => {
    const script = __create_index(table, columns)
    database.execute(script)
  })

  database.createFunction("__create_index", {}, (table: string, columns: string, where: string) => {
    const script = __create_index(table, columns, where)
    database.execute(script)
  })

  database.createFunction("__drop_index", {}, (table: string, columns: string) => {
    const script = __drop_index(table, columns)
    database.execute(script)
  })

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
