import { GraphQLResolveInfo } from "graphql"
// @deno-types="npm:@types/graphql-fields"
import graphqlFields from "npm:graphql-fields@^2.0.3"
import { arrayOf, Constructor, nullable, RunTyped, Simplify } from "../runtyped.ts"
import { Selector, sql } from "../sql.ts"
import { declareGraphQLEnum, gqlclass } from "./graphql-typed.ts"

const SortDirectionOptions = [
  "ASC",
  "DESC",
] as const

const SortDirection = declareGraphQLEnum("SortDirection", SortDirectionOptions)

type SortDirections = (typeof SortDirection) extends Constructor<infer X> ? X : never

@gqlclass(undefined, { only: "input" })
class Sorting {
  @RunTyped.field(String, {
    gql: {},
  })
  col!: string

  @RunTyped.field(SortDirection, {
    gql: {},
  })
  dir!: SortDirections
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
  @RunTyped.field(Number, {
    gql: { defaultValue: 0 },
  })
  offset!: number

  @RunTyped.field(Number, {
    gql: { defaultValue: 25 },
  })
  limit!: number
}

export const gqlPaginationArgs = {
  window: {
    type: nullable(Window),
  },
}

const knownPaginationTypes = new Map<Constructor, Constructor>()

export const paginationOf = <T>(ofType: Constructor<T>) => {
  let existing = knownPaginationTypes.get(ofType)
  if (!existing) {
    @gqlclass(`${ofType.name}ListConnection`)
    class Pagination {
      @RunTyped.field(arrayOf(ofType), {
        gql: {},
      })
      slice!: T[]

      @RunTyped.field(Number, {
        gql: {},
      })
      pageIndex!: number

      @RunTyped.field(Number, {
        gql: {},
      })
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

    const srcTable = selector.$meta.selectedTables[0]!
    const ftsTable = sql.tbl(`_fts_${srcTable.name}`)

    return selector
      .join(ftsTable, "_fts").on(sql.expr(`_fts.rowid = ${srcTable.alias}.rowid`))
      .where(sql`${ftsTable} MATCH sanitize_websearch(${search})`)
      .orderBy(sql.expr("_fts.rank"), "ASC") as any
  }
}

export const sqliteWebSort = (sort: { col: string, dir: SortDirections } | null | undefined, defaultSort?: { col: string, dir: SortDirections } | null | undefined) => {
  if (!sort) {
    sort = defaultSort
  }

  return <T, S>(selector: Selector<T, S>): Selector<T, S> => {
    if (!sort) {
      return selector
    }

    const srcTable = selector.$meta.selectedTables[0]!

    let { col, dir } = sort
    if (!col.includes(".")) {
      col = `${srcTable.alias}.${col}`
    }

    if (!selector.$meta.addressableFieldNames.has(col)) {
      throw new Error("invalid sort col")
    }

    if (!SortDirectionOptions.includes(dir)) {
      throw new Error("invalid sort dir")
    }

    return selector
      .orderBy(sql.expr(col), dir)
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
