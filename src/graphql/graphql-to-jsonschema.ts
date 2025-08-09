import { DocumentNode, FieldNode, GraphQLScalarType, GraphQLSchema, InputObjectTypeDefinitionNode, InterfaceTypeDefinitionNode, Kind, ListTypeNode, NamedTypeNode, NonNullTypeNode, ObjectTypeDefinitionNode, SelectionSetNode, TypeNode } from "graphql"
import type { JSONSchema7 } from "npm:@types/json-schema"

const convertObjectType = (schema: GraphQLSchema, typeNode: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode | InputObjectTypeDefinitionNode, node: SelectionSetNode, result: JSONSchema7) => {
  result.type = ["null", "object"]
  result.properties = {}

  const typeFields = typeNode.fields!

  for (const selection of node.selections) {
    if (selection.kind !== Kind.FIELD) {
      continue
    }

    const field = typeFields.find(f => f.name.value === selection.name.value)
    if (!field) {
      continue
    }

    const properties = (result.properties[field.name.value] = {} as JSONSchema7)
    convertOutputType(schema, field.type, selection, properties)
  }
}

const convertNamedType = (schema: GraphQLSchema, typeNode: NamedTypeNode, node: FieldNode, result: JSONSchema7) => {
  const type = schema.getType(typeNode.name.value)
  if (!type) {
    return
  }

  if (type instanceof GraphQLScalarType) {
    switch (type.name) {
    case "Int":
    case "Float":
      result.type = ["null", "number"]
      break
    case "Boolean":
      result.type = ["null", "boolean"]
      break
    default:
      result.type = ["null", "string"]
      break
    }
    return
  }

  switch (type.astNode?.kind) {
  case Kind.OBJECT_TYPE_DEFINITION:
    convertObjectType(schema, type.astNode, node.selectionSet!, result)
    break
  case Kind.INTERFACE_TYPE_DEFINITION:
    convertObjectType(schema, type.astNode, node.selectionSet!, result)
    break
  case Kind.UNION_TYPE_DEFINITION:
    result.anyOf = type.astNode.types!.map(typeOption => {
      const properties = {} as JSONSchema7
      convertNamedType(schema, typeOption, node, properties)
      return properties
    })
    break
  case Kind.ENUM_TYPE_DEFINITION:
    result.enum = type.astNode.values!.map(n => n.name.value)
    break
  }
}

const convertListType = (schema: GraphQLSchema, typeNode: ListTypeNode, node: FieldNode, result: JSONSchema7) => {
  result.type = ["null", "array"]
  result.items = {}

  convertOutputType(schema, typeNode.type, node, result.items)
}

const convertNonNullType = (schema: GraphQLSchema, typeNode: NonNullTypeNode, node: FieldNode, result: JSONSchema7) => {
  convertOutputType(schema, typeNode.type, node, result)

  if (Array.isArray(result.type)) {
    result.type = result.type.filter(t => t !== "null")
    if (result.type.length === 1) {
      result.type = result.type[0]
    }
  }
}

const convertOutputType = (schema: GraphQLSchema, typeNode: TypeNode, node: FieldNode, result: JSONSchema7) => {
  switch (typeNode.kind) {
  case Kind.NAMED_TYPE:
    convertNamedType(schema, typeNode, node, result)
    break
  case Kind.LIST_TYPE:
    convertListType(schema, typeNode, node, result)
    break
  case Kind.NON_NULL_TYPE:
    convertNonNullType(schema, typeNode, node, result)
    break
  }
}

export const createJSONSchema7FromGraphQLDocumentNode = (schema: GraphQLSchema, document: DocumentNode): JSONSchema7 => {
  const result = {
    $schema: "http://json-schema.org/draft-07/schema#",
    properties: {
      data: {},
      errors: {
        type: ["null", "object"],
        properties: {
          message: { type: "string" },
          stack: { type: "string" },
          path: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      extensions: {
        type: ["null", "object"],
        properties: {},
        additionalProperties: { type: "string" },
      },
    },
  } satisfies JSONSchema7

  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      convertObjectType(schema, schema.getRootType(definition.operation)!.astNode!, definition.selectionSet, result.properties["data"])
    }
  }

  return result
}
