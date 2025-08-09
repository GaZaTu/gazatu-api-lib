import type { SQLite3 } from "./sqlite3/sqlite3.ts"

const triggerName = (srcTable: string, ftsTable: string, op: "insert" | "update" | "delete") => {
  return `trg_${srcTable}_after_${op}_sync_${ftsTable}`
}

const fieldsToStrings = (fields: string[]) => {
  let fieldsStrRaw = "rowid"
  let fieldsStrSrc = "SRC.rowid"
  let fieldsStrOld = "OLD.rowid"
  let fieldsStrNew = "NEW.rowid"

  const valuesClause = (field: string, table: string) => {
    if (field.startsWith("SELECT")) {
      return `(${field.replace(/\$SRC/g, table)})`
    } else {
      return `${table}."${field}"`
    }
  }

  for (const field of fields) {
    fieldsStrRaw += `, "${field}"`
    fieldsStrSrc += `, ${valuesClause(field, "SRC")}`
    fieldsStrOld += `, ${valuesClause(field, "OLD")}`
    fieldsStrNew += `, ${valuesClause(field, "NEW")}`
  }

  return {
    fieldsStrRaw,
    fieldsStrSrc,
    fieldsStrOld,
    fieldsStrNew,
  }
}

const __reset_fts_data = (srcTable: string, ftsTable: string, ftsFields: string[]) => {
  const {
    fieldsStrRaw,
    fieldsStrSrc,
  } = fieldsToStrings(ftsFields)

  const script = `
DELETE FROM "${ftsTable}";
INSERT INTO "${ftsTable}" (
  ${fieldsStrRaw}
)
SELECT
  ${fieldsStrSrc}
FROM "${srcTable}" SRC;
  `

  return script
}

const __reset_fts_external_data = (srcTable: string, ftsTable: string, ftsFields: string[]) => {
  const {
    fieldsStrRaw,
    fieldsStrSrc,
  } = fieldsToStrings(ftsFields)

  const script = `
INSERT INTO "${ftsTable}" ("${ftsTable}") VALUES ('delete-all');
INSERT INTO "${ftsTable}" (
  ${fieldsStrRaw}
)
SELECT
  ${fieldsStrSrc}
FROM "${srcTable}" SRC;
  `

  return script
}

const __create_fts_sync_triggers = (srcTable: string, ftsTable: string, ftsFields: string[]) => {
  const {
    fieldsStrRaw,
    fieldsStrNew,
  } = fieldsToStrings(ftsFields)

  const script = `
CREATE TRIGGER "${triggerName(srcTable, ftsTable, "insert")}"
AFTER INSERT ON "${srcTable}" FOR EACH ROW
BEGIN
  INSERT INTO "${ftsTable}" (
    ${fieldsStrRaw}
  ) VALUES (
    ${fieldsStrNew}
  );
END;

CREATE TRIGGER "${triggerName(srcTable, ftsTable, "update")}"
AFTER UPDATE OF ${fieldsStrRaw} ON "${srcTable}" FOR EACH ROW
BEGIN
  DELETE FROM "${ftsTable}"
  WHERE rowid = OLD.rowid;

  INSERT INTO "${ftsTable}" (
    ${fieldsStrRaw}
  ) VALUES (
    ${fieldsStrNew}
  );
END;

CREATE TRIGGER "${triggerName(srcTable, ftsTable, "delete")}"
AFTER DELETE ON "${srcTable}" FOR EACH ROW
BEGIN
  DELETE FROM "${ftsTable}"
  WHERE rowid = OLD.rowid;
END;
  `

  return script
}

const __drop_fts_sync_triggers = (srcTable: string, ftsTable: string) => {
  const script = `
DROP TRIGGER "${triggerName(srcTable, ftsTable, "insert")}";
DROP TRIGGER "${triggerName(srcTable, ftsTable, "update")}";
DROP TRIGGER "${triggerName(srcTable, ftsTable, "delete")}";
  `

  return script
}

