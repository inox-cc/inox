import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import { tokenize } from '../lexer.ts'
import { parse } from '../parser.ts'
import { readTypeAnnotation } from '../parser/type-annotations.ts'
import { isWeakTypeName } from '../type-names.ts'
import type { AnyNode, Diagnostic, ProgramNode, Token, ValueType } from '../types.ts'

export type ModuleDeclarationContractEmitResult = {
  code: string
  diagnostics: Diagnostic[]
}

export type ModuleDeclarationContractParseResult = {
  program: ProgramNode
  diagnostics: Diagnostic[]
}

type DeclarationContractDefaultExport = {
  syntheticName: string
}

type DeclarationContractNormalizeResult = {
  source: string
  defaultExports: DeclarationContractDefaultExport[]
}

type AmbientNamespaceNode = {
  name: string
  typeName: string
  methods: string[][]
  namespaceIndexes: number[]
}

type AmbientNamespaceParseResult = {
  nodeIndex: number
  position: number
}

type FunctionSignatureBoundary = {
  end: number
  position: number
}

type AmbientNamespaceNormalizeState = {
  nextId: number
  nodes: AmbientNamespaceNode[]
}

type DeclareConstDeclaration = {
  name: string
  valueType: string
  position: number
}

type DeclarationValueMetadata = {
  valueType: ValueType | null
  declaredType: string | null
}

export function findModuleDeclarationExport(program: ProgramNode, name: string): AnyNode | null {
  for (const item of program.body) {
    if (item.exported === true && item.name === name) {
      return item
    }
  }

  return null
}

export function moduleDeclarationExportValueType(program: ProgramNode, name: string): ValueType | null {
  const declaration = findModuleDeclarationExport(program, name)

  if (declaration === null || typeof declaration === 'undefined') {
    return null
  }

  return moduleDeclarationNodeValueType(declaration)
}

export function moduleDeclarationNodeValueType(declaration: AnyNode): ValueType | null {
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
    return 'function'
  }

  if (declaration.type !== 'VariableDeclaration') {
    return null
  }

  const valueType = declaration.valueType

  if (typeof valueType === 'string' && valueType !== '' && valueType !== 'unknown') {
    return valueType.slice(0)
  }

  const declaredType = declaration.declaredType

  if (typeof declaredType !== 'string' || declaredType === '') {
    return typeof valueType === 'string' && valueType !== '' ? valueType.slice(0) : 'unknown'
  }

  return moduleDeclarationTypeNameValueType(declaredType.slice(0))
}

function moduleDeclarationTypeNameValueType(typeName: string): ValueType {
  if (
    typeName === 'boolean' ||
    typeName === 'function' ||
    typeName === 'number' ||
    typeName === 'string' ||
    typeName === 'unknown' ||
    typeName === 'void'
  ) {
    return typeName
  }

  if (typeName.startsWith('array<') || typeName.endsWith('[]')) {
    return 'object'
  }

  return 'object'
}

