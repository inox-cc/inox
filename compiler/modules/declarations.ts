import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import { tokenize } from '../lexer.ts'
import { parse } from '../parser.ts'
import type { AnyNode, Diagnostic, ProgramNode, Token } from '../types.ts'

export type ModuleDeclarationContractEmitResult = {
  code: string
  diagnostics: Diagnostic[]
}

export type ModuleDeclarationContractParseResult = {
  program: ProgramNode
  diagnostics: Diagnostic[]
}

export function createModuleDeclarationProgram(program: ProgramNode): ProgramNode {
  const body: AnyNode[] = []

  for (const item of program.body) {
    const declaration = createModuleDeclarationNode(item)

    if (declaration !== null) {
      body.push(declaration)
    }
  }

  return {
    type: 'Program',
    body
  }
}

export function emitModuleDeclarationContract(program: ProgramNode): string {
  const result = emitModuleDeclarationContractResult(program)

  throwDiagnostics(result.diagnostics)

  return result.code
}

export function emitModuleDeclarationContractResult(program: ProgramNode): ModuleDeclarationContractEmitResult {
  const diagnostics: Diagnostic[] = []
  const lines: string[] = []

  for (const item of program.body) {
    appendModuleDeclarationContractNode(lines, item, diagnostics)
  }

  return {
    code: joinLines(lines),
    diagnostics
  }
}

export function parseModuleDeclarationContract(source: string, file: string | null = null): ProgramNode {
  const result = parseModuleDeclarationContractResult(source, file)

  throwDiagnostics(result.diagnostics)

  return result.program
}

export function parseModuleDeclarationContractResult(
  source: string,
  file: string | null = null
): ModuleDeclarationContractParseResult {
  try {
    const diagnostics: Diagnostic[] = []
    const normalized = normalizeModuleDeclarationContractSource(source, file, diagnostics)

    if (diagnostics.length > 0) {
      return {
        program: emptyProgram(),
        diagnostics
      }
    }

    const tokens = tokenize(normalized, {
      file: declarationContractFileName(file)
    })
    const program = parse(tokens)

    markModuleDeclarationContractProgram(program)
    validateModuleDeclarationContractProgram(program, diagnostics)

    if (diagnostics.length > 0) {
      return {
        program: emptyProgram(),
        diagnostics
      }
    }

    return {
      program,
      diagnostics
    }
  } catch (error) {
    const diagnostics = diagnosticsFromCompileError(error)

    if (diagnostics !== null) {
      return {
        program: emptyProgram(),
        diagnostics
      }
    }

    throw error
  }
}

function appendModuleDeclarationContractNode(lines: string[], item: AnyNode, diagnostics: Diagnostic[]): void {
  if (item.type === 'ImportDeclaration') {
    appendModuleDeclarationImport(lines, item, diagnostics)
    return
  }

  if (item.type === 'ExportDeclaration') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_REEXPORT',
        'declaration contracts do not support re-export declarations yet',
        item.loc
      )
    )
    return
  }

  if (item.type === 'TypeAliasDeclaration') {
    appendModuleDeclarationTypeAlias(lines, item)
    return
  }

  if (item.type === 'FunctionDeclaration') {
    appendModuleDeclarationFunction(lines, item)
    return
  }

  if (item.type === 'VariableDeclaration') {
    appendModuleDeclarationVariable(lines, item, diagnostics)
    return
  }

  if (item.type === 'ClassDeclaration') {
    appendModuleDeclarationClass(lines, item)
    return
  }

  diagnostics.push(
    diagnostic(
      'INOX_DECLARATION_UNSUPPORTED_NODE',
      `declaration contracts do not support ${stringMetadata(item.type, 'unknown')} nodes`,
      item.loc
    )
  )
}

function appendModuleDeclarationImport(lines: string[], item: AnyNode, diagnostics: Diagnostic[]): void {
  if (item.typeOnly !== true) {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_IMPORT',
        'declaration contracts support only type-only imports',
        item.loc
      )
    )
    return
  }

  lines.push(`${formatImportSpecifiers(item.specifiers)} from ${quoteStringLiteral(item.source)};`)
}

