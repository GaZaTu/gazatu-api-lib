import { GraphQLResolveInfo } from "graphql"
// @deno-types="npm:@types/graphql-fields@1.3.9"
import graphqlFields from "npm:graphql-fields@2.0.3"
import { defineGraphQLEnum, gqlclass, gqlprop, listOf, nullable } from "./graphql-typed.ts"
import { Selector, sql } from "../sql.ts"
import { sanitizeWebSearch } from "../sqlite3/sqlite-sanitizewebsearch.ts"

const SortDirection = defineGraphQLEnum("SortDirection", [
  "ASC",
  "DESC",
] as const)

@gqlclass(undefined, { only: "input" })
class Sorting {
  @gqlprop(String)
  col!: string
  @gqlprop(SortDirection)
  dir!: (typeof SortDirection)["ofOptions"]
}

export const gqlSortingArgs = {
  sorting: {
    type: nullable(Sorting),
  },
}

export const gqlSearchArgs = {
  search: {
    type: nullable(String),
  },
}

@gqlclass(undefined, { only: "input" })
class Window {
  @gqlprop(Number, { defaultValue: 0 })
  offset!: number
  @gqlprop(Number, { defaultValue: 25 })
  limit!: number
}

export const gqlPaginationArgs = {
  window: {
    type: nullable(Window),
  },
}

type Constructor<T = any> = abstract new (...args: any) => T

const knownPaginationTypes = new Map<Constructor, Constructor>()

export const paginationOf = <T>(ofType: Constructor<T>) => {
  let existing = knownPaginationTypes.get(ofType)
  if (!existing) {
    @gqlclass(`${ofType.name}ListConnection`)
    class Pagination {
      @gqlprop(listOf(ofType))
      slice!: T[]
      @gqlprop(Number)
      pageIndex!: number
      @gqlprop(Number)
      pageCount!: number
    }

    knownPaginationTypes.set(ofType, existing = Pagination)
  }

  return existing as Constructor<{
    slice: T[],
    pageIndex: number,
    pageCount: number,
  }>
}


export const sqliteWebSearch = (search: string | null | undefined, defaultSearch?: string | null | undefined) => {
  if (!search) {
    search = defaultSearch
  }

  return <T, S>(selector: Selector<T, S>): Selector<T, S> => {
    if (!search) {
      return selector
    }

    const searchSanitized = sanitizeWebSearch(search)
    if (!searchSanitized) {
      return selector
    }

    const srcTable = selector.$meta.selectedTables[0]
    const ftsTable = sql.tbl(`${srcTable?.name}FTS`)

    return selector
      .join(ftsTable, "_fts").on(sql.expr(`_fts.rowid = ${srcTable?.alias}.rowid`))
      .where(sql`${ftsTable} MATCH ${searchSanitized}`)
      .orderBy(sql.expr("_fts.rank"), "ASC") as any
  }
}

export const sqliteWebSort = (sort: { col: string, dir: "ASC" | "DESC" } | null | undefined, defaultSort?: { col: string, dir: "ASC" | "DESC" } | null | undefined) => {
  if (!sort) {
    sort = defaultSort
  }

  return <T, S>(selector: Selector<T, S>): Selector<T, S> => {
    if (!sort) {
      return selector
    }

    if (!selector.$meta.addressableFieldNames.has(sort.col)) {
      throw new Error("invalid sort col")
    }

    if (!["ASC", "DESC"].includes(sort.dir)) {
      throw new Error("invalid sort dir")
    }

    return selector
      .orderBy(sql.expr(sort.col), sort.dir)
  }
}

export const sqliteWebPaginated = (window: { offset: number, limit: number } | null | undefined, defaultWindow?: { offset: number, limit: number } | null | undefined) => {
  defaultWindow ??= { offset: 0, limit: 25 }
  window ??= defaultWindow
  const { offset, limit } = window

  return async <T, S>(selector: Selector<T, S>) => {
    const [slice, count] = await selector
      .findPaginated(offset, limit)

    return {
      slice,
      pageIndex: Math.floor(offset / limit),
      pageCount: Math.ceil(count / limit),
    }
  }
}

export const sqliteSelectDynamic = (selectedKeys: string[]) => {
  type Simplify<T> = T extends object ? { [K in keyof T]: Simplify<T[K]> } : T

  return <T, S>(selector: Selector<T, S>): Selector<T, Simplify<Omit<T, "__alias">>> => {
    const tables = selector.$meta.selectedTables
    const fields = selector.$meta.addressableFields
    const fieldNames = new Set(fields.map(f => f.name))

    for (const field of fields) {
      if (field.pk || field.ref) {
        selectedKeys.push(field.name)
      }
    }

    const selectedKeysWithAlias = selectedKeys
      .map((key, i) => {
        return tables.map(tbl => [i, `${tbl.alias}.${key}`] as const)
      })
      .flat(1)

    const selectedKeysIndexSet = new Set<number>()
    const allowedSelection = new Set<any>()

    for (const [i, key] of selectedKeysWithAlias) {
      if (!selectedKeysIndexSet.has(i) && fieldNames.has(key)) {
        selectedKeysIndexSet.add(i)
        allowedSelection.add(key)
      }
    }

    for (let i = 0; i < selectedKeys.length; i++) {
      const key = selectedKeys[i]!
      if (!selectedKeysIndexSet.has(i) && fieldNames.has(key)) {
        selectedKeysIndexSet.add(i)
        allowedSelection.add(key)
      }
    }

    return selector
      .select(...allowedSelection) as any
  }
}

export const sqliteSelectWithGraphQL = (info: GraphQLResolveInfo, extraKeys: string[] = [], path = (o: any) => o?.slice ?? o) => {
  const selection = graphqlFields(info)
  const selectionPart = path(selection) ?? {}
  const selectedKeys = Object.keys(selectionPart)
  const keySet = new Set([...selectedKeys, ...extraKeys])

  return sqliteSelectDynamic([...keySet])
}

export const sqliteSelectTypename = () => {
  return <T, S>(selector: Selector<T, S>) => {
    return selector
      .select(sql<string>`${selector.$meta.selectedTables[0]?.name}`.as("__typename"))
  }
}