export function createModuleDeclarationProgram(program: ProgramNode): ProgramNode {
  const body: AnyNode[] = []
  const promotedTypeImportNames = collectPromotedTypeImportNames(program)

  for (const item of program.body) {
    if (item.type === 'ImportDeclaration' && importDeclarationHasTypeOnlySpecifiers(item)) {
      const declaration = createModuleDeclarationImportNode(item, promotedTypeImportNames)

      if (declaration !== null) {
        body.push(declaration)
      }
      continue
    }

    if (
      item.type === 'TypeAliasDeclaration' &&
      item.syntheticTypeImport === true &&
      item.syntheticTypeImportSourceTypeOnly === true
    ) {
      continue
    }

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

function collectPromotedTypeImportNames(program: ProgramNode): Set<string> {
  const names: Set<string> = new Set()

  for (const item of program.body) {
    if (
      item.type === 'TypeAliasDeclaration' &&
      item.syntheticTypeImport === true &&
      item.exported === true &&
      item.syntheticTypeImportSourceTypeOnly !== true
    ) {
      names.add(item.name)
    }
  }

  return names
}

function createModuleDeclarationImportNode(item: AnyNode, omittedNames: Set<string>): AnyNode | null {
  const specifiers: AnyNode[] = []

  for (const specifier of item.specifiers) {
    if (item.typeOnly !== true && specifier.typeOnly !== true) {
      continue
    }

    if (omittedNames.has(specifier.local)) {
      continue
    }

    specifiers.push(specifier)
  }

  if (specifiers.length === 0) {
    return null
  }

  return {
    type: 'ImportDeclaration',
    typeOnly: true,
    specifiers,
    source: item.source,
    loc: item.loc
  }
}

function importDeclarationHasTypeOnlySpecifiers(item: AnyNode): boolean {
  if (item.typeOnly === true) {
    return true
  }

  for (const specifier of item.specifiers) {
    if (specifier.typeOnly === true) {
      return true
    }
  }

  return false
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

    const tokens = tokenize(normalized.source, {
      file: declarationContractFileName(file)
    })
    const program = parse(tokens)

    renameModuleDeclarationDefaultExports(program, normalized.defaultExports)
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

export function parseGlobalDeclarationContract(source: string, file: string | null = null): ProgramNode {
  const result = parseGlobalDeclarationContractResult(source, file)

  throwDiagnostics(result.diagnostics)

  return result.program
}

export function parseGlobalDeclarationContractResult(
  source: string,
  file: string | null = null
): ModuleDeclarationContractParseResult {
  try {
    const diagnostics: Diagnostic[] = []
    const normalized = normalizeGlobalDeclarationContractSource(source, file, diagnostics)

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
    validateGlobalDeclarationContractProgram(program, diagnostics)

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

export function parseModuleGlobalDeclarationContractResult(
  source: string,
  file: string | null = null
): ModuleDeclarationContractParseResult {
  try {
    const diagnostics: Diagnostic[] = []
    const globalSource = extractModuleGlobalDeclarationContractSource(source, file, diagnostics)

    if (diagnostics.length > 0 || globalSource === null) {
      return {
        program: emptyProgram(),
        diagnostics
      }
    }

    return parseGlobalDeclarationContractResult(globalSource, file)
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
  const typeParameters = formatTypeParameterList(item.typeParameters)

  lines.push(`${exportPrefix(item)}type ${item.name}${typeParameters} = ${formatTypeAliasInfo(item.valueType)};`)
}

function appendModuleDeclarationFunction(lines: string[], item: AnyNode): void {
  const asyncPrefix = item.async === true ? 'async ' : ''
  const typeParameters = formatTypeParameterList(item.typeParameters)
  const params = formatParamList(item.params)
  const returnType = declarationReturnType(item)

  lines.push(`${exportPrefix(item)}${asyncPrefix}function ${item.name}${typeParameters}(${params}): ${returnType};`)
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
  const typeParameters = formatTypeParameterList(item.typeParameters)
  const extendsClause = classExtendsClause(item)

  lines.push(`${exportPrefix(item)}class ${item.name}${typeParameters}${extendsClause} {`)

  appendModuleDeclarationClassFields(lines, item.fields)
  appendModuleDeclarationClassIndexSignatures(lines, item.indexSignatures)
  appendModuleDeclarationClassMethods(lines, item.methods)

  lines.push('}')
}

function appendModuleDeclarationClassIndexSignatures(lines: string[], signatures: AnyNode[] | null | undefined): void {
  if (signatures === null || typeof signatures === 'undefined') {
    return
  }

  for (const signature of signatures) {
    const readonlyPrefix = signature.readonly === true ? 'readonly ' : ''
    const name = stringMetadata(signature.name, 'index')
    const keyType = stringMetadata(signature.keyType, 'unknown')
    const valueType = stringMetadata(signature.valueType, 'unknown')

    lines.push(`  ${readonlyPrefix}[${name}: ${keyType}]: ${valueType};`)
  }
}

function appendModuleDeclarationClassFields(lines: string[], fields: AnyNode[] | null | undefined): void {
  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    const typeName = ownershipTypeName(field, declaredTypeName(field) ?? typeNameFromMetadata(field, 'unknown'))
    const staticPrefix = field.static === true ? 'static ' : ''
    const readonlyPrefix = field.readonly === true ? 'readonly ' : ''
    const optional = field.optional === true ? '?' : ''

    lines.push(`  ${staticPrefix}${readonlyPrefix}${field.name}${optional}: ${typeName};`)
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

function validateGlobalDeclarationContractProgram(program: ProgramNode, diagnostics: Diagnostic[]): void {
  for (const item of program.body) {
    if (item.type === 'VariableDeclaration') {
      if (declaredTypeName(item) === null) {
        diagnostics.push(
          diagnostic(
            'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED',
            `ambient ${stringMetadata(item.kind, 'const')} ${item.name} needs an explicit type in declaration contracts`,
            item.loc
          )
        )
      }
      continue
    }

    if (
      item.type === 'TypeAliasDeclaration' ||
      item.type === 'FunctionDeclaration' ||
      item.type === 'ClassDeclaration'
    ) {
      continue
    }

    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NODE',
        `global declaration contracts do not support ${stringMetadata(item.type, 'unknown')} nodes`,
        item.loc
      )
    )
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
): DeclarationContractNormalizeResult {
  const tokens = tokenize(source, {
    file: declarationContractFileName(file)
  })
  const parts: string[] = []
  const declareConstTypes: Map<string, string> = new Map()
  const defaultExports: DeclarationContractDefaultExport[] = []
  let position = 0

  while (!tokenIs(tokens, position, 'eof', '<eof>')) {
    if (isDeclareGlobalStart(tokens, position)) {
      const close = findBalancedClose(tokens, position + 2, '{', '}')

      if (tokenValue(tokens, close) !== '}') {
        diagnostics.push(
          diagnostic(
            'INOX_DECLARATION_GLOBAL_BLOCK',
            'module declaration contract has an unclosed declare global block',
            tokenAt(tokens, position)
          )
        )
        return {
          source: '',
          defaultExports
        }
      }

      position = close + 1

      if (tokenValue(tokens, position) === ';') {
        position = position + 1
      }
      continue
    }

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

    if (isDeclareConstDeclarationStart(tokens, position)) {
      const declaration = readDeclareConstDeclaration(tokens, position)

      if (declaration !== null) {
        declareConstTypes.set(declaration.name, declaration.valueType)
        position = declaration.position
        continue
      }
    }

    if (isVariableSignatureStart(tokens, position)) {
      position = appendNormalizedVariableSignature(parts, tokens, position)
      continue
    }

    if (isDefaultExportDeclarationStart(tokens, position)) {
      position = appendNormalizedDefaultExport(parts, defaultExports, declareConstTypes, tokens, position)
      continue
    }

    if (isClassDeclarationStart(tokens, position)) {
      position = appendNormalizedClassDeclaration(parts, tokens, position)
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

  return {
    source: joinParts(parts),
    defaultExports
  }
}

function extractModuleGlobalDeclarationContractSource(
  source: string,
  file: string | null,
  diagnostics: Diagnostic[]
): string | null {
  const tokens = tokenize(source, {
    file: declarationContractFileName(file)
  })
  const bodyParts: string[] = []
  let foundGlobalBlock = false
  let position = 0

  while (!tokenIs(tokens, position, 'eof', '<eof>')) {
    if (!isDeclareGlobalStart(tokens, position)) {
      position = position + 1
      continue
    }

    const open = position + 2
    const close = findBalancedClose(tokens, open, '{', '}')

    if (tokenValue(tokens, close) !== '}') {
      diagnostics.push(
        diagnostic(
          'INOX_DECLARATION_GLOBAL_BLOCK',
          'module declaration contract has an unclosed declare global block',
          tokenAt(tokens, position)
        )
      )
      return null
    }

    foundGlobalBlock = true
    let previousLine = tokenAt(tokens, open).line

    for (let index = open + 1; index < close; index = index + 1) {
      const token = tokenAt(tokens, index)

      if (token.line > previousLine) {
        bodyParts.push('\n')
      }

      bodyParts.push(tokenSource(token))
      previousLine = token.line
    }

    bodyParts.push('\n')
    position = close + 1
  }

  if (!foundGlobalBlock) {
    return null
  }

  return `export {}\ndeclare global {\n${joinParts(bodyParts)}\n}\n`
}

function normalizeGlobalDeclarationContractSource(
  source: string,
  file: string | null,
  diagnostics: Diagnostic[]
): string {
  const tokens = tokenize(source, {
    file: declarationContractFileName(file)
  })
  const parts: string[] = []
  let foundGlobalBlock = false
  let position = 0

  while (!tokenIs(tokens, position, 'eof', '<eof>')) {
    if (isEmptyExportMarker(tokens, position)) {
      position = position + 3

      if (tokenValue(tokens, position) === ';') {
        position = position + 1
      }
      continue
    }

    if (isDeclareGlobalStart(tokens, position)) {
      const open = position + 2
      const close = findBalancedClose(tokens, open, '{', '}')

      if (tokenValue(tokens, close) !== '}') {
        diagnostics.push(
          diagnostic(
            'INOX_DECLARATION_GLOBAL_BLOCK',
            'global declaration contract has an unclosed declare global block',
            tokenAt(tokens, position)
          )
        )
        return ''
      }

      if (foundGlobalBlock) {
        diagnostics.push(
          diagnostic(
            'INOX_DECLARATION_GLOBAL_BLOCK',
            'global declaration contract must contain exactly one declare global block',
            tokenAt(tokens, position)
          )
        )
        return ''
      }

      foundGlobalBlock = true
      const bodyParts: string[] = []
      let previousLine = tokenAt(tokens, open).line

      for (let index = open + 1; index < close; index = index + 1) {
        const token = tokenAt(tokens, index)

        if (token.line > previousLine) {
          bodyParts.push('\n')
        }

        bodyParts.push(tokenSource(token))
        previousLine = token.line
      }

      const normalized = normalizeGlobalDeclarationBlockSource(joinParts(bodyParts), file, diagnostics)

      parts.push(normalized.source)
      position = close + 1

      if (tokenValue(tokens, position) === ';') {
        position = position + 1
      }
      continue
    }

    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_GLOBAL_WRAPPER',
        'global declaration contracts support only export {} and declare global declarations',
        tokenAt(tokens, position)
      )
    )
    return ''
  }

  if (!foundGlobalBlock) {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_GLOBAL_WRAPPER',
        'global declaration contract requires a declare global block',
        tokenAt(tokens, 0)
      )
    )
    return ''
  }

  return joinParts(parts)
}

function normalizeGlobalDeclarationBlockSource(
  source: string,
  file: string | null,
  diagnostics: Diagnostic[]
): DeclarationContractNormalizeResult {
  const tokens = tokenize(source, {
    file: declarationContractFileName(file)
  })
  const parts: string[] = []
  const namespaceIndexes: number[] = []
  const state: AmbientNamespaceNormalizeState = { nextId: 0, nodes: [] }
  let position = 0
  let previousLine = tokenAt(tokens, 0).line

  while (!tokenIs(tokens, position, 'eof', '<eof>')) {
    const parsed = readAmbientNamespaceDeclaration(tokens, position, state, diagnostics)

    if (parsed !== null) {
      namespaceIndexes.push(parsed.nodeIndex)
      position = parsed.position

      if (position > 0) {
        previousLine = tokenAt(tokens, position - 1).line
      }
      continue
    }

    const token = tokenAt(tokens, position)

    if (token.line > previousLine) {
      parts.push('\n')
    }

    parts.push(tokenSource(token))
    previousLine = token.line
    position = position + 1
  }

  for (let index = 0; index < namespaceIndexes.length; index = index + 1) {
    const node = ambientNamespaceNodeAt(state, namespaceIndexes[index])

    appendAmbientNamespaceSource(parts, state, namespaceIndexes[index])
    parts.push('const')
    parts.push(node.name)
    parts.push(':')
    parts.push(node.typeName)
    parts.push(';')
  }

  return normalizeModuleDeclarationContractSource(joinParts(parts), file, diagnostics)
}

function readAmbientNamespaceDeclaration(
  tokens: Token[],
  position: number,
  state: AmbientNamespaceNormalizeState,
  diagnostics: Diagnostic[]
): AmbientNamespaceParseResult | null {
  let current = position

  if (tokenValue(tokens, current) === 'export' || tokenValue(tokens, current) === 'declare') {
    current = current + 1
  }

  if (tokenValue(tokens, current) !== 'namespace') {
    return null
  }

  const namespaceToken = tokenAt(tokens, current)
  const nameToken = tokenAt(tokens, current + 1)

  if (!isDeclarationLocalNameToken(nameToken)) {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE',
        'ambient namespace declaration requires a simple identifier name',
        namespaceToken
      )
    )
    return {
      nodeIndex: pushEmptyAmbientNamespaceNode(state),
      position: skipToStatementEnd(tokens, current)
    }
  }

  current = current + 2

  if (tokenValue(tokens, current) !== '{') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE',
        `ambient namespace ${nameToken.value} requires a declaration block`,
        namespaceToken
      )
    )
    return {
      nodeIndex: pushEmptyAmbientNamespaceNode(state),
      position: skipToStatementEnd(tokens, current)
    }
  }

  const close = findBalancedClose(tokens, current, '{', '}')

  if (tokenValue(tokens, close) !== '}') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE',
        `ambient namespace ${nameToken.value} has an unclosed declaration block`,
        namespaceToken
      )
    )
    return {
      nodeIndex: pushEmptyAmbientNamespaceNode(state),
      position: close
    }
  }

  const node: AmbientNamespaceNode = {
    name: nameToken.value,
    typeName: nextAmbientNamespaceTypeName(state),
    methods: [],
    namespaceIndexes: []
  }
  const nodeIndex = state.nodes.length
  state.nodes.push(node)

  current = current + 1

  while (current < close && !tokenIs(tokens, current, 'eof', '<eof>')) {
    if (tokenValue(tokens, current) === ';') {
      current = current + 1
      continue
    }

    const nested = readAmbientNamespaceDeclaration(tokens, current, state, diagnostics)

    if (nested !== null) {
      node.namespaceIndexes.push(nested.nodeIndex)
      current = nested.position
      continue
    }

    if (isFunctionSignatureStart(tokens, current)) {
      const method = readAmbientNamespaceFunction(tokens, current, diagnostics)

      if (method !== null) {
        node.methods.push(method.parts)
        current = method.position
        continue
      }
    }

    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE_MEMBER',
        'ambient namespace declarations support only nested namespaces and function signatures',
        tokenAt(tokens, current)
      )
    )
    current = skipToStatementEnd(tokens, current)
  }

  let nextPosition = close + 1

  if (tokenValue(tokens, nextPosition) === ';') {
    nextPosition = nextPosition + 1
  }

  return { nodeIndex, position: nextPosition }
}