function appendModuleDeclarationTypeAlias(lines: string[], item: AnyNode): void {
  lines.push(`${exportPrefix(item)}type ${item.name} = ${formatTypeAliasInfo(item.valueType)};`)
}

function appendModuleDeclarationFunction(lines: string[], item: AnyNode): void {
  const asyncPrefix = item.async === true ? 'async ' : ''
  const params = formatParamList(item.params)
  const returnType = declarationReturnType(item)

  lines.push(`${exportPrefix(item)}${asyncPrefix}function ${item.name}(${params}): ${returnType};`)
}

function appendModuleDeclarationVariable(lines: string[], item: AnyNode, diagnostics: Diagnostic[]): void {
  const declaredType = declarationValueTypeName(item)

  if (declaredType === null) {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED',
        `exported ${stringMetadata(item.kind, 'const')} ${item.name} needs an explicit type in declaration contracts`,
        item.loc
      )
    )
    return
  }

  lines.push(`${exportPrefix(item)}${stringMetadata(item.kind, 'const')} ${item.name}: ${declaredType};`)
}

function appendModuleDeclarationClass(lines: string[], item: AnyNode): void {
  const extendsClause = classExtendsClause(item)

  lines.push(`${exportPrefix(item)}class ${item.name}${extendsClause} {`)

  appendModuleDeclarationClassFields(lines, item.fields)
  appendModuleDeclarationClassMethods(lines, item.methods)

  lines.push('}')
}

function appendModuleDeclarationClassFields(lines: string[], fields: AnyNode[] | null | undefined): void {
  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    const typeName = declaredTypeName(field) ?? typeNameFromMetadata(field, 'unknown')
    const staticPrefix = field.static === true ? 'static ' : ''
    const readonlyPrefix = field.readonly === true ? 'readonly ' : ''
    const weakPrefix = field.ownership === 'weak' ? 'weak ' : ''
    const optional = field.optional === true ? '?' : ''

    lines.push(`  ${staticPrefix}${weakPrefix}${readonlyPrefix}${field.name}${optional}: ${typeName};`)
  }
}

function appendModuleDeclarationClassMethods(lines: string[], methods: AnyNode[] | null | undefined): void {
  if (methods === null || typeof methods === 'undefined') {
    return
  }

  for (const method of methods) {
    const params = formatParamList(method.params)
    const returnType = declarationReturnType(method)
    const staticPrefix = method.static === true ? 'static ' : ''

    lines.push(`  ${staticPrefix}${method.name}(${params}): ${returnType} {}`)
  }
}

function validateModuleDeclarationContractProgram(program: ProgramNode, diagnostics: Diagnostic[]): void {
  for (const item of program.body) {
    validateModuleDeclarationContractNode(item, diagnostics)
  }
}

function validateModuleDeclarationContractNode(item: AnyNode, diagnostics: Diagnostic[]): void {
  if (item.type === 'ImportDeclaration') {
    if (item.typeOnly !== true) {
      diagnostics.push(
        diagnostic(
          'INOX_DECLARATION_UNSUPPORTED_IMPORT',
          'declaration contracts support only type-only imports',
          item.loc
        )
      )
    }
    return
  }

  if (item.type === 'ExportDeclaration') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_REEXPORT',
        'declaration contracts do not support re-export declarations yet',
        item.loc
      )
    )
    return
  }

  if (item.type === 'VariableDeclaration') {
    if (item.exported === true && declaredTypeName(item) === null) {
      diagnostics.push(
        diagnostic(
          'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED',
          `exported ${stringMetadata(item.kind, 'const')} ${item.name} needs an explicit type in declaration contracts`,
          item.loc
        )
      )
    }
    return
  }

  if (item.type === 'TypeAliasDeclaration' || item.type === 'FunctionDeclaration' || item.type === 'ClassDeclaration') {
    return
  }

  diagnostics.push(
    diagnostic(
      'INOX_DECLARATION_UNSUPPORTED_NODE',
      `declaration contracts do not support ${stringMetadata(item.type, 'unknown')} nodes`,
      item.loc
    )
  )
}

