import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, ProgramNode, SourceLocation, SymbolInfo, TypeAliasInfo, ValueType } from './types.ts'

const globals = new Map<string, SymbolInfo>([
  ['console', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['Promise', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Date', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['performance', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['Set', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Map', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['fetch', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['setTimeout', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['clearTimeout', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['setInterval', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['clearInterval', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['setImmediate', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['clearImmediate', {
    kind: 'global',
    mutable: false,
    valueType: 'function'
  }],
  ['fs', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['http', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['JSON', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['Math', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['Buffer', {
    kind: 'global',
    mutable: false,
    valueType: 'object'
  }],
  ['Uint8Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Int8Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Uint16Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Int16Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Uint32Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }],
  ['Int32Array', {
    kind: 'global',
    mutable: false,
    valueType: 'object',
    constructable: true
  }]
])

export function checkProgram(program: ProgramNode): { ast: ProgramNode } {
  const checker = new Checker(program)
  checker.check()

  return {
    ast: program
  }
}

class Checker {
  program: ProgramNode
  diagnostics: Diagnostic[]
  scope: Scope
  types: Map<string, TypeAliasInfo>
  breakDepth: number
  continueDepth: number
  currentReturnType: ValueType
  asyncDepth: number

  constructor(program: ProgramNode) {
    this.program = program
    this.diagnostics = []
    this.scope = new Scope(null)
    this.types = new Map()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.asyncDepth = 0
  }

  check(): void {
    this.collectTopLevelDeclarations()

    for (const item of this.program.body) {
      this.checkTopLevelItem(item)
    }

    throwDiagnostics(this.diagnostics)
  }

  collectTopLevelDeclarations(): void {
    for (const item of this.program.body) {
      if (item.type === 'TypeAliasDeclaration') {
        this.declareTypeAlias(item)
      }
    }

    for (const item of this.program.body) {
      if (item.type === 'ImportDeclaration') {
        for (const specifier of item.specifiers) {
          this.declare(specifier.local, {
            kind: item.typeOnly ? 'type import' : 'import',
            mutable: false,
            valueType: 'unknown',
            loc: specifier.loc
          }, specifier.loc)
        }
      }

      if (item.type === 'FunctionDeclaration') {
        this.declare(item.name, {
          kind: 'function',
          mutable: false,
          valueType: 'function',
          params: item.params.map(param => this.resolveParam(param)),
          returnType: this.resolveDeclaredType(item.returnType, item.loc).valueType,
          async: item.async,
          loc: item.loc
        }, item.loc)
      }

      if (item.type === 'ClassDeclaration') {
        this.declare(item.name, {
          kind: 'class',
          mutable: false,
          valueType: 'class',
          constructorParams: item.methods.find(method => method.name === 'constructor')?.params ?? [],
          loc: item.loc
        }, item.loc)
      }
    }
  }

  resolveParam(param: AnyNode): AnyNode {
    const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

    return {
      ...param,
      valueType: paramInfo.valueType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape
    }
  }

  checkTopLevelItem(item: AnyNode): void {
    if (item.type === 'TypeAliasDeclaration') {
      return
    }

    if (item.type === 'ImportDeclaration') {
      return
    }

    if (item.type === 'FunctionDeclaration') {
      this.withScope(() => {
        const previousReturnType = this.currentReturnType
        this.currentReturnType = item.returnType
        const previousAsyncDepth = this.asyncDepth
        this.asyncDepth = item.async ? this.asyncDepth + 1 : this.asyncDepth

        for (const param of item.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(param.name, {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          }, param.loc)
        }

        try {
          this.checkStatements(item.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.asyncDepth = previousAsyncDepth
        }
      })

      return
    }

    if (item.type === 'ClassDeclaration') {
      this.checkClassDeclaration(item)
      return
    }

    this.checkStatement(item)
  }

  checkStatements(statements: AnyNode[]): void {
    for (const statement of statements) {
      this.checkStatement(statement)
    }
  }

  checkStatement(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.withScope(() => {
        this.checkStatements(statement.body)
      })

      return
    }

    if (statement.type === 'IfStatement') {
      this.checkBooleanCondition(statement.condition)
      this.checkScopedBody(statement.consequent)

      if (statement.alternate != null) {
        this.checkScopedBody(statement.alternate)
      }

      return
    }

    if (statement.type === 'WhileStatement') {
      this.checkBooleanCondition(statement.condition)
      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
      return
    }

    if (statement.type === 'ForStatement') {
      this.checkForStatement(statement)
      return
    }

    if (statement.type === 'ForOfStatement') {
      this.checkForOfStatement(statement)
      return
    }

    if (statement.type === 'SwitchStatement') {
      this.checkSwitchStatement(statement)
      return
    }

    if (statement.type === 'BreakStatement') {
      if (this.breakDepth === 0) {
        this.report('CCJS_BREAK_OUTSIDE', 'break can only be used inside a loop or switch', statement.loc)
      }

      return
    }

    if (statement.type === 'ContinueStatement') {
      if (this.continueDepth === 0) {
        this.report('CCJS_CONTINUE_OUTSIDE', 'continue can only be used inside a loop', statement.loc)
      }

      return
    }

    if (statement.type === 'VariableDeclaration') {
      if (statement.kind === 'const' && statement.init == null) {
        this.report('CCJS_CONST_INIT', 'const declarations must have an initializer', statement.loc)
      }

      const declared = statement.declaredType == null ? null : this.resolveDeclaredType(statement.declaredType, statement.loc)
      const initType = statement.init == null ? 'unknown' : this.checkExpression(statement.init)
      const valueType = declared?.valueType ?? initType

      if (declared?.shape != null && statement.init?.type === 'ObjectLiteral') {
        this.checkObjectLiteralAgainstShape(statement.init, declared.shape)
      }

      this.declare(statement.name, {
        kind: statement.kind,
        mutable: statement.kind === 'let',
        valueType,
        functionType: declared?.functionType ?? null,
        shape: declared?.shape ?? null,
        loc: statement.loc
      }, statement.loc)

      if (declared != null && statement.init != null) {
        this.checkAssignableType(initType, declared.valueType, statement.loc)
      }

      return
    }

    if (statement.type === 'ExpressionStatement') {
      this.checkExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement') {
      const actual = statement.argument == null ? 'void' : this.checkExpression(statement.argument)
      this.checkAssignableType(actual, this.currentReturnType, statement.loc)
    }
  }

  checkExpression(expression: AnyNode): ValueType {
    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'NullLiteral') {
      return 'null'
    }

    if (expression.type === 'ThisExpression') {
      return this.resolveReference({
        type: 'Reference',
        path: ['this'],
        loc: expression.loc
      })?.valueType ?? 'unknown'
    }

    if (expression.type === 'Reference') {
      return this.resolveReference(expression)?.valueType ?? 'unknown'
    }

    if (expression.type === 'MemberExpression') {
      return this.checkMemberExpression(expression)
    }

    if (expression.type === 'IndexExpression') {
      return this.checkIndexExpression(expression)
    }

    if (expression.type === 'OptionalMemberExpression') {
      this.checkExpression(expression.object)
      return 'unknown'
    }

    if (expression.type === 'OptionalIndexExpression') {
      this.checkExpression(expression.object)
      this.checkExpression(expression.index)
      return 'unknown'
    }

    if (expression.type === 'OptionalCallExpression') {
      this.checkExpression(expression.callee)

      for (const arg of expression.args) {
        this.checkExpression(arg)
      }

      return 'unknown'
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression)
    }

    if (expression.type === 'AwaitExpression') {
      if (this.asyncDepth === 0) {
        this.report('CCJS_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      this.checkExpression(expression.argument)
      return 'unknown'
    }

    if (expression.type === 'ArrowFunctionExpression') {
      this.checkArrowFunctionExpression(expression)
      return 'function'
    }

    if (expression.type === 'CallExpression') {
      return this.checkCallExpression(expression)
    }

    if (expression.type === 'AssignmentExpression') {
      return this.checkAssignment(expression)
    }

    if (expression.type === 'BinaryExpression') {
      const left = this.checkExpression(expression.left)
      const right = this.checkExpression(expression.right)
      return inferBinaryExpressionType(expression.operator, left, right)
    }

    if (expression.type === 'UnaryExpression') {
      this.checkExpression(expression.argument)
      return expression.operator === '!' ? 'boolean' : 'number'
    }

    if (expression.type === 'ArrayLiteral') {
      for (const element of expression.elements) {
        this.checkExpression(element)
      }

      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      this.checkObjectLiteral(expression)
      return 'object'
    }

    return 'unknown'
  }

  checkAssignment(expression: AnyNode): ValueType {
    if (expression.target.type === 'MemberExpression') {
      return this.checkMemberAssignment(expression)
    }

    if (expression.target.type === 'IndexExpression') {
      return this.checkIndexAssignment(expression)
    }

    if (expression.target.type !== 'Reference') {
      this.report('CCJS_INVALID_ASSIGNMENT_TARGET', 'assignment target must be a binding or field', expression.loc)
      return this.checkExpression(expression.value)
    }

    const symbol = this.resolveReference(expression.target)
    const valueType = this.checkExpression(expression.value)

    if (symbol != null && expression.target.path.length === 1 && !symbol.mutable) {
      this.report('CCJS_ASSIGN_CONST', `cannot assign to ${symbol.kind} binding ${expression.target.path[0]}`, expression.target.loc)
    }

    if (symbol != null) {
      this.checkAssignableType(valueType, symbol.valueType, expression.value.loc)
    }

    return valueType
  }

  checkMemberExpression(expression: AnyNode): ValueType {
    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      this.checkExpression(expression.object)
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      return 'unknown'
    }

    return this.resolveDeclaredType(field.valueType, field.loc).valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (shape == null) {
      this.checkExpression(expression.target.object)
      return valueType
    }

    const field = this.findShapeField(shape, expression.target.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.target.property}`, expression.target.loc)
      return valueType
    }

    if (field.readonly) {
      this.report('CCJS_ASSIGN_READONLY_FIELD', `cannot assign to readonly field ${expression.target.property}`, expression.target.loc)
    }

    this.checkAssignableType(valueType, this.resolveDeclaredType(field.valueType, field.loc).valueType, expression.value.loc)

    return valueType
  }

  checkIndexExpression(expression: AnyNode): ValueType {
    if (expression.index.type !== 'StringLiteral') {
      this.checkExpression(expression.object)
      this.checkExpression(expression.index)
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      this.checkExpression(expression.object)
      this.checkExpression(expression.index)
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      return 'unknown'
    }

    return this.resolveDeclaredType(field.valueType, field.loc).valueType
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    if (expression.target.index.type !== 'StringLiteral') {
      this.checkExpression(expression.target.object)
      this.checkExpression(expression.target.index)
      return this.checkExpression(expression.value)
    }

    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (shape == null) {
      this.checkExpression(expression.target.object)
      this.checkExpression(expression.target.index)
      return valueType
    }

    const field = this.findShapeField(shape, expression.target.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.target.index.value}`, expression.target.index.loc)
      return valueType
    }

    if (field.readonly) {
      this.report('CCJS_ASSIGN_READONLY_FIELD', `cannot assign to readonly field ${expression.target.index.value}`, expression.target.loc)
    }

    this.checkAssignableType(valueType, this.resolveDeclaredType(field.valueType, field.loc).valueType, expression.value.loc)

    return valueType
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const calleeType = this.checkExpression(expression.callee)
    const argTypes = expression.args.map(arg => this.checkExpression(arg))
    const symbol = this.getCallableSymbol(expression.callee)

    if (symbol == null) {
      return calleeType === 'function' ? 'unknown' : 'unknown'
    }

    if (symbol.params == null) {
      return symbol.returnType ?? 'unknown'
    }

    if (symbol.params.length !== expression.args.length) {
      this.report('CCJS_ARG_COUNT', `function ${expression.callee.path[0]} expects ${symbol.params.length} argument(s), got ${expression.args.length}`, expression.loc)
    }

    for (const [index, param] of symbol.params.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(argTypes[index], param.valueType, expression.args[index].loc)
      }
    }

    return symbol.returnType ?? 'unknown'
  }

  checkNewExpression(expression: AnyNode): ValueType {
    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    const symbol = this.scope.resolve(expression.callee.path[0]) ?? globals.get(expression.callee.path[0])

    if (symbol?.kind !== 'class' && !symbol?.constructable) {
      this.report('CCJS_UNKNOWN_NAME', `unknown class ${expression.callee.path[0]}`, expression.callee.loc)
      return 'object'
    }

    if (symbol.constructable) {
      return 'object'
    }

    const constructorParams = symbol.constructorParams ?? []

    if (constructorParams.length !== expression.args.length) {
      this.report('CCJS_ARG_COUNT', `class ${expression.callee.path[0]} constructor expects ${constructorParams.length} argument(s), got ${expression.args.length}`, expression.loc)
    }

    for (const [index, param] of constructorParams.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(argTypes[index], param.valueType, expression.args[index].loc)
      }
    }

    return 'object'
  }

  checkArrowFunctionExpression(expression: AnyNode): void {
    this.withScope(() => {
      for (const param of expression.params) {
        this.declare(param.name, {
          kind: 'param',
          mutable: true,
          valueType: param.valueType,
          loc: param.loc
        }, param.loc)
      }

      if (expression.expressionBody) {
        this.checkExpression(expression.body)
      } else {
        this.checkStatements(expression.body)
      }
    })
  }

  checkClassDeclaration(statement: AnyNode): void {
    const methodNames = new Set<string>()

    for (const method of statement.methods) {
      if (methodNames.has(method.name)) {
        this.report('CCJS_REDECLARED_NAME', `method ${method.name} is already declared in this class`, method.loc)
      }

      methodNames.add(method.name)
      this.withScope(() => {
        const previousReturnType = this.currentReturnType
        this.currentReturnType = method.returnType

        this.declare('this', {
          kind: 'this',
          mutable: false,
          valueType: 'object',
          loc: method.loc
        }, method.loc)

        for (const param of method.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(param.name, {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          }, param.loc)
        }

        try {
          this.checkStatements(method.body)
        } finally {
          this.currentReturnType = previousReturnType
        }
      })
    }
  }

  checkObjectLiteralAgainstShape(expression: AnyNode, shape: ObjectShapeInfo): void {
    const properties = new Map<string, AnyNode>(expression.properties.map(property => [property.key, property]))

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property == null) {
        this.report('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc)
        continue
      }

      this.checkAssignableType(this.checkExpression(property.value), this.resolveDeclaredType(field.valueType, field.loc).valueType, property.loc)
    }

    for (const property of expression.properties) {
      if (this.findShapeField(shape, property.key) == null) {
        this.report('CCJS_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      return null
    }

    return this.scope.resolve(expression.path[0])?.shape ?? null
  }

  findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
    return shape.fields.find(field => field.name === name) ?? null
  }

  getCallableSymbol(callee: AnyNode): SymbolInfo | null {
    if (callee.type !== 'Reference' || callee.path.length !== 1) {
      return null
    }

    const symbol = this.scope.resolve(callee.path[0]) ?? globals.get(callee.path[0])

    if (symbol?.kind === 'function') {
      return symbol
    }

    if (symbol?.valueType === 'function' && symbol.functionType != null) {
      return {
        kind: 'function',
        valueType: 'function',
        params: symbol.functionType.params,
        returnType: symbol.functionType.returnType,
        loc: symbol.loc
      }
    }

    return null
  }

  checkObjectLiteral(expression: AnyNode): void {
    const keys = new Set<string>()

    for (const property of expression.properties) {
      if (keys.has(property.key)) {
        this.report('CCJS_DUPLICATE_OBJECT_KEY', `duplicate object property ${property.key}`, property.loc)
      }

      keys.add(property.key)
      this.checkExpression(property.value)
    }
  }

  checkForStatement(statement: AnyNode): void {
    this.withScope(() => {
      if (statement.init?.type === 'VariableDeclaration') {
        this.checkStatement(statement.init)
      } else if (statement.init != null) {
        this.checkExpression(statement.init)
      }

      if (statement.test != null) {
        this.checkBooleanCondition(statement.test)
      }

      if (statement.update != null) {
        this.checkExpression(statement.update)
      }

      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
    })
  }

  checkForOfStatement(statement: AnyNode): void {
    this.checkExpression(statement.iterable)

    this.withScope(() => {
      this.declare(statement.name, {
        kind: statement.kind,
        mutable: statement.kind === 'let',
        valueType: 'unknown',
        loc: statement.nameLoc
      }, statement.nameLoc)

      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
    })
  }

  checkSwitchStatement(statement: AnyNode): void {
    const discriminantType = this.checkExpression(statement.discriminant)
    let hasDefault = false

    if (!isSwitchableType(discriminantType)) {
      this.report('CCJS_SWITCH_TYPE', `switch discriminant must be number, string or boolean, got ${discriminantType}`, statement.discriminant.loc)
    }

    this.withBreakable(() => {
      for (const item of statement.cases) {
        if (item.test == null) {
          if (hasDefault) {
            this.report('CCJS_DUPLICATE_DEFAULT', 'switch can only have one default branch', item.loc)
          }

          hasDefault = true
        } else {
          const caseType = this.checkExpression(item.test)

          if (!isMatchingSwitchCaseType(caseType, discriminantType)) {
            this.report('CCJS_SWITCH_TYPE', `switch case type ${caseType} does not match discriminant type ${discriminantType}`, item.test.loc)
          }
        }

        this.withScope(() => {
          this.checkStatements(item.consequent)
        })
      }
    })
  }

  checkBooleanCondition(expression: AnyNode): void {
    const type = this.checkExpression(expression)

    if (type !== 'boolean' && type !== 'unknown') {
      this.report('CCJS_CONDITION_TYPE', `condition must be boolean, got ${type}`, expression.loc)
    }
  }

  checkScopedBody(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.checkStatement(statement)
      return
    }

    this.withScope(() => {
      this.checkStatement(statement)
    })
  }

  resolveReference(reference: AnyNode): SymbolInfo | null {
    const root = reference.path[0]
    const symbol = this.scope.resolve(root) ?? globals.get(root)

    if (symbol == null) {
      this.report('CCJS_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  declareTypeAlias(item: AnyNode): void {
    if (this.types.has(item.name)) {
      this.report('CCJS_REDECLARED_NAME', `type ${item.name} is already declared`, item.loc)
      return
    }

    if (item.valueType.kind === 'object' || item.valueType.kind === 'function') {
      this.types.set(item.name, item.valueType)
    }
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): { valueType: ValueType, functionType: AnyNode | null, shape: ObjectShapeInfo | null } {
    if (name == null || name === 'unknown') {
      return {
        valueType: 'unknown',
        functionType: null,
        shape: null
      }
    }

    if (isBuiltinValueType(name)) {
      return {
        valueType: name,
        functionType: null,
        shape: null
      }
    }

    const shape = this.types.get(name)

    if (shape != null) {
      if (shape.kind === 'function') {
        return {
          valueType: 'function',
          functionType: {
            ...shape,
            params: shape.params.map(param => {
              const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

              return {
                ...param,
                valueType: paramInfo.valueType,
                functionType: paramInfo.functionType,
                shape: paramInfo.shape
              }
            })
          },
          shape: null
        }
      }

      return {
        valueType: 'object',
        functionType: null,
        shape
      }
    }

    this.report('CCJS_UNKNOWN_TYPE', `unknown type ${name}`, loc)

    return {
      valueType: 'unknown',
      functionType: null,
      shape: null
    }
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation): void {
    if (this.scope.hasOwn(name)) {
      this.report('CCJS_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
  }

  withScope(callback: () => void): void {
    const previous = this.scope
    this.scope = new Scope(previous)

    try {
      callback()
    } finally {
      this.scope = previous
    }
  }

  withBreakable(callback: () => void): void {
    this.breakDepth += 1

    try {
      callback()
    } finally {
      this.breakDepth -= 1
    }
  }

  withLoop(callback: () => void): void {
    this.breakDepth += 1
    this.continueDepth += 1

    try {
      callback()
    } finally {
      this.continueDepth -= 1
      this.breakDepth -= 1
    }
  }

  checkAssignableType(actual: ValueType, expected: ValueType, loc: SourceLocation): void {
    if (!isAssignableType(actual, expected)) {
      this.report('CCJS_TYPE_MISMATCH', `cannot assign ${actual} to ${expected}`, loc)
    }
  }

  report(code: string, message: string, loc: SourceLocation): void {
    this.diagnostics.push(diagnostic(code, message, loc))
  }
}

class Scope {
  parent: Scope | null
  bindings: Map<string, SymbolInfo>

  constructor(parent: Scope | null) {
    this.parent = parent
    this.bindings = new Map()
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    return this.bindings.get(name) ?? this.parent?.resolve(name) ?? null
  }
}

function inferBinaryExpressionType(operator: string, left: ValueType, right: ValueType): ValueType {
  if (['===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
    return 'boolean'
  }

  if (operator === '+' && (left === 'string' || right === 'string')) {
    return 'string'
  }

  return 'number'
}

function isAssignableType(actual: ValueType | null | undefined, expected: ValueType | null | undefined): boolean {
  if (actual == null || expected == null || actual === 'unknown' || expected === 'unknown') {
    return true
  }

  return actual === expected
}

function isSwitchableType(type: ValueType): boolean {
  return ['boolean', 'number', 'string', 'unknown'].includes(type)
}

function isMatchingSwitchCaseType(actual: ValueType, expected: ValueType): boolean {
  return actual === 'unknown' || expected === 'unknown' || actual === expected
}

function isBuiltinValueType(name: string): boolean {
  return ['array', 'boolean', 'function', 'null', 'number', 'object', 'string', 'void'].includes(name)
}
