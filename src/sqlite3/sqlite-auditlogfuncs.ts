import type { SQLite3 } from "./sqlite3/sqlite3.ts"

const defaultLogTableName = "AuditLogEntry"

const triggerName = (logTable: string, srcTable: string, op: "insert" | "update" | "delete") => {
  return `trg_${srcTable}_after_${op}_logto_${logTable}`
}

const __create_auditlog_table = (logTable: string) => {
  const script = `
CREATE TABLE "${logTable}" (
  "id" INTEGER NOT NULL,
  "srcTable" VARCHAR(256) NOT NULL,
  "srcRowid" VARCHAR(256) NOT NULL,
  "operation" CHAR(1) NOT NULL CHECK ("operation" IN ('I', 'U', 'D')),
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "newValues" TEXT NOT NULL,
  "oldValues" TEXT NOT NULL,
  "description" TEXT,
  "userId" VARCHAR(26),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "idx_${logTable}_srcTable" ON "${logTable}" ("srcTable");
CREATE INDEX "idx_${logTable}_srcRowid" ON "${logTable}" ("srcRowid");
CREATE INDEX "idx_${logTable}_userId" ON "${logTable}" ("userId");
  `

  return script
}

const __drop_auditlog_table = (logTable: string) => {
  const script = `
DROP TABLE IF EXISTS "${logTable}";
  `

  return script
}

// const __create_auditlog_union_view = (logTables: string[]) => {
//   const script = `
// CREATE VIEW "${defaultLogTableName}View" AS
// ${logTables.map(t => `SELECT * FROM "${t}"`).join("\nUNION ")}
//   `

//   return script
// }

// const __drop_auditlog_union_view = () => {
//   const script = `
// DROP VIEW "${defaultLogTableName}View";
//   `

//   return script
// }

const __create_auditlog_triggers = (logTable: string, srcTable: string, srcPK: string, srcFields: string[], operations: string[], descriptionSelector: string | null) => {
  let script = ""

  const anyValuesJson = (which: string) => srcFields.map(f => `'${f}',${which}.${f}`).join(", ")
  const newValuesJson = anyValuesJson("NEW")
  const oldValuesJson = anyValuesJson("OLD")
  const changesFilter = srcFields.map(f => `CASE WHEN NEW.${f} IS OLD.${f} THEN '$.${f}' ELSE '$.__NULL__' END`).join(", ")

  const newDescriptionSelector = descriptionSelector?.replaceAll("SRC.", "NEW.")
  const oldDescriptionSelector = descriptionSelector?.replaceAll("SRC.", "OLD.")

  if (operations.includes("I")) {
    script += `
CREATE TRIGGER "${triggerName(logTable, srcTable, "insert")}"
AFTER INSERT ON "${srcTable}" FOR EACH ROW
BEGIN
  INSERT INTO "${logTable}" (
    "srcTable",
    "srcRowid",
    "operation",
    "newValues",
    "oldValues",
    "description",
    "userId"
  ) VALUES (
    '${srcTable}',
    NEW."${srcPK}",
    'I',
    json_object(${newValuesJson}),
    json_object(),
    ${newDescriptionSelector ? `(${newDescriptionSelector})` : "NULL"},
    getenv('USER')
  );
END;
    `
  }

  if (operations.includes("U")) {
    script += `
CREATE TRIGGER "${triggerName(logTable, srcTable, "update")}"
AFTER UPDATE ON "${srcTable}" FOR EACH ROW
BEGIN
  INSERT INTO "${logTable}" (
    "srcTable",
    "srcRowid",
    "operation",
    "newValues",
    "oldValues",
    "description",
    "userId"
  )
  SELECT
    '${srcTable}' as "srcTable",
    NEW."${srcPK}" as "srcRowId",
    'U' as "operation",
    json_remove(json_object(${newValuesJson}), ${changesFilter}) as "newValues",
    json_remove(json_object(${oldValuesJson}), ${changesFilter}) as "oldValues",
    ${newDescriptionSelector ? `(${newDescriptionSelector})` : "NULL"} as "description",
    getenv('USER') as "userId"
  WHERE "oldValues" != json_object();
END;
    `
  }

  if (operations.includes("D")) {
    script += `
CREATE TRIGGER "${triggerName(logTable, srcTable, "delete")}"
AFTER DELETE ON "${srcTable}" FOR EACH ROW
BEGIN
  INSERT INTO "${logTable}" (
    "srcTable",
    "srcRowid",
    "operation",
    "newValues",
    "oldValues",
    "description",
    "userId"
  ) VALUES (
    '${srcTable}',
    OLD."${srcPK}",
    'D',
    json_object(),
    json_object(${oldValuesJson}),
    ${oldDescriptionSelector ? `(${oldDescriptionSelector})` : "NULL"},
    getenv('USER')
  );
END;
    `
  }

  return script
}