function readAmbientNamespaceFunction(
  tokens: Token[],
  position: number,
  diagnostics: Diagnostic[]
): { parts: string[]; position: number } | null {
  const boundary = findFunctionSignatureBoundary(tokens, position)

  if (boundary === null) {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE_MEMBER',
        'ambient namespace function requires a declaration signature',
        tokenAt(tokens, position)
      )
    )
    return null
  }

  let current = position

  if (tokenValue(tokens, current) === 'export') {
    current = current + 1
  }

  if (tokenValue(tokens, current) === 'async') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_UNSUPPORTED_NAMESPACE_MEMBER',
        'ambient namespace function uses its return type instead of the async modifier',
        tokenAt(tokens, current)
      )
    )
    return {
      parts: [],
      position: boundary.position
    }
  }

  current = current + 1
  const parts: string[] = []

  while (current < boundary.end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push(';')

  return { parts, position: boundary.position }
}

function appendAmbientNamespaceSource(parts: string[], state: AmbientNamespaceNormalizeState, nodeIndex: number): void {
  const node = ambientNamespaceNodeAt(state, nodeIndex)

  for (let index = 0; index < node.namespaceIndexes.length; index = index + 1) {
    appendAmbientNamespaceSource(parts, state, node.namespaceIndexes[index])
  }

  parts.push('interface')
  parts.push(node.typeName)
  parts.push('{')

  for (let index = 0; index < node.namespaceIndexes.length; index = index + 1) {
    const nested = ambientNamespaceNodeAt(state, node.namespaceIndexes[index])

    parts.push('readonly')
    parts.push(nested.name)
    parts.push(':')
    parts.push(nested.typeName)
    parts.push(';')
  }

  for (let methodIndex = 0; methodIndex < node.methods.length; methodIndex = methodIndex + 1) {
    const method = node.methods[methodIndex]

    for (let partIndex = 0; partIndex < method.length; partIndex = partIndex + 1) {
      parts.push(method[partIndex])
    }
  }

  parts.push('}')
}