function markModuleDeclarationContractProgram(program: ProgramNode): void {
  for (const item of program.body) {
    markModuleDeclarationContractNode(item)
  }
}

function markModuleDeclarationContractNode(item: AnyNode): void {
  if (item.type === 'FunctionDeclaration') {
    item.declarationOnly = true
    item.body = []
    return
  }

  if (item.type === 'VariableDeclaration') {
    item.declarationOnly = true
    item.init = null
    return
  }

  if (item.type === 'ClassDeclaration') {
    item.declarationOnly = true
    markModuleDeclarationClassMembers(item)
  }
}

function markModuleDeclarationClassMembers(item: AnyNode): void {
  const methods = item.methods

  if (methods === null || typeof methods === 'undefined') {
    return
  }

  for (const method of methods) {
    method.declarationOnly = true
    method.body = []
  }
}

function normalizeModuleDeclarationContractSource(
  source: string,
  file: string | null,
  diagnostics: Diagnostic[]
): string {
  const tokens = tokenize(source, {
    file: declarationContractFileName(file)
  })
  const parts: string[] = []
  let position = 0

  while (!tokenIs(tokens, position, 'eof', '<eof>')) {
    if (isUnsupportedExportStar(tokens, position)) {
      diagnostics.push(
        diagnostic(
          'INOX_DECLARATION_UNSUPPORTED_REEXPORT',
          'declaration contracts do not support export * declarations yet',
          tokenAt(tokens, position)
        )
      )
      position = skipToStatementEnd(tokens, position)
      continue
    }

    if (isUnsupportedNamespace(tokens, position)) {
      diagnostics.push(
        diagnostic(
          'INOX_DECLARATION_UNSUPPORTED_NAMESPACE',
          'declaration contracts do not support namespace declarations',
          tokenAt(tokens, position)
        )
      )
      position = skipToStatementEnd(tokens, position)
      continue
    }

    if (isInterfaceDeclarationStart(tokens, position)) {
      position = appendNormalizedInterfaceDeclaration(parts, tokens, position)
      continue
    }

    if (isFunctionSignatureStart(tokens, position)) {
      position = appendNormalizedFunctionSignature(parts, tokens, position)
      continue
    }

    parts.push(tokenSource(tokenAt(tokens, position)))
    position = position + 1
  }

  return joinParts(parts)
}

function appendNormalizedInterfaceDeclaration(parts: string[], tokens: Token[], position: number): number {
  let current = position
  let exported = false

  if (tokenValue(tokens, current) === 'export') {
    exported = true
    current = current + 1
  }

  current = current + 1

  const name = tokenAt(tokens, current)
  current = current + 1

  if (exported) {
    parts.push('export')
  }

  parts.push('type')
  parts.push(tokenSource(name))
  parts.push('=')

  if (tokenValue(tokens, current) === 'extends') {
    current = current + 1

    while (!tokenIs(tokens, current, 'eof', '<eof>') && tokenValue(tokens, current) !== '{') {
      const token = tokenAt(tokens, current)

      if (token.value === ',') {
        parts.push('&')
      } else {
        parts.push(tokenSource(token))
      }

      current = current + 1
    }

    parts.push('&')
  }

  const close = findBalancedClose(tokens, current, '{', '}')

  while (current <= close && !tokenIs(tokens, current, 'eof', '<eof>')) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push(';')

  if (tokenValue(tokens, current) === ';') {
    current = current + 1
  }

  return current
}

