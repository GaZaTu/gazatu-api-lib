import { gqlclass } from "../src/graphql/index.ts"
import { GraphQLRouter, listen, LocalSQLite3DatabaseAccess, RunTyped, nullable, buildGraphQLSchema, TypedGraphQLResolverMap, gqlResolver } from "../src/index.ts"
import { sqlclass } from "../src/sql.ts"

type AppContext = {}

type GraphQLResolver = TypedGraphQLResolverMap<AppContext>

@gqlclass()
@sqlclass()
class User {
  @RunTyped.field(String, {
    gql: {},
    sql: {},
  })
  id!: string

  @RunTyped.field(String, {
    gql: {},
    sql: {},
  })
  username!: string

  @RunTyped.field(nullable(String), {
    sql: {},
  })
  password?: string | null

  @RunTyped.field(nullable(String), {
    gql: {},
    sql: {},
  })
  email?: string | null

  @RunTyped.field(Boolean, {
    gql: {},
    sql: {},
  })
  activated!: boolean

  @RunTyped.field(String, {
    gql: {},
    sql: {},
  })
  createdAt!: string

  @RunTyped.field(String, {
    gql: {},
    sql: {},
  })
  updatedAt!: string
}

const database = new LocalSQLite3DatabaseAccess()
await database.initialize()

const UserResolver: GraphQLResolver = {
  Query: {
    user: gqlResolver({
      type: nullable(User),
      args: {
        id: {
          type: String,
        },
      },
      resolve: async (_, { id }) => {
        return await database.findOne(User)
          .byId(id)
      },
    }),
  },
}

const schema = buildGraphQLSchema([
  UserResolver,
])

const graphqlRouter = new GraphQLRouter<AppContext>({
  path: "/graphql",
  schema,
  createContext: request => {
    return {}
  },
  development: true,
})

const server = listen({
  host: "127.0.0.1",
  port: 9098,
  development: true,
}, [
  graphqlRouter,
])
await server.onListen
console.log("started")