const __drop_auditlog_triggers = (logTable: string, srcTable: string) => {
  const script = `
DROP TRIGGER IF EXISTS "${triggerName(logTable, srcTable, "insert")}";
DROP TRIGGER IF EXISTS "${triggerName(logTable, srcTable, "update")}";
DROP TRIGGER IF EXISTS "${triggerName(logTable, srcTable, "delete")}";
  `

  return script
}

export const registerAuditLogFunctions = (database: SQLite3) => {
  database.createFunction("__create_auditlog_table", {}, (logTable: string) => {
    const script = __create_auditlog_table(logTable)
    database.execute(script)
  })

  database.createFunction("__create_auditlog_table", {}, () => {
    const script = __create_auditlog_table(defaultLogTableName)
    database.execute(script)
  })

  database.createFunction("__drop_auditlog_table", {}, (logTable: string) => {
    const script = __drop_auditlog_table(logTable)
    database.execute(script)
  })

  database.createFunction("__drop_auditlog_table", {}, () => {
    const script = __drop_auditlog_table(defaultLogTableName)
    database.execute(script)
  })

  database.createFunction("__create_auditlog_triggers", {}, (logTable: string, srcTable: string, operations: string, descriptionSelector: string | null) => {
    const srcInfo = database.prepare(`PRAGMA table_info("${srcTable}")`).all()
    if (!srcInfo.length) {
      throw new Error(`empty table_info for "${srcTable}"`)
    }

    const srcPK = srcInfo.find(col => col.pk)?.name ?? "rowid"
    const srcFields = srcInfo.map(col => col.name)

    const script = __create_auditlog_triggers(logTable, srcTable, srcPK, srcFields, operations.split(","), descriptionSelector)
    database.execute(script)
  })

  database.createFunction("__create_auditlog_triggers", {}, (srcTable: string, operations: string, descriptionSelector: string | null) => {
    const srcInfo = database.prepare(`PRAGMA table_info("${srcTable}")`).all()
    if (!srcInfo.length) {
      throw new Error(`empty table_info for "${srcTable}"`)
    }

    const srcPK = srcInfo.find(col => col.pk)?.name ?? "rowid"
    const srcFields = srcInfo.map(col => col.name)

    const script = __create_auditlog_triggers(defaultLogTableName, srcTable, srcPK, srcFields, operations.split(","), descriptionSelector)
    database.execute(script)
  })

  database.createFunction("__drop_auditlog_triggers", {}, (logTable: string, srcTable: string) => {
    const script = __drop_auditlog_triggers(logTable, srcTable)
    database.execute(script)
  })

  database.createFunction("__drop_auditlog_triggers", {}, (srcTable: string) => {
    const script = __drop_auditlog_triggers(defaultLogTableName, srcTable)
    database.execute(script)
  })

  database.createFunction("__get_auditlog_table_defaultname", {}, () => {
    return defaultLogTableName
  })
}