function pushEmptyAmbientNamespaceNode(state: AmbientNamespaceNormalizeState): number {
  const index = state.nodes.length

  state.nodes.push({
    name: '__invalid_namespace',
    typeName: nextAmbientNamespaceTypeName(state),
    methods: [],
    namespaceIndexes: []
  })

  return index
}

function ambientNamespaceNodeAt(state: AmbientNamespaceNormalizeState, index: number): AmbientNamespaceNode {
  return state.nodes[index] as AmbientNamespaceNode
}

function nextAmbientNamespaceTypeName(state: AmbientNamespaceNormalizeState): string {
  const name = '__inox_ambient_namespace_' + state.nextId

  state.nextId = state.nextId + 1
  return name
}

function isEmptyExportMarker(tokens: Token[], position: number): boolean {
  return (
    tokenValue(tokens, position) === 'export' &&
    tokenValue(tokens, position + 1) === '{' &&
    tokenValue(tokens, position + 2) === '}'
  )
}

function isDeclareGlobalStart(tokens: Token[], position: number): boolean {
  return (
    tokenValue(tokens, position) === 'declare' &&
    tokenValue(tokens, position + 1) === 'global' &&
    tokenValue(tokens, position + 2) === '{'
  )
}

function renameModuleDeclarationDefaultExports(
  program: ProgramNode,
  defaultExports: DeclarationContractDefaultExport[]
): void {
  if (defaultExports.length === 0) {
    return
  }

  const syntheticNames: Set<string> = new Set()

  for (const item of defaultExports) {
    syntheticNames.add(item.syntheticName)
  }

  for (const item of program.body) {
    if (item.type === 'VariableDeclaration' && syntheticNames.has(item.name)) {
      item.name = 'default'
    }
  }
}

function readDeclareConstDeclaration(tokens: Token[], position: number): DeclareConstDeclaration | null {
  const name = tokenAt(tokens, position + 2)

  if (!isDeclarationLocalNameToken(name)) {
    return null
  }

  let current = position + 3

  if (tokenValue(tokens, current) !== ':') {
    return null
  }

  current = current + 1

  const typeResult = readTypeAnnotation(tokens, current, [';'], {
    stopAtLineBreak: true
  })
  let next = typeResult.position

  if (tokenValue(tokens, next) === ';') {
    next = next + 1
  }

  return {
    name: name.value,
    valueType: nonEmptyTypeNameOrUnknown(typeResult.typeName),
    position: next
  }
}

