import { diagnostic, quoteDiagnosticString, throwDiagnostics } from './diagnostics.ts'
import {
  createAliasType,
  createClassDeclaration,
  createExportDeclaration,
  createFieldDefinition,
  createFunctionDeclaration,
  createFunctionType,
  createImportDeclaration,
  createImportSpecifier,
  createMethodDefinition,
  createObjectType,
  createObjectTypeField,
  createParam,
  createTypeAliasDeclaration,
  createVariableDeclaration
} from './parser/declarations.ts'
import {
  createArrayLiteral,
  createArrowFunction,
  createAssignmentExpression,
  createAwaitExpression,
  createBinaryExpression,
  createBooleanLiteral,
  createCallExpression,
  createConditionalExpression,
  createIndexExpression,
  createMemberExpression,
  createNewExpression,
  createNullLiteral,
  createNumberLiteral,
  createObjectKey,
  createObjectLiteral,
  createObjectProperty,
  createOptionalCallTarget,
  createOptionalIndexExpression,
  createOptionalMemberExpression,
  createReference,
  createReferenceFromName,
  createStringLiteral,
  createTemplateLiteral,
  createThisExpression,
  createTypeAssertionExpression,
  createUnaryExpression,
  createUpdateExpression
} from './parser/expressions.ts'
import { locFromToken } from './parser/locations.ts'
import { readTypeAnnotation } from './parser/type-annotations.ts'
import type { AnyNode, Diagnostic, ProgramNode, SourceLocation, Token } from './types.ts'

export function parse(tokens: Token[]): ProgramNode {
  const parser = new Parser(tokens)
  return parser.parseProgram()
}

type FieldModifiers = {
  readOnly: boolean
  weakToken: Token | null
}

type TypeAnnotationOptions = {
  stopAtLineBreak?: boolean
  stopAtStatementBoundary?: boolean
}

function pushAllNodes(target: AnyNode[], source: AnyNode[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    const node = source[index]

    target.push(node)
  }
}

function ownershipFromWeakToken(weakToken: Token | null): string {
  if (weakToken === null || typeof weakToken === 'undefined') {
    return 'strong'
  }

  return 'weak'
}

function stringArrayIncludes(values: string[], value: string): boolean {
  for (const item of values) {
    if (item === value) {
      return true
    }
  }

  return false
}

function typeAnnotationOptionsOrEmpty(options: TypeAnnotationOptions | null): TypeAnnotationOptions {
  if (options !== null && typeof options !== 'undefined') {
    return options
  }

  return {}
}

function stringArrayOrEmpty(values: string[] | null): string[] {
  if (values !== null && typeof values !== 'undefined') {
    return values
  }

  return []
}

function cloneObjectTypeField(field: AnyNode): AnyNode {
  const cloned: AnyNode = {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly === true,
    ownership: ownershipFromWeakToken(null),
    weakLoc: null,
    valueType: field.valueType,
    loc: field.loc
  }

  if (field.ownership !== null && typeof field.ownership !== 'undefined') {
    cloned.ownership = field.ownership
  }

  if (field.weakLoc !== null && typeof field.weakLoc !== 'undefined') {
    cloned.weakLoc = field.weakLoc
  }

  if (field.functionType !== null && typeof field.functionType !== 'undefined') {
    cloned.functionType = field.functionType
  }

  if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
    cloned.declaredType = field.declaredType
  }

  return cloned
}

function findObjectTypeFieldIndex(fields: AnyNode[], name: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === name) {
      return index
    }
  }

  return -1
}

function mergeUnionObjectTypes(variants: AnyNode[]): AnyNode {
  const fields: AnyNode[] = []
  const counts: Map<string, number> = new Map()
  let dynamic = false
  let dynamicField: AnyNode | null = null

  for (const variant of variants) {
    dynamic = dynamic || variant.dynamic === true

    if (dynamicField === null && variant.dynamicField !== null && typeof variant.dynamicField !== 'undefined') {
      dynamicField = variant.dynamicField
    }

    for (const field of variant.fields) {
      const name: string = field.name
      const count = counts.get(name)
      const existingIndex = findObjectTypeFieldIndex(fields, name)
      let nextCount = 1

      if (count !== null && typeof count !== 'undefined') {
        nextCount = count + 1
      }

      counts.set(name, nextCount)

      if (existingIndex === -1) {
        fields.push(cloneObjectTypeField(field))
      }
    }
  }

  for (const field of fields) {
    const count = counts.get(field.name)
    let fieldCount = 0

    if (count !== null && typeof count !== 'undefined') {
      fieldCount = count
    }

    if (field.optional === true || fieldCount !== variants.length) {
      field.optional = true
    }
  }

  return createObjectType(fields, [], dynamic, dynamicField)
}

class Parser {
  tokens: Token[]
  position: number
  diagnostics: Diagnostic[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.position = 0
    this.diagnostics = []
  }

  parseProgram(): ProgramNode {
    const body: AnyNode[] = []

    while (!this.is('eof')) {
      if (this.matchValue(';')) {
        continue
      }

      body.push(this.parseTopLevelItem())
    }

    throwDiagnostics(this.diagnostics)

    return {
      type: 'Program',
      body
    }
  }