function appendNormalizedFunctionSignature(parts: string[], tokens: Token[], position: number): number {
  const end = findFunctionSignatureEnd(tokens, position)

  if (end === -1) {
    parts.push(tokenSource(tokenAt(tokens, position)))
    return position + 1
  }

  let current = position

  while (current < end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push('{')
  parts.push('}')

  return end + 1
}

function findFunctionSignatureEnd(tokens: Token[], position: number): number {
  let current = position
  let parenDepth = 0
  let genericDepth = 0

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    const value = tokenValue(tokens, current)

    if (value === '(') {
      parenDepth = parenDepth + 1
    } else if (value === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
    } else if (value === '<') {
      genericDepth = genericDepth + 1
    } else if (value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (value === '{' && parenDepth === 0) {
      return -1
    } else if (value === ';' && parenDepth === 0 && genericDepth === 0) {
      return current
    }

    current = current + 1
  }

  return -1
}

function isFunctionSignatureStart(tokens: Token[], position: number): boolean {
  let current = position

  if (tokenValue(tokens, current) === 'export') {
    current = current + 1
  }

  if (tokenValue(tokens, current) === 'async') {
    current = current + 1
  }

  return tokenValue(tokens, current) === 'function'
}

function isInterfaceDeclarationStart(tokens: Token[], position: number): boolean {
  if (tokenValue(tokens, position) === 'interface') {
    return true
  }

  return tokenValue(tokens, position) === 'export' && tokenValue(tokens, position + 1) === 'interface'
}

function isUnsupportedExportStar(tokens: Token[], position: number): boolean {
  return tokenValue(tokens, position) === 'export' && tokenValue(tokens, position + 1) === '*'
}

function isUnsupportedNamespace(tokens: Token[], position: number): boolean {
  if (tokenValue(tokens, position) === 'namespace') {
    return true
  }

  return tokenValue(tokens, position) === 'export' && tokenValue(tokens, position + 1) === 'namespace'
}

function skipToStatementEnd(tokens: Token[], position: number): number {
  let current = position

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    if (tokenValue(tokens, current) === ';') {
      return current + 1
    }

    current = current + 1
  }

  return current
}

function findBalancedClose(tokens: Token[], position: number, open: string, close: string): number {
  let current = position
  let depth = 0

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    const value = tokenValue(tokens, current)

    if (value === open) {
      depth = depth + 1
    } else if (value === close) {
      depth = depth - 1

      if (depth === 0) {
        return current
      }
    }

    current = current + 1
  }

  return current
}

function formatImportSpecifiers(specifiers: AnyNode[]): string {
  const names: string[] = []

  for (const specifier of specifiers) {
    if (specifier.local !== specifier.imported) {
      names.push(`${specifier.imported} as ${specifier.local}`)
    } else {
      names.push(specifier.imported)
    }
  }

  return `import type { ${joinStrings(names, ', ')} }`
}

function formatTypeAliasInfo(info: AnyNode | null | undefined): string {
  if (info === null || typeof info === 'undefined') {
    return 'unknown'
  }

  if (info.kind === 'function') {
    return formatFunctionType(info)
  }

  if (info.kind === 'object') {
    return formatObjectType(info)
  }

  if (info.kind === 'alias') {
    return typeNameOrUnknown(info.valueType)
  }

  return 'unknown'
}

function formatFunctionType(info: AnyNode): string {
  const returnType = typeNameOrUnknown(info.returnType)

  return `(${formatParamList(info.params)}) => ${returnType}`
}

function formatObjectType(info: AnyNode): string {
  const objectBody = formatObjectTypeBody(info)
  const baseTypes = info.baseTypes

  if (baseTypes !== null && typeof baseTypes !== 'undefined' && baseTypes.length > 0) {
    return `${joinStrings(baseTypes, ' & ')} & ${objectBody}`
  }

  return objectBody
}

function formatObjectTypeBody(info: AnyNode): string {
  const lines: string[] = ['{']

  if (info.dynamic === true) {
    const dynamicType = objectFieldTypeName(info.dynamicField)

    lines.push(`  [key: string]: ${dynamicType};`)
  }

  const fields = info.fields

  if (fields !== null && typeof fields !== 'undefined') {
    for (const field of fields) {
      lines.push(`  ${formatObjectTypeField(field)};`)
    }
  }

  lines.push('}')

  return joinStrings(lines, '\n')
}

