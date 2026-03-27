import { DocumentNode, GraphQLInputObjectType, GraphQLInputType, GraphQLList, GraphQLNamedType, GraphQLNonNull, GraphQLSchema, Kind, NamedTypeNode, TypeNode } from "graphql"

const unwrapTypeNodeUntilNamedTypeNode = (type: TypeNode): NamedTypeNode => {
  switch (type.kind) {
  case Kind.NAMED_TYPE:
    return type
  case Kind.LIST_TYPE:
  case Kind.NON_NULL_TYPE:
    return unwrapTypeNodeUntilNamedTypeNode(type.type)
  }
}

const unwrapTypeUntilInputObjectType = (type: GraphQLNamedType | GraphQLInputType | undefined): GraphQLInputObjectType | undefined => {
  if (!type) {
    return undefined
  }

  if (type instanceof GraphQLInputObjectType) {
    return type
  }

  if (type instanceof GraphQLList || type instanceof GraphQLNonNull) {
    return unwrapTypeUntilInputObjectType(type.ofType)
  }

  return undefined
}

const cachedInputTypePruners = new Map<string, (variable: any) => void>()
const getInputTypePruner = (type: GraphQLNamedType | GraphQLInputType | undefined) => {
  type = unwrapTypeUntilInputObjectType(type)
  if (!type) {
    return undefined
  }

  let inputPruner = cachedInputTypePruners.get(type.name)
  if (!inputPruner) {
    const fieldsMap = type.getFields()
    const fieldsArray = Object.values(fieldsMap)

    const pruneOperations = new Map<string, (variable: any) => void>()
    for (const fieldDef of fieldsArray) {
      const op = getInputTypePruner(fieldDef.type)
      if (op) {
        pruneOperations.set(fieldDef.name, op)
      }
    }

    cachedInputTypePruners.set(type.name, inputPruner = values => {
      if (!values) {
        return
      }

      if (!Array.isArray(values)) {
        values = [values]
      }

      for (const value of values) {
        for (const key of Object.keys(value)) {
          if (!fieldsMap[key]) {
            delete value[key]
          }
        }

        for (const [key, op] of pruneOperations) {
          op(value[key])
        }
      }
    })
  }

  return inputPruner
}

export const createGraphQLVariablesPruner = (schema: GraphQLSchema, document: DocumentNode) => {
  const pruneOperations = new Map<string, (variable: any) => void>()

  for (const docDefinition of document.definitions) {
    if (docDefinition.kind !== Kind.OPERATION_DEFINITION) {
      continue
    }

    for (const varDefinition of docDefinition.variableDefinitions ?? []) {
      const varNamedType = unwrapTypeNodeUntilNamedTypeNode(varDefinition.type)
      const varType = schema.getType(varNamedType.name.value)

      const op = getInputTypePruner(varType)
      if (op) {
        pruneOperations.set(varDefinition.variable.name.value, op)
      }
    }
  }

  return (variables: Record<string | symbol, unknown> | null | undefined) => {
    if (!variables) {
      return
    }

    for (const [key, op] of pruneOperations) {
      op(variables[key])
    }
  }
}
