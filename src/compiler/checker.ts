import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, ProgramNode, SourceLocation, SymbolInfo, TypeAliasInfo, ValueType } from './types.ts'

type ResolvedTypeInfo = {
  valueType: ValueType
  nullable: boolean
  functionType: AnyNode | null
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
  mapKeyType: ValueType | null
  mapValueType: ValueType | null
  promiseValueType?: ValueType | null
  setElementType: ValueType | null
}

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
  ['Error', {
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
  currentReturnNullable: boolean
  currentReturnPromiseValueType: ValueType | null
  asyncDepth: number

  constructor(program: ProgramNode) {
    this.program = program
    this.diagnostics = []
    this.scope = new Scope(null)
    this.types = new Map()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.currentReturnNullable = false
    this.currentReturnPromiseValueType = null
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
        if (item.typeOnly) {
          continue
        }

        for (const specifier of item.specifiers) {
          this.declare(specifier.local, {
            kind: 'import',
            mutable: false,
            valueType: 'unknown',
            loc: specifier.loc
          }, specifier.loc)
        }
      }

      if (item.type === 'FunctionDeclaration') {
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)

        this.declare(item.name, {
          kind: 'function',
          mutable: false,
          valueType: 'function',
          params: item.params.map(param => this.resolveParam(param)),
          returnType: returnInfo.valueType,
          returnNullable: returnInfo.nullable,
          returnArrayElementType: returnInfo.arrayElementType,
          returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
          returnMapKeyType: returnInfo.mapKeyType,
          returnMapValueType: returnInfo.mapValueType,
          returnPromiseValueType: returnInfo.promiseValueType ?? null,
          returnSetElementType: returnInfo.setElementType,
          returnShape: returnInfo.shape,
          async: item.async,
          loc: item.loc
        }, item.loc)
      }

      if (item.type === 'ClassDeclaration') {
        this.declare(item.name, {
          kind: 'class',
          mutable: false,
          valueType: 'class',
          constructorParams: item.methods.find(method => method.name === 'constructor')?.params.map(param => this.resolveParam(param)) ?? [],
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
      nullable: paramInfo.nullable,
      arrayElementType: paramInfo.arrayElementType,
      arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
      mapKeyType: paramInfo.mapKeyType,
      mapValueType: paramInfo.mapValueType,
      promiseValueType: paramInfo.promiseValueType ?? null,
      setElementType: paramInfo.setElementType,
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
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        this.currentReturnPromiseValueType = returnInfo.promiseValueType ?? null
        const previousAsyncDepth = this.asyncDepth
        this.asyncDepth = item.async ? this.asyncDepth + 1 : this.asyncDepth

        for (const param of item.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(param.name, {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            nullable: paramInfo.nullable,
            arrayElementType: paramInfo.arrayElementType,
            arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
            mapKeyType: paramInfo.mapKeyType,
            mapValueType: paramInfo.mapValueType,
            promiseValueType: paramInfo.promiseValueType ?? null,
            setElementType: paramInfo.setElementType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          }, param.loc)
        }

        try {
          this.checkStatements(item.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
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

    if (statement.type === 'TryStatement') {
      this.checkTryStatement(statement)
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

    if (statement.type === 'ThrowStatement') {
      this.checkExpression(statement.argument)
      return
    }

    if (statement.type === 'VariableDeclaration') {
      if (statement.kind === 'const' && statement.init == null) {
        this.report('CCJS_CONST_INIT', 'const declarations must have an initializer', statement.loc)
      }

      const declared = statement.declaredType == null ? null : this.resolveDeclaredType(statement.declaredType, statement.loc)
      const initType = statement.init == null ? 'unknown' : this.checkVariableInitializer(statement.init, declared)
      const valueType = declared?.valueType ?? initType
      const arrayElementType = declared?.arrayElementType ?? this.resolveExpressionArrayElementType(statement.init)
      const arrayElementDeclaredType = declared?.arrayElementDeclaredType ?? this.resolveExpressionArrayElementDeclaredType(statement.init)
      const mapType = declared?.valueType === 'map'
        ? {
            key: declared.mapKeyType,
            value: declared.mapValueType
          }
        : this.resolveExpressionMapType(statement.init)
      const setElementType = declared?.valueType === 'set' ? declared.setElementType : this.resolveExpressionSetElementType(statement.init)
      const promiseValueType = declared?.valueType === 'promise' ? declared.promiseValueType ?? null : this.resolveExpressionPromiseValueType(statement.init)

      if (declared?.shape != null && statement.init?.type === 'ObjectLiteral') {
        this.checkObjectLiteralAgainstShape(statement.init, declared.shape)
      }

      this.declare(statement.name, {
        kind: statement.kind,
        mutable: statement.kind === 'let',
        valueType,
        nullable: declared?.nullable === true || statement.init?.nullable === true,
        arrayElementType,
        arrayElementDeclaredType,
        mapKeyType: mapType?.key ?? null,
        mapValueType: mapType?.value ?? null,
        promiseValueType,
        setElementType,
        functionType: declared?.functionType ?? null,
        shape: declared?.shape ?? null,
        loc: statement.loc
      }, statement.loc)

      if (declared != null && statement.init != null) {
        this.checkAssignableType(initType, declared.valueType, statement.loc, declared.nullable, this.expressionCanBeNull(statement.init))

        if (declared.valueType === 'array' && declared.arrayElementType != null) {
          this.checkAssignableType(this.resolveExpressionArrayElementType(statement.init), declared.arrayElementType, statement.loc)
        }

        if (declared.valueType === 'map') {
          const actual = this.resolveExpressionMapType(statement.init)

          if (declared.mapKeyType != null) {
            this.checkAssignableType(actual?.key, declared.mapKeyType, statement.loc)
          }

          if (declared.mapValueType != null) {
            this.checkAssignableType(actual?.value, declared.mapValueType, statement.loc)
          }
        }

        if (declared.valueType === 'set' && declared.setElementType != null) {
          this.checkAssignableType(this.resolveExpressionSetElementType(statement.init), declared.setElementType, statement.loc)
        }

        if (declared.valueType === 'promise' && declared.promiseValueType != null) {
          this.checkAssignableType(this.resolveExpressionPromiseValueType(statement.init), declared.promiseValueType, statement.loc)
        }
      }

      return
    }

    if (statement.type === 'ExpressionStatement') {
      this.checkExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement') {
      const actual = statement.argument == null ? 'void' : this.checkExpression(statement.argument)
      this.checkAssignableType(actual, this.currentReturnType, statement.loc, this.currentReturnNullable, this.expressionCanBeNull(statement.argument))

      if (this.currentReturnType === 'promise' && this.currentReturnPromiseValueType != null) {
        this.checkAssignableType(this.resolveExpressionPromiseValueType(statement.argument), this.currentReturnPromiseValueType, statement.loc)
      }
    }
  }

  checkTryStatement(statement: AnyNode): void {
    this.checkStatement(statement.block)

    if (statement.handler != null) {
      this.withScope(() => {
        if (statement.handler.param != null) {
          this.declare(statement.handler.param, {
            kind: 'catch',
            mutable: false,
            valueType: 'unknown',
            loc: statement.handler.paramLoc
          }, statement.handler.paramLoc)
        }

        this.checkStatement(statement.handler.body)
      })
    }

    if (statement.finalizer != null) {
      this.checkStatement(statement.finalizer)
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
      const symbol = this.resolveReference(expression)
      expression.nullable = symbol?.nullable === true

      return symbol?.valueType ?? 'unknown'
    }

    if (expression.type === 'MemberExpression') {
      return this.checkMemberExpression(expression)
    }

    if (expression.type === 'IndexExpression') {
      return this.checkIndexExpression(expression)
    }

    if (expression.type === 'OptionalMemberExpression') {
      return this.checkOptionalMemberExpression(expression)
    }

    if (expression.type === 'OptionalIndexExpression') {
      return this.checkOptionalIndexExpression(expression)
    }

    if (expression.type === 'OptionalCallExpression') {
      this.checkExpression(expression.callee)
      const argTypes = expression.args.map(arg => this.checkExpression(arg))
      const symbol = this.getCallableSymbol(expression.callee)

      if (symbol == null) {
        expression.valueType = 'unknown'
        expression.nullable = true

        return expression.valueType
      }

      expression.valueType = symbol.returnType ?? 'unknown'
      expression.nullable = true
      expression.arrayElementType = symbol.returnArrayElementType ?? null
      expression.arrayElementDeclaredType = symbol.returnArrayElementDeclaredType ?? null
      expression.mapKeyType = symbol.returnMapKeyType ?? null
      expression.mapValueType = symbol.returnMapValueType ?? null
      expression.promiseValueType = symbol.returnPromiseValueType ?? null
      expression.setElementType = symbol.returnSetElementType ?? null
      expression.shape = symbol.returnShape ?? null

      if (symbol.params != null) {
        if (symbol.params.length !== expression.args.length) {
          const name = expression.callee.type === 'Reference' ? expression.callee.path[0] : 'callable'

          this.report('CCJS_ARG_COUNT', `function ${name} expects ${symbol.params.length} argument(s), got ${expression.args.length}`, expression.loc)
        }

        for (const [index, param] of symbol.params.entries()) {
          if (index < argTypes.length) {
            this.checkAssignableType(argTypes[index], param.valueType, expression.args[index].loc, param.nullable === true, this.expressionCanBeNull(expression.args[index]))
          }
        }
      }

      return expression.valueType
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression)
    }

    if (expression.type === 'AwaitExpression') {
      if (this.asyncDepth === 0) {
        this.report('CCJS_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      const argumentType = this.checkExpression(expression.argument)
      const valueType = argumentType === 'promise'
        ? this.resolveExpressionPromiseValueType(expression.argument) ?? 'unknown'
        : argumentType

      expression.valueType = valueType

      return valueType
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
      return this.checkBinaryExpression(expression)
    }

    if (expression.type === 'UnaryExpression') {
      this.checkExpression(expression.argument)
      return expression.operator === '!' ? 'boolean' : 'number'
    }

    if (expression.type === 'ArrayLiteral') {
      const elementTypes: ValueType[] = []

      for (const element of expression.elements) {
        elementTypes.push(this.checkExpression(element))
      }

      expression.arrayElementType = commonArrayElementType(elementTypes)
      expression.arrayElementDeclaredType = expression.arrayElementType

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
      this.checkAssignableType(valueType, symbol.valueType, expression.value.loc, symbol.nullable === true, this.expressionCanBeNull(expression.value))

      if (symbol.valueType === 'promise' && symbol.promiseValueType != null) {
        this.checkAssignableType(this.resolveExpressionPromiseValueType(expression.value), symbol.promiseValueType, expression.value.loc)
      }
    }

    return valueType
  }

  checkBinaryExpression(expression: AnyNode): ValueType {
    const left = this.checkExpression(expression.left)
    const right = this.checkExpression(expression.right)
    const nullableEquality = isEqualityOperator(expression.operator)
      && ((left === 'null' && this.expressionCanBeNull(expression.right)) || (right === 'null' && this.expressionCanBeNull(expression.left)))

    if (isEqualityOperator(expression.operator) && !nullableEquality && !isEqualityComparableType(left, right)) {
      this.report('CCJS_TYPE_MISMATCH', `cannot compare ${left} and ${right} with ${expression.operator}`, expression.loc)
    }

    const valueType = inferBinaryExpressionType(expression.operator, left, right)
    expression.valueType = valueType
    expression.nullable = expression.operator === '??' && this.expressionCanBeNull(expression.right)

    return valueType
  }

  expressionCanBeNull(expression: AnyNode): boolean {
    return expression?.type === 'NullLiteral' || expression?.nullable === true
  }

  checkMemberExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)

    if (objectType === 'string' && expression.property === 'length') {
      return 'number'
    }

    if (objectType === 'array' && expression.property === 'length') {
      return 'number'
    }

    if ((objectType === 'map' || objectType === 'set') && expression.property === 'size') {
      return 'number'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      return 'unknown'
    }

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = field.nullable === true || fieldType.nullable
    expression.valueType = valueType
    expression.arrayElementType = field.arrayElementType ?? fieldType.arrayElementType
    expression.arrayElementDeclaredType = field.arrayElementDeclaredType ?? fieldType.arrayElementDeclaredType
    expression.mapKeyType = field.mapKeyType ?? fieldType.mapKeyType
    expression.mapValueType = field.mapValueType ?? fieldType.mapValueType
    expression.promiseValueType = field.promiseValueType ?? fieldType.promiseValueType ?? null
    expression.setElementType = field.setElementType ?? fieldType.setElementType
    expression.shape = field.shape ?? fieldType.shape

    return valueType
  }

  checkOptionalMemberExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.object)

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = true
    expression.valueType = valueType
    expression.arrayElementType = field.arrayElementType ?? fieldType.arrayElementType
    expression.arrayElementDeclaredType = field.arrayElementDeclaredType ?? fieldType.arrayElementDeclaredType
    expression.mapKeyType = field.mapKeyType ?? fieldType.mapKeyType
    expression.mapValueType = field.mapValueType ?? fieldType.mapValueType
    expression.promiseValueType = field.promiseValueType ?? fieldType.promiseValueType ?? null
    expression.setElementType = field.setElementType ?? fieldType.setElementType
    expression.shape = field.shape ?? fieldType.shape

    return valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const targetType = this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (targetType === 'string' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'array' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if ((targetType === 'map' || targetType === 'set') && expression.target.property === 'size') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field size', expression.target.loc)
      return valueType
    }

    if (shape == null) {
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

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    this.checkAssignableType(valueType, fieldType.valueType, expression.value.loc, fieldType.nullable, this.expressionCanBeNull(expression.value))

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(this.resolveExpressionArrayElementType(expression.value), fieldType.arrayElementType, expression.value.loc)
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)

      if (fieldType.mapKeyType != null) {
        this.checkAssignableType(actual?.key, fieldType.mapKeyType, expression.value.loc)
      }

      if (fieldType.mapValueType != null) {
        this.checkAssignableType(actual?.value, fieldType.mapValueType, expression.value.loc)
      }
    }

    if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
      this.checkAssignableType(this.resolveExpressionSetElementType(expression.value), fieldType.setElementType, expression.value.loc)
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(this.resolveExpressionPromiseValueType(expression.value), fieldType.promiseValueType, expression.value.loc)
    }

    return valueType
  }

  checkIndexExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }

      this.checkAssignableType(indexType, mapType.key, expression.index.loc, false, this.expressionCanBeNull(expression.index))

      expression.collectionKind = 'map'
      expression.nullable = true
      expression.valueType = mapType.value ?? 'unknown'
      expression.mapKeyType = mapType.key ?? null
      expression.mapValueType = mapType.value ?? null

      return mapType.value ?? 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc)
        return this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
      }

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      return 'unknown'
    }

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = field.nullable === true || fieldType.nullable
    expression.valueType = valueType
    expression.arrayElementType = field.arrayElementType ?? fieldType.arrayElementType
    expression.arrayElementDeclaredType = field.arrayElementDeclaredType ?? fieldType.arrayElementDeclaredType
    expression.mapKeyType = field.mapKeyType ?? fieldType.mapKeyType
    expression.mapValueType = field.mapValueType ?? fieldType.mapValueType
    expression.promiseValueType = field.promiseValueType ?? fieldType.promiseValueType ?? null
    expression.setElementType = field.setElementType ?? fieldType.setElementType
    expression.shape = field.shape ?? fieldType.shape

    return valueType
  }

  checkOptionalIndexExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'

        expression.nullable = true
        expression.valueType = valueType
        expression.arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)

        return valueType
      }

      expression.nullable = true
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = true
    expression.valueType = valueType
    expression.arrayElementType = field.arrayElementType ?? fieldType.arrayElementType
    expression.arrayElementDeclaredType = field.arrayElementDeclaredType ?? fieldType.arrayElementDeclaredType
    expression.mapKeyType = field.mapKeyType ?? fieldType.mapKeyType
    expression.mapValueType = field.mapValueType ?? fieldType.mapValueType
    expression.promiseValueType = field.promiseValueType ?? fieldType.promiseValueType ?? null
    expression.setElementType = field.setElementType ?? fieldType.setElementType
    expression.shape = field.shape ?? fieldType.shape

    return valueType
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.target.object)
    const indexType = this.checkExpression(expression.target.index)
    const valueType = this.checkExpression(expression.value)

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.target.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }

      this.checkAssignableType(indexType, mapType.key, expression.target.index.loc, false, this.expressionCanBeNull(expression.target.index))
      this.checkAssignableType(valueType, mapType.value, expression.value.loc, false, this.expressionCanBeNull(expression.value))

      expression.target.collectionKind = 'map'
      expression.target.valueType = mapType.value ?? 'unknown'
      expression.target.mapKeyType = mapType.key ?? null
      expression.target.mapValueType = mapType.value ?? null

      return valueType
    }

    if (expression.target.index.type !== 'StringLiteral') {
      return valueType
    }

    const shape = this.resolveExpressionShape(expression.target.object)

    if (shape == null) {
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

    const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
    this.checkAssignableType(valueType, fieldType.valueType, expression.value.loc, fieldType.nullable, this.expressionCanBeNull(expression.value))

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(this.resolveExpressionArrayElementType(expression.value), fieldType.arrayElementType, expression.value.loc)
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)

      if (fieldType.mapKeyType != null) {
        this.checkAssignableType(actual?.key, fieldType.mapKeyType, expression.value.loc)
      }

      if (fieldType.mapValueType != null) {
        this.checkAssignableType(actual?.value, fieldType.mapValueType, expression.value.loc)
      }
    }

    if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
      this.checkAssignableType(this.resolveExpressionSetElementType(expression.value), fieldType.setElementType, expression.value.loc)
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(this.resolveExpressionPromiseValueType(expression.value), fieldType.promiseValueType, expression.value.loc)
    }

    return valueType
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const stringConversionType = this.checkStringConversionCall(expression)

    if (stringConversionType != null) {
      return stringConversionType
    }

    const stringTrimType = this.checkStringTrimCall(expression)

    if (stringTrimType != null) {
      return stringTrimType
    }

    const stringSliceType = this.checkStringSliceCall(expression)

    if (stringSliceType != null) {
      return stringSliceType
    }

    const stringMethodType = this.checkStringPredicateCall(expression)

    if (stringMethodType != null) {
      return stringMethodType
    }

    const arrayMethodType = this.checkArrayMethodCall(expression)

    if (arrayMethodType != null) {
      return arrayMethodType
    }

    const collectionMethodType = this.checkCollectionMethodCall(expression)

    if (collectionMethodType != null) {
      return collectionMethodType
    }

    const fsType = this.checkFsCall(expression)

    if (fsType != null) {
      return fsType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType != null) {
      return promiseStaticType
    }

    const calleeType = this.checkExpression(expression.callee)
    const argTypes = expression.args.map(arg => this.checkExpression(arg))
    const symbol = this.getCallableSymbol(expression.callee)

    if (symbol == null) {
      return calleeType === 'function' ? 'unknown' : 'unknown'
    }

    expression.valueType = symbol.returnType ?? 'unknown'
    expression.nullable = symbol.returnNullable === true
    expression.arrayElementType = symbol.returnArrayElementType ?? null
    expression.arrayElementDeclaredType = symbol.returnArrayElementDeclaredType ?? null
    expression.mapKeyType = symbol.returnMapKeyType ?? null
    expression.mapValueType = symbol.returnMapValueType ?? null
    expression.promiseValueType = symbol.returnPromiseValueType ?? null
    expression.setElementType = symbol.returnSetElementType ?? null
    expression.shape = symbol.returnShape ?? null

    if (symbol.params == null) {
      return symbol.returnType ?? 'unknown'
    }

    if (symbol.params.length !== expression.args.length) {
      this.report('CCJS_ARG_COUNT', `function ${expression.callee.path[0]} expects ${symbol.params.length} argument(s), got ${expression.args.length}`, expression.loc)
    }

    for (const [index, param] of symbol.params.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(argTypes[index], param.valueType, expression.args[index].loc, param.nullable === true, this.expressionCanBeNull(expression.args[index]))
      }
    }

    return symbol.returnType ?? 'unknown'
  }

  checkFsCall(expression: AnyNode): ValueType | null {
    const method = fsRuntimeMethodName(expression.callee)

    if (method == null) {
      return null
    }

    if (this.scope.resolve('fs') != null) {
      return null
    }

    if (method === 'readFile') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report('CCJS_ARG_COUNT', `function fs.readFile expects 1 or 2 argument(s), got ${expression.args.length}`, expression.loc)
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)

      expression.valueType = 'promise'
      expression.promiseValueType = 'string'

      return 'promise'
    }

    if (expression.args.length !== 2) {
      this.report('CCJS_ARG_COUNT', `function fs.writeFile expects 2 argument(s), got ${expression.args.length}`, expression.loc)
    }

    this.checkFsStringArg(expression, 0)
    this.checkFsStringArg(expression, 1)

    expression.valueType = 'promise'
    expression.promiseValueType = 'void'

    return 'promise'
  }

  checkFsStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkPromiseStaticCall(expression: AnyNode): ValueType | null {
    const method = promiseStaticMethodName(expression.callee)

    if (method == null) {
      return null
    }

    if (this.scope.resolve('Promise') != null) {
      return null
    }

    if (expression.args.length > 1) {
      this.report('CCJS_ARG_COUNT', `function Promise.${method} expects at most 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    expression.valueType = 'promise'
    expression.promiseValueType = method === 'resolve' ? argTypes[0] ?? 'void' : 'unknown'

    return 'promise'
  }

  checkCollectionMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const property = expression.callee.property
    const objectType = this.checkExpression(expression.callee.object)

    if (objectType === 'map' && isMapMethod(property)) {
      const mapType = this.resolveExpressionMapType(expression.callee.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }

      if (property === 'clear') {
        this.checkCollectionArgCount(expression, 'map.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      if (property === 'get' || property === 'has' || property === 'delete') {
        this.checkCollectionArgCount(expression, `map.${property}`, 1)

        if (expression.args[0] != null) {
          this.checkAssignableType(this.checkExpression(expression.args[0]), mapType.key, expression.args[0].loc, false, this.expressionCanBeNull(expression.args[0]))
        }

        for (const arg of expression.args.slice(1)) {
          this.checkExpression(arg)
        }

        if (property === 'get') {
          expression.valueType = mapType.value ?? 'unknown'
          expression.nullable = true
          return mapType.value ?? 'unknown'
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      this.checkCollectionArgCount(expression, 'map.set', 2)

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), mapType.key, expression.args[0].loc, false, this.expressionCanBeNull(expression.args[0]))
      }

      if (expression.args[1] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[1]), mapType.value, expression.args[1].loc, false, this.expressionCanBeNull(expression.args[1]))
      }

      for (const arg of expression.args.slice(2)) {
        this.checkExpression(arg)
      }

      expression.valueType = 'map'
      expression.mapKeyType = mapType.key
      expression.mapValueType = mapType.value

      return 'map'
    }

    if (objectType === 'set' && isSetMethod(property)) {
      const elementType = this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'

      if (property === 'clear') {
        this.checkCollectionArgCount(expression, 'set.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      this.checkCollectionArgCount(expression, `set.${property}`, 1)

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), elementType, expression.args[0].loc, false, this.expressionCanBeNull(expression.args[0]))
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      if (property === 'add') {
        expression.valueType = 'set'
        expression.setElementType = elementType
        return 'set'
      }

      expression.valueType = 'boolean'
      return 'boolean'
    }

    return null
  }

  checkCollectionArgCount(expression: AnyNode, name: string, expected: number): void {
    if (expression.args.length !== expected) {
      this.report('CCJS_ARG_COUNT', `${name} expects ${expected} argument(s), got ${expression.args.length}`, expression.loc)
    }
  }

  checkArrayMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isArrayMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'array') {
      return null
    }

    const elementType = this.resolveExpressionArrayElementType(expression.callee.object) ?? 'unknown'
    const elementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.callee.object) ?? elementType

    expression.arrayElementType = elementType
    expression.arrayElementDeclaredType = elementDeclaredType

    if (expression.callee.property === 'push') {
      expression.valueType = 'number'

      if (expression.args.length !== 1) {
        this.report('CCJS_ARG_COUNT', `array.push expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      }

      if (expression.args[0] != null) {
        const pushedType = this.checkExpression(expression.args[0])

        if (elementType !== 'unknown') {
          this.checkAssignableType(pushedType, elementType, expression.args[0].loc, false, this.expressionCanBeNull(expression.args[0]))
        }
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      return 'number'
    }

    if (expression.callee.property === 'pop') {
      expression.valueType = elementType
      expression.nullable = true

      if (expression.args.length !== 0) {
        this.report('CCJS_ARG_COUNT', `array.pop expects 0 argument(s), got ${expression.args.length}`, expression.loc)
      }

      for (const arg of expression.args) {
        this.checkExpression(arg)
      }

      return elementType
    }

    expression.valueType = 'array'

    if (expression.callee.property === 'sort') {
      if (expression.args.length > 1) {
        this.report('CCJS_ARG_COUNT', `array.sort expects 0 or 1 argument(s), got ${expression.args.length}`, expression.loc)
      }

      if (expression.args[0] != null) {
        this.checkArrayCallback(expression.args[0], [
          { name: 'left', valueType: elementType },
          { name: 'right', valueType: elementType }
        ], 'number')
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      return 'array'
    }

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `array.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (expression.callee.property === 'filter') {
      if (expression.args[0] != null) {
        this.checkArrayCallback(expression.args[0], [
          { name: 'value', valueType: elementType },
          { name: 'index', valueType: 'number' }
        ], 'boolean')
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      return 'array'
    }

    const mappedType = expression.args[0] == null
      ? 'unknown'
      : this.checkArrayCallback(expression.args[0], [
          { name: 'value', valueType: elementType },
          { name: 'index', valueType: 'number' }
        ])

    expression.arrayElementType = mappedType
    expression.arrayElementDeclaredType = mappedType

    for (const arg of expression.args.slice(1)) {
      this.checkExpression(arg)
    }

    return 'array'
  }

  checkArrayCallback(expression: AnyNode, params: Array<{ name: string, valueType: ValueType }>, returnType?: ValueType): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc)

      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report('CCJS_ARG_COUNT', `array callback expects at most ${params.length} parameter(s), got ${expression.params.length}`, expression.loc)
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false

    this.withScope(() => {
      for (const [index, param] of expression.params.entries()) {
        const expected = params[index]?.valueType ?? 'unknown'
        const actual = param.valueType === 'unknown' ? expected : param.valueType

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc)
        }

        param.declaredType = param.valueType === 'unknown' ? actual : param.valueType
        param.valueType = actual
        param.nullable = false

        this.declare(param.name, {
          kind: 'param',
          mutable: true,
          valueType: actual,
          loc: param.loc
        }, param.loc)
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.body.loc ?? expression.loc
        returnNullable = this.expressionCanBeNull(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression == null) {
          this.checkStatements(expression.body)
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = returnExpression.loc ?? expression.loc
          returnNullable = this.expressionCanBeNull(returnExpression)
        }
      }
    })

    if (returnType != null) {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = returnType ?? actualReturnType
    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable

    return actualReturnType
  }

  resolveSingleReturnExpression(body: AnyNode): AnyNode | null {
    const statements = Array.isArray(body)
      ? body
      : body?.type === 'BlockStatement'
        ? body.body
        : null

    if (statements == null || statements.length !== 1) {
      return null
    }

    const [statement] = statements

    return statement?.type === 'ReturnStatement' ? statement.argument ?? null : null
  }

  checkStringConversionCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1 || expression.callee.path[0] !== 'String') {
      return null
    }

    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `String expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'string'
    }

    if (!['boolean', 'number', 'string'].includes(argTypes[0])) {
      this.report('CCJS_TYPE_MISMATCH', `cannot convert ${argTypes[0]} to string with String`, expression.args[0].loc)
    }

    return 'string'
  }

  checkStringTrimCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'trim') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    for (const arg of expression.args) {
      this.checkExpression(arg)
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report('CCJS_ARG_COUNT', `string.trim expects 0 argument(s), got ${expression.args.length}`, expression.loc)
    }

    return 'string'
  }

  checkStringSliceCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'slice') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report('CCJS_ARG_COUNT', `string.slice expects 1 or 2 argument(s), got ${expression.args.length}`, expression.loc)
    }

    for (const [index, argType] of argTypes.entries()) {
      this.checkAssignableType(argType, 'number', expression.args[index].loc)
    }

    return 'string'
  }

  checkStringPredicateCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isStringPredicateMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `string.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (argTypes[0] != null) {
      this.checkAssignableType(argTypes[0], 'string', expression.args[0].loc, false, this.expressionCanBeNull(expression.args[0]))
    }

    return 'boolean'
  }

  checkNewExpression(expression: AnyNode): ValueType {
    const argTypes = expression.args.map(arg => this.checkExpression(arg))

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    if (expression.callee.path[0] === 'Map') {
      expression.valueType = 'map'
      expression.mapKeyType = 'unknown'
      expression.mapValueType = 'unknown'
      return 'map'
    }

    if (expression.callee.path[0] === 'Set') {
      expression.valueType = 'set'
      expression.setElementType = 'unknown'
      return 'set'
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
        this.checkAssignableType(argTypes[index], param.valueType, expression.args[index].loc, param.nullable === true, this.expressionCanBeNull(expression.args[index]))
      }
    }

    return 'object'
  }

  checkVariableInitializer(expression: AnyNode, declared: ResolvedTypeInfo | null): ValueType {
    if (expression.type === 'ArrowFunctionExpression' && declared?.valueType === 'function' && declared.functionType != null) {
      this.checkArrowFunctionExpression(expression, declared.functionType)
      return 'function'
    }

    return this.checkExpression(expression)
  }

  checkArrowFunctionExpression(expression: AnyNode, functionType: AnyNode | null = null): void {
    let actualReturnType: ValueType = functionType?.returnType ?? 'unknown'

    this.withScope(() => {
      if (functionType != null && expression.params.length > functionType.params.length) {
        this.report('CCJS_ARG_COUNT', `function callback expects at most ${functionType.params.length} parameter(s), got ${expression.params.length}`, expression.loc)
      }

      for (const [index, param] of expression.params.entries()) {
        const expected = functionType?.params[index]
        const paramInfo = param.valueType === 'unknown' && expected != null
          ? {
              valueType: expected.valueType,
              nullable: expected.nullable === true,
              arrayElementType: expected.arrayElementType ?? null,
              arrayElementDeclaredType: expected.arrayElementDeclaredType ?? null,
              mapKeyType: expected.mapKeyType ?? null,
              mapValueType: expected.mapValueType ?? null,
              promiseValueType: expected.promiseValueType ?? null,
              setElementType: expected.setElementType ?? null,
              functionType: expected.functionType ?? null,
              shape: expected.shape ?? null
            }
          : this.resolveDeclaredType(param.valueType, param.loc)

        if (expected != null && param.valueType !== 'unknown') {
          this.checkAssignableType(expected.valueType, paramInfo.valueType, param.loc, expected.nullable === true)
        }

        param.declaredType = param.valueType === 'unknown'
          ? expected?.declaredType ?? paramInfo.valueType
          : param.valueType
        param.valueType = paramInfo.valueType
        param.nullable = paramInfo.nullable
        param.arrayElementType = paramInfo.arrayElementType
        param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
        param.mapKeyType = paramInfo.mapKeyType
        param.mapValueType = paramInfo.mapValueType
        param.promiseValueType = paramInfo.promiseValueType ?? null
        param.setElementType = paramInfo.setElementType
        param.functionType = paramInfo.functionType
        param.shape = paramInfo.shape

        this.declare(param.name, {
          kind: 'param',
          mutable: true,
          valueType: paramInfo.valueType,
          nullable: paramInfo.nullable,
          arrayElementType: paramInfo.arrayElementType,
          arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
          mapKeyType: paramInfo.mapKeyType,
          mapValueType: paramInfo.mapValueType,
          promiseValueType: paramInfo.promiseValueType ?? null,
          setElementType: paramInfo.setElementType,
          functionType: paramInfo.functionType,
          shape: paramInfo.shape,
          loc: param.loc
        }, param.loc)
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)

        if (functionType != null) {
          this.checkAssignableType(actualReturnType, functionType.returnType, expression.body.loc, functionType.returnNullable === true, this.expressionCanBeNull(expression.body))

          if (functionType.returnType === 'promise' && functionType.returnPromiseValueType != null) {
            this.checkAssignableType(this.resolveExpressionPromiseValueType(expression.body), functionType.returnPromiseValueType, expression.body.loc)
          }
        }
      } else {
        if (functionType == null) {
          this.checkStatements(expression.body)
          return
        }

        const previousReturnType = this.currentReturnType
        const previousReturnNullable = this.currentReturnNullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType

        try {
          this.currentReturnType = functionType.returnType
          this.currentReturnNullable = functionType.returnNullable === true
          this.currentReturnPromiseValueType = functionType.returnPromiseValueType ?? null
          this.checkStatements(expression.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
        }
      }
    })

    expression.returnType = functionType?.returnType ?? actualReturnType
    expression.declaredReturnType = functionType?.declaredReturnType ?? expression.returnType
    expression.returnNullable = functionType?.returnNullable === true || (expression.expressionBody && expression.body?.nullable === true)
    expression.returnArrayElementType = functionType?.returnArrayElementType ?? expression.body?.arrayElementType ?? null
    expression.returnMapKeyType = functionType?.returnMapKeyType ?? expression.body?.mapKeyType ?? null
    expression.returnMapValueType = functionType?.returnMapValueType ?? expression.body?.mapValueType ?? null
    expression.returnPromiseValueType = functionType?.returnPromiseValueType ?? expression.body?.promiseValueType ?? null
    expression.returnSetElementType = functionType?.returnSetElementType ?? expression.body?.setElementType ?? null
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
        const methodReturnInfo = this.resolveDeclaredType(method.returnType, method.loc)
        this.currentReturnType = methodReturnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = methodReturnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        this.currentReturnPromiseValueType = methodReturnInfo.promiseValueType ?? null

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
            nullable: paramInfo.nullable,
            arrayElementType: paramInfo.arrayElementType,
            arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
            mapKeyType: paramInfo.mapKeyType,
            mapValueType: paramInfo.mapValueType,
            promiseValueType: paramInfo.promiseValueType ?? null,
            setElementType: paramInfo.setElementType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          }, param.loc)
        }

        try {
          this.checkStatements(method.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
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

      const fieldType = this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
      const propertyType = this.checkExpression(property.value)

      this.checkAssignableType(propertyType, fieldType.valueType, property.loc, fieldType.nullable, this.expressionCanBeNull(property.value))

      if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
        this.checkAssignableType(this.resolveExpressionArrayElementType(property.value), fieldType.arrayElementType, property.loc)
      }

      if (fieldType.valueType === 'map') {
        const actual = this.resolveExpressionMapType(property.value)

        if (fieldType.mapKeyType != null) {
          this.checkAssignableType(actual?.key, fieldType.mapKeyType, property.loc)
        }

        if (fieldType.mapValueType != null) {
          this.checkAssignableType(actual?.value, fieldType.mapValueType, property.loc)
        }
      }

      if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
        this.checkAssignableType(this.resolveExpressionSetElementType(property.value), fieldType.setElementType, property.loc)
      }

      if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
        this.checkAssignableType(this.resolveExpressionPromiseValueType(property.value), fieldType.promiseValueType, property.loc)
      }
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
        returnNullable: symbol.functionType.returnNullable,
        returnArrayElementType: symbol.functionType.returnArrayElementType,
        returnArrayElementDeclaredType: symbol.functionType.returnArrayElementDeclaredType,
        returnMapKeyType: symbol.functionType.returnMapKeyType,
        returnMapValueType: symbol.functionType.returnMapValueType,
        returnPromiseValueType: symbol.functionType.returnPromiseValueType,
        returnSetElementType: symbol.functionType.returnSetElementType,
        returnShape: symbol.functionType.returnShape,
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
    const iterableType = this.checkExpression(statement.iterable)
    const mapEntryShape = iterableType === 'map'
      ? this.createMapEntryShape(this.resolveExpressionMapType(statement.iterable), statement.nameLoc)
      : null
    const elementType = iterableType === 'array'
      ? this.resolveExpressionArrayElementType(statement.iterable) ?? 'unknown'
      : iterableType === 'set'
        ? this.resolveExpressionSetElementType(statement.iterable) ?? 'unknown'
        : iterableType === 'map'
          ? 'object'
          : 'unknown'
    const elementDeclaredType = iterableType === 'array'
      ? this.resolveExpressionArrayElementDeclaredType(statement.iterable) ?? elementType
      : iterableType === 'set'
        ? elementType
        : iterableType === 'map'
          ? 'object'
          : 'unknown'
    const declared = statement.declaredType == null ? null : this.resolveDeclaredType(statement.declaredType, statement.nameLoc)
    const valueType = declared?.valueType ?? elementType
    const inferredDeclaredType = declared == null ? elementDeclaredType : statement.declaredType
    const shape = declared?.shape ?? mapEntryShape

    statement.valueType = valueType
    statement.nullable = declared?.nullable === true
    statement.inferredDeclaredType = inferredDeclaredType
    statement.arrayElementType = declared?.arrayElementType ?? null
    statement.arrayElementDeclaredType = declared?.arrayElementDeclaredType ?? null
    statement.mapKeyType = declared?.mapKeyType ?? null
    statement.mapValueType = declared?.mapValueType ?? null
    statement.setElementType = declared?.setElementType ?? null
    statement.functionType = declared?.functionType ?? null
    statement.shape = shape

    if (declared != null) {
      this.checkAssignableType(elementType, declared.valueType, statement.nameLoc, declared.nullable)
    }

    this.withScope(() => {
      this.declare(statement.name, {
        kind: statement.kind,
        mutable: statement.kind === 'let',
        valueType,
        nullable: declared?.nullable === true,
        arrayElementType: declared?.arrayElementType ?? null,
        arrayElementDeclaredType: declared?.arrayElementDeclaredType ?? null,
        mapKeyType: declared?.mapKeyType ?? null,
        mapValueType: declared?.mapValueType ?? null,
        setElementType: declared?.setElementType ?? null,
        functionType: declared?.functionType ?? null,
        shape,
        loc: statement.nameLoc
      }, statement.nameLoc)

      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
    })
  }

  createMapEntryShape(mapType: { key: ValueType | null, value: ValueType | null } | null, loc: SourceLocation): ObjectShapeInfo {
    return {
      kind: 'object',
      fields: [
        {
          name: 'key',
          readonly: true,
          declaredType: mapType?.key ?? 'unknown',
          valueType: mapType?.key ?? 'unknown',
          loc
        },
        {
          name: 'value',
          readonly: true,
          declaredType: mapType?.value ?? 'unknown',
          valueType: mapType?.value ?? 'unknown',
          loc
        }
      ]
    }
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

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name == null || name === 'unknown') {
      return {
        valueType: 'unknown',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const nullableTypeName = nullableTypeNameFromTypeName(name)

    if (nullableTypeName != null) {
      const inner = this.resolveDeclaredType(nullableTypeName, loc)

      return {
        ...inner,
        nullable: true
      }
    }

    const arrayElementTypeName = arrayElementTypeNameFromTypeName(name)

    if (name === 'array' || arrayElementTypeName != null) {
      const elementInfo = arrayElementTypeName == null ? null : this.resolveDeclaredType(arrayElementTypeName, loc)

      return {
        valueType: 'array',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: elementInfo?.valueType ?? 'unknown',
        arrayElementDeclaredType: arrayElementTypeName ?? null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || mapTypeNames != null) {
      const keyInfo = mapTypeNames == null ? null : this.resolveDeclaredType(mapTypeNames.key, loc)
      const valueInfo = mapTypeNames == null ? null : this.resolveDeclaredType(mapTypeNames.value, loc)

      return {
        valueType: 'map',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: keyInfo?.valueType ?? 'unknown',
        mapValueType: valueInfo?.valueType ?? 'unknown',
        promiseValueType: null,
        setElementType: null
      }
    }

    const setElementTypeName = setElementTypeNameFromTypeName(name)

    if (name === 'set' || setElementTypeName != null) {
      const elementInfo = setElementTypeName == null ? null : this.resolveDeclaredType(setElementTypeName, loc)

      return {
        valueType: 'set',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: elementInfo?.valueType ?? 'unknown'
      }
    }

    const promiseValueTypeName = promiseValueTypeNameFromTypeName(name)

    if (name === 'promise' || promiseValueTypeName != null) {
      const valueInfo = promiseValueTypeName == null ? null : this.resolveDeclaredType(promiseValueTypeName, loc)

      return {
        valueType: 'promise',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: valueInfo?.valueType ?? 'unknown',
        setElementType: null
      }
    }

    if (isBuiltinValueType(name)) {
      return {
        valueType: name,
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const shape = this.types.get(name)

    if (shape != null) {
      if (shape.kind === 'function') {
        const returnInfo = this.resolveDeclaredType(shape.returnType, loc)

        return {
          valueType: 'function',
          nullable: false,
          functionType: {
            ...shape,
            params: shape.params.map(param => {
              const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

              return {
                ...param,
                declaredType: param.valueType,
                valueType: paramInfo.valueType,
                nullable: paramInfo.nullable,
                arrayElementType: paramInfo.arrayElementType,
                arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
                mapKeyType: paramInfo.mapKeyType,
                mapValueType: paramInfo.mapValueType,
                promiseValueType: paramInfo.promiseValueType ?? null,
                setElementType: paramInfo.setElementType,
                functionType: paramInfo.functionType,
                shape: paramInfo.shape
              }
            }),
            declaredReturnType: shape.returnType,
            returnType: returnInfo.valueType,
            returnNullable: returnInfo.nullable,
            returnArrayElementType: returnInfo.arrayElementType,
            returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
            returnMapKeyType: returnInfo.mapKeyType,
            returnMapValueType: returnInfo.mapValueType,
            returnPromiseValueType: returnInfo.promiseValueType ?? null,
            returnSetElementType: returnInfo.setElementType,
            returnShape: returnInfo.shape
          },
          shape: null,
          arrayElementType: null,
          arrayElementDeclaredType: null,
          mapKeyType: null,
          mapValueType: null,
          promiseValueType: null,
          setElementType: null
        }
      }

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: this.resolveObjectShape(shape),
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    this.report('CCJS_UNKNOWN_TYPE', `unknown type ${name}`, loc)

    return {
      valueType: 'unknown',
      nullable: false,
      functionType: null,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      mapKeyType: null,
      mapValueType: null,
      promiseValueType: null,
      setElementType: null
    }
  }

  resolveObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    return {
      ...shape,
      fields: shape.fields.map(field => {
        const fieldInfo = this.resolveDeclaredType(field.valueType, field.loc)

        return {
          ...field,
          declaredType: field.valueType,
          valueType: fieldInfo.valueType,
          nullable: fieldInfo.nullable,
          arrayElementType: fieldInfo.arrayElementType,
          arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
          mapKeyType: fieldInfo.mapKeyType,
          mapValueType: fieldInfo.mapValueType,
          promiseValueType: fieldInfo.promiseValueType ?? null,
          setElementType: fieldInfo.setElementType,
          functionType: fieldInfo.functionType,
          shape: fieldInfo.shape
        }
      })
    }
  }

  resolveExpressionArrayElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'ArrayLiteral') {
      return expression.arrayElementType ?? null
    }

    if (expression.type === 'CallExpression') {
      return expression.arrayElementType ?? null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      return this.scope.resolve(expression.path[0])?.arrayElementType ?? null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.arrayElementType ?? null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.arrayElementType ?? null
    }

    return null
  }

  resolveExpressionArrayElementDeclaredType(expression: AnyNode | null | undefined): string | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'ArrayLiteral' || expression.type === 'CallExpression') {
      return expression.arrayElementDeclaredType ?? expression.arrayElementType ?? null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.arrayElementDeclaredType ?? symbol?.arrayElementType ?? null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.arrayElementDeclaredType ?? field?.arrayElementType ?? null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.arrayElementDeclaredType ?? field?.arrayElementType ?? null
    }

    return null
  }

  resolveExpressionMapType(expression: AnyNode | null | undefined): { key: ValueType | null, value: ValueType | null } | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      return expression.valueType === 'map'
        ? {
            key: expression.mapKeyType ?? null,
            value: expression.mapValueType ?? null
          }
        : null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.valueType === 'map'
        ? {
            key: symbol.mapKeyType ?? null,
            value: symbol.mapValueType ?? null
          }
        : null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.valueType === 'map'
        ? {
            key: field.mapKeyType ?? null,
            value: field.mapValueType ?? null
          }
        : null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.valueType === 'map'
        ? {
            key: field.mapKeyType ?? null,
            value: field.mapValueType ?? null
          }
        : null
    }

    return null
  }

  resolveExpressionSetElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      return expression.valueType === 'set' ? expression.setElementType ?? null : null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.valueType === 'set' ? symbol.setElementType ?? null : null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.valueType === 'set' ? field.setElementType ?? null : null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.valueType === 'set' ? field.setElementType ?? null : null
    }

    return null
  }

  resolveExpressionPromiseValueType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      return expression.valueType === 'promise' ? expression.promiseValueType ?? null : null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.valueType === 'promise' ? symbol.promiseValueType ?? null : null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.valueType === 'promise' ? field.promiseValueType ?? null : null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.valueType === 'promise' ? field.promiseValueType ?? null : null
    }

    return null
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

  checkAssignableType(actual: ValueType | null | undefined, expected: ValueType | null | undefined, loc: SourceLocation, expectedNullable = false, actualNullable = false): void {
    if (!isAssignableType(actual, expected, expectedNullable, actualNullable)) {
      const actualLabel = actualNullable && actual !== 'null' && actual !== 'unknown' && actual != null
        ? `${actual} | null`
        : actual

      this.report('CCJS_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
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
  if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
    return 'boolean'
  }

  if (operator === '??') {
    return left === 'null' || left === 'unknown' ? right : left
  }

  if (operator === '+' && (left === 'string' || right === 'string')) {
    return 'string'
  }

  return 'number'
}

function isEqualityOperator(operator: string): boolean {
  return ['===', '!==', '==', '!='].includes(operator)
}

function isStringPredicateMethod(name: string): boolean {
  return ['includes', 'startsWith', 'endsWith'].includes(name)
}

function isArrayMethod(name: string): boolean {
  return ['sort', 'filter', 'map', 'push', 'pop'].includes(name)
}

function isMapMethod(name: string): boolean {
  return ['clear', 'delete', 'get', 'has', 'set'].includes(name)
}

function isSetMethod(name: string): boolean {
  return ['add', 'clear', 'delete', 'has'].includes(name)
}

function isEqualityComparableType(left: ValueType, right: ValueType): boolean {
  if (left === 'unknown' || right === 'unknown') {
    return true
  }

  return ['boolean', 'number', 'string', 'null'].includes(left) && left === right
}

function isAssignableType(actual: ValueType | null | undefined, expected: ValueType | null | undefined, expectedNullable = false, actualNullable = false): boolean {
  if (actual == null || expected == null || actual === 'unknown' || expected === 'unknown') {
    return true
  }

  if (actualNullable && actual !== 'null' && !expectedNullable) {
    return false
  }

  if (actual === 'null') {
    return expected === 'null' || expectedNullable
  }

  return actual === expected
}

function isSwitchableType(type: ValueType): boolean {
  return ['boolean', 'number', 'string', 'unknown'].includes(type)
}

function isMatchingSwitchCaseType(actual: ValueType, expected: ValueType): boolean {
  return actual === 'unknown' || expected === 'unknown' || actual === expected
}

function arrayElementTypeNameFromTypeName(name: string): string | null {
  const match = /^array<(.+)>$/.exec(name)

  return match?.[1] ?? null
}

function nullableTypeNameFromTypeName(name: string): string | null {
  const match = /^nullable<(.+)>$/.exec(name)

  return match?.[1] ?? null
}

function mapTypeNamesFromTypeName(name: string): { key: string, value: string } | null {
  const match = /^map<(.+)>$/.exec(name)

  if (match == null) {
    return null
  }

  const args = splitGenericArgs(match[1])

  return args.length === 2
    ? {
        key: args[0],
        value: args[1]
      }
    : null
}

function setElementTypeNameFromTypeName(name: string): string | null {
  const match = /^set<(.+)>$/.exec(name)
  const args = match == null ? [] : splitGenericArgs(match[1])

  return args.length === 1 ? args[0] : null
}

function promiseValueTypeNameFromTypeName(name: string): string | null {
  const match = /^promise<(.+)>$/.exec(name)
  const args = match == null ? [] : splitGenericArgs(match[1])

  return args.length === 1 ? args[0] : null
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

function commonArrayElementType(types: ValueType[]): ValueType {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every(type => type === first) ? first : 'unknown'
}

function isBuiltinValueType(name: string): boolean {
  return ['array', 'boolean', 'function', 'null', 'number', 'object', 'promise', 'string', 'void'].includes(name)
}

function promiseStaticMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression' || !['resolve', 'reject'].includes(callee.property)) {
    return null
  }

  return callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Promise'
    ? callee.property
    : null
}

function fsRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression' || !['readFile', 'writeFile'].includes(callee.property)) {
    return null
  }

  return callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'fs'
    ? callee.property
    : null
}
