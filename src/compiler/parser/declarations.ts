import type { AnyNode, Token } from '../types.ts'
import { locFromToken } from './locations.ts'

export function createImportSpecifier(imported: string, local: string, token: Token, isDefault = false): AnyNode {
  return {
    imported,
    local,
    ...(isDefault ? { default: true } : {}),
    loc: locFromToken(token)
  }
}

export function createImportDeclaration(typeOnly: boolean, specifiers: AnyNode[], source: Token): AnyNode {
  return {
    type: 'ImportDeclaration',
    typeOnly,
    specifiers,
    source: source.value,
    loc: locFromToken(source)
  }
}

export function createExportDeclaration(typeOnly: boolean, specifiers: AnyNode[], source: Token): AnyNode {
  return {
    type: 'ExportDeclaration',
    typeOnly,
    specifiers,
    source: source.value,
    loc: locFromToken(source)
  }
}

export function createParam(token: Token, valueType = 'unknown', optional = false): AnyNode {
  return {
    name: token.value,
    optional,
    valueType,
    loc: locFromToken(token)
  }
}

export function createFunctionDeclaration(options: {
  exported: boolean
  async: boolean
  name: Token
  params: AnyNode[]
  returnType: string
  body: AnyNode[]
}): AnyNode {
  return {
    type: 'FunctionDeclaration',
    exported: options.exported,
    async: options.async,
    name: options.name.value,
    loc: locFromToken(options.name),
    params: options.params,
    returnType: options.returnType,
    body: options.body
  }
}

export function createTypeAliasDeclaration(exported: boolean, name: Token, valueType: AnyNode): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported,
    name: name.value,
    loc: locFromToken(name),
    valueType
  }
}

export function createFunctionType(params: AnyNode[], returnType: string): AnyNode {
  return {
    kind: 'function',
    params,
    returnType
  }
}

export function createAliasType(valueType: string): AnyNode {
  return {
    kind: 'alias',
    valueType
  }
}

export function createObjectType(fields: AnyNode[], baseTypes: string[] = [], dynamic = false): AnyNode {
  return {
    kind: 'object',
    baseTypes,
    dynamic,
    fields
  }
}

export function createObjectTypeField(
  name: Token,
  readonly: boolean,
  optional: boolean,
  valueType: string,
  ownership = 'strong',
  weakToken: Token | null = null
): AnyNode {
  return {
    name: name.value,
    optional,
    readonly,
    ownership,
    weakLoc: weakToken == null ? null : locFromToken(weakToken),
    valueType,
    loc: locFromToken(name)
  }
}

export function createClassDeclaration(options: {
  exported: boolean
  name: Token
  extendsName: string | null
  extendsToken: Token | null
  fields: AnyNode[]
  methods: AnyNode[]
}): AnyNode {
  return {
    type: 'ClassDeclaration',
    exported: options.exported,
    name: options.name.value,
    loc: locFromToken(options.name),
    extendsName: options.extendsName,
    extendsLoc: options.extendsToken == null ? null : locFromToken(options.extendsToken),
    fields: options.fields,
    methods: options.methods
  }
}

export function createFieldDefinition(options: {
  name: Token
  staticToken: Token | null
  readonly: boolean
  ownership?: string
  weakToken?: Token | null
  valueType: string
}): AnyNode {
  return {
    type: 'FieldDefinition',
    name: options.name.value,
    static: options.staticToken != null,
    staticLoc: options.staticToken == null ? null : locFromToken(options.staticToken),
    readonly: options.readonly,
    ownership: options.ownership ?? 'strong',
    weakLoc: options.weakToken == null ? null : locFromToken(options.weakToken),
    valueType: options.valueType,
    loc: locFromToken(options.name)
  }
}

export function createMethodDefinition(options: {
  name: Token
  staticToken: Token | null
  params: AnyNode[]
  returnType: string
  body: AnyNode[]
}): AnyNode {
  return {
    type: 'MethodDefinition',
    name: options.name.value,
    static: options.staticToken != null,
    staticLoc: options.staticToken == null ? null : locFromToken(options.staticToken),
    loc: locFromToken(options.name),
    params: options.params,
    returnType: options.returnType,
    body: options.body
  }
}

export function createVariableDeclaration(options: {
  kind: string
  exported: boolean
  name: Token
  declaredType: string | null
  init: AnyNode | null
}): AnyNode {
  return {
    type: 'VariableDeclaration',
    kind: options.kind,
    exported: options.exported,
    name: options.name.value,
    loc: locFromToken(options.name),
    declaredType: options.declaredType,
    init: options.init
  }
}
