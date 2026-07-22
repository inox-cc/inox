import { relative, resolve, sep } from 'node:path'

import ts from 'typescript'

import {
  discoverCompilerLibraries,
  type DiscoveredCompilerLibrary
} from '../../../scripts/lib/compiler-library-discovery.ts'

export type CompilerSemanticVocabularyCategory =
  | 'api-member'
  | 'api-root'
  | 'behavior'
  | 'identity'
  | 'native'
  | 'option-value'

export type CompilerSemanticVocabularyEntry = {
  category: CompilerSemanticVocabularyCategory
  owner: string
  token: string
}

export type CompilerSemanticTail = CompilerSemanticVocabularyEntry & {
  column: number
  context: string
  file: string
  line: number
}

export type CompilerSemanticVocabularyInventory = {
  entries: CompilerSemanticVocabularyEntry[]
  packageIds: string[]
}

type VocabularyPhrase = {
  entry: CompilerSemanticVocabularyEntry
  words: string[]
}

type VocabularyPhraseIndex = Map<string, VocabularyPhrase[]>

const projectRoot = resolve('.')
const hostImportSpecifiers = new Map<string, Set<string>>([
  ['compiler/index.ts', new Set(['node:fs', 'node:path', 'node:process', 'node:url'])],
  ['compiler/node-host.ts', new Set(['node:crypto', 'node:fs', 'node:path', 'node:url'])]
])
const coreProtocolValues = new Set([
  'array',
  'array-literal',
  'async-result',
  'async-runtime',
  'awaitable',
  'boolean',
  'borrowed',
  'bytes',
  'call',
  'callback-values',
  'class',
  'construct',
  'create',
  'dynamic-object',
  'event-loop',
  'exception-value',
  'fulfill',
  'function',
  'index',
  'index-assignment',
  'index-read',
  'index-write',
  'indexable',
  'invalid-result',
  'iterable',
  'managed-values',
  'map-fulfilled',
  'map-rejected',
  'member',
  'member-assignment',
  'member-read',
  'member-write',
  'name',
  'nominal',
  'null',
  'number',
  'object',
  'objects',
  'owned',
  'parameter',
  'present',
  'primitive',
  'regexp-literal',
  'reject',
  'runtime-value',
  'runtime-values',
  'string',
  'string-bytes',
  'thrown',
  'type',
  'unknown',
  'value',
  'void',
  'weak',
  'weak-references'
])
const universalNativeValues = new Set([
  'bool',
  'double',
  'inox::String',
  'inox::Value',
  'inox_value',
  'size_t',
  'std::string',
  'void'
])
const commonDiagnosticCodes = new Set([
  'INOX_C_UNSUPPORTED_EXPR',
  'INOX_NOT_IMPLEMENTED',
  'INOX_TYPE_MISMATCH'
])
const universalDescriptorKeys = new Set([
  'asyncResultOperation',
  'callbackLifetime',
  'cArgumentKinds',
  'cCallStyle',
  'cFailureMode',
  'cResultMode',
  'cValueKind',
  'failureMode',
  'kind',
  'ownership',
  'role',
  'source',
  'traitId',
  'valueType',
  'valueTypes'
])
const identityDescriptorKeys = new Set([
  'baseTypeIds',
  'bindingAliases',
  'bindingId',
  'capabilities',
  'capability',
  'dependencies',
  'id',
  'initializerId',
  'libraryId',
  'literalProviderId',
  'objectTypeIds',
  'operationId',
  'optionId',
  'receiverTypeId',
  'resultTypeId',
  'runtimeRequirement',
  'runtimeRequirements',
  'typeId'
])
const nativeDescriptorKeys = new Set([
  'appendElementExpression',
  'appendSpreadExpression',
  'cArgumentAdapters',
  'cAsyncFulfillExpression',
  'cAsyncRejectExpression',
  'cAwaitExpression',
  'cClassFormatExpression',
  'cEntrypointAdapter',
  'cFunction',
  'cFulfillExpression',
  'cName',
  'cObserveExpression',
  'cppType',
  'cPreludeIncludes',
  'cReceiverAdapter',
  'cRejectExpression',
  'cResultAdapter',
  'cRuntimeValueExpression',
  'cRuntimeValueValidExpression',
  'cType',
  'cValidExpression',
  'cValueAdapter',
  'createExpression'
])
const optionValueDescriptorKeys = new Set([
  'allowedValues',
  'defaultValue',
  'prefixes',
  'stringLiterals',
  'values'
])
const semanticMetadataPropertyNames = new Set([
  'bindingId',
  'capability',
  'cExpression',
  'cppType',
  'member',
  'method',
  'operationId',
  'optionId',
  'property',
  'runtimeRequirement',
  'typeId'
])
const semanticCallNameMarkers = [
  'backend',
  'binding',
  'builtin',
  'callee',
  'capability',
  'global',
  'library',
  'member',
  'method',
  'native',
  'operation',
  'option',
  'property',
  'properties',
  'requirement',
  'root',
  'runtime'
]
const membershipMethodNames = new Set(['get', 'has', 'includes', 'indexOf', 'set'])
const dedicatedIdentifierMarkers = new Set([
  'adapter',
  'backend',
  'binding',
  'builtin',
  'call',
  'capability',
  'check',
  'compiler',
  'emit',
  'global',
  'handler',
  'import',
  'library',
  'lower',
  'native',
  'operation',
  'prepared',
  'requirement',
  'resolve',
  'runtime'
])
const hostImplementationTypeNames = new Set([
  'Array',
  'Boolean',
  'Error',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'RegExp',
  'Set',
  'String'
])

