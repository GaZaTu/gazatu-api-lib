import type { SQLite3 } from "./sqlite3.ts"

const defaultIdxTableName = "IdentifierIndex"

const triggerName = (srcTable: string, idxTable: string, op: "insert" | "update" | "delete") => {
  return `trg_${srcTable}_after_${op}_sync_${idxTable}`
}

const __create_idindex_table = (idxTable: string) => {
  const script = `
CREATE TABLE "${idxTable}Table" (
  "id" INTEGER NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  UNIQUE ("name"),
  PRIMARY KEY ("id")
);

CREATE TABLE "${idxTable}" (
  "id" VARCHAR(128) NOT NULL,
  "tableId" INTEGER NOT NULL,
  FOREIGN KEY ("tableId") REFERENCES "${idxTable}Table" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

CREATE VIEW "${idxTable}View" AS
SELECT
  idx."id" as "id",
  tbl."name" as "table"
FROM "${idxTable}" idx
JOIN "${idxTable}Table" tbl ON tbl."id" = idx."tableId";

CREATE INDEX "idx_${idxTable}_tableId" ON "${idxTable}" ("tableId");
  `

  return script
}

const __drop_idindex_table = (idxTable: string) => {
  const script = `
DROP VIEW "${idxTable}View";
DROP TABLE "${idxTable}";
DROP TABLE "${idxTable}Table";
  `

  return script
}

const __reset_idindex_data = (srcTable: string, idxTable: string, srcPK: string) => {
  const script = `
DELETE FROM "${idxTable}"
WHERE
  "tableId" = (SELECT "id" FROM "${idxTable}Table" WHERE "name" = '${srcTable}');
INSERT INTO "${idxTable}" (
  "id",
  "tableId"
)
SELECT
  "${srcPK}",
  (SELECT "id" FROM "${idxTable}Table" WHERE "name" = '${srcTable}')
FROM "${srcTable}";
  `

  return script
}

const __create_idindex_triggers = (srcTable: string, idxTable: string, srcPK: string, srcTableId: number) => {
  let script = ""

  script += `
INSERT INTO "${idxTable}Table" (
  "id",
  "name"
) VALUES (
  ${srcTableId},
  '${srcTable}'
);

CREATE TRIGGER "${triggerName(srcTable, idxTable, "insert")}"
AFTER INSERT ON "${srcTable}" FOR EACH ROW
BEGIN
  INSERT INTO "${idxTable}" (
    "id",
    "tableId"
  ) VALUES (
    NEW."${srcPK}",
    ${srcTableId}
  );
END;
  `

  script += `
CREATE TRIGGER "${triggerName(srcTable, idxTable, "delete")}"
AFTER DELETE ON "${srcTable}" FOR EACH ROW
BEGIN
  DELETE FROM "${idxTable}"
  WHERE
    "id" = OLD."${srcPK}";
END;
  `

  return script
}

const __drop_idindex_triggers = (srcTable: string, idxTable: string) => {
  const script = `
DROP TRIGGER IF EXISTS "${triggerName(srcTable, idxTable, "insert")}";
DROP TRIGGER IF EXISTS "${triggerName(srcTable, idxTable, "delete")}";
DELETE FROM "${idxTable}Table" WHERE "name" = '${srcTable}';
  `

  return script
}

export const registerIDIndexFunctions = (database: SQLite3) => {
  database.createFunction("__create_idindex_table", {}, (idxTable: string) => {
    const script = __create_idindex_table(idxTable)
    database.execute(script)
  })

  database.createFunction("__create_idindex_table", {}, () => {
    const script = __create_idindex_table(defaultIdxTableName)
    database.execute(script)
  })

  database.createFunction("__drop_idindex_table", {}, (idxTable: string) => {
    const script = __drop_idindex_table(idxTable)
    database.execute(script)
  })

  database.createFunction("__drop_idindex_table", {}, () => {
    const script = __drop_idindex_table(defaultIdxTableName)
    database.execute(script)
  })

  database.createFunction("__reset_idindex_data", {}, (srcTable: string, idxTable: string) => {
    const srcInfo = database.prepare(`PRAGMA table_info("${srcTable}")`).all()
    if (!srcInfo.length) {
      throw new Error(`empty table_info for "${srcTable}"`)
    }

    const srcPK = srcInfo.find(col => col.pk)?.name ?? "rowid"

    const script = __reset_idindex_data(srcTable, idxTable, srcPK)
    database.execute(script)
  })

  database.createFunction("__create_idindex_triggers", {}, (srcTable: string, idxTable: string) => {
    const srcInfo = database.prepare(`PRAGMA table_info("${srcTable}")`).all()
    if (!srcInfo.length) {
      throw new Error(`empty table_info for "${srcTable}"`)
    }

    const srcPK = srcInfo.find(col => col.pk)?.name ?? "rowid"

    const [[ newid ]] = database.prepare(`SELECT (coalesce(max("id"), 0) + 1) as "newid" FROM "${idxTable}Table"`).all() as any[]

    const script = __create_idindex_triggers(srcTable, idxTable, srcPK, newid)
    database.execute(script)
  })

  database.createFunction("__create_idindex_triggers", {}, (srcTable: string) => {
    const srcInfo = database.prepare(`PRAGMA table_info("${srcTable}")`).all()
    if (!srcInfo.length) {
      throw new Error(`empty table_info for "${srcTable}"`)
    }

    const srcPK = srcInfo.find(col => col.pk)?.name ?? "rowid"

    const [[ newid ]] = database.prepare(`SELECT (coalesce(max("id"), 0) + 1) as "newid" FROM "${defaultIdxTableName}Table"`).all() as any[]

    const script = __create_idindex_triggers(srcTable, defaultIdxTableName, srcPK, newid)
    database.execute(script)
  })

  database.createFunction("__drop_idindex_triggers", {}, (srcTable: string, idxTable: string) => {
    const script = __drop_idindex_triggers(srcTable, idxTable)
    database.execute(script)
  })

  database.createFunction("__drop_idindex_triggers", {}, (srcTable: string) => {
    const script = __drop_idindex_triggers(srcTable, defaultIdxTableName)
    database.execute(script)
  })

  database.createFunction("__get_idindex_table_defaultname", {}, () => {
    return defaultIdxTableName
  })
}