function formatObjectTypeField(field: AnyNode): string {
  const readonlyPrefix = field.readonly === true ? 'readonly ' : ''
  const weakPrefix = field.ownership === 'weak' ? 'weak ' : ''
  const optional = field.optional === true ? '?' : ''
  const typeName = objectFieldTypeName(field)

  return `${weakPrefix}${readonlyPrefix}${field.name}${optional}: ${typeName}`
}

function objectFieldTypeName(field: AnyNode | null | undefined): string {
  if (field === null || typeof field === 'undefined') {
    return 'unknown'
  }

  if (field.functionType !== null && typeof field.functionType !== 'undefined') {
    return formatFunctionType(field.functionType)
  }

  return declaredTypeName(field) ?? typeNameFromMetadata(field, 'unknown')
}

function formatParamList(params: AnyNode[] | null | undefined): string {
  const names: string[] = []

  if (params === null || typeof params === 'undefined') {
    return ''
  }

  for (const param of params) {
    const optional = param.optional === true ? '?' : ''
    const typeName = declaredTypeName(param) ?? typeNameFromMetadata(param, 'unknown')

    names.push(`${param.name}${optional}: ${typeName}`)
  }

  return joinStrings(names, ', ')
}

function declarationReturnType(item: AnyNode): string {
  const declared = nullableStringMetadata(item.declaredReturnType)

  if (declared !== null) {
    return declared
  }

  return typeNameFromMetadata(
    {
      valueType: item.returnType,
      nullable: item.returnNullable,
      arrayElementDeclaredType: item.returnArrayElementDeclaredType,
      arrayElementType: item.returnArrayElementType,
      mapKeyType: item.returnMapKeyType,
      mapValueType: item.returnMapValueType,
      promiseValueType: item.returnPromiseValueType,
      setElementType: item.returnSetElementType,
      shape: item.returnShape
    },
    'void'
  )
}

function declaredTypeName(item: AnyNode): string | null {
  return nullableStringMetadata(item.declaredType)
}

function declarationValueTypeName(item: AnyNode): string | null {
  const declared = declaredTypeName(item)

  if (declared !== null) {
    return declared
  }

  const valueType = nullableStringMetadata(item.valueType)

  if (valueType === null) {
    return null
  }

  return typeNameFromMetadata(item, 'unknown')
}

function typeNameFromMetadata(item: AnyNode, fallback: string): string {
  const valueType = stringMetadata(item.valueType, fallback)
  let typeName = valueType

  if (valueType === 'array') {
    typeName = `array<${stringMetadata(item.arrayElementDeclaredType, stringMetadata(item.arrayElementType, 'unknown'))}>`
  } else if (valueType === 'map') {
    typeName = `map<${stringMetadata(item.mapKeyType, 'unknown')},${stringMetadata(item.mapValueType, 'unknown')}>`
  } else if (valueType === 'promise') {
    typeName = `promise<${stringMetadata(item.promiseValueType, 'unknown')}>`
  } else if (valueType === 'set') {
    typeName = `set<${stringMetadata(item.setElementType, 'unknown')}>`
  }

  if (item.nullable === true && typeName !== 'null' && !typeName.startsWith('nullable<')) {
    return `nullable<${typeName}>`
  }

  return typeName
}

function classExtendsClause(item: AnyNode): string {
  const extendsName = nullableStringMetadata(item.extendsName)

  if (extendsName === null) {
    return ''
  }

  return ` extends ${extendsName}`
}

function exportPrefix(item: AnyNode): string {
  if (item.exported === true) {
    return 'export '
  }

  return ''
}

function typeNameOrUnknown(value: string | null | undefined): string {
  return stringMetadata(value, 'unknown')
}

