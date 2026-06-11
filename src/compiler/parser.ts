import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import type { AnyNode, Diagnostic, ProgramNode, SourceLocation, Token } from './types.ts'

export function parse(tokens: Token[]): ProgramNode {
  const parser = new Parser(tokens)
  return parser.parseProgram()
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
      this.report('CCJS_EXPECTED_FUNCTION', 'expected function after async')
    }

    if (this.matchKeyword('class')) {
      return this.parseClassDeclaration(exported)
    }

    if (this.matchKeyword('type')) {
      return this.parseTypeAliasDeclaration(exported)
    }

    if (exported && this.matchKeyword('const')) {
      return this.parseVariableDeclaration('const', true)
    }

    if (exported && this.matchKeyword('let')) {
      return this.parseVariableDeclaration('let', true)
    }

    if (exported) {
      this.report('CCJS_EXPECTED_EXPORT', 'expected exported function or variable declaration')
    }

    return this.parseStatement()
  }

  parseImportDeclaration(typeOnly: boolean): AnyNode {
    if (this.matchKeyword('type')) {
      typeOnly = true
    }

    const specifiers: AnyNode[] = []

    if (this.matchValue('{')) {
      while (!this.isValue('}') && !this.is('eof')) {
        const imported = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected imported name')
        let local = imported.value

        if (this.matchIdentifier('as')) {
          local = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected local import name').value
        }

        specifiers.push({
          imported: imported.value,
          local,
          loc: locFromToken(imported)
        })

        if (!this.matchValue(',')) {
          break
        }
      }

      this.expectValue('}', 'CCJS_EXPECTED_IMPORT', 'expected } after import specifiers')
    } else {
      this.report('CCJS_UNSUPPORTED_IMPORT', 'only named ESM imports are implemented in the current compiler slice')
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    this.expectKeyword('from', 'CCJS_EXPECTED_IMPORT', 'expected from after import specifiers')
    const source = this.expect('string', 'CCJS_EXPECTED_IMPORT', 'expected import source string')
    this.matchValue(';')

    return {
      type: 'ImportDeclaration',
      typeOnly,
      specifiers,
      source: source.value,
      loc: locFromToken(source)
    }
  }

  parseFunctionDeclaration(exported: boolean, isAsync = false): AnyNode {
    const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected function name')
    const params: AnyNode[] = []

    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after function name')

    while (!this.isValue(')') && !this.is('eof')) {
      const param = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected parameter name')
      let valueType = 'unknown'

      if (this.matchValue(':')) {
        valueType = this.parseTypeAnnotation([',', ')'])
      }

      params.push({
        name: param.value,
        valueType,
        loc: locFromToken(param)
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after function parameters')
    let returnType = 'void'

    if (this.matchValue(':')) {
      returnType = this.parseTypeAnnotation(['{'])
    }

    return {
      type: 'FunctionDeclaration',
      exported,
      async: isAsync,
      name: name.value,
      loc: locFromToken(name),
      params,
      returnType,
      body: this.parseBlock()
    }
  }

  parseTypeAliasDeclaration(exported: boolean): AnyNode {
    const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected type alias name')
    this.expectValue('=', 'CCJS_EXPECTED_TYPE', 'expected = after type alias name')

    if (this.isValue('(')) {
      return {
        type: 'TypeAliasDeclaration',
        exported,
        name: name.value,
        loc: locFromToken(name),
        valueType: this.parseFunctionType()
      }
    }

    if (!this.isValue('{')) {
      this.report('CCJS_EXPECTED_TYPE', 'only object type aliases are implemented in the current compiler slice')
      this.skipStatement()

      return {
        type: 'TypeAliasDeclaration',
        exported,
        name: name.value,
        loc: locFromToken(name),
        valueType: {
          kind: 'unknown'
        }
      }
    }

    return {
      type: 'TypeAliasDeclaration',
      exported,
      name: name.value,
      loc: locFromToken(name),
      valueType: this.parseObjectType()
    }
  }

  parseFunctionType(): AnyNode {
    const params: AnyNode[] = []

    this.expectValue('(', 'CCJS_EXPECTED_TYPE', 'expected ( in function type')

    while (!this.isValue(')') && !this.is('eof')) {
      const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected function type parameter name')
      this.expectValue(':', 'CCJS_EXPECTED_TYPE', 'expected : after function type parameter name')
      const valueType = this.parseTypeAnnotation([',', ')'])

      params.push({
        name: name.value,
        valueType,
        loc: locFromToken(name)
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'CCJS_EXPECTED_TYPE', 'expected ) after function type parameters')
    this.expectValue('=>', 'CCJS_EXPECTED_ARROW', 'expected => in function type')
    const returnType = this.parseTypeAnnotation([';', ',', '}'], {
      stopAtStatementBoundary: true
    })
    this.matchValue(';')

    return {
      kind: 'function',
      params,
      returnType
    }
  }

  parseObjectType(): AnyNode {
    const fields: AnyNode[] = []

    this.expectValue('{', 'CCJS_EXPECTED_TYPE', 'expected { in object type')

    while (!this.isValue('}') && !this.is('eof')) {
      const readonly = this.matchKeyword('readonly')
      const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected object type field name')
      this.expectValue(':', 'CCJS_EXPECTED_TYPE', 'expected : after object type field name')
      const valueType = this.parseTypeAnnotation([',', '}'])

      fields.push({
        name: name.value,
        readonly,
        valueType,
        loc: locFromToken(name)
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue('}', 'CCJS_EXPECTED_TYPE', 'expected } after object type')
    this.matchValue(';')

    return {
      kind: 'object',
      fields
    }
  }

  parseClassDeclaration(exported: boolean): AnyNode {
    const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected class name')
    const fields: AnyNode[] = []
    const methods: AnyNode[] = []
    let extendsName: string | null = null
    let extendsLoc: SourceLocation | null = null

    const extendsToken = this.matchContextualKeyword('extends')

    if (extendsToken != null) {
      const base = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected base class name')
      extendsName = base.value
      extendsLoc = locFromToken(extendsToken)
    }

    this.expectValue('{', 'CCJS_EXPECTED_BLOCK', 'expected { after class name')

    while (!this.isValue('}') && !this.is('eof')) {
      const member = this.parseClassMember()

      if (member.type === 'FieldDefinition') {
        fields.push(member)
      } else {
        methods.push(member)
      }
    }

    this.expectValue('}', 'CCJS_EXPECTED_BLOCK', 'expected } after class body')

    return {
      type: 'ClassDeclaration',
      exported,
      name: name.value,
      loc: locFromToken(name),
      extendsName,
      extendsLoc,
      fields,
      methods
    }
  }

  parseClassMember(): AnyNode {
    const staticToken = this.matchClassStaticModifier()
    const readonly = this.matchKeyword('readonly')
    const name = this.parseClassMemberName()

    if (!readonly && this.isValue('(')) {
      return this.parseClassMethod(name, staticToken)
    }

    if (readonly && this.isValue('(')) {
      this.report('CCJS_EXPECTED_TYPE', 'readonly class methods are not supported; use readonly fields')
    }

    this.expectValue(':', 'CCJS_EXPECTED_TYPE', 'expected : after class field name')
    const valueType = this.parseTypeAnnotation([';', '}'], {
      stopAtLineBreak: true
    })
    this.matchValue(';')

    return {
      type: 'FieldDefinition',
      name: name.value,
      static: staticToken != null,
      staticLoc: staticToken == null ? null : locFromToken(staticToken),
      readonly,
      valueType,
      loc: locFromToken(name)
    }
  }

  parseClassMethod(name: Token, staticToken: Token | null = null): AnyNode {
    const params: AnyNode[] = []

    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after method name')

    while (!this.isValue(')') && !this.is('eof')) {
      const param = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected parameter name')
      let valueType = 'unknown'

      if (this.matchValue(':')) {
        valueType = this.parseTypeAnnotation([',', ')'])
      }

      params.push({
        name: param.value,
        valueType,
        loc: locFromToken(param)
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after method parameters')
    let returnType = name.value === 'constructor' ? 'void' : 'unknown'

    if (this.matchValue(':')) {
      returnType = this.parseTypeAnnotation(['{'])
    }

    return {
      type: 'MethodDefinition',
      name: name.value,
      static: staticToken != null,
      staticLoc: staticToken == null ? null : locFromToken(staticToken),
      loc: locFromToken(name),
      params,
      returnType,
      body: this.parseBlock()
    }
  }

  parseClassMemberName(): Token {
    if (this.is('identifier') || this.isKeywordValue('constructor')) {
      return this.advance()
    }

    return this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected method name')
  }

  matchClassStaticModifier(): Token | null {
    if (!this.isContextualKeyword('static')) {
      return null
    }

    const next = this.peek(1)

    if (next.type !== 'identifier' && !['constructor', 'readonly'].includes(next.value)) {
      return null
    }

    return this.advance()
  }

  parseBlock(): AnyNode[] {
    const body: AnyNode[] = []

    this.expectValue('{', 'CCJS_EXPECTED_BLOCK', 'expected {')

    while (!this.isValue('}') && !this.is('eof')) {
      body.push(this.parseStatement())
    }

    this.expectValue('}', 'CCJS_EXPECTED_BLOCK', 'expected }')

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
      this.report('CCJS_NO_DYNAMIC_IMPORT', 'dynamic import is not supported; use static ESM imports')
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
      this.report('CCJS_NO_VAR', '`var` is not supported; use `let` or `const`')
      this.skipStatement()

      return {
        type: 'InvalidStatement'
      }
    }

    if (this.matchKeyword('return')) {
      const token = this.previous()
      const argument = this.isValue('}') || this.isValue(';') ? null : this.parseExpression()
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
    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after if')
    const condition = this.parseExpression()
    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after if condition')
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
        const paramToken = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected catch binding name')
        param = paramToken.value
        paramLoc = locFromToken(paramToken)
        this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after catch binding')
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

    if (handler == null && finalizer == null) {
      this.report('CCJS_EXPECTED_TRY_HANDLER', 'try must be followed by catch or finally', start)
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
    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after while')
    const condition = this.parseExpression()
    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after while condition')

    return {
      type: 'WhileStatement',
      condition,
      body: this.parseStatement(),
      loc: locFromToken(start)
    }
  }

  parseForStatement(start: Token): AnyNode {
    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after for')

    if (this.isForInHeader()) {
      return this.parseUnsupportedForInStatement()
    }

    if (this.isForOfHeader()) {
      return this.parseForOfStatement(start)
    }

    const init = this.parseForInitializer()
    const test = this.isValue(';') ? null : this.parseExpression()
    this.expectValue(';', 'CCJS_EXPECTED_SEMICOLON', 'expected ; after for condition')
    const update = this.isValue(')') ? null : this.parseExpression()
    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after for update')

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
    const kind = this.advance().value
    const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected for...of binding name')
    const declaredType = this.matchValue(':') ? this.parseTypeAnnotation(['of']) : null
    this.expectKeyword('of', 'CCJS_EXPECTED_OF', 'expected of in for...of statement')
    const iterable = this.parseExpression()
    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after for...of iterable')

    return {
      type: 'ForOfStatement',
      kind,
      name: name.value,
      declaredType,
      loc: locFromToken(start),
      nameLoc: locFromToken(name),
      iterable,
      body: this.parseStatement()
    }
  }

  parseUnsupportedForInStatement(): AnyNode {
    this.report('CCJS_NO_FOR_IN', 'for...in is not supported; use Object.keys/map helpers later')

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
    this.expectValue(';', 'CCJS_EXPECTED_SEMICOLON', 'expected ; after for initializer')

    return expression
  }

  parseSwitchStatement(start: Token): AnyNode {
    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( after switch')
    const discriminant = this.parseExpression()
    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after switch discriminant')
    this.expectValue('{', 'CCJS_EXPECTED_BLOCK', 'expected { after switch')
    const cases: AnyNode[] = []

    while (!this.isValue('}') && !this.is('eof')) {
      if (this.matchKeyword('case')) {
        const test = this.parseExpression()
        this.expectValue(':', 'CCJS_EXPECTED_COLON', 'expected : after case expression')
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
        this.expectValue(':', 'CCJS_EXPECTED_COLON', 'expected : after default')
        cases.push({
          type: 'SwitchCase',
          test: null,
          consequent: this.parseSwitchConsequent(),
          loc: locFromToken(token)
        })
        continue
      }

      this.report('CCJS_EXPECTED_SWITCH_CASE', 'expected case or default in switch')
      this.advance()
    }

    this.expectValue('}', 'CCJS_EXPECTED_BLOCK', 'expected } after switch')

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
    const name = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected variable name')
    let declaredType: string | null = null

    if (this.matchValue(':')) {
      declaredType = this.parseTypeAnnotation(['=', ';', '}', ')'])
    }

    const init = this.matchValue('=') ? this.parseExpression() : null
    this.matchValue(';')

    return {
      type: 'VariableDeclaration',
      kind,
      exported,
      name: name.value,
      loc: locFromToken(name),
      declaredType,
      init
    }
  }

  parseExpression(): AnyNode {
    return this.parseAssignment()
  }

  parseAssignment(): AnyNode {
    if (this.isArrowFunctionStart()) {
      return this.parseArrowFunction()
    }

    const expression = this.parseNullish()

    if (this.matchValue('=')) {
      return {
        type: 'AssignmentExpression',
        target: expression,
        value: this.parseAssignment(),
        loc: expression.loc
      }
    }

    return expression
  }

  parseArrowFunction(): AnyNode {
    const start = this.current()
    const params = this.parseArrowParameters()
    this.expectValue('=>', 'CCJS_EXPECTED_ARROW', 'expected => in arrow function')
    const body = this.isValue('{') ? this.parseBlock() : this.parseExpression()

    return {
      type: 'ArrowFunctionExpression',
      params,
      body,
      expressionBody: !Array.isArray(body),
      loc: locFromToken(start)
    }
  }

  parseArrowParameters(): AnyNode[] {
    if (this.is('identifier') && this.peek(1).value === '=>') {
      const token = this.advance()

      return [{
        name: token.value,
        valueType: 'unknown',
        loc: locFromToken(token)
      }]
    }

    const params: AnyNode[] = []
    this.expectValue('(', 'CCJS_EXPECTED_PAREN', 'expected ( before arrow parameters')

    while (!this.isValue(')') && !this.is('eof')) {
      const param = this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected parameter name')
      let valueType = 'unknown'

      if (this.matchValue(':')) {
        valueType = this.parseTypeAnnotation([',', ')'])
      }

      params.push({
        name: param.value,
        valueType,
        loc: locFromToken(param)
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after arrow parameters')

    return params
  }

  parseNullish(): AnyNode {
    return this.parseBinaryExpression(() => this.parseLogicalOr(), ['??'])
  }

  parseLogicalOr(): AnyNode {
    return this.parseBinaryExpression(() => this.parseLogicalAnd(), ['||'])
  }

  parseLogicalAnd(): AnyNode {
    return this.parseBinaryExpression(() => this.parseEquality(), ['&&'])
  }

  parseEquality(): AnyNode {
    return this.parseBinaryExpression(() => this.parseComparison(), ['===', '!==', '==', '!='])
  }

  parseComparison(): AnyNode {
    return this.parseBinaryExpression(() => this.parseTerm(), ['<', '<=', '>', '>='])
  }

  parseTerm(): AnyNode {
    return this.parseBinaryExpression(() => this.parseFactor(), ['+', '-'])
  }

  parseFactor(): AnyNode {
    return this.parseBinaryExpression(() => this.parseUnary(), ['*', '/', '%'])
  }

  parseBinaryExpression(parseOperand: () => AnyNode, operators: string[]): AnyNode {
    let left = parseOperand()

    while (operators.includes(this.current().value)) {
      const operator = this.advance()
      const right = parseOperand()
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        loc: left.loc
      }
    }

    return left
  }

  parseUnary(): AnyNode {
    if (this.matchKeyword('await')) {
      const token = this.previous()

      return {
        type: 'AwaitExpression',
        argument: this.parseUnary(),
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('new')) {
      return this.parseNewExpression(this.previous())
    }

    if (this.isValue('!') || this.isValue('-')) {
      const operator = this.advance()

      return {
        type: 'UnaryExpression',
        operator: operator.value,
        argument: this.parseUnary(),
        loc: locFromToken(operator)
      }
    }

    return this.parsePostfix()
  }

  parseNewExpression(start: Token): AnyNode {
    let callee = this.parsePrimary()
    const args: AnyNode[] = []

    while (this.matchValue('.')) {
      const property = this.parsePropertyName()
      callee = {
        type: 'MemberExpression',
        object: callee,
        property: property.value,
        loc: callee.loc
      }
    }

    if (this.matchValue('(')) {
      while (!this.isValue(')') && !this.is('eof')) {
        args.push(this.parseExpression())

        if (!this.matchValue(',')) {
          break
        }
      }

      this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after constructor arguments')
    }

    return {
      type: 'NewExpression',
      callee,
      args,
      loc: locFromToken(start)
    }
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
        expression = {
          type: 'MemberExpression',
          object: expression,
          property: property.value,
          loc: expression.loc
        }
        continue
      }

      if (this.matchValue('?.')) {
        expression = this.finishOptionalPostfixExpression(expression)
        continue
      }

      if (this.matchValue('[')) {
        const index = this.parseExpression()
        this.expectValue(']', 'CCJS_EXPECTED_BRACKET', 'expected ] after index expression')
        expression = {
          type: 'IndexExpression',
          object: expression,
          index,
          loc: expression.loc
        }
        continue
      }

      break
    }

    return expression
  }

  finishOptionalPostfixExpression(object: AnyNode): AnyNode {
    if (this.matchValue('(')) {
      return this.finishCallExpression({
        type: 'OptionalCallTarget',
        callee: object,
        loc: object.loc
      })
    }

    if (this.matchValue('[')) {
      const index = this.parseExpression()
      this.expectValue(']', 'CCJS_EXPECTED_BRACKET', 'expected ] after optional index expression')

      return {
        type: 'OptionalIndexExpression',
        object,
        index,
        loc: object.loc
      }
    }

    const property = this.parsePropertyName()

    return {
      type: 'OptionalMemberExpression',
      object,
      property: property.value,
      loc: object.loc
    }
  }

  finishCallExpression(callee: AnyNode): AnyNode {
    const args: AnyNode[] = []

    while (!this.isValue(')') && !this.is('eof')) {
      args.push(this.parseExpression())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after call arguments')

    return {
      type: callee.type === 'OptionalCallTarget' ? 'OptionalCallExpression' : 'CallExpression',
      callee: callee.type === 'OptionalCallTarget' ? callee.callee : callee,
      args,
      loc: callee.loc
    }
  }

  parsePrimary(): AnyNode {
    if (this.matchKeyword('import')) {
      this.report('CCJS_NO_DYNAMIC_IMPORT', 'dynamic import is not supported; use static ESM imports')

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
      this.expectValue(')', 'CCJS_EXPECTED_PAREN', 'expected ) after expression')
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

      return {
        type: 'StringLiteral',
        value: token.value,
        loc: locFromToken(token)
      }
    }

    if (this.is('template')) {
      const token = this.advance()

      return {
        type: 'TemplateLiteral',
        raw: token.value,
        loc: locFromToken(token)
      }
    }

    if (this.is('number')) {
      const token = this.advance()

      return {
        type: 'NumberLiteral',
        value: token.value,
        loc: locFromToken(token)
      }
    }

    if (this.matchKeyword('true')) {
      return {
        type: 'BooleanLiteral',
        value: true,
        loc: locFromToken(this.previous())
      }
    }

    if (this.matchKeyword('false')) {
      return {
        type: 'BooleanLiteral',
        value: false,
        loc: locFromToken(this.previous())
      }
    }

    if (this.matchKeyword('null')) {
      return {
        type: 'NullLiteral',
        value: null,
        loc: locFromToken(this.previous())
      }
    }

    if (this.matchKeyword('this')) {
      return {
        type: 'ThisExpression',
        loc: locFromToken(this.previous())
      }
    }

    if (this.is('identifier') || this.is('keyword')) {
      const token = this.advance()

      return {
        type: 'Reference',
        path: [token.value],
        loc: locFromToken(token)
      }
    }

    const token = this.current()
    this.report('CCJS_EXPECTED_EXPRESSION', `expected expression, got ${JSON.stringify(token.value)}`)
    this.advance()

    return {
      type: 'InvalidExpression'
    }
  }

  parseArrayLiteral(): AnyNode {
    const start = this.expectValue('[', 'CCJS_EXPECTED_BRACKET', 'expected [')
    const elements: AnyNode[] = []

    while (!this.isValue(']') && !this.is('eof')) {
      elements.push(this.parseExpression())

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue(']', 'CCJS_EXPECTED_BRACKET', 'expected ] after array literal')

    return {
      type: 'ArrayLiteral',
      elements,
      loc: locFromToken(start)
    }
  }

  parseObjectLiteral(): AnyNode {
    const start = this.expectValue('{', 'CCJS_EXPECTED_OBJECT', 'expected {')
    const properties: AnyNode[] = []

    while (!this.isValue('}') && !this.is('eof')) {
      const key = this.parseObjectKey()
      let value: AnyNode | null = null

      if (this.matchValue(':')) {
        value = this.parseExpression()
      } else if (key.kind === 'identifier') {
        value = {
          type: 'Reference',
          path: [key.name],
          loc: key.loc
        }
      } else {
        this.report('CCJS_EXPECTED_OBJECT_VALUE', 'expected : after object property key')
        value = {
          type: 'InvalidExpression'
        }
      }

      properties.push({
        key: key.name,
        value,
        loc: key.loc
      })

      if (!this.matchValue(',')) {
        break
      }
    }

    this.expectValue('}', 'CCJS_EXPECTED_OBJECT', 'expected } after object literal')

    return {
      type: 'ObjectLiteral',
      properties,
      loc: locFromToken(start)
    }
  }

  parseObjectKey(): AnyNode {
    if (this.is('identifier')) {
      const token = this.advance()

      return {
        kind: 'identifier',
        name: token.value,
        loc: locFromToken(token)
      }
    }

    if (this.is('string') || this.is('number')) {
      const token = this.advance()

      return {
        kind: token.type,
        name: token.value,
        loc: locFromToken(token)
      }
    }

    const token = this.current()
    this.report('CCJS_EXPECTED_OBJECT_KEY', 'expected object property key', token)
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

    return this.expect('identifier', 'CCJS_EXPECTED_IDENTIFIER', 'expected property name')
  }

  skipTypeUntil(values: string[]): void {
    while (!this.is('eof') && !values.includes(this.current().value)) {
      this.advance()
    }
  }

  parseTypeAnnotation(values: string[], options: { stopAtLineBreak?: boolean, stopAtStatementBoundary?: boolean } = {}): string {
    const parts: string[] = []
    let genericDepth = 0
    let lastTokenLine = this.current().line

    while (!this.is('eof')) {
      const token = this.current()

      if (genericDepth === 0 && values.includes(token.value)) {
        break
      }

      if (genericDepth === 0 && parts.length > 0 && options.stopAtLineBreak === true && token.line > lastTokenLine) {
        break
      }

      if (genericDepth === 0 && parts.length > 0 && options.stopAtStatementBoundary === true && token.line > lastTokenLine && isStatementBoundaryToken(token)) {
        break
      }

      if (token.value === '<') {
        genericDepth += 1
      } else if (token.value === '>' && genericDepth > 0) {
        genericDepth -= 1
      }

      parts.push(token.value)
      lastTokenLine = token.line
      this.advance()
    }

    return normalizeTypeName(parts.join(''))
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
        depth += 1
      } else if (this.isValue('}')) {
        depth -= 1
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

  expect(type: string, code: string, message: string): Token {
    if (this.is(type)) {
      return this.advance()
    }

    const token = this.current()
    this.report(code, message, token)

    return {
      type,
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

    this.report(code, message)

    return this.current()
  }

  expectKeyword(value: string, code: string, message: string): void {
    if (this.matchKeyword(value)) {
      return
    }

    this.report(code, message)
  }

  report(code: string, message: string, token = this.current()): void {
    this.diagnostics.push(diagnostic(code, message, token))
  }

  is(type: string): boolean {
    return this.current().type === type
  }

  isKeywordValue(value: string): boolean {
    return this.current().type === 'keyword' && this.current().value === value
  }

  isContextualKeyword(value: string): boolean {
    return this.current().type === 'identifier' && this.current().value === value
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
    if (this.current().type !== 'keyword' || !['const', 'let'].includes(this.current().value) || this.peek(1).type !== 'identifier') {
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
        genericDepth += 1
      } else if (token.value === '>' && genericDepth > 0) {
        genericDepth -= 1
      }

      offset += 1
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

    for (let offset = 0; this.peek(offset).type !== 'eof'; offset += 1) {
      const token = this.peek(offset)

      if (token.value === '(') {
        depth += 1
      } else if (token.value === ')') {
        depth -= 1

        if (depth === 0) {
          return this.peek(offset + 1).value === '=>'
        }
      }
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

function locFromToken(token: SourceLocation): SourceLocation {
  return {
    line: token.line,
    column: token.column
  }
}

function isStatementBoundaryToken(token: Token): boolean {
  return token.type === 'keyword' && [
    'async',
    'class',
    'const',
    'export',
    'function',
    'import',
    'let',
    'type'
  ].includes(token.value)
}

function normalizeTypeName(name: string): string {
  const unionArgs = splitUnionArgs(name)

  if (unionArgs.length > 1) {
    const normalized = unionArgs.map(arg => normalizeTypeName(arg))
    const withoutNull = normalized.filter(arg => arg !== 'null')

    return normalized.length === 2 && withoutNull.length === 1
      ? `nullable<${withoutNull[0]}>`
      : 'unknown'
  }

  if (name.endsWith('[]')) {
    return `array<${normalizeTypeName(name.slice(0, -2))}>`
  }

  const arrayMatch = /^Array<(.+)>$/.exec(name)

  if (arrayMatch != null) {
    return `array<${normalizeTypeName(arrayMatch[1])}>`
  }

  const mapMatch = /^Map<(.+)>$/.exec(name)

  if (mapMatch != null) {
    const args = splitGenericArgs(mapMatch[1])

    return args.length === 2 ? `map<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>` : 'map'
  }

  const setMatch = /^Set<(.+)>$/.exec(name)

  if (setMatch != null) {
    const args = splitGenericArgs(setMatch[1])

    return args.length === 1 ? `set<${normalizeTypeName(args[0])}>` : 'set'
  }

  const promiseMatch = /^Promise<(.+)>$/.exec(name)

  if (promiseMatch != null) {
    const args = splitGenericArgs(promiseMatch[1])

    return args.length === 1 ? `promise<${normalizeTypeName(args[0])}>` : 'promise'
  }

  if (['number', 'string', 'boolean', 'void', 'null', 'unknown'].includes(name)) {
    return name
  }

  if (name === 'Array' || name === 'array') {
    return 'array'
  }

  if (name === 'Map' || name === 'map') {
    return 'map'
  }

  if (name === 'Set' || name === 'set') {
    return 'set'
  }

  if (name === 'Promise' || name === 'promise') {
    return 'promise'
  }

  if (name === 'Function' || name === 'function') {
    return 'function'
  }

  if (name === 'any') {
    return 'unknown'
  }

  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : 'unknown'
}

function splitGenericArgs(value: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (char === '<') {
      depth += 1
    } else if (char === '>') {
      depth -= 1
    } else if (char === ',' && depth === 0) {
      args.push(value.slice(start, index))
      start = index + 1
    }
  }

  args.push(value.slice(start))

  return args.map(arg => arg.trim()).filter(Boolean)
}

function splitUnionArgs(value: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (char === '<') {
      depth += 1
    } else if (char === '>') {
      depth -= 1
    } else if (char === '|' && depth === 0) {
      args.push(value.slice(start, index))
      start = index + 1
    }
  }

  args.push(value.slice(start))

  return args.map(arg => arg.trim()).filter(Boolean)
}