export async function compilerLibrarySemanticVocabulary(): Promise<CompilerSemanticVocabularyInventory> {
  return compilerLibrarySemanticVocabularyFromDiscovered(await discoverCompilerLibraries())
}

export function compilerLibrarySemanticVocabularyFromDiscovered(
  libraries: DiscoveredCompilerLibrary[]
): CompilerSemanticVocabularyInventory {
  const entries: CompilerSemanticVocabularyEntry[] = []
  const packageIds: string[] = []

  for (const library of libraries) {
    packageIds.push(library.id)
    addVocabulary(entries, library.id, 'identity', library.id)
    addVocabulary(entries, library.id, 'identity', library.importSource)
    addVocabulary(entries, library.id, 'native', library.compilerEntrypoint)

    for (const source of library.nativeSources) {
      addVocabulary(entries, library.id, 'native', source)
    }

    for (const includeDir of library.nativeIncludeDirs) {
      addVocabulary(entries, library.id, 'native', includeDir)
    }

    collectDeclarationVocabulary(entries, library)
    collectDescriptorVocabulary(entries, library.id, library.compilerPackage, [])
  }

  return {
    entries: uniqueVocabulary(entries),
    packageIds: packageIds.sort()
  }
}

export function createCompilerSemanticTailDetector(
  vocabulary: CompilerSemanticVocabularyEntry[]
): (file: string, source: string) => CompilerSemanticTail[] {
  const exact = exactVocabulary(vocabulary)
  const substring = substringVocabulary(vocabulary)
  const phrases = identifierPhrases(vocabulary)

  return (file: string, source: string): CompilerSemanticTail[] => {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const tails: CompilerSemanticTail[] = []
    const seen = new Set<string>()

    visitCompilerSource(sourceFile, sourceFile, projectPath(file), exact, substring, phrases, tails, seen)

    return tails.sort(compareSemanticTails)
  }
}

