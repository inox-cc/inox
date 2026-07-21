import type { AnyNode, SourceLocation, Token } from '../types.ts'
import { locFromToken } from './locations.ts'

type FunctionDeclarationOptions = {
  exported: boolean
  isAsync: boolean
  name: Token
  typeParameters: AnyNode[]
  params: AnyNode[]
  declaredReturnType: string | null
  returnType: string
  returnShape: AnyNode | null
  body: AnyNode[]
}

type ClassDeclarationOptions = {
  exported: boolean
  name: Token
  typeParameters: AnyNode[]
  extendsName: string | null
  extendsToken: Token | null
  fields: AnyNode[]
  indexSignatures: AnyNode[]
  methods: AnyNode[]
}

type FieldDefinitionOptions = {
  name: Token
  staticToken: Token | null
  readOnly: boolean
  ownership: string
  valueType: string
}

type MethodDefinitionOptions = {
  name: Token
  staticToken: Token | null
  typeParameters: AnyNode[]
  params: AnyNode[]
  declaredReturnType: string | null
  returnType: string
  body: AnyNode[]
}

type VariableDeclarationOptions = {
  kind: string
  exported: boolean
  name: Token
  declaredType: string | null
  init: AnyNode | null
}

function nullableTokenLocation(token: Token | null): SourceLocation | null {
  if (token === null || typeof token === 'undefined') {
    return null
  }

  return locFromToken(token)
}

export function createImportSpecifier(imported: string, local: string, token: Token, isDefault: boolean): AnyNode {
  const specifier: AnyNode = {
    imported,
    local,
    loc: locFromToken(token)
  }

  if (isDefault) {
    specifier.default = true
  }

  return specifier
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

export function createParam(
  token: Token,
  valueType: string,
  optional: boolean,
  defaultValue: AnyNode | null = null,
  rest: boolean = false
): AnyNode {
  return {
    name: token.value,
    optional,
    rest: rest === true,
    valueType,
    declaredType: null,
    typeRef: null,
    nullable: false,
    asyncResultValueType: null,
    asyncResultRejectionIntrinsicRole: null,
    functionType: null,
    shape: null,
    className: null,
    libraryIntrinsicRole: null,
    defaultValue,
    bindingElements: null,
    loc: locFromToken(token)
  }
}

export function createFunctionDeclaration(options: FunctionDeclarationOptions): AnyNode {
  return {
    type: 'FunctionDeclaration',
    exported: options.exported,
    async: options.isAsync,
    name: options.name.value,
    loc: locFromToken(options.name),
    typeParameters: options.typeParameters,
    params: options.params,
    declaredReturnType: options.declaredReturnType,
    returnType: options.returnType,
    returnTypeRef: null,
    returnNullable: false,
    returnAsyncResultValueType: null,
    returnShape: options.returnShape,
    body: options.body
  }
}

export function createTypeParameter(name: Token, constraint: string | null): AnyNode {
  return {
    name: name.value,
    constraint,
    loc: locFromToken(name)
  }
}

export function createTypeAliasDeclaration(
  exported: boolean,
  name: Token,
  typeParameters: AnyNode[],
  valueType: AnyNode
): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported,
    name: name.value,
    loc: locFromToken(name),
    typeParameters,
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

export function createObjectType(
  fields: AnyNode[],
  baseTypes: string[],
  dynamic: boolean,
  dynamicField: AnyNode | null = null
): AnyNode {
  return {
    kind: 'object',
    baseTypes,
    dynamic,
    dynamicField,
    fields
  }
}

export function createObjectTypeField(
  name: Token,
  readOnly: boolean,
  optional: boolean,
  valueType: string,
  ownership: string
): AnyNode {
  return {
    name: name.value,
    optional,
    readonly: readOnly,
    ownership,
    weakLoc: null,
    valueType,
    loc: locFromToken(name)
  }
}

export function createClassDeclaration(options: ClassDeclarationOptions): AnyNode {
  return {
    type: 'ClassDeclaration',
    exported: options.exported,
    name: options.name.value,
    loc: locFromToken(options.name),
    typeParameters: options.typeParameters,
    extendsName: options.extendsName,
    extendsLoc: nullableTokenLocation(options.extendsToken),
    fields: options.fields,
    indexSignatures: options.indexSignatures,
    methods: options.methods
  }
}

export function createFieldDefinition(options: FieldDefinitionOptions): AnyNode {
  return {
    type: 'FieldDefinition',
    name: options.name.value,
    static: options.staticToken !== null && typeof options.staticToken !== 'undefined',
    staticLoc: nullableTokenLocation(options.staticToken),
    readonly: options.readOnly,
    ownership: options.ownership,
    weakLoc: null,
    valueType: options.valueType,
    loc: locFromToken(options.name)
  }
}

export function createMethodDefinition(options: MethodDefinitionOptions): AnyNode {
  return {
    type: 'MethodDefinition',
    name: options.name.value,
    static: options.staticToken !== null && typeof options.staticToken !== 'undefined',
    staticLoc: nullableTokenLocation(options.staticToken),
    loc: locFromToken(options.name),
    typeParameters: options.typeParameters,
    params: options.params,
    declaredReturnType: options.declaredReturnType,
    returnType: options.returnType,
    body: options.body
  }
}

export function createVariableDeclaration(options: VariableDeclarationOptions): AnyNode {
  return {
    type: 'VariableDeclaration',
    kind: options.kind,
    exported: options.exported,
    name: options.name.value,
    loc: locFromToken(options.name),
    declaredType: options.declaredType,
    inferredDeclaredType: null,
    init: options.init,
    valueType: 'unknown',
    nullable: false,
    asyncResultValueType: null,
    asyncResultRejectionIntrinsicRole: null,
    functionType: null,
    shape: null,
    className: null,
    libraryIntrinsicRole: null,
    typeRef: null
  }
}
