import type { AnyNode, ProgramNode } from '../types.ts'
import {
  arrayElementTypeNameFromTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromTypeName,
  promiseValueTypeNameFromTypeName,
  setElementTypeNameFromTypeName
} from '../type-names.ts'

export type LowerContext = {
  types: Map<string, AnyNode>
}

export type LowerResolvedType = {
  valueType: string | null
  nullable: boolean
  arrayElementType: string | null
  arrayElementDeclaredType: string | null
  mapKeyType: string | null
  mapValueType: string | null
  promiseValueType?: string | null
  setElementType: string | null
  returnShape?: AnyNode | null
  shape: AnyNode | null
  functionType: AnyNode | null
}

export function createLowerContext(ast: ProgramNode): LowerContext {
  return {
    types: collectTypes(ast)
  }
}

export function resolveDeclaredType(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name == null) {
    return unresolvedType()
  }

  const nullableTypeName = nullableTypeNameFromTypeName(name)

  if (nullableTypeName != null) {
    const inner = resolveDeclaredType(nullableTypeName, context)

    return {
      ...inner,
      nullable: true
    }
  }

  const arrayElementTypeName = arrayElementTypeNameFromTypeName(name)

  if (name === 'array' || arrayElementTypeName != null) {
    const elementType = arrayElementTypeName == null ? null : resolveDeclaredType(arrayElementTypeName, context)

    return {
      ...unresolvedType(),
      valueType: 'array',
      arrayElementType: elementType?.valueType ?? 'unknown',
      arrayElementDeclaredType: arrayElementTypeName ?? null
    }
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)
  const isMalformedMapTypeName = mapTypeNames == null && name.startsWith('map<') && name.endsWith('>')

  if (name === 'map' || mapTypeNames != null || isMalformedMapTypeName) {
    const keyType = mapTypeNames == null ? null : resolveDeclaredType(mapTypeNames.key, context)
    const valueType = mapTypeNames == null ? null : resolveDeclaredType(mapTypeNames.value, context)

    return {
      ...unresolvedType(),
      valueType: 'map',
      mapKeyType: keyType?.valueType ?? 'unknown',
      mapValueType: valueType?.valueType ?? 'unknown'
    }
  }

  const setElementTypeName = setElementTypeNameFromTypeName(name)

  if (name === 'set' || setElementTypeName != null) {
    const elementType = setElementTypeName == null ? null : resolveDeclaredType(setElementTypeName, context)

    return {
      ...unresolvedType(),
      valueType: 'set',
      setElementType: elementType?.valueType ?? 'unknown'
    }
  }

  const promiseValueTypeName = promiseValueTypeNameFromTypeName(name)

  if (name === 'promise' || promiseValueTypeName != null) {
    const valueType = promiseValueTypeName == null ? null : resolveDeclaredType(promiseValueTypeName, context)

    return {
      ...unresolvedType(),
      valueType: 'promise',
      promiseValueType: valueType?.valueType ?? 'unknown'
    }
  }

  if (isBytesTypeName(name)) {
    return {
      ...unresolvedType(),
      valueType: 'bytes'
    }
  }

  if (isBuiltinValueType(name)) {
    return {
      ...unresolvedType(),
      valueType: name
    }
  }

  const type = context.types.get(name)

  if (type?.kind === 'object') {
    return {
      ...unresolvedType(),
      valueType: 'object',
      shape: resolveObjectShape(type, context)
    }
  }

  if (type?.kind === 'function') {
    const returnType = resolveDeclaredType(type.returnType, context)

    return {
      ...unresolvedType(),
      valueType: 'function',
      functionType: {
        ...type,
        params: type.params.map((param) => {
          const declared = resolveDeclaredType(param.valueType, context)

          return {
            ...param,
            valueType: declared.valueType ?? param.valueType,
            nullable: declared.nullable,
            arrayElementType: declared.arrayElementType,
            arrayElementDeclaredType: declared.arrayElementDeclaredType,
            mapKeyType: declared.mapKeyType,
            mapValueType: declared.mapValueType,
            promiseValueType: declared.promiseValueType ?? null,
            setElementType: declared.setElementType,
            shape: declared.shape,
            functionType: declared.functionType
          }
        }),
        returnType: returnType.valueType ?? type.returnType,
        returnNullable: returnType.nullable,
        returnArrayElementType: returnType.arrayElementType,
        returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
        returnMapKeyType: returnType.mapKeyType,
        returnMapValueType: returnType.mapValueType,
        returnPromiseValueType: returnType.promiseValueType ?? null,
        returnSetElementType: returnType.setElementType,
        returnShape: returnType.shape
      }
    }
  }

  return unresolvedType()
}

function resolveObjectShape(shape: AnyNode, context: LowerContext): AnyNode {
  return {
    ...shape,
    fields: shape.fields.map((field) => {
      const declared = resolveDeclaredType(field.valueType, context)

      return {
        ...field,
        declaredType: field.valueType,
        valueType: declared.valueType ?? field.valueType,
        nullable: declared.nullable,
        arrayElementType: declared.arrayElementType,
        arrayElementDeclaredType: declared.arrayElementDeclaredType,
        mapKeyType: declared.mapKeyType,
        mapValueType: declared.mapValueType,
        promiseValueType: declared.promiseValueType ?? null,
        setElementType: declared.setElementType,
        shape: declared.shape,
        functionType: declared.functionType
      }
    })
  }
}

function collectTypes(ast: ProgramNode): Map<string, AnyNode> {
  const types = new Map()

  for (const item of ast.body) {
    if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
      types.set(item.name, {
        kind: 'object',
        fields: item.valueType.fields.map((field) => ({
          name: field.name,
          readonly: field.readonly,
          valueType: field.valueType,
          loc: field.loc
        }))
      })
    } else if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'function') {
      types.set(item.name, {
        kind: 'function',
        params: item.valueType.params.map((param) => ({
          name: param.name,
          valueType: param.valueType,
          loc: param.loc
        })),
        returnType: item.valueType.returnType
      })
    }
  }

  return types
}

function unresolvedType(): LowerResolvedType {
  return {
    valueType: null,
    nullable: false,
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    shape: null,
    functionType: null
  }
}