function appendNormalizedDefaultExport(
  parts: string[],
  defaultExports: DeclarationContractDefaultExport[],
  declareConstTypes: Map<string, string>,
  tokens: Token[],
  position: number
): number {
  const localName = tokenValue(tokens, position + 2)
  const declaredType = declareConstTypes.get(localName) ?? 'unknown'
  const syntheticName = `__inox_default_export_${defaultExports.length}`

  parts.push('export')
  parts.push('const')
  parts.push(syntheticName)
  parts.push(':')
  parts.push(declaredType)
  parts.push(';')
  defaultExports.push({ syntheticName })

  return skipToStatementEnd(tokens, position)
}

function appendNormalizedClassDeclaration(parts: string[], tokens: Token[], position: number): number {
  let current = position

  while (!tokenIs(tokens, current, 'eof', '<eof>') && tokenValue(tokens, current) !== '{') {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  if (tokenValue(tokens, current) !== '{') {
    return current
  }

  const close = findBalancedClose(tokens, current, '{', '}')

  parts.push(tokenSource(tokenAt(tokens, current)))
  current = current + 1

  while (current < close && !tokenIs(tokens, current, 'eof', '<eof>')) {
    if (isClassMethodSignatureStart(tokens, current)) {
      current = appendNormalizedClassMethodSignature(parts, tokens, current)
      continue
    }

    if (isClassPropertySignatureStart(tokens, current)) {
      current = appendNormalizedClassPropertySignature(parts, tokens, current)
      continue
    }

    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push(tokenSource(tokenAt(tokens, close)))

  if (tokenValue(tokens, close + 1) === ';') {
    return close + 2
  }

  return close + 1
}

function appendNormalizedClassMethodSignature(parts: string[], tokens: Token[], position: number): number {
  const boundary = findFunctionSignatureBoundary(tokens, position)

  if (boundary === null) {
    parts.push(tokenSource(tokenAt(tokens, position)))
    return position + 1
  }

  let current = position

  while (current < boundary.end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push('{')
  parts.push('}')

  return boundary.position
}

function appendNormalizedClassPropertySignature(parts: string[], tokens: Token[], position: number): number {
  const boundary = findClassPropertySignatureBoundary(tokens, position)

  if (boundary === null) {
    parts.push(tokenSource(tokenAt(tokens, position)))
    return position + 1
  }

  let current = position

  while (current < boundary.end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push(';')
  return boundary.position
}

function findClassPropertySignatureBoundary(tokens: Token[], position: number): FunctionSignatureBoundary | null {
  let current = position
  let braceDepth = 0
  let bracketDepth = 0
  let genericDepth = 0
  let parenDepth = 0
  let hasType = false

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    const token = tokenAt(tokens, current)

    if (
      current > position &&
      hasType &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      genericDepth === 0 &&
      parenDepth === 0 &&
      token.line > tokenAt(tokens, current - 1).line &&
      (isClassMethodSignatureStart(tokens, current) || isClassPropertySignatureStart(tokens, current))
    ) {
      return { end: current, position: current }
    }

    const value = token.value

    if (value === '{') {
      braceDepth = braceDepth + 1
    } else if (value === '}' && braceDepth > 0) {
      braceDepth = braceDepth - 1
    } else if (
      value === '}' &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      genericDepth === 0 &&
      parenDepth === 0 &&
      hasType
    ) {
      return { end: current, position: current }
    } else if (value === '[') {
      bracketDepth = bracketDepth + 1
    } else if (value === ']' && bracketDepth > 0) {
      bracketDepth = bracketDepth - 1
    } else if (value === '<') {
      genericDepth = genericDepth + 1
    } else if (value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (value === '(') {
      parenDepth = parenDepth + 1
    } else if (value === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
    } else if (value === ':' && braceDepth === 0 && bracketDepth === 0 && genericDepth === 0 && parenDepth === 0) {
      hasType = true
    } else if (value === ';' && braceDepth === 0 && bracketDepth === 0 && genericDepth === 0 && parenDepth === 0) {
      return { end: current, position: current + 1 }
    }

    current = current + 1
  }

  return hasType ? { end: current, position: current } : null
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

  while (
    !tokenIs(tokens, current, 'eof', '<eof>') &&
    tokenValue(tokens, current) !== 'extends' &&
    tokenValue(tokens, current) !== '{'
  ) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

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
  let previousLine = tokenAt(tokens, current).line

  while (current <= close && !tokenIs(tokens, current, 'eof', '<eof>')) {
    const token = tokenAt(tokens, current)

    if (token.line > previousLine) {
      parts.push('\n')
    }

    parts.push(tokenSource(token))
    previousLine = token.line
    current = current + 1
  }

  parts.push(';')

  if (tokenValue(tokens, current) === ';') {
    current = current + 1
  }

  return current
}

function appendNormalizedFunctionSignature(parts: string[], tokens: Token[], position: number): number {
  const boundary = findFunctionSignatureBoundary(tokens, position)

  if (boundary === null) {
    parts.push(tokenSource(tokenAt(tokens, position)))
    return position + 1
  }

  let current = position

  while (current < boundary.end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push('{')
  parts.push('}')

  return boundary.position
}

function appendNormalizedVariableSignature(parts: string[], tokens: Token[], position: number): number {
  const boundary = findVariableSignatureBoundary(tokens, position)

  if (boundary === null) {
    parts.push(tokenSource(tokenAt(tokens, position)))
    return position + 1
  }

  let current = position

  while (current < boundary.end) {
    parts.push(tokenSource(tokenAt(tokens, current)))
    current = current + 1
  }

  parts.push(';')

  return boundary.position
}

function findVariableSignatureBoundary(tokens: Token[], position: number): FunctionSignatureBoundary | null {
  let current = position

  if (tokenValue(tokens, current) === 'export') {
    current = current + 1
  }

  if (tokenValue(tokens, current) !== 'const' && tokenValue(tokens, current) !== 'let') {
    return null
  }

  current = current + 1

  if (!isDeclarationLocalNameToken(tokenAt(tokens, current)) || tokenValue(tokens, current + 1) !== ':') {
    return null
  }

  current = current + 2
  const typeStart = current
  let braceDepth = 0
  let bracketDepth = 0
  let genericDepth = 0
  let parenDepth = 0

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    const token = tokenAt(tokens, current)

    if (
      current > typeStart &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      genericDepth === 0 &&
      parenDepth === 0 &&
      token.line > tokenAt(tokens, current - 1).line &&
      isDeclarationContractStatementStart(tokens, current)
    ) {
      return { end: current, position: current }
    }

    const value = token.value

    if (value === '{') {
      braceDepth = braceDepth + 1
    } else if (value === '}' && braceDepth > 0) {
      braceDepth = braceDepth - 1
    } else if (value === '[') {
      bracketDepth = bracketDepth + 1
    } else if (value === ']' && bracketDepth > 0) {
      bracketDepth = bracketDepth - 1
    } else if (value === '<') {
      genericDepth = genericDepth + 1
    } else if (value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (value === '(') {
      parenDepth = parenDepth + 1
    } else if (value === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
    } else if (value === ';' && braceDepth === 0 && bracketDepth === 0 && genericDepth === 0 && parenDepth === 0) {
      return { end: current, position: current + 1 }
    }

    current = current + 1
  }

  return { end: current, position: current }
}

function findFunctionSignatureBoundary(tokens: Token[], position: number): FunctionSignatureBoundary | null {
  let current = position
  let parenDepth = 0
  let genericDepth = 0
  let hasReturnType = false
  let hasParameterList = false

  while (!tokenIs(tokens, current, 'eof', '<eof>')) {
    if (
      current > position &&
      parenDepth === 0 &&
      genericDepth === 0 &&
      hasParameterList &&
      tokenAt(tokens, current).line > tokenAt(tokens, current - 1).line &&
      isDeclarationContractStatementStart(tokens, current)
    ) {
      return { end: current, position: current }
    }

    const value = tokenValue(tokens, current)

    if (value === '(') {
      parenDepth = parenDepth + 1
    } else if (value === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1

      if (parenDepth === 0) {
        hasParameterList = true
      }
    } else if (value === '<') {
      genericDepth = genericDepth + 1
    } else if (value === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (value === ':' && parenDepth === 0 && genericDepth === 0) {
      hasReturnType = true
    } else if (value === '{' && parenDepth === 0) {
      return null
    } else if (value === '}' && parenDepth === 0 && genericDepth === 0 && hasParameterList) {
      return { end: current, position: current }
    } else if (value === ';' && parenDepth === 0 && genericDepth === 0) {
      return { end: current, position: current + 1 }
    }

    current = current + 1
  }

  if ((hasReturnType || hasParameterList) && parenDepth === 0 && genericDepth === 0) {
    return { end: current, position: current }
  }

  return null
}

function isDeclarationContractStatementStart(tokens: Token[], position: number): boolean {
  if (
    isFunctionSignatureStart(tokens, position) ||
    isInterfaceDeclarationStart(tokens, position) ||
    isClassDeclarationStart(tokens, position) ||
    isClassMethodSignatureStart(tokens, position) ||
    isClassPropertySignatureStart(tokens, position)
  ) {
    return true
  }

  const value = tokenValue(tokens, position)

  if (value === 'const' || value === 'let' || value === 'namespace' || value === 'declare') {
    return true
  }

  if (value === 'type') {
    return isDeclarationLocalNameToken(tokenAt(tokens, position + 1)) && tokenValue(tokens, position + 2) === '='
  }

  return value === 'export'
}

function isFunctionSignatureStart(tokens: Token[], position: number): boolean {
  let current = position

  if (tokenValue(tokens, current) === 'export') {
    current = current + 1
  }

  if (tokenValue(tokens, current) === 'async') {
    current = current + 1
  }

  if (tokenValue(tokens, current) !== 'function') {
    return false
  }

  return isFunctionDeclarationNameToken(tokenAt(tokens, current + 1))
}

function isInterfaceDeclarationStart(tokens: Token[], position: number): boolean {
  if (tokenValue(tokens, position) === 'interface') {
    return true
  }

  return tokenValue(tokens, position) === 'export' && tokenValue(tokens, position + 1) === 'interface'
}

function isClassDeclarationStart(tokens: Token[], position: number): boolean {
  if (tokenValue(tokens, position) === 'class') {
    return true
  }

  return tokenValue(tokens, position) === 'export' && tokenValue(tokens, position + 1) === 'class'
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

function isDeclareConstDeclarationStart(tokens: Token[], position: number): boolean {
  return (
    tokenValue(tokens, position) === 'declare' &&
    tokenValue(tokens, position + 1) === 'const' &&
    isDeclarationLocalNameToken(tokenAt(tokens, position + 2))
  )
}

function isDefaultExportDeclarationStart(tokens: Token[], position: number): boolean {
  return (
    tokenValue(tokens, position) === 'export' &&
    tokenValue(tokens, position + 1) === 'default' &&
    isDeclarationLocalNameToken(tokenAt(tokens, position + 2))
  )
}

function isVariableSignatureStart(tokens: Token[], position: number): boolean {
  let current = position

  if (tokenValue(tokens, current) === 'export') {
    current = current + 1
  }

  if (tokenValue(tokens, current) !== 'const' && tokenValue(tokens, current) !== 'let') {
    return false
  }

  return isDeclarationLocalNameToken(tokenAt(tokens, current + 1)) && tokenValue(tokens, current + 2) === ':'
}

function isFunctionDeclarationNameToken(token: Token): boolean {
  return token.type === 'identifier' || token.value === 'type'
}

function isDeclarationLocalNameToken(token: Token): boolean {
  return token.type === 'identifier' || token.value === 'type'
}

function isClassMethodSignatureStart(tokens: Token[], position: number): boolean {
  let current = position

  if (tokenValue(tokens, current) === 'static') {
    current = current + 1
  }

  if (!isClassMemberNameToken(tokenAt(tokens, current))) {
    return false
  }

  current = current + 1

  if (tokenValue(tokens, current) === '<') {
    current = findBalancedClose(tokens, current, '<', '>') + 1
  }

  return tokenValue(tokens, current) === '('
}

function isClassPropertySignatureStart(tokens: Token[], position: number): boolean {
  let current = position

  while (
    tokenValue(tokens, current) === 'static' ||
    tokenValue(tokens, current) === 'readonly' ||
    tokenValue(tokens, current) === 'public' ||
    tokenValue(tokens, current) === 'protected' ||
    tokenValue(tokens, current) === 'private' ||
    tokenValue(tokens, current) === 'declare' ||
    tokenValue(tokens, current) === 'abstract'
  ) {
    current = current + 1
  }

  if (tokenValue(tokens, current) === '[') {
    current = findBalancedClose(tokens, current, '[', ']') + 1
  } else if (isClassMemberNameToken(tokenAt(tokens, current))) {
    current = current + 1
  } else {
    return false
  }

  if (tokenValue(tokens, current) === '?') {
    current = current + 1
  }

  return tokenValue(tokens, current) === ':'
}

function isClassMemberNameToken(token: Token): boolean {
  return token.type === 'identifier' || token.type === 'keyword'
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

function formatTypeParameterList(typeParameters: AnyNode[] | null | undefined): string {
  if (typeParameters === null || typeof typeParameters === 'undefined' || typeParameters.length === 0) {
    return ''
  }

  const values: string[] = []

  for (const typeParameter of typeParameters) {
    const constraint = nullableStringMetadata(typeParameter.constraint)

    if (constraint !== null) {
      values.push(`${typeParameter.name} extends ${constraint}`)
    } else {
      values.push(typeParameter.name)
    }
  }

  return `<${joinStrings(values, ', ')}>`
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
    let readonlyPrefix = ''

    if (info.dynamicField !== null && typeof info.dynamicField !== 'undefined') {
      if (info.dynamicField.readonly === true) {
        readonlyPrefix = 'readonly '
      }
    }

    lines.push(`  ${readonlyPrefix}[key: string]: ${dynamicType};`)
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
  const optional = field.optional === true ? '?' : ''
  const typeName = objectFieldTypeName(field)

  return `${readonlyPrefix}${field.name}${optional}: ${ownershipTypeName(field, typeName)}`
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
    const rest = param.rest === true ? '...' : ''
    const typeName = declaredTypeName(param) ?? typeNameFromMetadata(param, 'unknown')

    names.push(`${rest}${param.name}${optional}: ${typeName}`)
  }

  return joinStrings(names, ', ')
}

function declarationReturnType(item: AnyNode): string {
  const predicateParameterName = nullableStringMetadata(item.typePredicateParameterName)
  const predicateType = nullableStringMetadata(item.typePredicateType)

  if (predicateParameterName !== null && predicateType !== null) {
    return `${predicateParameterName} is ${predicateType}`
  }

  const declared = nullableStringMetadata(item.declaredReturnType)

  if (declared !== null) {
    return declared
  }

  return typeNameFromMetadata(
    {
      valueType: item.returnType,
      nullable: item.returnNullable,
      asyncResultValueType: item.returnAsyncResultValueType,
      shape: item.returnShape
    },
    'void'
  )
}

function declaredTypeName(item: AnyNode): string | null {
  return nullableStringMetadata(item.declaredType)
}

function ownershipTypeName(item: AnyNode, typeName: string): string {
  if (item.ownership === 'weak' && !isWeakTypeName(typeName)) {
    return `weak<${typeName}>`
  }

  return typeName
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

  if (valueType === 'async-result') {
    typeName = `asyncResult<${stringMetadata(item.asyncResultValueType, 'unknown')}>`
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

function nonEmptyTypeNameOrUnknown(value: string | null | undefined): string {
  const typeName = typeNameOrUnknown(value)

  if (typeName === '') {
    return 'unknown'
  }

  return typeName
}

function tokenAt(tokens: Token[], position: number): Token {
  const fallback = tokens[tokens.length - 1]

  if (fallback === undefined) {
    throw new Error('declaration token stream must contain eof')
  }

  if (position < 0 || position >= tokens.length) {
    return fallback
  }

  return tokens[position] ?? fallback
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
  const declaration: AnyNode = {
    type: 'FunctionDeclaration',
    exported: true,
    declarationOnly: true,
    async: item.async === true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    params: cloneParams(item.params),
    declaredReturnType: nullableMetadata(item.declaredReturnType),
    returnType: stringMetadata(item.returnType, 'void'),
    returnTypeRef: nullableMetadata(item.returnTypeRef),
    returnNullable: item.returnNullable === true,
    returnAsyncResultValueType: nullableMetadata(item.returnAsyncResultValueType),
    returnShape: nullableMetadata(item.returnShape),
    typePredicateParameterName: nullableMetadata(item.typePredicateParameterName),
    typePredicateType: nullableMetadata(item.typePredicateType),
    typePredicateLoc: nullableMetadata(item.typePredicateLoc),
    argumentNarrowing: nullableMetadata(item.argumentNarrowing),
    body: []
  }
  const typeParameters = cloneTypeParameters(item.typeParameters)

  if (typeParameters.length > 0) {
    declaration.typeParameters = typeParameters
  }

  return declaration
}

function cloneTypeParameters(typeParameters: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (typeParameters === null || typeof typeParameters === 'undefined') {
    return cloned
  }

  for (const typeParameter of typeParameters) {
    cloned.push({
      name: typeParameter.name,
      constraint: nullableMetadata(typeParameter.constraint),
      loc: nullableMetadata(typeParameter.loc)
    })
  }

  return cloned
}

function cloneVariableDeclaration(item: AnyNode): AnyNode {
  const inferred = inferVariableDeclarationMetadata(item)

  return {
    type: 'VariableDeclaration',
    kind: stringMetadata(item.kind, 'const'),
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    declaredType: nullableMetadata(item.declaredType ?? item.inferredDeclaredType ?? inferred.declaredType),
    typeRef: nullableMetadata(item.typeRef),
    valueType: knownStringMetadata(item.valueType) ?? inferred.valueType ?? stringMetadata(item.valueType, 'unknown'),
    nullable: item.nullable === true,
    shape: nullableMetadata(item.shape),
    functionType: nullableMetadata(item.functionType),
    asyncResultValueType: nullableMetadata(item.asyncResultValueType),
    init: null
  }
}

function inferVariableDeclarationMetadata(item: AnyNode): DeclarationValueMetadata {
  return inferExpressionDeclarationMetadata(item.init)
}

function inferExpressionDeclarationMetadata(expression: AnyNode | null | undefined): DeclarationValueMetadata {
  if (expression === null || typeof expression === 'undefined') {
    return emptyDeclarationValueMetadata()
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return scalarDeclarationValueMetadata('string')
  }

  if (expression.type === 'NumberLiteral') {
    return scalarDeclarationValueMetadata('number')
  }

  if (expression.type === 'BooleanLiteral') {
    return scalarDeclarationValueMetadata('boolean')
  }

  if (expression.type === 'NullLiteral') {
    return scalarDeclarationValueMetadata('null')
  }

  if (expression.type === 'ArrayLiteral') {
    return arrayLiteralDeclarationValueMetadata(expression)
  }

  if (expression.type === 'NewExpression') {
    return emptyDeclarationValueMetadata()
  }

  return emptyDeclarationValueMetadata()
}

function scalarDeclarationValueMetadata(valueType: ValueType): DeclarationValueMetadata {
  return {
    valueType,
    declaredType: valueType
  }
}

function arrayLiteralDeclarationValueMetadata(expression: AnyNode): DeclarationValueMetadata {
  const elementType = arrayLiteralElementType(expression)

  return {
    valueType: 'object',
    declaredType: `array<${elementType ?? 'unknown'}>`
  }
}

function arrayLiteralElementType(expression: AnyNode): ValueType | null {
  if (expression.elements.length === 0) {
    return null
  }

  let elementType: ValueType | null = null

  for (const element of expression.elements) {
    const metadata = inferExpressionDeclarationMetadata(element)

    if (metadata.valueType === null || metadata.valueType === 'unknown') {
      return null
    }

    if (elementType === null) {
      elementType = metadata.valueType
    } else if (elementType !== metadata.valueType) {
      return null
    }
  }

  return elementType
}

function emptyDeclarationValueMetadata(): DeclarationValueMetadata {
  return {
    valueType: null,
    declaredType: null
  }
}

function cloneClassDeclaration(item: AnyNode): AnyNode {
  const declaration: AnyNode = {
    type: 'ClassDeclaration',
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    extendsName: nullableMetadata(item.extendsName),
    extendsLoc: nullableMetadata(item.extendsLoc),
    shape: nullableMetadata(item.shape),
    fields: cloneClassFields(item.fields),
    indexSignatures: cloneClassIndexSignatures(item.indexSignatures),
    methods: cloneClassMethods(item.methods)
  }
  const typeParameters = cloneTypeParameters(item.typeParameters)

  if (typeParameters.length > 0) {
    declaration.typeParameters = typeParameters
  }

  return declaration
}

function cloneClassIndexSignatures(signatures: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (signatures === null || typeof signatures === 'undefined') {
    return cloned
  }

  for (const signature of signatures) {
    cloned.push({
      type: 'ClassIndexSignature',
      name: signature.name,
      keyType: signature.keyType,
      valueType: signature.valueType,
      readonly: signature.readonly === true,
      loc: nullableMetadata(signature.loc)
    })
  }

  return cloned
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
      typeRef: nullableMetadata(field.typeRef),
      optional: field.optional === true,
      valueType: stringMetadata(field.valueType, 'unknown'),
      nullable: field.nullable === true,
      asyncResultValueType: nullableMetadata(field.asyncResultValueType),
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
      typeParameters: cloneTypeParameters(method.typeParameters),
      params: cloneParams(method.params),
      declaredReturnType: nullableMetadata(method.declaredReturnType),
      returnType: stringMetadata(method.returnType, 'void'),
      returnTypeRef: nullableMetadata(method.returnTypeRef),
      returnNullable: method.returnNullable === true,
      returnAsyncResultValueType: nullableMetadata(method.returnAsyncResultValueType),
      typePredicateParameterName: nullableMetadata(method.typePredicateParameterName),
      typePredicateType: nullableMetadata(method.typePredicateType),
      typePredicateLoc: nullableMetadata(method.typePredicateLoc),
      argumentNarrowing: nullableMetadata(method.argumentNarrowing),
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
      typeRef: nullableMetadata(param.typeRef),
      nullable: param.nullable === true,
      asyncResultValueType: nullableMetadata(param.asyncResultValueType),
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

function knownStringMetadata(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined' && value.length > 0 && value !== 'unknown') {
    return value
  }

  return null
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