function collectDeclarationVocabulary(
  entries: CompilerSemanticVocabularyEntry[],
  library: DiscoveredCompilerLibrary
): void {
  if (library.declarationSource === null) {
    return
  }

  const sourceFile = ts.createSourceFile(
    library.declarationPath ?? `${library.id}.d.ts`,
    library.declarationSource,
    ts.ScriptTarget.Latest,
    true
  )

  function visit(node: ts.Node): void {
    if (isRootDeclaration(node)) {
      addVocabulary(entries, library.id, 'api-root', declarationName(node))
    } else if (isMemberDeclaration(node)) {
      addVocabulary(entries, library.id, 'api-member', propertyNameText(node.name))
    }

    if (ts.isLiteralTypeNode(node) && ts.isStringLiteralLike(node.literal)) {
      addVocabulary(entries, library.id, 'behavior', node.literal.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function isRootDeclaration(
  node: ts.Node
): node is
  | ts.ClassDeclaration
  | ts.EnumDeclaration
  | ts.FunctionDeclaration
  | ts.InterfaceDeclaration
  | ts.ModuleDeclaration
  | ts.TypeAliasDeclaration {
  return (
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  )
}

function declarationName(node: ReturnType<typeof asRootDeclaration>): string | null {
  const name = node.name

  if (typeof name === 'undefined') {
    return null
  }

  if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
    return null
  }

  return name.text === 'global' ? null : name.text
}

function asRootDeclaration(node: ts.Node):
  | ts.ClassDeclaration
  | ts.EnumDeclaration
  | ts.FunctionDeclaration
  | ts.InterfaceDeclaration
  | ts.ModuleDeclaration
  | ts.TypeAliasDeclaration {
  return node as
    | ts.ClassDeclaration
    | ts.EnumDeclaration
    | ts.FunctionDeclaration
    | ts.InterfaceDeclaration
    | ts.ModuleDeclaration
    | ts.TypeAliasDeclaration
}

function isMemberDeclaration(
  node: ts.Node
): node is
  | ts.EnumMember
  | ts.MethodDeclaration
  | ts.MethodSignature
  | ts.PropertyDeclaration
  | ts.PropertySignature {
  return (
    ts.isEnumMember(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node)
  )
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (typeof name === 'undefined') {
    return null
  }

  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  return null
}

function collectDescriptorVocabulary(
  entries: CompilerSemanticVocabularyEntry[],
  owner: string,
  value: unknown,
  path: string[]
): void {
  if (typeof value === 'string') {
    addDescriptorString(entries, owner, path, value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDescriptorVocabulary(entries, owner, item, path)
    }
    return
  }

  if (value === null || typeof value !== 'object') {
    return
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    collectDescriptorVocabulary(entries, owner, item, [...path, key])
  }
}

function addDescriptorString(
  entries: CompilerSemanticVocabularyEntry[],
  owner: string,
  path: string[],
  value: string
): void {
  const key = path[path.length - 1] ?? ''

  if (coreProtocolValues.has(value) || universalDescriptorKeys.has(key)) {
    return
  }

  if (key === 'declarationNames') {
    addVocabulary(entries, owner, 'api-root', value)
    return
  }

  if (identityDescriptorKeys.has(key)) {
    addVocabulary(entries, owner, 'identity', value)
    return
  }

  if (key.endsWith('DiagnosticMessage')) {
    addVocabulary(entries, owner, 'behavior', value)
    return
  }

  if (key.endsWith('DiagnosticCode')) {
    if (!commonDiagnosticCodes.has(value)) {
      addVocabulary(entries, owner, 'behavior', value)
    }
    return
  }

  if (key === 'cliAliases') {
    addVocabulary(entries, owner, 'identity', value)
    return
  }

  if (optionValueDescriptorKeys.has(key)) {
    addVocabulary(entries, owner, 'option-value', value)
    return
  }

  if (key === 'value' && (path.includes('cValueMap') || path.includes('conditions'))) {
    addVocabulary(entries, owner, 'option-value', value)
    return
  }

  if (nativeDescriptorKeys.has(key)) {
    if (!universalNativeValues.has(value)) {
      addVocabulary(entries, owner, 'native', value)
    }
    return
  }

  if (key === 'cExpression' || key === 'cMember' || key === 'cArgumentMethodNames') {
    if (isSimpleIdentifier(value)) {
      addVocabulary(entries, owner, 'api-member', value)
    } else {
      addVocabulary(entries, owner, 'native', value)
    }
    return
  }

  if (key === 'name' && descriptorPathContainsApiShape(path)) {
    addVocabulary(entries, owner, 'api-member', value)
    return
  }

  if (value.includes('#') || value === owner) {
    addVocabulary(entries, owner, 'identity', value)
    return
  }

  addVocabulary(entries, owner, 'behavior', value)
}

function descriptorPathContainsApiShape(path: string[]): boolean {
  const shapeKeys = new Set([
    'fields',
    'objectLiteralFields',
    'objectMethods',
    'resultShapeFields',
    'shapeFields'
  ])

  for (const key of path) {
    if (shapeKeys.has(key)) {
      return true
    }
  }

  return false
}

function addVocabulary(
  entries: CompilerSemanticVocabularyEntry[],
  owner: string,
  category: CompilerSemanticVocabularyCategory,
  token: string | null | undefined
): void {
  if (token === null || typeof token === 'undefined' || token.length === 0) {
    return
  }

  if (token.length < 3 && category !== 'api-root' && category !== 'api-member') {
    return
  }

  if (coreProtocolValues.has(token) || commonDiagnosticCodes.has(token)) {
    return
  }

  entries.push({ category, owner, token })
}

function uniqueVocabulary(entries: CompilerSemanticVocabularyEntry[]): CompilerSemanticVocabularyEntry[] {
  const unique = new Map<string, CompilerSemanticVocabularyEntry>()

  for (const entry of entries) {
    unique.set(`${entry.owner}\0${entry.category}\0${entry.token}`, entry)
  }

  return Array.from(unique.values()).sort(compareVocabulary)
}

function compareVocabulary(
  left: CompilerSemanticVocabularyEntry,
  right: CompilerSemanticVocabularyEntry
): number {
  return (
    left.token.localeCompare(right.token) ||
    left.owner.localeCompare(right.owner) ||
    left.category.localeCompare(right.category)
  )
}

function exactVocabulary(
  vocabulary: CompilerSemanticVocabularyEntry[]
): Map<string, CompilerSemanticVocabularyEntry[]> {
  const result = new Map<string, CompilerSemanticVocabularyEntry[]>()

  for (const entry of vocabulary) {
    const entries = result.get(entry.token) ?? []
    entries.push(entry)
    result.set(entry.token, entries)
  }

  return result
}

function substringVocabulary(vocabulary: CompilerSemanticVocabularyEntry[]): CompilerSemanticVocabularyEntry[] {
  return vocabulary.filter(
    (entry) =>
      (entry.category === 'identity' &&
        (entry.token.includes(':') || entry.token.includes('#') || entry.token.includes('/'))) ||
      (entry.category === 'native' && (entry.token.includes('/') || entry.token.includes('::')))
  )
}

function identifierPhrases(vocabulary: CompilerSemanticVocabularyEntry[]): VocabularyPhraseIndex {
  const phrases: VocabularyPhraseIndex = new Map()

  for (const entry of vocabulary) {
    if (entry.category !== 'api-member' && entry.category !== 'api-root' && entry.category !== 'native') {
      continue
    }

    if (!isSimpleIdentifier(entry.token) || hostImplementationTypeNames.has(entry.token)) {
      continue
    }

    const words = identifierWords(entry.token)

    if (words.length === 0) {
      continue
    }

    const firstWord = words[0]
    const candidates = phrases.get(firstWord) ?? []
    candidates.push({ entry, words })
    phrases.set(firstWord, candidates)
  }

  return phrases
}

function visitCompilerSource(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  file: string,
  exact: Map<string, CompilerSemanticVocabularyEntry[]>,
  substring: CompilerSemanticVocabularyEntry[],
  phrases: VocabularyPhraseIndex,
  tails: CompilerSemanticTail[],
  seen: Set<string>
): void {
  if (isTextLikeNode(node)) {
    checkTextNode(node, sourceFile, file, exact, substring, tails, seen)
  }

  if (ts.isIdentifier(node)) {
    checkIdentifier(node, sourceFile, file, exact, phrases, tails, seen)
  }

  ts.forEachChild(node, (child) =>
    visitCompilerSource(child, sourceFile, file, exact, substring, phrases, tails, seen)
  )
}

function checkTextNode(
  node: ts.StringLiteralLike | ts.TemplateLiteralToken,
  sourceFile: ts.SourceFile,
  file: string,
  exact: Map<string, CompilerSemanticVocabularyEntry[]>,
  substring: CompilerSemanticVocabularyEntry[],
  tails: CompilerSemanticTail[],
  seen: Set<string>
): void {
  const text = node.text
  const exactEntries = exact.get(text) ?? []

  for (const entry of exactEntries) {
    if (isAllowedHostImport(node, file, entry.token) || isAllowedCoreProfileUse(node, sourceFile, entry.token)) {
      continue
    }

    if (isUnconditionalTextEntry(entry) || isSemanticLiteralUse(node, entry)) {
      addSemanticTail(tails, seen, sourceFile, file, node, entry, textNodeContext(node))
    }
  }

  for (const entry of substring) {
    if (entry.token === text || !textContainsToken(text, entry.token)) {
      continue
    }

    if (isAllowedHostImport(node, file, entry.token)) {
      continue
    }

    addSemanticTail(tails, seen, sourceFile, file, node, entry, 'text-substring')
  }
}

function checkIdentifier(
  node: ts.Identifier,
  sourceFile: ts.SourceFile,
  file: string,
  exact: Map<string, CompilerSemanticVocabularyEntry[]>,
  phrases: VocabularyPhraseIndex,
  tails: CompilerSemanticTail[],
  seen: Set<string>
): void {
  if (isAllowedHostImportIdentifier(node, file) || isHostAdapterIdentifier(node)) {
    return
  }

  if (isFixedSemanticProperty(node)) {
    for (const entry of exact.get(node.text) ?? []) {
      if (entry.category === 'identity') {
        addSemanticTail(tails, seen, sourceFile, file, node, entry, 'fixed-property-dispatch')
      }
    }
  }

  const words = identifierWords(node.text)

  for (const word of words) {
    for (const phrase of phrases.get(word) ?? []) {
      if (!containsWordSequence(words, phrase.words)) {
        continue
      }

      const exactIdentifier = node.text === phrase.entry.token

      if (
        exactIdentifier &&
        phrase.entry.token.slice(0, 1) === phrase.entry.token.slice(0, 1).toLowerCase()
      ) {
        continue
      }

      if (!exactIdentifier && !isDedicatedIdentifierUse(words, phrase)) {
        continue
      }

      if (exactIdentifier && phrase.entry.category === 'api-member') {
        continue
      }

      addSemanticTail(tails, seen, sourceFile, file, node, phrase.entry, 'dedicated-identifier')
    }
  }
}

function isDedicatedIdentifierUse(words: string[], phrase: VocabularyPhrase): boolean {
  const lowerCaseSingleWord =
    phrase.words.length === 1 &&
    phrase.entry.token.slice(0, 1) === phrase.entry.token.slice(0, 1).toLowerCase()

  if (!lowerCaseSingleWord) {
    return containsDedicatedIdentifierMarker(words)
  }

  if (
    (phrase.entry.token.length > 2 && !/[0-9]/.test(phrase.entry.token)) ||
    dedicatedIdentifierMarkers.has(phrase.words[0])
  ) {
    return false
  }

  if (phrase.entry.category === 'api-root') {
    return words.includes('global') || words.includes('builtin')
  }

  if (phrase.entry.category === 'api-member') {
    return words.includes('member') || words.includes('method') || words.includes('property')
  }

  return false
}

function isUnconditionalTextEntry(entry: CompilerSemanticVocabularyEntry): boolean {
  if (entry.category === 'identity') {
    return entry.token.includes(':') || entry.token.includes('#') || entry.token.startsWith('--')
  }

  if (entry.category === 'native') {
    return true
  }

  if (entry.category === 'behavior') {
    return entry.token.startsWith('INOX_') || entry.token.includes(' ')
  }

  return false
}

function isSemanticLiteralUse(node: ts.Node, entry: CompilerSemanticVocabularyEntry): boolean {
  if (entry.category === 'api-member') {
    return isApiMemberLiteralUse(node)
  }

  if (entry.category === 'option-value') {
    return isOptionValueLiteralUse(node)
  }

  if (entry.category === 'behavior') {
    return isBehaviorLiteralUse(node)
  }

  if (entry.category === 'api-root') {
    return isApiRootLiteralUse(node)
  }

  const parent = node.parent

  if (ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent)) {
    return true
  }

  if (
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
  ) {
    return true
  }

  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true
  }

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return semanticMetadataPropertyNames.has(propertyNameText(parent.name) ?? '')
  }

  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.indexOf(node as ts.Expression)

    if (argumentIndex >= 0 && isSemanticCall(parent, argumentIndex)) {
      return true
    }
  }

  return isInsideCollectionInitializer(node)
}

