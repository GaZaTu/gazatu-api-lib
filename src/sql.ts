import DataLoader from "npm:dataloader@^2.2.3"

type AllKeys<T> = T extends any ? keyof T : never
type PickType<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? T[K] : never
type PickTypeOf<T, K extends string | number | symbol> = K extends AllKeys<T> ? PickType<T, K> : never

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never

type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A ? K extends keyof B ? A[K] | B[K] : A[K] : K extends keyof B ? B[K] : never
}

type Simplify<T> = T extends object ? { [K in keyof T]: Simplify<T[K]> } : T

type Constructor<T = any> = new (...args: any[]) => T

type ConstructorType<C> = C extends Constructor<infer T> ? T : never

const SQL_COMPARISON_OPERATORS = ["=", "==", "!=", "<>", ">", ">=", "<", "<=", "in", "not in", "is", "is not", "like", "not like", "match", "glob", "ilike", "not ilike", "@>", "<@", "^@", "&&", "?", "?&", "?|", "!<", "!>", "<=>", "!~", "~", "~*", "!~*", "@@", "@@@", "!!", "<->", "regexp", "is distinct from", "is not distinct from"] as const
const SQL_ARITHMETIC_OPERATORS = ["+", "-", "*", "/", "%", "^", "&", "|", "#", "<<", ">>"] as const
const SQL_JSON_OPERATORS = ["->", "->>"] as const
const SQL_BINARY_OPERATORS = ["=", "==", "!=", "<>", ">", ">=", "<", "<=", "in", "not in", "is", "is not", "like", "not like", "match", "glob", "ilike", "not ilike", "@>", "<@", "^@", "&&", "?", "?&", "?|", "!<", "!>", "<=>", "!~", "~", "~*", "!~*", "@@", "@@@", "!!", "<->", "regexp", "is distinct from", "is not distinct from", "+", "-", "*", "/", "%", "^", "&", "|", "#", "<<", ">>", "&&", "||"] as const
const SQL_UNARY_FILTER_OPERATORS = ["exists", "not exists"] as const
const SQL_UNARY_OPERATORS = ["not", "-", "exists", "not exists"] as const
const SQL_OPERATORS = ["=", "==", "!=", "<>", ">", ">=", "<", "<=", "in", "not in", "is", "is not", "like", "not like", "match", "glob", "ilike", "not ilike", "@>", "<@", "^@", "&&", "?", "?&", "?|", "!<", "!>", "<=>", "!~", "~", "~*", "!~*", "@@", "@@@", "!!", "<->", "regexp", "is distinct from", "is not distinct from", "+", "-", "*", "/", "%", "^", "&", "|", "#", "<<", ">>", "&&", "||", "->", "->>", "not", "-", "exists", "not exists", "between", "between symmetric"] as const

type SqlComparisonOperator = (typeof SQL_COMPARISON_OPERATORS)[number]
type SqlArithmeticOperator = (typeof SQL_ARITHMETIC_OPERATORS)[number]
type SqlJSONOperator = (typeof SQL_JSON_OPERATORS)[number]
type SqlJSONOperatorWith$ = SqlJSONOperator | `${SqlJSONOperator}$`
type SqlBinaryOperator = (typeof SQL_BINARY_OPERATORS)[number]
type SqlUnaryOperator = (typeof SQL_UNARY_OPERATORS)[number]
type SqlUnaryFilterOperator = (typeof SQL_UNARY_FILTER_OPERATORS)[number]
type SqlOperator = (typeof SQL_OPERATORS)[number]

export class SqlExpr<V = any, A extends string = any> {
  constructor(
    public readonly query: string,
    public readonly params: any[] = [],
    public readonly alias?: A,
  ) {}

  as<A extends string>(alias: A): SqlExpr<V, A> {
    return new SqlExpr(`${this.query} AS ${alias}`, this.params, alias)
  }

  toString(): string {
    return this.query
  }
}

export class ExecutableSqlExpr<V = any, A extends string = any> extends SqlExpr<V, A> {
  constructor(
    query: string,
    params: any[] = [],
    alias?: A,
    private _read: QueryExecutor = dummyExecutor,
    private _write: QueryExecutor = dummyExecutor,
  ) {
    super(query, params, alias)
  }

  async execute<R = V>(): Promise<R> {
    const query = this.query.trimStart()
    const params = this.params
    const isSelect = query.startsWith("SELECT")
    const executor = isSelect ? this._read : this._write

    const result = await executor(query, params)
    return result as any
  }