function tokenAt(tokens: Token[], position: number): Token {
  if (position < 0 || position >= tokens.length) {
    return tokens[tokens.length - 1]
  }

  return tokens[position]
}

function tokenValue(tokens: Token[], position: number): string {
  return tokenAt(tokens, position).value
}

function tokenIs(tokens: Token[], position: number, tokenType: string, value: string): boolean {
  const token = tokenAt(tokens, position)

  return token.type === tokenType && token.value === value
}

function tokenSource(token: Token): string {
  if (token.type === 'string') {
    return quoteStringLiteral(token.value)
  }

  return token.value
}

function quoteStringLiteral(value: string): string {
  return `'${escapeStringLiteral(value)}'`
}

function escapeStringLiteral(value: string): string {
  let escaped = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const unit = value[index]

    if (unit === '\\') {
      escaped = escaped + '\\\\'
    } else if (unit === "'") {
      escaped = escaped + "\\'"
    } else if (unit === '\n') {
      escaped = escaped + '\\n'
    } else {
      escaped = escaped + unit
    }
  }

  return escaped
}

function declarationContractFileName(file: string | null): string {
  if (file !== null && typeof file !== 'undefined') {
    return file
  }

  return ''
}

function diagnosticsFromCompileError(error: any): Diagnostic[] | null {
  if (
    error !== null &&
    typeof error !== 'undefined' &&
    error.diagnostics !== null &&
    typeof error.diagnostics !== 'undefined'
  ) {
    return error.diagnostics
  }

  return null
}

function emptyProgram(): ProgramNode {
  return {
    type: 'Program',
    body: []
  }
}

function joinLines(lines: string[]): string {
  if (lines.length === 0) {
    return ''
  }

  return `${joinStrings(lines, '\n')}\n`
}

function joinParts(parts: string[]): string {
  return joinStrings(parts, ' ')
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function createModuleDeclarationNode(item: AnyNode): AnyNode | null {
  if (item.type === 'TypeAliasDeclaration') {
    return item
  }

  if (item.type === 'FunctionDeclaration' && item.exported === true) {
    return cloneFunctionDeclaration(item)
  }

  if (item.type === 'VariableDeclaration' && item.exported === true) {
    return cloneVariableDeclaration(item)
  }

  if (item.type === 'ClassDeclaration' && item.exported === true) {
    return cloneClassDeclaration(item)
  }

  return null
}

function cloneFunctionDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'FunctionDeclaration',
    exported: true,
    declarationOnly: true,
    async: item.async === true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    params: cloneParams(item.params),
    declaredReturnType: nullableMetadata(item.declaredReturnType),
    returnType: stringMetadata(item.returnType, 'void'),
    returnNullable: item.returnNullable === true,
    returnArrayElementType: nullableMetadata(item.returnArrayElementType),
    returnArrayElementDeclaredType: nullableMetadata(item.returnArrayElementDeclaredType),
    returnMapKeyType: nullableMetadata(item.returnMapKeyType),
    returnMapValueType: nullableMetadata(item.returnMapValueType),
    returnPromiseValueType: nullableMetadata(item.returnPromiseValueType),
    returnSetElementType: nullableMetadata(item.returnSetElementType),
    returnShape: nullableMetadata(item.returnShape),
    body: []
  }
}

function cloneVariableDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'VariableDeclaration',
    kind: stringMetadata(item.kind, 'const'),
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    declaredType: nullableMetadata(item.declaredType),
    valueType: stringMetadata(item.valueType, 'unknown'),
    nullable: item.nullable === true,
    shape: nullableMetadata(item.shape),
    functionType: nullableMetadata(item.functionType),
    arrayElementType: nullableMetadata(item.arrayElementType),
    arrayElementDeclaredType: nullableMetadata(item.arrayElementDeclaredType),
    mapKeyType: nullableMetadata(item.mapKeyType),
    mapValueType: nullableMetadata(item.mapValueType),
    mapValueShape: nullableMetadata(item.mapValueShape),
    promiseValueType: nullableMetadata(item.promiseValueType),
    setElementType: nullableMetadata(item.setElementType),
    init: null
  }
}

function cloneClassDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'ClassDeclaration',
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    extendsName: nullableMetadata(item.extendsName),
    extendsLoc: nullableMetadata(item.extendsLoc),
    shape: nullableMetadata(item.shape),
    fields: cloneClassFields(item.fields),
    methods: cloneClassMethods(item.methods)
  }
}

function cloneClassFields(fields: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (fields === null || typeof fields === 'undefined') {
    return cloned
  }

  for (const field of fields) {
    cloned.push({
      type: 'FieldDefinition',
      name: field.name,
      static: field.static === true,
      staticLoc: nullableMetadata(field.staticLoc),
      readonly: field.readonly === true,
      ownership: nullableMetadata(field.ownership),
      weakLoc: nullableMetadata(field.weakLoc),
      loc: nullableMetadata(field.loc),
      declaredType: nullableMetadata(field.declaredType),
      optional: field.optional === true,
      valueType: stringMetadata(field.valueType, 'unknown'),
      nullable: field.nullable === true,
      arrayElementType: nullableMetadata(field.arrayElementType),
      arrayElementDeclaredType: nullableMetadata(field.arrayElementDeclaredType),
      mapKeyType: nullableMetadata(field.mapKeyType),
      mapValueType: nullableMetadata(field.mapValueType),
      promiseValueType: nullableMetadata(field.promiseValueType),
      setElementType: nullableMetadata(field.setElementType),
      shape: nullableMetadata(field.shape),
      functionType: nullableMetadata(field.functionType),
      className: nullableMetadata(field.className)
    })
  }

  return cloned
}

function cloneClassMethods(methods: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (methods === null || typeof methods === 'undefined') {
    return cloned
  }

  for (const method of methods) {
    cloned.push({
      type: 'MethodDefinition',
      name: method.name,
      static: method.static === true,
      staticLoc: nullableMetadata(method.staticLoc),
      loc: nullableMetadata(method.loc),
      params: cloneParams(method.params),
      declaredReturnType: nullableMetadata(method.declaredReturnType),
      returnType: stringMetadata(method.returnType, 'void'),
      returnNullable: method.returnNullable === true,
      returnArrayElementType: nullableMetadata(method.returnArrayElementType),
      returnArrayElementDeclaredType: nullableMetadata(method.returnArrayElementDeclaredType),
      returnMapKeyType: nullableMetadata(method.returnMapKeyType),
      returnMapValueType: nullableMetadata(method.returnMapValueType),
      returnPromiseValueType: nullableMetadata(method.returnPromiseValueType),
      returnSetElementType: nullableMetadata(method.returnSetElementType),
      body: []
    })
  }

  return cloned
}

function cloneParams(params: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (params === null || typeof params === 'undefined') {
    return cloned
  }

  for (const param of params) {
    cloned.push({
      name: param.name,
      optional: param.optional === true,
      valueType: stringMetadata(param.valueType, 'unknown'),
      loc: nullableMetadata(param.loc),
      declaredType: nullableMetadata(param.declaredType),
      nullable: param.nullable === true,
      arrayElementType: nullableMetadata(param.arrayElementType),
      arrayElementDeclaredType: nullableMetadata(param.arrayElementDeclaredType),
      mapKeyType: nullableMetadata(param.mapKeyType),
      mapValueType: nullableMetadata(param.mapValueType),
      promiseValueType: nullableMetadata(param.promiseValueType),
      setElementType: nullableMetadata(param.setElementType),
      shape: nullableMetadata(param.shape),
      functionType: nullableMetadata(param.functionType),
      className: nullableMetadata(param.className)
    })
  }

  return cloned
}

function stringMetadata(value: string | null | undefined, fallback: string): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return fallback
}

function nullableStringMetadata(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined' && value.length > 0) {
    return value
  }

  return null
}

function nullableMetadata(value: any): any {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}