function isApiMemberLiteralUse(node: ts.Node): boolean {
  const parent = node.parent

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return semanticMetadataPropertyNames.has(propertyNameText(parent.name) ?? '')
  }

  if (ts.isBinaryExpression(parent)) {
    return semanticExpressionText(binaryOtherOperand(parent, node))
  }

  if (ts.isCaseClause(parent)) {
    return semanticExpressionText(parent.parent.parent.expression)
  }

  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.indexOf(node as ts.Expression)
    return argumentIndex >= 0 && isSemanticCall(parent, argumentIndex)
  }

  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return semanticExpressionText(parent.expression)
  }

  return false
}

function isApiRootLiteralUse(node: ts.Node): boolean {
  const parent = node.parent

  if (ts.isBinaryExpression(parent)) {
    return semanticExpressionText(binaryOtherOperand(parent, node))
  }

  if (ts.isCaseClause(parent)) {
    return semanticExpressionText(parent.parent.parent.expression)
  }

  if (ts.isLiteralTypeNode(parent)) {
    return true
  }

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return semanticMetadataPropertyNames.has(propertyNameText(parent.name) ?? '')
  }

  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.indexOf(node as ts.Expression)
    return argumentIndex >= 0 && isSemanticCall(parent, argumentIndex)
  }

  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return semanticExpressionText(parent.expression)
  }

  return isInsideCollectionInitializer(node)
}