  then<TResult1 = V, TResult2 = never>(onfulfilled?: ((value: V) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute()
      .then(onfulfilled, onrejected)
  }
}

const _sql = <V = any>(strings: TemplateStringsArray, ...values: any[]): SqlExpr<V, any> => {
  const query = strings
    .reduce((prev, curr, i) => {
      const value: any = values[i - 1]

      if (typeof value === "function") {
        return `${prev}"${value.name}"${curr}`
      }

      if (value instanceof SqlExpr) {
        return `${prev}${value.query}${curr}`
      }

      if (Array.isArray(value)) {
        const array = value.flatMap(v => v instanceof SqlExpr ? v.params : [v])
        while (array.length < 32) {
          switch (typeof array[0]) {
          case "string":
            array.push("")
            break
          case "number":
            array.push(0)
            break
          }
        }

        return `${prev}(${array.map(() => "?").join(", ")})${curr}`
      }

      return `${prev}?${curr}`
    })

  const params = values
    .flatMap(value => {
      if (typeof value === "function") {
        return []
      }

      if (value instanceof SqlExpr) {
        return value.params
      }

      if (Array.isArray(value)) {
        const array = value.flatMap(v => v instanceof SqlExpr ? v.params : [v])
        while (array.length < 32) {
          switch (typeof array[0]) {
          case "string":
            array.push("")
            break
          case "number":
            array.push(0)
            break
          }
        }

        return array
      }

      return [value]
    })

  const expr = new SqlExpr<V>(query, params)
  return expr
}

const expr = <V = any>(expr: string) => {
  return new SqlExpr<V>(expr)
}

const arg = <V>(value: V) => {
  return sql<V>`${value}`
}

const ref = new Proxy({} as Record<string, SqlExpr>, {
  get: (t, p) => {
    return expr(String(p))
  },
})

const tbl = (name: string) => {
  return new Proxy(class {}, {
    get: (t, p) => p === "name" ? name : (t as any)[p],
  })
}

const _fn = <V = any>(n: TemplateStringsArray) => {
  return <Ts>(...a: AddressableField<Ts>[]): SqlExprFactory<Ts, V, any> => {
    const x = a.map(f => unpackAddressable(f)!).filter(f => !!f)
    return h => new SqlExpr(`${n[0]}(${x.join(", ")})`, x.map(f => f.params).flat())
  }
}

const fn = Object.assign(_fn, {
  date: _fn<string>`date`,
  count: _fn<number>`count`,
  starts_with: <Ts>(text: AddressableField<Ts>, find: AddressableField<Ts>): SqlExprFactory<Ts, boolean, any> => {
    const textExpr = unpackAddressable(text)!
    const findExpr = unpackAddressable(find)!
    return h => new SqlExpr(`substr(${textExpr}, 1, length(${findExpr})) = ${findExpr}`, [...textExpr.params, ...findExpr.params, ...findExpr.params])
  },
  ends_with: <Ts>(text: AddressableField<Ts>, find: AddressableField<Ts>): SqlExprFactory<Ts, boolean, any> => {
    const textExpr = unpackAddressable(text)!
    const findExpr = unpackAddressable(find)!
    return h => new SqlExpr(`substr(${textExpr}, -1 * length(${findExpr})) = ${findExpr}`, [...textExpr.params, ...findExpr.params, ...findExpr.params])
  },
})

export const sql = Object.assign(_sql, {
  expr,
  arg,
  tbl,
  fn,
  ref,
})

type AddressableFieldsProxy<Ts> = {
  [F in AddressableFieldName<Ts>]: SqlExpr<(F extends `${string}.${infer F_}` ? PickTypeOf<Ts, F_> : PickTypeOf<Ts, F>)>
}

interface SqlExprFactoryHelper<Ts> {
  <V = any>(strings: TemplateStringsArray, ...values: any[]): SqlExpr<V, any>
  expr<V = any>(expr: string): SqlExpr<V>
  arg<V = any>(val: V): SqlExpr<V>
  fn<V = any>(name: TemplateStringsArray): (<Fs extends AddressableField<Ts>[]>(...args: Fs) => SqlExpr<V>)
  ref: AddressableFieldsProxy<Ts>
}

const _SQLEXPR_FACTORY_HELPER = (strings: TemplateStringsArray, ...values: any[]) => {
  return _sql(strings, ...values)
}

const SQLEXPR_FACTORY_HELPER = Object.assign(_SQLEXPR_FACTORY_HELPER, {
  expr: (e: string) => expr(e),
  arg: (v: any) => arg(v),
  fn: (n: TemplateStringsArray) => sql.fn(n) as any,
  ref,
}) as SqlExprFactoryHelper<any>

type SqlExprFactory<Ts, V = any, A extends string = any> = (helper: SqlExprFactoryHelper<Ts>) => SqlExpr<V, A>

type AliasedTable<T, A extends string = "_"> = { __alias: A } & {
  [K in keyof T]: T[K]
}

type ExtractAliasTable<AT, A_ extends string = any> = AT extends AliasedTable<infer T, A_> ? T : never

type ExtractAliasValue<AT, T_ extends object = any> = AT extends AliasedTable<T_, infer A> ? A : never

type SelectableFieldNonAliased<Ts> = (Ts extends AliasedTable<infer T, infer A> ? (A extends "_" ? (Extract<keyof T, string> | "*") : `${A}.${(Extract<keyof T, string> | "*")}`) | "*" : never) | SqlExpr | SqlExprFactory<Ts> | undefined

type AddressableField<Ts> = Exclude<SelectableFieldNonAliased<Ts>, "*" | `${string}.*`>

type AddressableFieldName<Ts> = Exclude<AddressableField<Ts>, SqlExpr | SqlExprFactory<Ts> | undefined>

type SelectableField<Ts> = SelectableFieldNonAliased<Ts> | `${AddressableFieldName<Ts>} as ${string}`

type ExtractAliasFromSelection<F> = F extends `${infer A}.${string}` ? A : never

type ExtractFieldFromSelection<F> = F extends `${string}.${infer F}` ? F : never

type MakeSingleSelection<Ts, Fs> = Fs extends SqlExprFactory<Ts, infer V, infer A> ? {
  [x in A]: V
} : Fs extends SqlExpr<infer V, infer A> ? {
  [x in A]: V
} : Fs extends `${infer E} as ${infer A}` ? {
  [F in A]: (E extends `${string}.${infer F_}` ? PickTypeOf<Ts, F_> : PickTypeOf<Ts, E>)
} : Fs extends string ? {
  [F in Fs]: (F extends `${string}.${infer F_}` ? PickTypeOf<Ts, F_> : PickTypeOf<Ts, F>)
} : never
type MakeSelection<Ts, Fs> = UnionToIntersection<(Fs extends "*" ? ExtractAliasTable<Ts> : (Fs extends `${infer A}.*` ? ExtractAliasTable<Ts, A> : MakeSingleSelection<Ts, Fs>))>

type InsertableValues<T> = Partial<Merge<ExtractAliasTable<T>, { [F in keyof ExtractAliasTable<T>]: SqlExpr<PickTypeOf<T, F>> | SqlExprFactory<T, PickTypeOf<T, F>> }>>

// interface Joinable<Tables> {
//   join<NewTable>(table: Constructor<NewTable>): Joinable<Tables | AliasedTable<NewTable>>
//   join<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Joinable<Tables | AliasedTable<NewTable, A>>
// }

type AddressableInJoin<Parent> = Parent extends Selector<infer Ts> ? AddressableField<Ts> : never

const unpackAddressable = (f: AddressableField<any> | undefined): SqlExpr | undefined => {
  return (typeof f === "string") ? expr(f) : (typeof f === "function") ? f(SQLEXPR_FACTORY_HELPER) : f
}

const unpackSelectable = (f: SelectableField<any> | undefined): SqlExpr | undefined => {
  return (typeof f === "string") ? expr(f) : (typeof f === "function") ? f(SQLEXPR_FACTORY_HELPER) : f
}

const createWhereExpr = <Ts>(lhs?: AddressableField<Ts>, op?: SqlComparisonOperator, rhs?: AddressableField<Ts>) => {
  let lhsExpr = unpackAddressable(lhs)
  if (!lhsExpr) {
    return undefined
  }

  const rhsExpr = unpackAddressable(rhs)
  if (rhsExpr) {
    lhsExpr = sql`${lhsExpr} ${expr(op!)} ${rhsExpr}`
  }

  return lhsExpr
}

const createTableExpr = (table: Constructor | SqlExpr, alias?: string) => {
  let tableExpr = typeof table === "function" ? expr(table.name) : table
  if (alias) {
    tableExpr = tableExpr.as(alias)
  }

  return tableExpr
}

interface Joinable {
  join(table: Constructor, alias: string): JoinHandler<any>
}

class JoinHandler<Parent extends Joinable> {
  constructor(
    private readonly _parent: Parent,
    private _class: Constructor,
    private _clause: QueryBuilderJoinClause,
    private _finish: () => void,
  ) {}

  inner(): JoinHandler<Parent> {
    this._clause.mode = "INNER JOIN"
    return this
  }

  outer(): JoinHandler<Parent> {
    this._clause.mode = "OUTER JOIN"
    return this
  }

  left(): JoinHandler<Parent> {
    this._clause.mode = "LEFT JOIN"
    return this
  }

  right(): JoinHandler<Parent> {
    this._clause.mode = "RIGHT JOIN"
    return this
  }

  cross(): JoinHandler<Parent> {
    this._clause.mode = "CROSS JOIN"
    return this
  }

  on(lhs: AddressableInJoin<Parent>, rhs?: AddressableInJoin<Parent>): Parent {
    const expr = createWhereExpr(lhs, "=", rhs)
    if (!expr) {
      throw new Error("fdm")
    }

    this._clause.condition = expr

    this._finish()
    return this._parent
  }

  always(): Parent {
    return this.on(sql`1 = 1` as any)
  }

  n2m(lhs: AddressableInJoin<Parent>, rhs: readonly [Constructor, AddressableInJoin<Parent>]): Parent {
    const n2m = findN2MRelation(rhs[0], this._class)
    const n2mAlias = `_n2m_${rhs[0].name}_${this._clause.table}`

    this._parent.join(n2m.entity, n2mAlias)
      .on(expr(`${n2mAlias}.${n2m.ids[0]} = ${rhs[1]}`) as any)
    return this
      .on(expr(`${lhs} = ${n2mAlias}.${n2m.ids[1]}`) as any)
  }
}

class ConflictHandler<Table, Selection> {
  constructor(
    private readonly _parent: Inserter<Table, Selection>,
    private readonly _data: QueryBuilderUpsertClause,
    private readonly _compiler: QueryCompiler,
  ) { }

  doNothing(): Inserter<Table, Selection> {
    this._data.conflictResolution = "NOTHING"
    return this._parent
  }

  doUpdate(makeSub: (sub: Updater<AliasedTable<ExtractAliasTable<Table>, "excluded">>) => Updater): Inserter<Table, Selection> {
    this._data.conflictResolution = "UPDATE"
    const sub = makeSub(new Updater(this._compiler))
    const expr = new SqlExpr(sub.query, sub.params)
    this._data.update = expr
    return this._parent
  }

  doMerge(...fields: AddressableFieldName<Table>[]): Inserter<Table, Selection> {
    if (!fields.length) {
      this._data.conflictResolution = "MERGE"
    } else {
      this.doUpdate(u => u.set(fields.reduce((r, f) => { r[f] = sql.ref[`excluded.${f}`]; return r; }, {} as any)))
    }
    return this._parent
  }
}

export class Selector<Tables = unknown, Selection = unknown> {
  private _data: QueryBuilderData = {}
  private _tables: [Constructor, string?][] = []

  constructor(
    private readonly _compiler: QueryCompiler,
    private readonly _executor: QueryExecutor = dummyExecutor,
  ) {}