  parseTopLevelItem(): AnyNode {
    if (this.matchKeyword('import')) {
      return this.parseImportDeclaration(false)
    }

    const exported = this.matchKeyword('export')

    const isAsync = this.matchKeyword('async')

    if (this.matchKeyword('function')) {
      return this.parseFunctionDeclaration(exported, isAsync)
    }

    if (isAsync) {
      this.report('INOX_EXPECTED_FUNCTION', 'expected function after async', null)
    }

    if (this.matchKeyword('class')) {
      return this.parseClassDeclaration(exported)
    }

    if (exported && this.isValue('{')) {
      return this.parseExportDeclaration(false)
    }

    if (this.matchKeyword('type')) {
      if (exported && this.isValue('{')) {
        return this.parseExportDeclaration(true)
      }

      return this.parseTypeAliasDeclaration(exported)
    }

    if (exported && this.matchKeyword('const')) {
      return this.parseVariableDeclaration('const', true)
    }

    if (exported && this.matchKeyword('let')) {
      return this.parseVariableDeclaration('let', true)
    }

    if (exported) {
      this.report('INOX_EXPECTED_EXPORT', 'expected exported function or variable declaration', null)
    }

    return this.parseStatement()
  }

  parseImportDeclaration(typeOnly: boolean): AnyNode {
    let importTypeOnly = typeOnly

    if (this.matchKeyword('type')) {
      importTypeOnly = true
    }

    const specifiers: AnyNode[] = []

    if (this.is('identifier')) {
      const local = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected default import name')

      specifiers.push(createImportSpecifier('default', local.value, local, true))

      this.matchValue(',')
    }

    if (this.matchValue('{')) {
      pushAllNodes(specifiers, this.parseNamedImportSpecifiers())
    }

    if (specifiers.length === 0) {
      this.report('INOX_UNSUPPORTED_IMPORT', 'expected ESM default or named import specifiers', null)
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    this.expectKeyword('from', 'INOX_EXPECTED_IMPORT', 'expected from after import specifiers')
    const source = this.expect('string', 'INOX_EXPECTED_IMPORT', 'expected import source string')
    this.matchValue(';')

    return createImportDeclaration(importTypeOnly, specifiers, source)
  }

  parseExportDeclaration(typeOnly: boolean): AnyNode {
    const specifiers: AnyNode[] = []

    if (this.matchValue('{')) {
      pushAllNodes(specifiers, this.parseNamedImportSpecifiers())
    }

    if (specifiers.length === 0) {
      this.report('INOX_UNSUPPORTED_EXPORT', 'expected named export specifiers', null)
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    this.expectKeyword('from', 'INOX_EXPECTED_EXPORT', 'expected from after export specifiers')
    const source = this.expect('string', 'INOX_EXPECTED_EXPORT', 'expected export source string')
    this.matchValue(';')

    return createExportDeclaration(typeOnly, specifiers, source)
  }

  parseNamedImportSpecifiers(): AnyNode[] {
    const specifiers: AnyNode[] = []

    while (!this.isValue('}') && !this.is('eof')) {
      const imported = this.parseImportSpecifierName()
      let local = imported.value

      if (this.matchIdentifier('as')) {
        local = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected local import name').value
      }

      specifiers.push(createImportSpecifier(imported.value, local, imported, false))

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue('}', 'INOX_EXPECTED_IMPORT', 'expected } after import specifiers')

    return specifiers
  }

  parseImportSpecifierName(): Token {
    if (this.is('identifier') || this.is('keyword')) {
      return this.advance()
    }

    return this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected imported name')
  }

  parseFunctionDeclaration(exported: boolean, isAsync: boolean): AnyNode {
    const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected function name')
    const params: AnyNode[] = []

    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after function name')

    while (!this.isValue(')') && !this.is('eof')) {
      params.push(this.parseRuntimeParam())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after function parameters')
    let returnType = 'void'

    if (this.matchValue(':')) {
      returnType = this.parseTypeAnnotation(['{'], null)
    }

    return createFunctionDeclaration({
      exported,
      isAsync,
      name,
      params,
      returnType,
      body: this.parseBlock()
    })
  }

  parseTypeAliasDeclaration(exported: boolean): AnyNode {
    const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected type alias name')
    this.expectValue('=', 'INOX_EXPECTED_TYPE', 'expected = after type alias name')

    if (this.isValue('(')) {
      return createTypeAliasDeclaration(exported, name, this.parseFunctionType(false))
    }

    if (this.is('identifier') && this.peek(1).value === '&') {
      return createTypeAliasDeclaration(exported, name, this.parseIntersectionObjectType())
    }

    if (this.isValue('|') && this.peek(1).value === '{') {
      return createTypeAliasDeclaration(exported, name, this.parseUnionObjectType())
    }

    if (this.isValue('{')) {
      return createTypeAliasDeclaration(exported, name, this.parseObjectType(null))
    }

    const valueType = this.parseTypeAnnotation([';'], {
      stopAtStatementBoundary: true
    })
    this.matchValue(';')

    return createTypeAliasDeclaration(exported, name, createAliasType(valueType))
  }

  parseUnionObjectType(): AnyNode {
    const variants: AnyNode[] = []

    while (this.matchValue('|')) {
      if (!this.isValue('{')) {
        this.report('INOX_EXPECTED_TYPE', 'expected object type after | in union type', this.current())
        break
      }

      variants.push(this.parseObjectType(null))
    }

    this.matchValue(';')

    return mergeUnionObjectTypes(variants)
  }

  parseFunctionType(stopReturnAtLineBreak: boolean): AnyNode {
    const params: AnyNode[] = []

    this.expectValue('(', 'INOX_EXPECTED_TYPE', 'expected ( in function type')

    while (!this.isValue(')') && !this.is('eof')) {
      const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected function type parameter name')
      const optional = this.matchValue('?')
      this.expectValue(':', 'INOX_EXPECTED_TYPE', 'expected : after function type parameter name')
      const valueType = this.parseTypeAnnotation([',', ')'], null)

      params.push(createParam(name, valueType, optional))

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_TYPE', 'expected ) after function type parameters')
    this.expectValue('=>', 'INOX_EXPECTED_ARROW', 'expected => in function type')
    let returnTypeOptions: TypeAnnotationOptions = { stopAtStatementBoundary: true }

    if (stopReturnAtLineBreak) {
      returnTypeOptions = { stopAtLineBreak: true }
    }

    const returnType = this.parseTypeAnnotation([';', ',', '}'], returnTypeOptions)
    this.matchValue(';')

    return createFunctionType(params, returnType)
  }

  parseIntersectionObjectType() {
    const baseTypes: string[] = []

    while (this.is('identifier')) {
      baseTypes.push(this.advance().value)

      if (!this.matchValue('&')) {
        break
      }

      if (this.isValue('{')) {
        return this.parseObjectType(baseTypes)
      }
    }

    this.skipStatement()

    return createObjectType([], baseTypes, true)
  }

  parseObjectType(baseTypes: string[] | null): AnyNode {
    const actualBaseTypes = stringArrayOrEmpty(baseTypes)
    const fields: AnyNode[] = []
    let dynamic = false
    let dynamicField: AnyNode | null = null

    this.expectValue('{', 'INOX_EXPECTED_TYPE', 'expected { in object type')

    while (!this.isValue('}') && !this.is('eof')) {
      if (this.isValue('[')) {
        dynamic = true
        dynamicField = this.parseTypeIndexSignature()
        this.matchValue(',')
        this.matchValue(';')
        continue
      }

      const modifiers = this.parseFieldModifiers()
      const name = this.expectTypeFieldName()
      const optional = this.matchValue('?')

      if (this.isValue('(')) {
        const field = createObjectTypeField(
          name,
          modifiers.readOnly,
          optional,
          'function',
          ownershipFromWeakToken(modifiers.weakToken),
          modifiers.weakToken
        )
        field.functionType = this.parseObjectTypeMethodSignature()
        fields.push(field)
        this.matchValue(',')
        this.matchValue(';')
        continue
      }

      this.expectValue(':', 'INOX_EXPECTED_TYPE', 'expected : after object type field name')
      if (this.isValue('(')) {
        const field = createObjectTypeField(
          name,
          modifiers.readOnly,
          optional,
          'function',
          ownershipFromWeakToken(modifiers.weakToken),
          modifiers.weakToken
        )

        field.functionType = this.parseFunctionType(true)
        fields.push(field)
        this.matchValue(',')
        this.matchValue(';')
        continue
      }

      const valueType = this.parseTypeAnnotation([',', ';', '}'], {
        stopAtLineBreak: true
      })

      fields.push(
        createObjectTypeField(
          name,
          modifiers.readOnly,
          optional,
          valueType,
          ownershipFromWeakToken(modifiers.weakToken),
          modifiers.weakToken
        )
      )

      this.matchValue(',')
      this.matchValue(';')
    }

    this.expectValue('}', 'INOX_EXPECTED_TYPE', 'expected } after object type')
    this.matchValue(';')

    return createObjectType(fields, actualBaseTypes, dynamic, dynamicField)
  }

  parseObjectTypeMethodSignature() {
    const params: AnyNode[] = []

    this.expectValue('(', 'INOX_EXPECTED_TYPE', 'expected ( in object type method')

    while (!this.isValue(')') && !this.is('eof')) {
      const name = this.expectTypeParameterName()
      const optional = this.matchValue('?')
      this.expectValue(':', 'INOX_EXPECTED_TYPE', 'expected : after method type parameter name')
      const valueType = this.parseTypeAnnotation([',', ')'], null)

      params.push(createParam(name, valueType, optional))

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_TYPE', 'expected ) after object type method parameters')
    this.expectValue(':', 'INOX_EXPECTED_TYPE', 'expected : after object type method parameters')
    const returnType = this.parseTypeAnnotation([',', ';', '}'], {
      stopAtLineBreak: true
    })

    return createFunctionType(params, returnType)
  }

  parseTypeIndexSignature(): AnyNode | null {
    const start = this.expectValue('[', 'INOX_EXPECTED_TYPE', 'expected [ in type index signature')

    while (!this.is('eof') && !this.isValue(']')) {
      this.advance()
    }

    this.expectValue(']', 'INOX_EXPECTED_TYPE', 'expected ] after type index signature')

    let valueType = 'unknown'

    if (this.matchValue(':')) {
      valueType = this.parseTypeAnnotation([',', ';', '}'], {
        stopAtLineBreak: true
      })
    }

    return {
      name: '',
      optional: false,
      readonly: false,
      ownership: 'strong',
      valueType,
      loc: locFromToken(start)
    }
  }

  expectTypeFieldName(): Token {
    if (this.is('identifier') || this.is('keyword')) {
      return this.advance()
    }

    return this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected object type field name')
  }

  expectTypeParameterName(): Token {
    if (this.is('identifier') || this.is('keyword')) {
      return this.advance()
    }

    return this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected method type parameter name')
  }

  parseClassDeclaration(exported: boolean): AnyNode {
    const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected class name')
    const fields: AnyNode[] = []
    const methods: AnyNode[] = []
    let extendsName: string | null = null

    const extendsToken = this.matchContextualKeyword('extends')

    if (extendsToken !== null && typeof extendsToken !== 'undefined') {
      const base = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected base class name')
      extendsName = base.value
    }

    this.expectValue('{', 'INOX_EXPECTED_BLOCK', 'expected { after class name')

    while (!this.isValue('}') && !this.is('eof')) {
      const member = this.parseClassMember()

      if (member.type === 'FieldDefinition') {
        fields.push(member)
      } else {
        methods.push(member)
      }
    }

    this.expectValue('}', 'INOX_EXPECTED_BLOCK', 'expected } after class body')

    return createClassDeclaration({
      exported,
      name,
      extendsName,
      extendsToken,
      fields,
      methods
    })
  }

  parseClassMember(): AnyNode {
    const staticToken = this.matchClassStaticModifier()
    const modifiers = this.parseFieldModifiers()
    const name = this.parseClassMemberName()

    if (
      !modifiers.readOnly &&
      (modifiers.weakToken === null || typeof modifiers.weakToken === 'undefined') &&
      this.isValue('(')
    ) {
      return this.parseClassMethod(name, staticToken)
    }

    if (
      (modifiers.readOnly || (modifiers.weakToken !== null && typeof modifiers.weakToken !== 'undefined')) &&
      this.isValue('(')
    ) {
      this.report('INOX_EXPECTED_TYPE', 'class method ownership modifiers are not supported; use fields', null)
    }

    this.expectValue(':', 'INOX_EXPECTED_TYPE', 'expected : after class field name')
    const valueType = this.parseTypeAnnotation([';', '}'], {
      stopAtLineBreak: true
    })
    this.matchValue(';')

    return createFieldDefinition({
      name,
      staticToken,
      readOnly: modifiers.readOnly,
      ownership: ownershipFromWeakToken(modifiers.weakToken),
      weakToken: modifiers.weakToken,
      valueType
    })
  }

  parseFieldModifiers(): FieldModifiers {
    let readOnly = false
    let weakToken: Token | null = null
    let matched = true

    while (matched) {
      matched = false

      if (!readOnly && this.matchKeyword('readonly')) {
        readOnly = true
        matched = true
        continue
      }

      if ((weakToken === null || typeof weakToken === 'undefined') && this.isWeakFieldModifier()) {
        weakToken = this.advance()
        matched = true
      }
    }

    return { readOnly, weakToken }
  }

  parseClassMethod(name: Token, staticToken: Token | null): AnyNode {
    const params: AnyNode[] = []

    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after method name')

    while (!this.isValue(')') && !this.is('eof')) {
      params.push(this.parseRuntimeParam())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after method parameters')
    let returnType = 'unknown'

    if (name.value === 'constructor') {
      returnType = 'void'
    }

    if (this.matchValue(':')) {
      returnType = this.parseTypeAnnotation(['{'], null)
    }

    return createMethodDefinition({
      name,
      staticToken,
      params,
      returnType,
      body: this.parseBlock()
    })
  }

  parseClassMemberName(): Token {
    if (this.is('identifier') || this.isKeywordValue('constructor')) {
      return this.advance()
    }

    return this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected method name')
  }

  matchClassStaticModifier(): Token | null {
    if (!this.isContextualKeyword('static')) {
      return null
    }

    const next = this.peek(1)

    if (next.type !== 'identifier' && !this.isClassStaticKeywordFollower(next.value)) {
      return null
    }

    return this.advance()
  }

  isClassStaticKeywordFollower(value: string): boolean {
    if (value === 'constructor') {
      return true
    }

    if (value === 'readonly') {
      return true
    }

    return false
  }

  parseBlock(): AnyNode[] {
    const body: AnyNode[] = []

    this.expectValue('{', 'INOX_EXPECTED_BLOCK', 'expected {')

    while (!this.isValue('}') && !this.is('eof')) {
      body.push(this.parseStatement())
    }

    this.expectValue('}', 'INOX_EXPECTED_BLOCK', 'expected }')

    return body
  }

  parseStatement(): AnyNode {
    if (this.isValue('{')) {
      return {
        type: 'BlockStatement',
        body: this.parseBlock()
      }
    }

    if (this.matchKeyword('import')) {
      this.report('INOX_NO_DYNAMIC_IMPORT', 'dynamic import is not supported; use static ESM imports', null)
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    if (this.matchKeyword('if')) {
      return this.parseIfStatement(this.previous())
    }

    if (this.matchKeyword('while')) {
      return this.parseWhileStatement(this.previous())
    }

    if (this.matchKeyword('for')) {
      return this.parseForStatement(this.previous())
    }

    if (this.matchKeyword('switch')) {
      return this.parseSwitchStatement(this.previous())
    }

    if (this.matchKeyword('try')) {
      return this.parseTryStatement(this.previous())
    }

    if (this.matchKeyword('break')) {
      const token = this.previous()
      this.matchValue(';')

      return {
        type: 'BreakStatement',
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('continue')) {
      const token = this.previous()
      this.matchValue(';')

      return {
        type: 'ContinueStatement',
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('throw')) {
      const token = this.previous()
      const argument = this.parseExpression()
      this.matchValue(';')

      return {
        type: 'ThrowStatement',
        argument,
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('const')) {
      return this.parseVariableDeclaration('const', false)
    }

    if (this.matchKeyword('let')) {
      return this.parseVariableDeclaration('let', false)
    }

    if (this.matchKeyword('var')) {
      this.report('INOX_NO_VAR', '`var` is not supported; use `let` or `const`', null)
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    if (this.matchKeyword('return')) {
      const token = this.previous()
      let argument: AnyNode | null = null

      if (!this.isValue('}') && !this.isValue(';')) {
        argument = this.parseExpression()
      }
      this.matchValue(';')

      return {
        type: 'ReturnStatement',
        argument,
        loc: locFromToken(token)
      }
    }

    const expression = this.parseExpression()
    this.matchValue(';')

    return {
      type: 'ExpressionStatement',
      expression
    }
  }

  parseIfStatement(start: Token): AnyNode {
    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after if')
    const condition = this.parseExpression()
    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after if condition')
    const consequent = this.parseStatement()
    let alternate: AnyNode | null = null

    if (this.matchKeyword('else')) {
      if (this.matchKeyword('if')) {
        alternate = this.parseIfStatement(this.previous())
      } else {
        alternate = this.parseStatement()
      }
    }

    return {
      type: 'IfStatement',
      condition,
      consequent,
      alternate,
      loc: locFromToken(start)
    }
  }

  parseTryStatement(start: Token): AnyNode {
    const block = {
      type: 'BlockStatement',
      body: this.parseBlock(),
      loc: locFromToken(start)
    }
    let handler: AnyNode | null = null
    let finalizer: AnyNode | null = null

    if (this.matchKeyword('catch')) {
      const token = this.previous()
      let param: string | null = null
      let paramLoc: SourceLocation | null = null

      if (this.matchValue('(')) {
        const paramToken = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected catch binding name')
        param = paramToken.value
        paramLoc = locFromToken(paramToken)
        this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after catch binding')
      }

      handler = {
        type: 'CatchClause',
        param,
        paramLoc,
        body: {
          type: 'BlockStatement',
          body: this.parseBlock(),
          loc: locFromToken(token)
        },
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('finally')) {
      const token = this.previous()
      finalizer = {
        type: 'BlockStatement',
        body: this.parseBlock(),
        loc: locFromToken(token)
      }
    }

    if (
      (handler === null || typeof handler === 'undefined') &&
      (finalizer === null || typeof finalizer === 'undefined')
    ) {
      this.report('INOX_EXPECTED_TRY_HANDLER', 'try must be followed by catch or finally', start)
    }

    return {
      type: 'TryStatement',
      block,
      handler,
      finalizer,
      loc: locFromToken(start)
    }
  }

  parseWhileStatement(start: Token): AnyNode {
    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after while')
    const condition = this.parseExpression()
    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after while condition')

    return {
      type: 'WhileStatement',
      condition,
      body: this.parseStatement(),
      loc: locFromToken(start)
    }
  }

  parseForStatement(start: Token): AnyNode {
    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after for')

    if (this.isForInHeader()) {
      return this.parseUnsupportedForInStatement()
    }

    if (this.isForOfHeader()) {
      return this.parseForOfStatement(start)
    }

    const init = this.parseForInitializer()
    let test: AnyNode | null = null

    if (!this.isValue(';')) {
      test = this.parseExpression()
    }
    this.expectValue(';', 'INOX_EXPECTED_SEMICOLON', 'expected ; after for condition')
    let update: AnyNode | null = null

    if (!this.isValue(')')) {
      update = this.parseExpression()
    }
    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after for update')

    return {
      type: 'ForStatement',
      init,
      test,
      update,
      body: this.parseStatement(),
      loc: locFromToken(start)
    }
  }

  parseForOfStatement(start: Token): AnyNode {
    const kindToken = this.advance()
    const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected for-of binding name')
    let declaredType: string | null = null

    if (this.matchValue(':')) {
      declaredType = this.parseTypeAnnotation(['of'], null)
    }
    this.expectKeyword('of', 'INOX_EXPECTED_OF', 'expected of in for-of statement')
    const iterable = this.parseExpression()
    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after for-of iterable')

    return {
      type: 'ForOfStatement',
      kind: kindToken.value,
      name: name.value,
      declaredType: declaredType,
      loc: locFromToken(start),
      nameLoc: locFromToken(name),
      iterable: iterable,
      body: this.parseStatement()
    }
  }

  parseUnsupportedForInStatement(): AnyNode {
    this.report('INOX_NO_FOR_IN', 'for-in is not supported; use Object.keys/map helpers later', null)

    while (!this.isValue(')') && !this.is('eof')) {
      this.advance()
    }

    this.matchValue(')')

    if (this.isValue('{')) {
      this.skipBlockTokens()
    } else {
      this.skipStatement()
    }

    return {
      type: 'InvalidStatement'
    }
  }

  parseForInitializer(): AnyNode | null {
    if (this.matchValue(';')) {
      return null
    }

    if (this.matchKeyword('const')) {
      return this.parseVariableDeclaration('const', false)
    }

    if (this.matchKeyword('let')) {
      return this.parseVariableDeclaration('let', false)
    }

    const expression = this.parseExpression()
    this.expectValue(';', 'INOX_EXPECTED_SEMICOLON', 'expected ; after for initializer')

    return expression
  }

  parseSwitchStatement(start: Token): AnyNode {
    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( after switch')
    const discriminant = this.parseExpression()
    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after switch discriminant')
    this.expectValue('{', 'INOX_EXPECTED_BLOCK', 'expected { after switch')
    const cases: AnyNode[] = []

    while (!this.isValue('}') && !this.is('eof')) {
      if (this.matchKeyword('case')) {
        const test = this.parseExpression()
        this.expectValue(':', 'INOX_EXPECTED_COLON', 'expected : after case expression')
        cases.push({
          type: 'SwitchCase',
          test,
          consequent: this.parseSwitchConsequent(),
          loc: test.loc
        })
        continue
      }

      if (this.matchKeyword('default')) {
        const token = this.previous()
        this.expectValue(':', 'INOX_EXPECTED_COLON', 'expected : after default')
        cases.push({
          type: 'SwitchCase',
          test: null,
          consequent: this.parseSwitchConsequent(),
          loc: locFromToken(token)
        })
        continue
      }

      this.report('INOX_EXPECTED_SWITCH_CASE', 'expected case or default in switch', null)
      this.advance()
    }

    this.expectValue('}', 'INOX_EXPECTED_BLOCK', 'expected } after switch')

    return {
      type: 'SwitchStatement',
      discriminant,
      cases,
      loc: locFromToken(start)
    }
  }

  parseSwitchConsequent(): AnyNode[] {
    const consequent: AnyNode[] = []

    while (!this.is('eof') && !this.isValue('}') && !this.isKeywordValue('case') && !this.isKeywordValue('default')) {
      consequent.push(this.parseStatement())
    }

    return consequent
  }

  parseVariableDeclaration(kind: string, exported: boolean): AnyNode {
    const name = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected variable name')
    let declaredType: string | null = null

    if (this.matchValue(':')) {
      declaredType = this.parseTypeAnnotation(['=', ';', '}', ')'], null)
    }

    let init: AnyNode | null = null

    if (this.matchValue('=')) {
      init = this.parseExpression()
    }
    this.matchValue(';')

    return createVariableDeclaration({
      kind,
      exported,
      name,
      declaredType,
      init
    })
  }

  parseExpression(): AnyNode {
    return this.parseAssignment()
  }

  parseAssignment(): AnyNode {
    if (this.isAsyncArrowFunctionStart()) {
      return this.parseArrowFunction(true)
    }

    if (this.isArrowFunctionStart()) {
      return this.parseArrowFunction(false)
    }

    const expression = this.parseConditional()

    if (this.matchValue('=')) {
      return createAssignmentExpression(expression, this.parseAssignment())
    }

    return expression
  }

  parseConditional(): AnyNode {
    const test = this.parseTypeAssertion()

    if (!this.matchValue('?')) {
      return test
    }

    const consequent = this.parseAssignment()
    this.expectValue(':', 'INOX_EXPECTED_CONDITIONAL', 'expected : in conditional expression')
    const alternate = this.parseAssignment()

    return createConditionalExpression(test, consequent, alternate)
  }

  parseTypeAssertion(): AnyNode {
    let expression = this.parseNullish()

    while (this.matchIdentifier('as')) {
      const valueType = this.parseTypeAnnotation(['as', ',', ')', ']', ';', '}', ':'], {
        stopAtLineBreak: true
      })
      expression = createTypeAssertionExpression(expression, valueType)
    }

    return expression
  }

  parseArrowFunction(isAsync: boolean): AnyNode {
    const start = this.current()

    if (isAsync) {
      this.expectKeyword('async', 'INOX_EXPECTED_ARROW', 'expected async before async arrow function')
    }

    const params = this.parseArrowParameters()
    this.expectValue('=>', 'INOX_EXPECTED_ARROW', 'expected => in arrow function')

    if (this.isValue('{')) {
      const body = this.parseBlock()
      return createArrowFunction(start, isAsync, params, body, false)
    }

    const body = this.parseExpression()

    return createArrowFunction(start, isAsync, params, body, true)
  }

  parseArrowParameters(): AnyNode[] {
    if (this.is('identifier') && this.peek(1).value === '=>') {
      const token = this.advance()

      return [createParam(token, 'unknown', false)]
    }

    const params: AnyNode[] = []
    this.expectValue('(', 'INOX_EXPECTED_PAREN', 'expected ( before arrow parameters')

    while (!this.isValue(')') && !this.is('eof')) {
      params.push(this.parseRuntimeParam())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after arrow parameters')

    return params
  }

  parseRuntimeParam(): AnyNode {
    const param = this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected parameter name')
    let optional = this.matchValue('?')
    let valueType = 'unknown'
    let defaultValue: AnyNode | null = null

    if (this.matchValue(':')) {
      valueType = this.parseTypeAnnotation([',', ')', '='], null)
    }

    if (this.matchValue('=')) {
      optional = true
      defaultValue = this.parseExpression()
    }

    return createParam(param, valueType, optional, defaultValue)
  }

  parseNullish(): AnyNode {
    return this.parseBinaryExpression('logicalOr', ['??'])
  }

  parseLogicalOr(): AnyNode {
    return this.parseBinaryExpression('logicalAnd', ['||'])
  }

  parseLogicalAnd(): AnyNode {
    return this.parseBinaryExpression('equality', ['&&'])
  }

  parseEquality(): AnyNode {
    return this.parseBinaryExpression('comparison', ['===', '!==', '=' + '=', '!' + '='])
  }

  parseComparison(): AnyNode {
    return this.parseBinaryExpression('term', ['<', '<=', '>', '>='])
  }

  parseTerm(): AnyNode {
    return this.parseBinaryExpression('factor', ['+', '-'])
  }

  parseFactor(): AnyNode {
    return this.parseBinaryExpression('unary', ['*', '/', '%'])
  }

  parseBinaryExpression(operandKind: string, operators: string[]): AnyNode {
    let left = this.parseBinaryOperand(operandKind)

    while (stringArrayIncludes(operators, this.current().value)) {
      const operator = this.advance()
      const right = this.parseBinaryOperand(operandKind)
      left = createBinaryExpression(operator, left, right)
    }

    return left
  }

  parseBinaryOperand(operandKind: string): AnyNode {
    if (operandKind === 'logicalOr') {
      return this.parseLogicalOr()
    }

    if (operandKind === 'logicalAnd') {
      return this.parseLogicalAnd()
    }

    if (operandKind === 'equality') {
      return this.parseEquality()
    }

    if (operandKind === 'comparison') {
      return this.parseComparison()
    }

    if (operandKind === 'term') {
      return this.parseTerm()
    }

    if (operandKind === 'factor') {
      return this.parseFactor()
    }

    return this.parseUnary()
  }

  parseUnary(): AnyNode {
    if (this.matchKeyword('await')) {
      const token = this.previous()

      return createAwaitExpression(token, this.parseUnary())
    }

    if (this.matchKeyword('new')) {
      return this.parseNewExpression(this.previous())
    }

    if (this.matchKeyword('typeof')) {
      return createUnaryExpression(this.previous(), this.parseUnary())
    }

    if (this.isValue('++') || this.isValue('--')) {
      const operator = this.advance()

      return createUpdateExpression(operator, this.parseUnary(), true)
    }

    if (this.isValue('!') || this.isValue('-')) {
      const operator = this.advance()

      return createUnaryExpression(operator, this.parseUnary())
    }

    return this.parsePostfix()
  }

  parseNewExpression(start: Token): AnyNode {
    let callee = this.parsePrimary()
    const args: AnyNode[] = []

    while (this.matchValue('.')) {
      const property = this.parsePropertyName()
      callee = createMemberExpression(callee, property)
    }

    if (this.matchValue('(')) {
      while (!this.isValue(')') && !this.is('eof')) {
        args.push(this.parseExpression())

        if (!this.matchValue(',')) {
          break
        }
      }

      this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after constructor arguments')
    }

    return createNewExpression(start, callee, args)
  }

  parsePostfix(): AnyNode {
    let expression = this.parsePrimary()

    while (true) {
      if (this.matchValue('(')) {
        expression = this.finishCallExpression(expression)
        continue
      }

      if (this.matchValue('.')) {
        const property = this.parsePropertyName()
        expression = createMemberExpression(expression, property)
        continue
      }

      if (this.matchValue('?.')) {
        expression = this.finishOptionalPostfixExpression(expression)
        continue
      }

      if (this.matchValue('[')) {
        const index = this.parseExpression()
        this.expectValue(']', 'INOX_EXPECTED_BRACKET', 'expected ] after index expression')
        expression = createIndexExpression(expression, index)
        continue
      }

      if (this.isValue('++') || this.isValue('--')) {
        const operator = this.advance()
        expression = createUpdateExpression(operator, expression, false)
        continue
      }

      break
    }

    return expression
  }

  finishOptionalPostfixExpression(object: AnyNode): AnyNode {
    if (this.matchValue('(')) {
      return this.finishCallExpression(createOptionalCallTarget(object))
    }

    if (this.matchValue('[')) {
      const index = this.parseExpression()
      this.expectValue(']', 'INOX_EXPECTED_BRACKET', 'expected ] after optional index expression')

      return createOptionalIndexExpression(object, index)
    }

    const property = this.parsePropertyName()

    return createOptionalMemberExpression(object, property)
  }

  finishCallExpression(callee: AnyNode): AnyNode {
    const args: AnyNode[] = []

    while (!this.isValue(')') && !this.is('eof')) {
      args.push(this.parseExpression())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after call arguments')

    return createCallExpression(callee, args)
  }

  parsePrimary(): AnyNode {
    if (this.matchKeyword('import')) {
      this.report('INOX_NO_DYNAMIC_IMPORT', 'dynamic import is not supported; use static ESM imports', null)

      if (this.matchValue('(')) {
        while (!this.isValue(')') && !this.is('eof')) {
          this.advance()
        }

        this.matchValue(')')
      }

      return {
        type: 'InvalidExpression'
      }
    }

    if (this.matchValue('(')) {
      const expression = this.parseExpression()
      this.expectValue(')', 'INOX_EXPECTED_PAREN', 'expected ) after expression')
      return expression
    }

    if (this.isValue('[')) {
      return this.parseArrayLiteral()
    }

    if (this.isValue('{')) {
      return this.parseObjectLiteral()
    }

    if (this.is('string')) {
      const token = this.advance()

      return createStringLiteral(token)
    }

    if (this.is('template')) {
      const token = this.advance()

      return createTemplateLiteral(token)
    }

    if (this.is('number')) {
      const token = this.advance()

      return createNumberLiteral(token)
    }

    if (this.matchKeyword('true')) {
      return createBooleanLiteral(this.previous(), true)
    }

    if (this.matchKeyword('false')) {
      return createBooleanLiteral(this.previous(), false)
    }

    if (this.matchKeyword('null')) {
      return createNullLiteral(this.previous())
    }

    if (this.matchKeyword('this')) {
      return createThisExpression(this.previous())
    }

    if (this.is('identifier') || this.is('keyword')) {
      const token = this.advance()

      return createReference(token)
    }

    const token = this.current()
    this.report('INOX_EXPECTED_EXPRESSION', `expected expression, got ${quoteDiagnosticString(token.value)}`, null)
    this.advance()

    return {
      type: 'InvalidExpression'
    }
  }

  parseArrayLiteral(): AnyNode {
    const start = this.expectValue('[', 'INOX_EXPECTED_BRACKET', 'expected [')
    const elements: AnyNode[] = []

    while (!this.isValue(']') && !this.is('eof')) {
      elements.push(this.parseExpression())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(']', 'INOX_EXPECTED_BRACKET', 'expected ] after array literal')

    return createArrayLiteral(start, elements)
  }

  parseObjectLiteral(): AnyNode {
    const start = this.expectValue('{', 'INOX_EXPECTED_OBJECT', 'expected {')
    const properties: AnyNode[] = []

    while (!this.isValue('}') && !this.is('eof')) {
      const key = this.parseObjectKey()
      let value: AnyNode = {
        type: 'InvalidExpression'
      }

      if (this.matchValue(':')) {
        value = this.parseExpression()
      } else if (key.kind === 'identifier') {
        value = createReferenceFromName(key.name, key.loc)
      } else {
        this.report('INOX_EXPECTED_OBJECT_VALUE', 'expected : after object property key', null)
      }

      properties.push(createObjectProperty(key, value))

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue('}', 'INOX_EXPECTED_OBJECT', 'expected } after object literal')

    return createObjectLiteral(start, properties)
  }

  parseObjectKey(): AnyNode {
    if (this.is('identifier') || this.is('keyword')) {
      const token = this.advance()
      const key = createObjectKey(token)

      key.kind = 'identifier'

      return key
    }

    if (this.is('string') || this.is('number')) {
      const token = this.advance()

      return createObjectKey(token)
    }

    const token = this.current()
    this.report('INOX_EXPECTED_OBJECT_KEY', 'expected object property key', token)
    this.advance()

    return {
      kind: 'identifier',
      name: '',
      loc: locFromToken(token)
    }
  }

  parsePropertyName(): Token {
    if (this.is('identifier') || this.is('keyword')) {
      return this.advance()
    }

    return this.expect('identifier', 'INOX_EXPECTED_IDENTIFIER', 'expected property name')
  }

  skipTypeUntil(values: string[]): void {
    while (!this.is('eof') && !stringArrayIncludes(values, this.current().value)) {
      this.advance()
    }
  }

  parseTypeAnnotation(values: string[], options: TypeAnnotationOptions | null): string {
    const actualOptions = typeAnnotationOptionsOrEmpty(options)
    const result = readTypeAnnotation(this.tokens, this.position, values, actualOptions)
    this.position = result.position

    return result.typeName
  }

  skipStatement(): void {
    while (!this.is('eof') && !this.isValue(';') && !this.isValue('}')) {
      this.advance()
    }

    this.matchValue(';')
  }

  skipBlockTokens(): void {
    if (!this.matchValue('{')) {
      this.skipStatement()
      return
    }

    let depth = 1

    while (!this.is('eof') && depth > 0) {
      if (this.isValue('{')) {
        depth = depth + 1
      } else if (this.isValue('}')) {
        depth = depth - 1
      }

      this.advance()
    }
  }

  matchKeyword(value: string): boolean {
    if (this.is('keyword') && this.current().value === value) {
      this.advance()
      return true
    }

    return false
  }

  matchIdentifier(value: string): boolean {
    if (this.is('identifier') && this.current().value === value) {
      this.advance()
      return true
    }

    return false
  }

  matchContextualKeyword(value: string): Token | null {
    if (!this.isContextualKeyword(value)) {
      return null
    }

    return this.advance()
  }

  matchValue(value: string): boolean {
    if (this.isValue(value)) {
      this.advance()
      return true
    }

    return false
  }

  expect(tokenType: string, code: string, message: string): Token {
    if (this.is(tokenType)) {
      return this.advance()
    }

    const token = this.current()
    this.report(code, message, token)

    return {
      type: tokenType,
      value: '',
      line: token.line,
      column: token.column,
      index: token.index
    }
  }

  expectValue(value: string, code: string, message: string): Token {
    if (this.matchValue(value)) {
      return this.previous()
    }

    this.report(code, message, null)

    return this.current()
  }

  expectKeyword(value: string, code: string, message: string): void {
    if (this.matchKeyword(value)) {
      return
    }

    this.report(code, message, null)
  }

  report(code: string, message: string, token: Token | null): void {
    let actualToken = this.current()

    if (token !== null && typeof token !== 'undefined') {
      actualToken = token
    }

    this.diagnostics.push(diagnostic(code, message, actualToken))
  }

  is(tokenType: string): boolean {
    return this.current().type === tokenType
  }

  isKeywordValue(value: string): boolean {
    return this.current().type === 'keyword' && this.current().value === value
  }

  isContextualKeyword(value: string): boolean {
    return this.current().type === 'identifier' && this.current().value === value
  }

  isWeakFieldModifier(): boolean {
    if (!this.isContextualKeyword('weak')) {
      return false
    }

    const next = this.peek(1)

    return next.type === 'identifier' || (next.type === 'keyword' && next.value === 'readonly')
  }

  isValue(value: string): boolean {
    return this.current().type === 'punctuator' && this.current().value === value
  }

  isForOfHeader(): boolean {
    return this.isForHeaderWithKeyword('of')
  }

  isForInHeader(): boolean {
    return this.isForHeaderWithKeyword('in')
  }

  isForHeaderWithKeyword(keyword: string): boolean {
    if (
      this.current().type !== 'keyword' ||
      !this.isForHeaderDeclarationKeyword(this.current().value) ||
      this.peek(1).type !== 'identifier'
    ) {
      return false
    }

    let offset = 2
    let genericDepth = 0

    while (this.peek(offset).type !== 'eof') {
      const token = this.peek(offset)

      if (genericDepth === 0 && token.value === keyword) {
        return true
      }

      if (genericDepth === 0 && (token.value === ')' || token.value === ';' || token.value === '=')) {
        return false
      }

      if (token.value === '<') {
        genericDepth = genericDepth + 1
      } else if (token.value === '>' && genericDepth > 0) {
        genericDepth = genericDepth - 1
      }

      offset = offset + 1
    }

    return false
  }

  isForHeaderDeclarationKeyword(value: string): boolean {
    if (value === 'const') {
      return true
    }

    if (value === 'let') {
      return true
    }

    return false
  }

  isArrowFunctionStart(): boolean {
    if (this.is('identifier') && this.peek(1).value === '=>') {
      return true
    }

    if (!this.isValue('(')) {
      return false
    }

    let depth = 0

    let offset = 0

    while (this.peek(offset).type !== 'eof') {
      const token = this.peek(offset)

      if (token.value === '(') {
        depth = depth + 1
      } else if (token.value === ')') {
        depth = depth - 1

        if (depth === 0) {
          return this.peek(offset + 1).value === '=>'
        }
      }

      offset = offset + 1
    }

    return false
  }

  isAsyncArrowFunctionStart(): boolean {
    if (!this.isKeywordValue('async')) {
      return false
    }

    if (this.peek(1).type === 'identifier' && this.peek(2).value === '=>') {
      return true
    }

    if (this.peek(1).value !== '(') {
      return false
    }

    let depth = 0

    let offset = 1

    while (this.peek(offset).type !== 'eof') {
      const token = this.peek(offset)

      if (token.value === '(') {
        depth = depth + 1
      } else if (token.value === ')') {
        depth = depth - 1

        if (depth === 0) {
          return this.peek(offset + 1).value === '=>'
        }
      }

      offset = offset + 1
    }

    return false
  }

  current(): Token {
    return this.tokens[this.position]
  }

  peek(offset: number): Token {
    return this.tokens[Math.min(this.position + offset, this.tokens.length - 1)]
  }

  advance(): Token {
    const token = this.current()
    this.position = Math.min(this.position + 1, this.tokens.length - 1)
    return token
  }

  previous(): Token {
    return this.tokens[Math.max(0, this.position - 1)]
  }
}