function isOptionValueLiteralUse(node: ts.Node): boolean {
  const parent = node.parent

  if (!ts.isBinaryExpression(parent)) {
    return false
  }

  const text = binaryOtherOperand(parent, node).getText().toLowerCase()
  return text.includes('backend') || text.includes('libraryoption') || text.includes('optionvalue')
}

function isBehaviorLiteralUse(node: ts.Node): boolean {
  const parent = node.parent

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return semanticMetadataPropertyNames.has(propertyNameText(parent.name) ?? '')
  }

  if (ts.isBinaryExpression(parent)) {
    return semanticExpressionText(binaryOtherOperand(parent, node))
  }

  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.indexOf(node as ts.Expression)
    return argumentIndex >= 0 && isSemanticCall(parent, argumentIndex)
  }

  return false
}

function binaryOtherOperand(expression: ts.BinaryExpression, node: ts.Node): ts.Expression {
  return expression.left === node ? expression.right : expression.left
}

function semanticExpressionText(expression: ts.Expression): boolean {
  const text = expression.getText().toLowerCase()

  for (const marker of semanticCallNameMarkers) {
    if (text.includes(marker)) {
      return true
    }
  }

  return text.includes('callee') || text.includes('property')
}

function isSemanticCall(call: ts.CallExpression, argumentIndex: number): boolean {
  if (ts.isPropertyAccessExpression(call.expression)) {
    const method = call.expression.name.text

    if (membershipMethodNames.has(method) && argumentIndex === 0) {
      return semanticExpressionText(call.expression.expression)
    }
  }

  const callee = call.expression.getText().toLowerCase()

  for (const marker of semanticCallNameMarkers) {
    if (callee.includes(marker)) {
      return true
    }
  }

  return false
}