  readonly $meta = {
    _data: this._data,
    _tables: this._tables,
    get selectedTables() {
      return this._tables.map(t => ({
        name: t[0].name,
        alias: t[1] ?? t[0].name,
        ...sqlclassMap.get(t[0]),
      }))
    },
    get addressableFields() {
      return this.selectedTables
        .flatMap(t => {
          if (!t.fields) {
            return []
          }

          return [...t.fields, ...(t.alias ? t.fields.map(f => ({ ...f, name: `${t.alias}.${f.name}` })) : [])]
        })
    },
    get addressableFieldNames() {
      return new Set(this.addressableFields.map(f => f.name))
    },
  }

  from<NewTable>(table: SqlExpr): Selector<Tables>
  from<NewTable>(table: Constructor<NewTable>): Selector<Exclude<Tables, unknown> | AliasedTable<NewTable>>
  from<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Selector<Exclude<Tables, unknown> | AliasedTable<NewTable, A>>
  from(table: Constructor | SqlExpr, alias?: string): Selector<any> {
    if (typeof table === "function") {
      this._tables.push([table, alias])
    }

    this._data.table = createTableExpr(table, alias)

    return this
  }

  join<NewTable>(table: Constructor<NewTable>): JoinHandler<Selector<Tables | AliasedTable<NewTable>>>
  join<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): JoinHandler<Selector<Tables | AliasedTable<NewTable, A>>>
  join(table: Constructor, alias?: string): JoinHandler<any> {
    if (typeof table === "function") {
      this._tables.push([table, alias])
    }

    const clause: QueryBuilderJoinClause = {
      table: createTableExpr(table, alias),
    }

    return new JoinHandler(this, table, clause, () => {
      this._data.joins ??= []
      this._data.joins.push(clause)
    })
  }

  distinct(distinct = true): Selector<Tables, Selection> {
    this._data.distinct = distinct
    return this
  }

  select<NewSelection extends SelectableField<Tables>[]>(...fields: NewSelection): Selector<Tables, Simplify<Selection & MakeSelection<Tables, NewSelection[number]>>> {
    this._data.selection ??= []
    this._data.selection.push(...fields.map(f => unpackSelectable(f)!).filter(f => !!f))
    return this as any
  }

  // select2<NewSelection extends Record<string, SelectableFields<Tables>>>(fields: NewSelection): Selector<Tables, Simplify<Selection>> {
  //   return this as any
  // }

  where(lhs?: AddressableField<Tables>, op?: SqlComparisonOperator, rhs?: AddressableField<Tables>): Selector<Tables, Selection> {
    const expr = createWhereExpr(lhs, op, rhs)
    if (!expr) {
      return this
    }

    this._data.conditions ??= []
    this._data.conditions.push(expr)

    return this
  }

  whereNot(lhs?: AddressableField<Tables>, op?: SqlComparisonOperator, rhs?: AddressableField<Tables>): Selector<Tables, Selection> {
    const expr = createWhereExpr(lhs, op, rhs)
    if (!expr) {
      return this
    }

    return this.where(sql`NOT (${expr})`)
  }

  whereExists(makeSub: (sub: Selector<Tables>) => Selector): Selector<Tables, Selection> {
    return this.where(makeSub(new Selector<Tables>(this._compiler)).asExists())
  }

  whereNotExists(makeSub: (sub: Selector<Tables>) => Selector): Selector<Tables, Selection> {
    return this.where(makeSub(new Selector<Tables>(this._compiler)).asNotExists())
  }

  whereIn(field: AddressableField<Tables>, makeSub: (sub: Selector<Tables>) => Selector): Selector<Tables, Selection> {
    return this.where(field, "in", makeSub(new Selector<Tables>(this._compiler)).asExpr())
  }

  groupBy(...fields: AddressableField<Tables>[]): Selector<Tables, Selection> {
    this._data.groupings ??= []
    this._data.groupings.push(...fields.map(f => unpackAddressable(f)!).filter(f => !!f))

    return this
  }

  having(lhs?: AddressableField<Tables>, op?: SqlComparisonOperator, rhs?: AddressableField<Tables>): Selector<Tables, Selection> {
    const expr = createWhereExpr(lhs, op, rhs)
    if (!expr) {
      return this
    }

    this._data.groupingConditions ??= []
    this._data.groupingConditions.push(expr)

    return this
  }

  private readonly _fieldsToOrderBy = new Map<string, QueryBuilderOrderClause>()

  orderBy(field: AddressableField<Tables>, direction?: OrderByDirection, nulls?: OrderByNulls): Selector<Tables, Selection> {
    const fieldExpr = unpackAddressable(field)
    if (!fieldExpr) {
      return this
    }

    if (direction && !ORDER_BY_DIRECTIONS.includes(direction)) {
      throw new Error("fdm")
    }

    const fieldName = typeof field === "string" ? field as any : undefined
    const orderClause: QueryBuilderOrderClause = {
      field: fieldExpr,
      direction,
      nulls,
    }

    if (fieldName) {
      for (const [otherName, otherClause] of this._fieldsToOrderBy) {
        if (otherName === fieldName) {
          Object.assign(otherClause, orderClause)
          return this
        }
      }

      this._fieldsToOrderBy.set(fieldName, orderClause)
    }

    this._data.ordering ??= []
    this._data.ordering.push(orderClause)

    return this
  }

  offset(offset: number | null | undefined | SqlExpr): Selector<Tables, Selection> {
    if (!offset) {
      this._data.offset = undefined
      return this
    }

    if (!(offset instanceof SqlExpr)) {
      offset = sql`${offset}`
    }

    this._data.offset = offset

    return this
  }

  limit(limit: number | null | undefined | SqlExpr): Selector<Tables, Selection> {
    if (!limit) {
      this._data.limit = undefined
      return this
    }

    if (!(limit instanceof SqlExpr)) {
      limit = sql`${limit}`
    }

    this._data.limit = limit

    return this
  }

  get query(): string {
    let query = this._compiler.compileSelectQuery(this._data)
    for (let union = this._data.prevUnion; union; union = union.data?.prevUnion) {
      query = `${this._compiler.compileSelectQuery(union.data)}\n${union.mode}\n${query}`
    }
    return query
  }

  get params(): any[] {
    let params = this._compiler.createSelectParams(this._data)
    for (let union = this._data.prevUnion; union; union = union.data?.prevUnion) {
      params = [...this._compiler.createSelectParams(union.data), ...params]
    }
    return params
  }

  compile(): [string, any[]] {
    return [this.query, this.params]
  }

  async findMany<R = Selection>(): Promise<R[]> {
    const r = await this._executor(this.query, this.params) as any[]
    return r
  }

