import type { SQLite3 } from "./sqlite3.ts"

const tableName = (table0: string, table1: string) => {
  return `N2M_${table0}_${table1}`
}

const __create_n2m_table = (table0: string, table1: string, table0Id: string, table1Id: string, table0IdType: string, table1IdType: string) => {
  const table0N2MId = `${table0}_${table0Id}`
  const table1N2MId = `${table1}_${table1Id}`

  const script = `
CREATE TABLE "${tableName(table0, table1)}" (
  "${table0N2MId}" ${table0IdType} NOT NULL,
  "${table1N2MId}" ${table1IdType} NOT NULL,
  FOREIGN KEY ("${table0N2MId}") REFERENCES "${table0}" ("${table0Id}") ON DELETE CASCADE,
  FOREIGN KEY ("${table1N2MId}") REFERENCES "${table1}" ("${table1Id}") ON DELETE CASCADE,
  PRIMARY KEY ("${table0N2MId}", "${table1N2MId}")
);

CREATE INDEX "idx_${tableName(table0, table1)}_id0" ON "${tableName(table0, table1)}" ("${table0N2MId}");
CREATE INDEX "idx_${tableName(table0, table1)}_id1" ON "${tableName(table0, table1)}" ("${table1N2MId}");
  `

  return script
}

const __drop_n2m_table = (table0: string, table1: string) => {
  const script = `
DROP INDEX "idx_${tableName(table0, table1)}_id0";
DROP INDEX "idx_${tableName(table0, table1)}_id1";

DROP TABLE "${tableName(table0, table1)}";
  `

  return script
}

export const registerN2MFunctions = (database: SQLite3) => {
  database.createFunction("__create_n2m_table", {}, (table0: string, table1: string) => {
    const table0Info = database.prepare(`PRAGMA table_info("${table0}")`).all()
    if (!table0Info.length) {
      throw new Error(`empty table_info for "${table0}"`)
    }

    const table1Info = database.prepare(`PRAGMA table_info("${table1}")`).all()
    if (!table1Info.length) {
      throw new Error(`empty table_info for "${table1}"`)
    }

    const table0PK = table0Info.find(col => col.pk)!
    const table1PK = table1Info.find(col => col.pk)!

    const script = __create_n2m_table(table0, table1, table0PK.name, table1PK.name, table0PK.type, table1PK.type)
    database.execute(script)
  })

  database.createFunction("__drop_n2m_table", {}, (table0: string, table1: string) => {
    const script = __drop_n2m_table(table0, table1)
    database.execute(script)
  })

  database.createFunction("__get_n2m_table_name", {}, (table0: string, table1: string) => {
    return tableName(table0, table1)
  })
}