function isInsideCollectionInitializer(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  let depth = 0

  while (typeof current !== 'undefined' && depth < 6) {
    if (
      ts.isNewExpression(current) &&
      ts.isIdentifier(current.expression) &&
      (current.expression.text === 'Map' || current.expression.text === 'Set')
    ) {
      return true
    }

    if (ts.isStatement(current)) {
      return false
    }

    current = current.parent
    depth = depth + 1
  }

  return false
}

function isFixedSemanticProperty(node: ts.Identifier): boolean {
  const parent = node.parent

  if (!ts.isPropertyAccessExpression(parent) || parent.name !== node) {
    return false
  }

  const receiver = parent.expression.getText().toLowerCase()

  return (
    receiver.endsWith('capabilities')
  )
}

function isAllowedHostImport(
  node: ts.StringLiteralLike | ts.TemplateLiteralToken,
  file: string,
  token: string
): boolean {
  const parent = node.parent

  if (!ts.isStringLiteralLike(node)) {
    return false
  }

  if (
    (!ts.isImportDeclaration(parent) && !ts.isExportDeclaration(parent)) ||
    parent.moduleSpecifier !== node
  ) {
    return false
  }

  return hostImportSpecifiers.get(file)?.has(token) === true
}

function isAllowedHostImportIdentifier(node: ts.Identifier, file: string): boolean {
  if (!hostImportSpecifiers.has(file)) {
    return false
  }

  const importDeclaration = enclosingImportDeclaration(node)

  return (
    importDeclaration !== null &&
    ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
    hostImportSpecifiers.get(file)?.has(importDeclaration.moduleSpecifier.text) === true
  )
}