const __create_fts_sync_triggers_for_n2m = (srcTable: string, ftsTable: string, n2mTable: string, srcId: string, n2mId: string, ftsFields: string[]) => {
  const {
    fieldsStrRaw,
    fieldsStrSrc,
  } = fieldsToStrings(ftsFields)

  const fieldsStrOld = fieldsStrSrc.replaceAll(`SRC.${srcId}`, `OLD.${n2mId}`)
  const fieldsStrNew = fieldsStrSrc.replaceAll(`SRC.${srcId}`, `NEW.${n2mId}`)

  const script = `
CREATE TRIGGER "${triggerName(n2mTable, ftsTable, "insert")}"
AFTER INSERT ON "${n2mTable}" FOR EACH ROW
BEGIN
  DELETE FROM "${ftsTable}"
  WHERE rowid = (SELECT rowid FROM "${srcTable}" WHERE "${srcId}" = NEW."${n2mId}");

  INSERT INTO "${ftsTable}" (
    ${fieldsStrRaw}
  )
  SELECT
    ${fieldsStrNew}
  FROM "${srcTable}" SRC
  WHERE "${srcId}" = NEW."${n2mId}";
END;

CREATE TRIGGER "${triggerName(n2mTable, ftsTable, "delete")}"
AFTER DELETE ON "${n2mTable}" FOR EACH ROW
BEGIN
  DELETE FROM "${ftsTable}"
  WHERE rowid = (SELECT rowid FROM "${srcTable}" WHERE "${srcId}" = OLD."${n2mId}");

  INSERT INTO "${ftsTable}" (
    ${fieldsStrRaw}
  )
  SELECT
    ${fieldsStrOld}
  FROM "${srcTable}" SRC
  WHERE "${srcId}" = OLD."${n2mId}";
END;
  `

  return script
}

const __drop_fts_sync_triggers_for_n2m = (srcTable: string, ftsTable: string, n2mTable: string) => {
  const script = `
DROP TRIGGER "${triggerName(n2mTable, ftsTable, "insert")}";
DROP TRIGGER "${triggerName(n2mTable, ftsTable, "delete")}";
  `

  return script
}

export const registerFTSSyncFunctions = (database: SQLite3) => {
  database.createFunction("__reset_fts_data", {}, (srcTable: string, ftsTable: string) => {
    const ftsInfo = database.prepare(`PRAGMA table_info("${ftsTable}")`).all()
    if (!ftsInfo.length) {
      throw new Error(`empty table_info for "${ftsTable}"`)
    }

    const ftsFields = ftsInfo.map(col => col.name)

    const script = __reset_fts_data(srcTable, ftsTable, ftsFields)
    database.execute(script)
  })

  database.createFunction("__reset_fts_external_data", {}, (srcTable: string, ftsTable: string) => {
    const ftsInfo = database.prepare(`PRAGMA table_info("${ftsTable}")`).all()
    if (!ftsInfo.length) {
      throw new Error(`empty table_info for "${ftsTable}"`)
    }

    const ftsFields = ftsInfo.map(col => col.name)

    const script = __reset_fts_external_data(srcTable, ftsTable, ftsFields)
    database.execute(script)
  })

  database.createFunction("__create_fts_sync_triggers", {}, (srcTable: string, ftsTable: string) => {
    const ftsInfo = database.prepare(`PRAGMA table_info("${ftsTable}")`).all()
    if (!ftsInfo.length) {
      throw new Error(`empty table_info for "${ftsTable}"`)
    }

    const ftsFields = ftsInfo.map(col => col.name)

    const script = __create_fts_sync_triggers(srcTable, ftsTable, ftsFields)
    database.execute(script)
  })

  database.createFunction("__drop_fts_sync_triggers", {}, (srcTable: string, ftsTable: string) => {
    const script = __drop_fts_sync_triggers(srcTable, ftsTable)
    database.execute(script)
  })

  database.createFunction("__create_fts_sync_triggers", {}, (srcTable: string, ftsTable: string, n2mTable: string) => {
    const ftsInfo = database.prepare(`PRAGMA table_info("${ftsTable}")`).all()
    if (!ftsInfo.length) {
      throw new Error(`empty table_info for "${ftsTable}"`)
    }

    const ftsFields = ftsInfo.map(col => col.name)

    const n2mFKList = database.prepare(`PRAGMA foreign_key_list("${n2mTable}")`).all()
    const { to: srcId, from: n2mId } = n2mFKList.find(fk => fk.table === srcTable)!

    const script = __create_fts_sync_triggers_for_n2m(srcTable, ftsTable, n2mTable, srcId, n2mId, ftsFields)
    database.execute(script)
  })

  database.createFunction("__drop_fts_sync_triggers", {}, (srcTable: string, ftsTable: string, n2mTable: string) => {
    const script = __drop_fts_sync_triggers_for_n2m(srcTable, ftsTable, n2mTable)
    database.execute(script)
  })
}
