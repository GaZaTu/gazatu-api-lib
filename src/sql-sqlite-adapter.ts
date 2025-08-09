import { QueryBuilderData, QueryCompiler, sql, SqlExpr } from "./sql.ts"

export class SqliteQueryCompiler implements QueryCompiler {
  compileSelectQuery(data: QueryBuilderData): string {
    let script = "SELECT"

    if (data.distinct) {
      script += " DISTINCT"
    }

    for (let i = 0; i < (data.selection?.length ?? 0); i++) {
      script += (i === 0) ? "\n  " : ",\n  "
      script += `${data.selection![i]}`
    }

    if (data.table) {
      script += `\nFROM ${data.table}`
    }

    for (let i = 0; i < (data.joins?.length ?? 0); i++) {
      script += "\n"
      script += `${data.joins![i]!.mode ?? "JOIN"} ${data.joins![i]!.table}${data.joins![i]!.condition ? ` ON ${data.joins![i]!.condition?.query}` : ""}`
    }

    for (let i = 0; i < (data.conditions?.length ?? 0); i++) {
      script += (i === 0) ? "\nWHERE\n  " : " AND\n  "
      script += data.conditions![i]!.query
    }

    for (let i = 0; i < (data.groupings?.length ?? 0); i++) {
      script += (i === 0) ? "\nGROUP BY\n  " : ",\n  "
      script += data.groupings![i]!.query
    }

    for (let i = 0; i < (data.groupingConditions?.length ?? 0); i++) {
      script += (i === 0) ? "\nHAVING\n  " : " AND\n  "
      script += data.groupingConditions![i]!.query
    }

    for (let i = 0; i < (data.ordering?.length ?? 0); i++) {
      // TODO: COLLATE NOCASE
      script += (i === 0) ? "\nORDER BY\n  " : ",\n  "
      script += `${data.ordering![i]!.field.query} ${data.ordering![i]!.direction ?? ""} ${data.ordering![i]!.nulls ?? ""}`
    }

    if (data.limit || data.offset) {
      script += `\nLIMIT ${data.limit?.query ?? -1}`
    }

    if (data.offset) {
      script += `\nOFFSET ${data.offset.query}`
    }

    return script
  }

  createSelectParams(data: QueryBuilderData): any[] {
    const values = [] as any[]

    for (const field of data.selection ?? []) {
      values.push(...field.params)
    }

    if (data.table instanceof SqlExpr) {
      values.push(...data.table.params)
    }

    for (const join of data.joins ?? []) {
      if (join.table instanceof SqlExpr) {
        values.push(...join.table.params)
      }

      if (join.condition) {
        values.push(...join.condition.params)
      }
    }

    for (const condition of data.conditions ?? []) {
      values.push(...condition.params)
    }

    for (const condition of data.groupingConditions ?? []) {
      values.push(...condition.params)
    }

    if (data.limit) {
      values.push(...data.limit.params)
    }

    if (data.offset) {
      values.push(...data.offset.params)
    }

    return values
  }

  compileInsertQuery(_data: QueryBuilderData): string {
    const { ...data } = _data

    let returningClause = ""
    if (data.selection) {
      returningClause = `\nRETURNING ${data.selection.map(s => s.toString()).join(", ")}`
      data.selection = undefined
    }

    let script = `INSERT INTO ${data.table}`

    script += ` (${data.assignments?.[0]?.map(([k]) => `\n  ${k}`).join(",")}\n)`

    if (data.insertFrom) {
      script += `\n${data.insertFrom}`
    } else {
      script += ` VALUES ${data.assignments?.map(a => `(${a.map(([, v]) => `\n  ${v}`).join(",")}\n)`).join(",\n")}`
    }

    if (!data.upsert) {
      script += returningClause
      return script
    }

    script += "\nON CONFLICT"

    if (data.upsert.conflictingFields?.length) {
      script += ` (${data.upsert.conflictingFields.map(f => `${f}`).join(", ")})`
    }

    script += " DO"

    switch (data.upsert.conflictResolution) {
    case "NOTHING":
      script += " NOTHING"
      break
    case "UPDATE":
      script += " " + String(data.upsert.update)
      break
    case "MERGE":
      data.table = undefined
      data.assignments = [data.assignments?.[0]?.map(([k]) => {
        return [k, sql.expr(`excluded.${k}`)]
      }) ?? []]
      script += " "
      script += this.compileUpdateQuery(data)
      break
    }

    script += returningClause
    return script
  }

  createInsertParams(data: QueryBuilderData): any[] {
    const values = [] as any[]

    for (const [, assignment] of data.assignments?.flat() ?? []) {
      values.push(...assignment.params)
    }

    if (data.insertFrom) {
      values.push(...data.insertFrom.params)
    }

    for (const field of data.selection ?? []) {
      values.push(...field.params)
    }

    return values
  }

  compileUpdateQuery(data: QueryBuilderData): string {
    let script = `UPDATE ${data.table ?? ""}\nSET`

    for (let i = 0; i < (data.assignments?.[0]?.length ?? 0); i++) {
      script += (i === 0) ? "\n  " : ",\n  "
      script += `${data.assignments![0]![i]![0]} = ${data.assignments![0]![i]![1]}`
    }

    for (let i = 0; i < (data.conditions?.length ?? 0); i++) {
      script += (i === 0) ? "\nWHERE\n  " : " AND\n  "
      script += data.conditions![i]!.query
    }

    if (data.selection) {
      script += `\nRETURNING ${data.selection.map(s => s.toString()).join(", ")}`
    }

    return script
  }

  createUpdateParams(data: QueryBuilderData): any[] {
    const values = [] as any[]

    for (const [, assignment] of data.assignments?.flat() ?? []) {
      values.push(...assignment.params)
    }

    for (const condition of data.conditions ?? []) {
      values.push(...condition.params)
    }

    for (const field of data.selection ?? []) {
      values.push(...field.params)
    }

    return values
  }

  compileDeleteQuery(data: QueryBuilderData): string {
    let script = `DELETE FROM ${data.table}`

    for (let i = 0; i < (data.conditions?.length ?? 0); i++) {
      script += (i === 0) ? "\nWHERE\n  " : " AND\n  "
      script += data.conditions![i]!.query
    }

    if (data.selection) {
      script += `\nRETURNING ${data.selection.map(s => s.toString()).join(", ")}`
    }

    return script
  }

  createDeleteParams(data: QueryBuilderData): any[] {
    const values = [] as any[]

    for (const condition of data.conditions ?? []) {
      values.push(...condition.params)
    }

    for (const field of data.selection ?? []) {
      values.push(...field.params)
    }

    return values
  }
}
