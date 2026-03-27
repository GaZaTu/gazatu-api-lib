import { GraphQLSchema, parse, printSchema } from "graphql"
import { relative } from "node:path"
import { codegen } from "npm:@graphql-codegen/core@^4.0.2"
import * as typescript from "npm:@graphql-codegen/typescript@^4.1.6"
import { appdataDir } from "../appinfo.ts"

export const exportSchema = async (schema: GraphQLSchema) => {
  const schemaAsGQLFile = `${appdataDir}/schema.gql`
  const schemaAsGQL = printSchema(schema)
  await Deno.writeTextFile(schemaAsGQLFile, schemaAsGQL)
  console.log("generated", relative(Deno.cwd(), schemaAsGQLFile))

  const schemaAsTSFile = `${appdataDir}/schema.gql.ts`
  const schemaAsTS = await codegen({
    schema: parse(printSchema(schema)),
    filename: schemaAsTSFile,
    documents: [],
    config: {},
    plugins: [
      {
        typescript: {
          enumsAsTypes: true,
        },
      },
    ],
    pluginMap: {
      typescript,
    },
  })
  await Deno.writeTextFile(schemaAsTSFile, schemaAsTS)
  console.log("generated", relative(Deno.cwd(), schemaAsTSFile))
}