  then<TResult1 = Selection, TResult2 = never>(onfulfilled?: ((value: Selection[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.findMany()
      .then(onfulfilled, onrejected)
  }

  async findOne<R = Selection | undefined>(): Promise<R> {
    this.limit(1)

    const result = await this.findMany()
    return result[0] as any
  }

  async findValue<R = Selection[keyof Selection] | undefined>(): Promise<R> {
    const result = await this.findOne()
    for (const value of Object.values(result ?? {})) {
      return value as any
    }
    return undefined as any
  }

  async findPaginated(offset: number | null | undefined, limit: number | null | undefined): Promise<[Selection[], number]> {
    const slice = await this
      .offset(offset ?? 0)
      .limit(limit ?? 25)
      .findMany()

    const count = await this
      .offset(undefined)
      .limit(undefined)
      .count()

    return [slice, count]
  }

  asCount(): SqlExpr<{ ["count(*)"]: number }> {
    this._data.selection = [sql`count(*)`]

    return this.asExpr() as any
  }

  async count(): Promise<number> {
    this._data.selection = [sql`count(*)`]

    if (this.isGrouped) {
      const selector = new Selector(this._compiler, this._executor)
      selector._data = Object.fromEntries(Object.entries(this._data))
      selector._data.ordering = undefined

      const counter = new Selector(this._compiler, this._executor)
      return await counter
        .select()
        .from(selector.asExpr())
        .count()
    } else {
      return await this
        .findValue<number>()
        .then(r => r ?? 0)
    }
  }

  asExpr(): SqlExpr<Selection[]> {
    return new SqlExpr(`(${this.query})`, this.params)
  }

  asExists(): SqlExpr<boolean> {
    this._data.selection = [sql`1`]

    return sql`(EXISTS ${this.asExpr()})`
  }

  asNotExists(): SqlExpr<boolean> {
    return sql`(NOT ${this.asExists()})`
  }

  async exists(): Promise<boolean> {
    return await new Selector(this._compiler)
      .select(this.asExists())
      .findValue()
  }

  async explain() {
    const r = sql`EXPLAIN QUERY PLAN ${new SqlExpr(`${this.query}`, this.params)}`
    return await this._executor(r.query, r.params)
  }

  orderByRandom(randomize = true) {
    if (!randomize) {
      return this
    }

    this._data.ordering = []

    return this.orderBy(sql`random()`)
  }

  get isGrouped() {
    return (this._data.groupings?.length ?? 0) > 0
  }

  get isOrdered() {
    return (this._data.ordering?.length ?? 0) > 0
  }

  union(mode?: "ALL"): Selector<unknown, unknown> {
    const union = new Selector(this._compiler, this._executor)
    union._data.prevUnion = {
      mode: mode ? "UNION ALL" : "UNION",
      data: this._data,
    }
    return union
  }

  $do(plugin: (qb: Selector<Tables, Selection>) => unknown): Selector<Tables, Selection> {
    plugin(this)
    return this
  }

  $plug<NewTables, NewSelection>(plugin: (qb: Selector<Tables, Selection>, h: SqlExprFactoryHelper<Tables>) => Selector<NewTables, NewSelection>): Selector<NewTables, NewSelection> {
    return plugin(this, SQLEXPR_FACTORY_HELPER)
  }

  private _conditionNesting = 0
  private _prevConditionMap = new Map<number, unknown>()

  $if<NewTables, NewSelection>(condition: unknown, onTrue: (qb: Selector<Tables, Selection>) => Selector<NewTables, NewSelection>): Selector<Tables | NewTables, Simplify<Selection & Partial<NewSelection>>> {
    try {
      const prevCondition = this._prevConditionMap.get(this._conditionNesting)
      if (condition) {
        try {
          this._conditionNesting += 1
          return onTrue(this) as any
        } finally {
          this._conditionNesting -= 1
        }
      } else {
        return this as any
      }
    } finally {
      this._prevConditionMap.set(this._conditionNesting, condition)
    }
  }

  $elseIf<NewTables, NewSelection>(condition: unknown, onTrue: (qb: Selector<Tables, Selection>) => Selector<NewTables, NewSelection>): Selector<Tables | NewTables, Simplify<Selection & Partial<NewSelection>>> {
    try {
      const prevCondition = this._prevConditionMap.get(this._conditionNesting)
      if (!prevCondition && condition) {
        try {
          this._conditionNesting += 1
          return onTrue(this) as any
        } finally {
          this._conditionNesting -= 1
        }
      } else {
        return this as any
      }
    } finally {
      this._prevConditionMap.set(this._conditionNesting, condition)
    }
  }

  $else<NewTables, NewSelection>(onTrue: (qb: Selector<Tables, Selection>) => Selector<NewTables, NewSelection>): Selector<Tables | NewTables, Simplify<Selection & Partial<NewSelection>>> {
    try {
      const prevCondition = this._prevConditionMap.get(this._conditionNesting)
      if (!prevCondition) {
        try {
          this._conditionNesting += 1
          return onTrue(this) as any
        } finally {
          this._conditionNesting -= 1
        }
      } else {
        return this as any
      }
    } finally {
      // nothing
    }
  }

  async $find<R>(plugin: (qb: Selector<Tables, Selection>) => Promise<R>): Promise<R> {
    return await plugin(this)
  }
}

export class Inserter<Table = unknown, Selection = unknown> {
  private _data: QueryBuilderData = {}

  constructor(
    private readonly _compiler: QueryCompiler,
    private readonly _executor: QueryExecutor = dummyExecutor,
  ) {}

  into<NewTable>(table: Constructor<NewTable>): Inserter<AliasedTable<NewTable>> {
    this._data.table = createTableExpr(table)
    return this as any
  }

  insert(values: InsertableValues<Table>): Inserter<Table, Selection>
  insert(...fields: Extract<AddressableField<Table>, string>[]): Inserter<Table, Selection>
  insert(...fields: (InsertableValues<Table> | AddressableField<Table>)[]): Inserter<Table, Selection> {
    if (typeof fields[0] !== "string") {
      const values = fields[0] as InsertableValues<Table>
      this._data.assignments ??= []
      this._data.assignments.push(Object.entries(values).map(([k, v]) => {
        if (v instanceof SqlExpr) {
          return [k, v]
        } else if (typeof v === "function") {
          return [k, v(SQLEXPR_FACTORY_HELPER)]
        } else {
          return [k, arg(v)]
        }
      }))
    } else {
      const values = fields as AddressableField<Table>[]
      this._data.assignments ??= []
      this._data.assignments.push(values.map(f => unpackAddressable(f)!).filter(f => !!f).map(f => [String(f), f]))
    }
    return this
  }

  insertMany(values: InsertableValues<Table>[]): Inserter<Table, Selection> {
    for (const v of values) {
      this.insert(v)
    }
    return this
  }

  insertJson(json: (keyof InsertableValues<Table> extends "json" ? object | string : never)) {
    if (typeof json !== "string") {
      json = JSON.stringify(json) as any
    }
    return this.insert({ json } as any)
  }

  upsert(values: InsertableValues<Table>): Inserter<Table, Selection>
  upsert(...fields: Extract<AddressableField<Table>, string>[]): Inserter<Table, Selection>
  upsert(...fields: (InsertableValues<Table> | AddressableField<Table>)[]): Inserter<Table, Selection> {
    this.insert(...fields as any[]).onConflict().doMerge()
    return this
  }

  upsertMany(values: InsertableValues<Table>[]): Inserter<Table, Selection> {
    this.insertMany(values).onConflict().doMerge()
    return this
  }

  from<NewTable>(table: Constructor<NewTable>, makeSub: ((sub: Selector<AliasedTable<NewTable>>) => Selector<any, ExtractAliasTable<Table>>)): Inserter<Table, Selection>
  from<NewTable, A extends string>(table: Constructor<NewTable>, alias: A, makeSub: ((sub: Selector<AliasedTable<NewTable>>) => Selector<any, ExtractAliasTable<Table>>)): Inserter<Table, Selection>
  from(table: Constructor, aliasOrMakeSub: string | ((sub: Selector<any>) => Selector<any, ExtractAliasTable<Table>>), makeSub?: ((sub: Selector<any>) => Selector<any, ExtractAliasTable<Table>>)): Inserter<Table, Selection> {
    if (typeof aliasOrMakeSub === "function") {
      makeSub = aliasOrMakeSub
    }

    // TODO
    const sub = makeSub!(new Selector(this._compiler).from(table))
    const expr = new SqlExpr(sub.query, sub.params)
    this._data.insertFrom = expr

    return this
  }

  onConflict(...fields: AddressableField<Table>[]): ConflictHandler<Table, Selection> {
    this._data.upsert ??= {}
    this._data.upsert.conflictingFields ??= []
    this._data.upsert.conflictingFields.push(...fields?.map(f => unpackAddressable(f)!).filter(f => !!f))
    return new ConflictHandler(this, this._data.upsert, this._compiler)
  }

  returning<NewSelection extends SelectableField<Table>[]>(...fields: NewSelection): Inserter<Table, Simplify<Selection & MakeSelection<Table, NewSelection[number]>>> {
    this._data.selection ??= []
    this._data.selection.push(...fields.map(f => unpackSelectable(f)!).filter(f => !!f))
    return this as any
  }

  get query(): string {
    return this._compiler.compileInsertQuery(this._data)
  }

  get params(): any[] {
    return this._compiler.createInsertParams(this._data)
  }

  compile(): [string, any[]] {
    return [this.query, this.params]
  }

  async execute<R = (Selection extends object ? Selection[] : number)>(env?: Record<string, string>): Promise<R> {
    const r = await this._executor(this.query, this.params, env) as any
    if (this._data.selection?.length) {
      return r
    }
    return r[0]?.["changes"] ?? 0
  }

  then<TResult1 = (Selection extends object ? Selection[] : number), TResult2 = never>(onfulfilled?: ((value: (Selection extends object ? Selection[] : number)) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute()
      .then(onfulfilled, onrejected)
  }

  $plug<NewTable, NewSelection>(plugin: (qb: Inserter<Table, Selection>, h: SqlExprFactoryHelper<Table>) => Inserter<NewTable, NewSelection>): Inserter<NewTable, NewSelection> {
    return plugin(this, SQLEXPR_FACTORY_HELPER)
  }

  $if<NewTable, NewSelection>(condition: unknown, onTrue: (qb: Inserter<Table, Selection>) => Inserter<NewTable, NewSelection>): Inserter<Table | NewTable, Simplify<Selection & Partial<NewSelection>>> {
    if (condition) {
      return onTrue(this) as any
    } else {
      return this as any
    }
  }
}

export class Updater<Table = unknown, Selection = unknown> {
  private _data: QueryBuilderData = {}

  constructor(
    private readonly _compiler: QueryCompiler,
    private readonly _executor: QueryExecutor = dummyExecutor,
  ) {}

  update<NewTable>(table: Constructor<NewTable>): Updater<AliasedTable<NewTable>>
  update<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Updater<AliasedTable<NewTable, A>>
  update(table: Constructor, alias?: string): Updater<any> {
    this._data.table = createTableExpr(table, alias)
    return this as any
  }

  set(values: InsertableValues<Table>): Updater<Table, Selection> {
    this._data.assignments ??= []
    this._data.assignments.push(Object.entries(values).map(([k, v]) => {
      if (v instanceof SqlExpr) {
        return [k, v]
      } else if (typeof v === "function") {
        return [k, v(SQLEXPR_FACTORY_HELPER)]
      } else {
        return [k, arg(v)]
      }
    }))
    return this
  }

  where(lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>): Updater<Table, Selection> {
    const expr = createWhereExpr(lhs, op, rhs)
    if (!expr) {
      return this
    }

    this._data.conditions ??= []
    this._data.conditions.push(expr)

    return this
  }

  whereExists(makeSub: (sub: Selector<Table>) => Selector): Updater<Table, Selection> {
    return this.where(makeSub(new Selector<Table>(this._compiler)).asExists())
  }

  whereNotExists(makeSub: (sub: Selector<Table>) => Selector): Updater<Table, Selection> {
    return this.where(makeSub(new Selector<Table>(this._compiler)).asNotExists())
  }

  whereIn(field: AddressableField<Table>, makeSub: (sub: Selector<Table>) => Selector): Updater<Table, Selection> {
    return this.where(field, "in", makeSub(new Selector<Table>(this._compiler)).asExpr())
  }

  returning<NewSelection extends SelectableField<Table>[]>(...fields: NewSelection): Updater<Table, Simplify<Selection & MakeSelection<Table, NewSelection[number]>>> {
    this._data.selection ??= []
    this._data.selection.push(...fields.map(f => unpackSelectable(f)!).filter(f => !!f))
    return this as any
  }

  get query(): string {
    return this._compiler.compileUpdateQuery(this._data)
  }

  get params(): any[] {
    return this._compiler.createUpdateParams(this._data)
  }

  compile(): [string, any[]] {
    return [this.query, this.params]
  }

  async execute<R = (Selection extends object ? Selection[] : number)>(env?: Record<string, string>): Promise<R> {
    const r = await this._executor(this.query, this.params, env) as any
    if (this._data.selection?.length) {
      return r
    }
    return r[0]?.["changes"] ?? 0
  }

  then<TResult1 = (Selection extends object ? Selection[] : number), TResult2 = never>(onfulfilled?: ((value: (Selection extends object ? Selection[] : number)) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute()
      .then(onfulfilled, onrejected)
  }

  $plug<NewTable, NewSelection>(plugin: (qb: Updater<Table, Selection>, h: SqlExprFactoryHelper<Table>) => Updater<NewTable, NewSelection>): Updater<NewTable, NewSelection> {
    return plugin(this, SQLEXPR_FACTORY_HELPER)
  }

  $if<NewTable, NewSelection>(condition: unknown, onTrue: (qb: Updater<Table, Selection>) => Updater<NewTable, NewSelection>): Updater<Table | NewTable, Simplify<Selection & Partial<NewSelection>>> {
    if (condition) {
      return onTrue(this) as any
    } else {
      return this as any
    }
  }
}

export class Deleter<Table = unknown, Selection = unknown> {
  private _data: QueryBuilderData = {}

  constructor(
    private readonly _compiler: QueryCompiler,
    private readonly _executor: QueryExecutor = dummyExecutor,
  ) {}

  from<NewTable>(table: Constructor<NewTable>): Deleter<AliasedTable<NewTable>>
  from<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Deleter<AliasedTable<NewTable, A>>
  from(table: Constructor, alias?: string): Deleter<any> {
    this._data.table = createTableExpr(table, alias)
    return this as any
  }

  where(lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>): Deleter<Table, Selection> {
    const expr = createWhereExpr(lhs, op, rhs)
    if (!expr) {
      return this
    }

    this._data.conditions ??= []
    this._data.conditions.push(expr)

    return this
  }

  whereExists(makeSub: (sub: Selector<Table>) => Selector): Deleter<Table, Selection> {
    return this.where(makeSub(new Selector<Table>(this._compiler)).asExists())
  }

  whereNotExists(makeSub: (sub: Selector<Table>) => Selector): Deleter<Table, Selection> {
    return this.where(makeSub(new Selector<Table>(this._compiler)).asNotExists())
  }

  whereIn(field: AddressableField<Table>, makeSub: (sub: Selector<Table>) => Selector): Deleter<Table, Selection> {
    return this.where(field, "in", makeSub(new Selector<Table>(this._compiler)).asExpr())
  }

  returning<NewSelection extends SelectableField<Table>[]>(...fields: NewSelection): Deleter<Table, Simplify<Selection & MakeSelection<Table, NewSelection[number]>>> {
    this._data.selection ??= []
    this._data.selection.push(...fields.map(f => unpackSelectable(f)!).filter(f => !!f))
    return this as any
  }

  get query(): string {
    return this._compiler.compileDeleteQuery(this._data)
  }

  get params(): any[] {
    return this._compiler.createDeleteParams(this._data)
  }

  compile(): [string, any[]] {
    return [this.query, this.params]
  }

  async execute<R = (Selection extends object ? Selection[] : number)>(env?: Record<string, string>): Promise<R> {
    const r = await this._executor(this.query, this.params, env) as any
    if (this._data.selection?.length) {
      return r
    }
    return r[0]?.["changes"] ?? 0
  }

  then<TResult1 = (Selection extends object ? Selection[] : number), TResult2 = never>(onfulfilled?: ((value: (Selection extends object ? Selection[] : number)) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute()
      .then(onfulfilled, onrejected)
  }

  $plug<NewTable, NewSelection>(plugin: (qb: Deleter<Table, Selection>, h: SqlExprFactoryHelper<Table>) => Deleter<NewTable, NewSelection>): Deleter<NewTable, NewSelection> {
    return plugin(this, SQLEXPR_FACTORY_HELPER)
  }

  $if<NewTable, NewSelection>(condition: unknown, onTrue: (qb: Deleter<Table, Selection>) => Deleter<NewTable, NewSelection>): Deleter<Table | NewTable, Simplify<Selection & Partial<NewSelection>>> {
    if (condition) {
      return onTrue(this) as any
    } else {
      return this as any
    }
  }
}

const ORDER_BY_DIRECTIONS = ["ASC", "DESC"] as const

type OrderByDirection = (typeof ORDER_BY_DIRECTIONS)[number]

type OrderByNulls = "NULLS FIRST" | "NULLS LAST"

type JoinMode = "INNER JOIN" | "OUTER JOIN" | "LEFT JOIN" | "RIGHT JOIN" | "CROSS JOIN"

type QueryBuilderJoinClause = {
  table: SqlExpr
  condition?: SqlExpr
  mode?: JoinMode
}

type QueryBuilderOrderClause = {
  field: SqlExpr
  direction?: OrderByDirection
  nulls?: OrderByNulls
}

type QueryBuilderConflictResolution = "NOTHING" | "UPDATE" | "MERGE"

type QueryBuilderUpsertClause = {
  conflictingFields?: SqlExpr[]
  conflictResolution?: QueryBuilderConflictResolution
  update?: SqlExpr
}

export type QueryBuilderData = {
  table?: SqlExpr
  selection?: SqlExpr[]
  joins?: QueryBuilderJoinClause[]
  assignments?: [string, SqlExpr][][]
  conditions?: SqlExpr[]
  groupings?: SqlExpr[]
  groupingConditions?: SqlExpr[]
  ordering?: QueryBuilderOrderClause[]
  offset?: SqlExpr
  limit?: SqlExpr
  upsert?: QueryBuilderUpsertClause
  distinct?: boolean
  insertFrom?: SqlExpr
  prevUnion?: {
    mode: "UNION" | "UNION ALL"
    data: QueryBuilderData
  }
}

export interface QueryCompiler {
  compileSelectQuery(data: QueryBuilderData): string
  createSelectParams(data: QueryBuilderData): any[]

  compileInsertQuery(data: QueryBuilderData): string
  createInsertParams(data: QueryBuilderData): any[]

  compileUpdateQuery(data: QueryBuilderData): string
  createUpdateParams(data: QueryBuilderData): any[]

  compileDeleteQuery(data: QueryBuilderData): string
  createDeleteParams(data: QueryBuilderData): any[]
}

class DummyQueryCompiler implements QueryCompiler {
  compileSelectQuery(data: QueryBuilderData): string {
    throw new Error("Method not implemented.")
  }
  createSelectParams(data: QueryBuilderData): any[] {
    throw new Error("Method not implemented.")
  }

  compileInsertQuery(data: QueryBuilderData): string {
    throw new Error("Method not implemented.")
  }
  createInsertParams(data: QueryBuilderData): any[] {
    throw new Error("Method not implemented.")
  }

  compileUpdateQuery(data: QueryBuilderData): string {
    throw new Error("Method not implemented.")
  }
  createUpdateParams(data: QueryBuilderData): any[] {
    throw new Error("Method not implemented.")
  }

  compileDeleteQuery(data: QueryBuilderData): string {
    throw new Error("Method not implemented.")
  }
  createDeleteParams(data: QueryBuilderData): any[] {
    throw new Error("Method not implemented.")
  }
}

type QueryExecutor = (query: string, values: any[], env?: Record<string, string>) => Promise<Record<string, any>[]>

const dummyExecutor = () => Promise.resolve([])

export type DatabaseAccessOptions = {
  compiler?: QueryCompiler
  read?: QueryExecutor
  write?: QueryExecutor
  newid?: () => string
  enableCache?: boolean
  parent?: DatabaseAccess
  createReader?: () => QueryExecutor | Promise<QueryExecutor>
  createWriter?: () => QueryExecutor | Promise<QueryExecutor>
}

export class DatabaseAccess {
  compiler: QueryCompiler
  read?: QueryExecutor
  write?: QueryExecutor
  newid: () => string

  private readonly createReader?: () => QueryExecutor | Promise<QueryExecutor>
  private readonly createWriter?: () => QueryExecutor | Promise<QueryExecutor>

  constructor(options: DatabaseAccessOptions) {
    this.compiler = options.compiler ?? options.parent?.compiler ?? new DummyQueryCompiler()
    this.read = options.read ?? options.parent?.read ?? dummyExecutor
    this.write = options.write ?? options.parent?.write ?? dummyExecutor
    this.newid = options.newid ?? options.parent?.newid ?? (() => crypto.randomUUID())

    this.createReader = options.createReader
    this.createWriter = options.createWriter

    if (options.parent) {
      this._useCache = options.parent._useCache
      this._dataloaders = options.parent._dataloaders
      this._n2mAccessCache = options.parent._n2mAccessCache
      this._tableAccessCache = options.parent._tableAccessCache
    }

    if (options.enableCache !== undefined) {
      this.enableCache(options.enableCache)
    }
  }

  async initialize() {
    if (this.createReader) {
      this.read = await this.createReader()
    }
    if (this.createWriter) {
      this.write = await this.createWriter()
    }
  }

  withEnv(env: () => Promise<Record<string, string>>) {
    return new DatabaseAccess({
      parent: this,
      write: async (q, v, e) => {
        return await this.write!(q, v, { ...e, ...(await env()) })
      },
    })
  }

  from<NewTable>(table: Constructor<NewTable>): Selector<AliasedTable<NewTable>>
  from<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Selector<AliasedTable<NewTable, A>>
  from(table: Constructor, alias?: string): Selector<any> {
    return new Selector(this.compiler, this.read).from(table, alias!)
  }

  into<NewTable>(table: Constructor<NewTable>): Inserter<AliasedTable<NewTable>> {
    return new Inserter(this.compiler, this.write).into(table)
  }

  update<NewTable>(table: Constructor<NewTable>): Updater<AliasedTable<NewTable>>
  update<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): Updater<AliasedTable<NewTable, A>>
  update(table: Constructor, alias?: string): Updater<any> {
    return new Updater(this.compiler, this.write).update(table, alias!)
  }

  delete(): Deleter<any> {
    return new Deleter(this.compiler, this.write)
  }


  private _dataloaders = {
    count: new Map<string, Map<string, DataLoader<unknown, any>>>(),
    findMany: new Map<string, Map<string, DataLoader<unknown, any>>>(),
    findManyByN2M: new Map<string, Map<string, DataLoader<unknown, any>>>(),
    findOne: new Map<string, Map<string, DataLoader<unknown, any>>>(),
  }

  private _useCache = false

  enableCache(useCache = true) {
    this._useCache = useCache
  }

  clearCache(...updatedTables: string[]) {
    for (const dataloaderMap of Object.values(this._dataloaders)) {
      if (updatedTables.length) {
        for (const updatedTable of updatedTables) {
          const dataloaders = dataloaderMap.get(updatedTable)
          if (!dataloaders) {
            continue
          }

          for (const [, dataloader] of dataloaders) {
            dataloader.clearAll()
          }
        }
      } else {
        for (const [, dataloaders] of dataloaderMap) {
          for (const [, dataloader] of dataloaders) {
            dataloader.clearAll()
          }
        }
      }
    }

    if (updatedTables) {
      for (const updatedTable of updatedTables) {
        for (const [, dataloaders] of this._dataloaders.findManyByN2M) {
          dataloaders.get(updatedTable)?.clearAll()
        }
      }
    }
  }

  private createTableAccess<NewTable>(table: Constructor<NewTable>) {
    // deno-lint-ignore no-this-alias
    const self = this

    type Table = AliasedTable<NewTable>

    // const table = this._tables.get(tableName)
    // if (!table) {
    //   throw new Error(`table '${tableName}' does not exist`)
    // }

    const hasIdColumn = sqlclassMap.get(table)?.fieldNames.includes("id") ?? false

    const maxBatchSize = 128

    const count = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>) => {
      return await this
        .from(table)
        .select(sql`count(*)` as any)
        .$if((lhs && op && rhs), s => s.where(lhs, op, rhs))
        .count()
    }

    const findId = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>) => {
      return await this
        .from(table)
        .select("id" as any)
        .where(lhs, op, rhs)
        .findValue()
    }

    const findMany = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>) => {
      return await this
        .from(table)
        .select("*" as any)
        .where(lhs, op, rhs)
        .findMany() as NewTable[]
    }

    const findManyWithDataLoader: (typeof findMany) = async (lhs, op, rhs) => {
      if (op !== "=" || typeof lhs !== "string" || !(rhs instanceof SqlExpr)) {
        return await findMany(lhs, op, rhs)
      }

      let record = this._dataloaders.count.get(table.name)
      if (!record) {
        record = new Map()

        this._dataloaders.count.set(table.name, record)
      }

      const condition = `${lhs} ${op} ?`

      let dataloader = record.get(condition)
      if (!dataloader) {
        dataloader = new DataLoader(async values => {
          const filter = values.slice()
          while (filter.length < maxBatchSize) {
            filter.push("")
          }

          const list = await findMany(lhs, "in", sql.arg(filter))

          const result = values
            .map(value => list.filter(e => (e as any)[lhs] === value))
          return result
        }, { maxBatchSize, cache: this._useCache })

        record.set(condition, dataloader)
      }

      const result = await dataloader.load(rhs.params[0])
      return result
    }

    const findManyById = async (ids: (string | number | null | undefined)[]) => {
      const filter = ids.slice()
      while (filter.length < maxBatchSize) {
        filter.push("")
      }

      return await findMany("id" as any, "in", sql.arg(filter))
    }

    const findOne = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>) => {
      return await this
        .from(table)
        .select("*" as any)
        .where(lhs, op, rhs)
        .findOne() as Promise<NewTable | undefined>
    }

    const findOneWithDataLoader: (typeof findOne) = async (lhs, op, rhs) => {
      if (op !== "=" || typeof lhs !== "string" || !(rhs instanceof SqlExpr)) {
        return await findOne(lhs, op, rhs)
      }

      let record = this._dataloaders.count.get(table.name)
      if (!record) {
        record = new Map()

        this._dataloaders.count.set(table.name, record)
      }

      const condition = `${lhs} ${op} ?`

      let dataloader = record.get(condition)
      if (!dataloader) {
        dataloader = new DataLoader(async values => {
          const filter = values.slice()
          while (filter.length < maxBatchSize) {
            filter.push("")
          }

          const map = new Map(
            (await findMany(lhs, "in", sql.arg(filter)))
              .map(r => [(r as any)[lhs], r] as const)
          )

          const result = values
            .map(value => map.get(value))
          return result
        }, { maxBatchSize, cache: this._useCache })

        record.set(condition, dataloader)
      }

      try {
        const result = await dataloader.load(rhs.params[0])
        return result
      } catch (error: any) {
        const e = new Error(error.message, { cause: error })
        e.stack = `${e.stack ? `${e.stack}\nCaused by ` : ""}${error.stack}`
        throw e
      }
    }

    const findOneById = async (id: string | number | null | undefined) => {
      if (!id) {
        return undefined
      }

      return await findOneWithDataLoader("id" as any, "=", sql.arg(id))
    }

    const exists = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>) => {
      const r = await findOneWithDataLoader(lhs, op, rhs)
      return r !== undefined
    }

    const existsById = async (id: string | number | null | undefined) => {
      if (!id) {
        return undefined
      }

      return await exists("id" as any, "in", sql.arg(id))
    }

    async function save(input: InsertableValues<Table>, env?: Record<string, string>): Promise<Simplify<NewTable>>
    async function save(input: InsertableValues<Table>[], env?: Record<string, string>): Promise<Simplify<NewTable>[]>
    async function save(input: InsertableValues<Table> | InsertableValues<Table>[], env?: Record<string, string>): Promise<Simplify<NewTable> | Simplify<NewTable>[]> {
      const inputIsArray = Array.isArray(input)
      input = Array.isArray(input) ? input : [input]

      const fields = self.from(table).$meta.addressableFieldNames
      const result = await self
        .into(table)
        .insertMany(
          input.map(object => {
            if (hasIdColumn && !(object as any).id) {
              Object.assign(object, {
                id: self.newid(),
              })
            }

            return Object.entries(object)
              .filter(([k, v]) => !k.startsWith("_") && v !== undefined && fields.has(k))
              .reduce((o, [k, v]) => { o[k] = v; return o; }, {} as Record<any, any>) as any
          })
        )
        .onConflict(hasIdColumn ? "id" as any : undefined).doMerge()
        .returning("*" as any)
        .execute(env)

      if (!inputIsArray) {
        return (result as any[])[0]
      } else {
        return result as any
      }
    }

    const deleteMany = async (lhs?: AddressableField<Table>, op?: SqlComparisonOperator, rhs?: AddressableField<Table>, env?: Record<string, string>) => {
      // TODO: DataLoader

      return await this
        .delete()
        .from(table)
        .where(lhs, op, rhs)
        .execute(env)
    }

    const deleteManyById = async (ids: (string | number)[], env?: Record<string, string>) => {
      const filter = ids.slice()
      while (filter.length < maxBatchSize) {
        filter.push("")
      }

      return await deleteMany("id" as any, "in", sql.arg(filter), env)
    }

    const deleteOneById = async (id: string | number, env?: Record<string, string>) => {
      return await deleteMany("id" as any, "=", sql.arg(id), env)
    }

    // const _delete = async (objects: Partial<T> | Partial<T>[] | undefined) => {
    //   if (!objects) {
    //     return
    //   }

    //   if (!Array.isArray(objects)) {
    //     objects = [objects]
    //   }

    //   for (const object of objects) {
    //     if (!object.id) {
    //       continue
    //     }

    //     await deleteOneById(object.id as any)
    //   }
    // }

    return {
      count,
      findId,
      findMany: findManyWithDataLoader,
      findManyById,
      findOne: findOneWithDataLoader,
      findOneById,
      exists,
      existsById,
      save,
      deleteMany,
      deleteManyById,
      deleteOneById,
      // delete: _delete,
    }
  }