function isHostAdapterIdentifier(node: ts.Identifier): boolean {
  return containsWordSequence(identifierWords(node.text), ['node', 'compiler', 'host'])
}

function enclosingImportDeclaration(node: ts.Node): ts.ImportDeclaration | null {
  let current: ts.Node | undefined = node.parent

  while (typeof current !== 'undefined') {
    if (ts.isImportDeclaration(current)) {
      return current
    }

    if (ts.isStatement(current)) {
      return null
    }

    current = current.parent
  }

  return null
}

function isAllowedCoreProfileUse(node: ts.Node, sourceFile: ts.SourceFile, token: string): boolean {
  if (token !== 'embedded' && token !== 'hosted') {
    return false
  }

  const typeAlias = enclosingTypeAlias(node)

  if (typeAlias?.name.text === 'RuntimeProfile') {
    return true
  }

  const parent = node.parent

  if (!ts.isBinaryExpression(parent)) {
    return false
  }

  const other = parent.left === node ? parent.right : parent.left

  return other.getText(sourceFile) === 'options.profile'
}

function enclosingTypeAlias(node: ts.Node): ts.TypeAliasDeclaration | null {
  let current: ts.Node | undefined = node.parent

  while (typeof current !== 'undefined') {
    if (ts.isTypeAliasDeclaration(current)) {
      return current
    }

    if (ts.isStatement(current)) {
      return null
    }

    current = current.parent
  }

  return null
}

function isTextLikeNode(
  node: ts.Node
): node is ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  )
}

function textNodeContext(node: ts.Node): string {
  const parent = node.parent

  if (ts.isBinaryExpression(parent)) {
    return 'binary-comparison'
  }

  if (ts.isCaseClause(parent)) {
    return 'switch-case'
  }

  if (ts.isLiteralTypeNode(parent)) {
    return 'literal-union'
  }

  if (ts.isCallExpression(parent)) {
    return 'call-argument'
  }

  if (ts.isPropertyAssignment(parent)) {
    return 'property-dispatch'
  }

  return 'text-literal'
}

function addSemanticTail(
  tails: CompilerSemanticTail[],
  seen: Set<string>,
  sourceFile: ts.SourceFile,
  file: string,
  node: ts.Node,
  entry: CompilerSemanticVocabularyEntry,
  context: string
): void {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const key = `${file}\0${position.line}\0${position.character}\0${entry.owner}\0${entry.category}\0${entry.token}`

  if (seen.has(key)) {
    return
  }

  seen.add(key)
  tails.push({
    ...entry,
    column: position.character + 1,
    context,
    file,
    line: position.line + 1
  })
}

function identifierWords(value: string): string[] {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
}

function containsWordSequence(words: string[], phrase: string[]): boolean {
  if (phrase.length > words.length) {
    return false
  }

  for (let start = 0; start + phrase.length <= words.length; start = start + 1) {
    let matches = true

    for (let index = 0; index < phrase.length; index = index + 1) {
      if (words[start + index] !== phrase[index]) {
        matches = false
        break
      }
    }

    if (matches) {
      return true
    }
  }

  return false
}

function containsDedicatedIdentifierMarker(words: string[]): boolean {
  for (const word of words) {
    if (dedicatedIdentifierMarkers.has(word)) {
      return true
    }
  }

  return false
}

function textContainsToken(text: string, token: string): boolean {
  let index = text.indexOf(token)

  while (index >= 0) {
    const before = index === 0 ? '' : text[index - 1]
    const afterIndex = index + token.length
    const after = afterIndex === text.length ? '' : text[afterIndex]

    if (!isIdentifierCharacter(before) && !isIdentifierCharacter(after)) {
      return true
    }

    index = text.indexOf(token, index + 1)
  }

  return false
}

function isIdentifierCharacter(value: string): boolean {
  return /^[A-Za-z0-9_$]$/.test(value)
}

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
}

function compareSemanticTails(left: CompilerSemanticTail, right: CompilerSemanticTail): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.token.localeCompare(right.token) ||
    left.owner.localeCompare(right.owner)
  )
}

function projectPath(path: string): string {
  const absolute = resolve(path)
  return relative(projectRoot, absolute).split(sep).join('/')
}