  private _tableAccessCache = new Map<string, ReturnType<DatabaseAccess["createTableAccess"]>>()

  private of<NewTable>(table: Constructor<NewTable>) {
    const tableAccess = this._tableAccessCache.get(table.name)
    if (tableAccess) {
      return tableAccess as typeof result
    }

    const result = this.createTableAccess(table)
    this._tableAccessCache.set(table.name, result as any)
    return result
  }

  count<NewTable>(table: Constructor<NewTable>) {
    return {
      where: this.of(table).count,
      then<TResult1 = number, TResult2 = never>(onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where()
          .then(onfulfilled, onrejected)
      },
    }
  }

  findId<NewTable>(table: Constructor<NewTable>) {
    return {
      where: this.of(table).findId,
      then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where()
          .then(onfulfilled, onrejected)
      },
    }
  }

  findMany<NewTable>(table: Constructor<NewTable>) {
    return {
      where: this.of(table).findMany,
      byId: this.of(table).findManyById,
      then<TResult1 = NewTable[], TResult2 = never>(onfulfilled?: ((value: NewTable[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where()
          .then(onfulfilled, onrejected)
      },
    }
  }

  findOne<NewTable>(table: Constructor<NewTable>) {
    return {
      where: this.of(table).findOne,
      byId: this.of(table).findOneById,
      then<TResult1 = NewTable | undefined, TResult2 = never>(onfulfilled?: ((value: NewTable | undefined) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where()
          .then(onfulfilled, onrejected)
      },
    }
  }

  exists<NewTable>(table: Constructor<NewTable>) {
    return {
      where: this.of(table).exists,
      byId: this.of(table).existsById,
      then<TResult1 = boolean, TResult2 = never>(onfulfilled?: ((value: boolean) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where()
          .then(onfulfilled, onrejected)
      },
    }
  }

  store<NewTable>(table: Constructor<NewTable>, data: InsertableValues<AliasedTable<NewTable>>, env?: Record<string, string>) {
    return this.of(table).save(data, env)
  }

  deleteMany<NewTable>(table: Constructor<NewTable>, env?: Record<string, string>) {
    const deleteMany = this.of(table).deleteMany
    const deleteManyById = this.of(table).deleteManyById
    return {
      where: ((a0, a1, a2) => deleteMany(a0, a1, a2, env)) as typeof deleteMany,
      byId: ((a0) => deleteManyById(a0, env)) as typeof deleteManyById,
      then<TResult1 = number, TResult2 = never>(onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
        return this.where(undefined, undefined, undefined, env)
          .then(onfulfilled, onrejected)
      },
    }
  }

  deleteOne<NewTable>(table: Constructor<NewTable>, env?: Record<string, string>) {
    const deleteOneById = this.of(table).deleteOneById
    return {
      byId: ((a0) => deleteOneById(a0, env)) as typeof deleteOneById,
    }
  }

  private createN2MAccess<T0 extends { id: any }, T1 extends { id: any }>(table0: Constructor<T0>, table1: Constructor<T1>) {
    // deno-lint-ignore no-this-alias
    const self = this

    const N2M = knownN2MSQLEntities.get(`${table0.name}|${table1.name}`)
    if (!N2M) {
      throw new Error("missing n2m relation")
    }

    const maxBatchSize = 128

    async function findManyWithDataLoader(id0: string | number, id1: null): Promise<T1[]>
    async function findManyWithDataLoader(id0: null, id1: string | number): Promise<T0[]>
    async function findManyWithDataLoader(id0: string | number | null, id1: string | number | null): Promise<T0[] | T1[]> {
      if (id0 === null && id1 === null) {
        return []
      }

      const n2mIdField = id0 === null ? N2M!.ids[1] : N2M!.ids[0]
      const idParam = id0 === null ? id1 : id0
      const selectedTable = id0 === null ? table0 : table1
      const selectedTableN2MId = id0 === null ? N2M!.ids[0] : N2M!.ids[1]

      let record = self._dataloaders.findManyByN2M.get(N2M!.entity.name)
      if (!record) {
        record = new Map()

        self._dataloaders.findManyByN2M.set(N2M!.entity.name, record)
      }

      let dataloader = record.get(selectedTable.name)
      if (!dataloader) {
        const { query } = sql`
SELECT
  src.*,
  ${expr(n2mIdField)}
FROM ${expr(N2M!.entity.name)} n2m
JOIN ${expr(selectedTable.name)} src ON src."id" = ${expr(selectedTableN2MId)}
WHERE ${expr(n2mIdField)} IN ${[...Array(maxBatchSize).keys()]}
        `

        dataloader = new DataLoader(async ids => {
          const filter = ids.slice()
          while (filter.length < maxBatchSize) {
            filter.push("")
          }

          const n2m = await self.read!(query.trim(), filter)

          return ids
            .map(id => {
              return n2m.filter(s => s[n2mIdField] === id)
            })
        }, { maxBatchSize, cache: self._useCache })

        record.set(selectedTable.name, dataloader)
      }

      const result = await dataloader.load(idParam)
      return result as (T0[] | T1[])
    }

    const insert = async (id0: string | number, id1: string | number, env?: Record<string, string>) => {
      return await this
        .into(N2M.entity)
        .insert({
          [N2M!.ids[0]]: id0,
          [N2M!.ids[1]]: id1,
        })
        .onConflict().doNothing()
        .execute(env)
    }

    const insertMany = async (id0: string | number, id1: (string | number)[], env?: Record<string, string>) => {
      return await this
        .into(N2M.entity)
        .insertMany(id1.map(id1 => ({
          [N2M!.ids[0]]: id0,
          [N2M!.ids[1]]: id1,
        })))
        .onConflict().doNothing()
        .execute(env)
    }

    const _delete = async (id0: string | number, id1: string | number, env?: Record<string, string>) => {
      return await this
        .delete()
        .from(N2M.entity)
        .where(N2M!.ids[0], "=", sql.arg(id0))
        .where(N2M!.ids[1], "=", sql.arg(id1))
        .execute(env)
    }

    const deleteMany = async (id0: string | number | null, id1: string | number | null | (string | number)[], env?: Record<string, string>) => {
      if (id0 === null && id1 === null) {
        return 0
      }

      return await this
        .delete()
        .from(N2M.entity)
        .$if(id0 !== null, d => d
          .where(N2M!.ids[0], "in", sql.arg(Array.isArray(id0) ? id0 : [id0]))
        )
        .$if(id1 !== null, d => d
          .where(N2M!.ids[1], "in", sql.arg(Array.isArray(id1) ? id1 : [id1]))
        )
        .execute(env) as number
    }

    const connect = async (o0: T0, o1: T1[] | null | undefined, env?: Record<string, string>) => {
      const ref = await findManyWithDataLoader(o0.id, null)

      const keySet = new Set(o1?.map(o => o.id))
      const refSet = new Set(ref.map(o => o.id))

      const keysToInsert = keySet.difference(refSet)
      const keysToDelete = refSet.difference(keySet)

      if (keysToInsert.size) {
        await insertMany(o0.id, [...keysToInsert], env)
      }
      if (keysToDelete.size) {
        await deleteMany(o0.id, [...keysToDelete], env)
      }
    }

    return {
      // select,
      findMany: findManyWithDataLoader,
      insert,
      insertMany,
      delete: _delete,
      deleteMany,
      connect,
    }
  }

  private _n2mAccessCache = new Map<string, ReturnType<DatabaseAccess["createN2MAccess"]>>()

  n2m<T0 extends { id: any }, T1 extends { id: any }>(table0: Constructor<T0>, table1: Constructor<T1>) {
    const n2mAccess = this._n2mAccessCache.get(`${table0.name}|${table1.name}`)
    if (n2mAccess) {
      return n2mAccess as any as typeof result
    }

    const result = this.createN2MAccess<T0, T1>(table0, table1)
    this._n2mAccessCache.set(`${table0.name}|${table1.name}`, result as any)
    return result
  }

  query<TableConstructors extends Constructor[]>(...tables: TableConstructors) {
    return new ManualQueryBuilder(this.read, this.write).init(...tables)
  }

  sql<V = any>(strings: TemplateStringsArray, ...values: any[]) {
    const expr = _sql<V>(strings, ...values)
    const result = new ExecutableSqlExpr<V>(expr.query, expr.params, expr.alias, this.read, this.write)
    return result
  }
}

class ManualQueryBuilder<Tables = unknown, Selection = unknown> {
  private _expr: SqlExpr[] = []
  private _returning = false

  constructor(
    private _read: QueryExecutor = dummyExecutor,
    private _write: QueryExecutor = dummyExecutor,
  ) {}

  ref<NewTable>(table: Constructor<NewTable>): ManualQueryBuilder<Exclude<Tables, unknown> | AliasedTable<NewTable>>
  ref<NewTable, A extends string>(table: Constructor<NewTable>, alias: A): ManualQueryBuilder<Exclude<Tables, unknown> | AliasedTable<NewTable, A>>
  ref(table: Constructor, alias?: string): ManualQueryBuilder<any> {
    return this as any
  }

  init<TableConstructors extends Constructor[]>(...tables: TableConstructors): ManualQueryBuilder<Exclude<Tables, unknown> | AliasedTable<ConstructorType<TableConstructors[number]>>> {
    return this as any
  }

  as<NewSelection>(): ManualQueryBuilder<Tables, NewSelection> {
    return this as any
  }

  add(factory: SqlExprFactory<Tables>): ManualQueryBuilder<Tables, Selection> {
    this._expr.push(factory(SQLEXPR_FACTORY_HELPER))
    return this
  }

  get query(): string {
    return this._expr
      .map(e => e.query)
      .join(" ")
  }

  get params(): any[] {
    return this._expr
      .map(e => e.params)
      .reduce((r, p) => [...r, ...p], [])
  }

  compile(): [string, any[]] {
    return [this.query, this.params]
  }

  async findMany<R = Selection>(): Promise<R[]> {
    const r = await this._read(this.query, this.params) as any[]
    return r
  }

  async execute<R = (Selection extends object ? Selection[] : number)>(): Promise<R> {
    const q = this.query
    const r = await this._write(q, this.params) as any
    if (q.includes("RETURNING")) {
      return r
    }
    return r[0]?.["changes"] ?? 0
  }
}

export const knownN2MSQLEntities = new Map<`${string}|${string}`, { entity: Constructor, index: 0 | 1, ids: [string, string] }>()

interface FieldMetadata {
  name: string
  pk?: boolean
  ref?: Constructor
}

interface EntityMetadata {
  name: string
  fields: FieldMetadata[]
  fieldNames: string[]
}

const sqlclassMap = new Map<Constructor, EntityMetadata>()

const sqlpropListSymbol = Symbol()
const sqlpropList = (metadata: DecoratorMetadataObject) => {
  return (metadata[sqlpropListSymbol] ??= []) as FieldMetadata[]
}

export const sqlclass = (name?: string) => {
  return (unknown: unknown, context: ClassDecoratorContext) => {
    name ??= context.name

    context.addInitializer(function () {
      sqlclassMap.set(this as any, {
        name: name!,
        fields: sqlpropList(context.metadata),
        fieldNames: sqlpropList(context.metadata).map(f => f.name),
      })
    })
  }
}

export const sqlprop = (options?: { pk?: boolean, ref?: Constructor }) => {
  return (unknown: unknown, context: ClassFieldDecoratorContext) => {
    sqlpropList(context.metadata).push({
      name: String(context.name),
      ...options,
    })
  }
}

export const defineN2MRelation = <T0, T1>(table0: Constructor<T0>, table1: Constructor<T1>) => {
  const id0 = `${table0.name}_id`
  const id1 = `${table1.name}_id`

  const entityName = `N2M_${table0.name}_${table1.name}`
  const entity = new Proxy(class {}, {
    get: (t, p) => p === "name" ? entityName : (t as any)[p],
  })

  knownN2MSQLEntities.set(`${table0.name}|${table1.name}`, { entity, index: 0, ids: [id0, id1] })
  knownN2MSQLEntities.set(`${table1.name}|${table0.name}`, { entity, index: 1, ids: [id1, id0] })

  return entity
}

export const findN2MRelation = <T0, T1>(table0: Constructor<T0>, table1: Constructor<T1>) => {
  const found = knownN2MSQLEntities.get(`${table0.name}|${table1.name}`)
  if (!found) {
    throw new Error(`no N2M relation found for ${table0.name} & ${table1.name}`)
  }

  const result = found
  return result
}
