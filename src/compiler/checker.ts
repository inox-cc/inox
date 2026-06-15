import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import {
  commonArrayElementType,
  commonValueType,
  inferBinaryExpressionType,
  isAssignableType,
  isEqualityComparableType,
  isEqualityOperator,
  isMatchingSwitchCaseType,
  isSwitchableType
} from './checker/assignability.ts'
import {
  debugMemoryStatsObjectShape,
  errorObjectShape,
  fetchAbortControllerObjectShape,
  fetchResponseObjectShape,
  fsConstantValues,
  fsDirentObjectShape,
  fsStatsObjectShape,
  globals,
  libuvOnlyRuntimeImports,
  numericCastNames,
  pathParseObjectShape,
  urlObjectShape
} from './checker/builtins.ts'
import { Scope } from './checker/scope.ts'
import { fsRuntimeCallInfo, isFsRuntimeImportSymbol, removedFsRuntimeMethodInfo } from './checker/std/fs.ts'
import { isJsonParseDeclaredType, jsonRuntimeMethodName } from './checker/std/json.ts'
import { isMathRuntimeMethod } from './checker/std/math.ts'
import { timerCallbackFunctionType, timerClearMethodName, timerRuntimeMethodName } from './checker/std/timers.ts'
import { memberExpressionPath } from './member-paths.ts'
import type { FsRuntimeCallInfo } from './stdlib/descriptors/fs.ts'
import {
  arrayElementTypeNameFromTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromTypeName,
  promiseValueTypeNameFromTypeName,
  setElementTypeNameFromTypeName
} from './type-names.ts'
import { unsupportedFsRuntimeMethodMessage } from './stdlib/descriptors/fs.ts'
import { unsupportedRuntimeBuiltinImportMessage } from './stdlib/descriptors/node-builtins.ts'
import {
  fetchHeadersRuntimeMethod,
  isFetchAbortControllerMethod,
  isFetchHeadersMethod,
  isFetchInitOption,
  isFetchRedirectMode,
  isFetchResponseBodyMethod,
  isSupportedFetchResponseBodyMethod
} from './stdlib/descriptors/fetch.ts'
import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryStaticRuntimeMethodNameFromPath
} from './stdlib/descriptors/binary.ts'
import {
  collectionConstructorNameFromPath,
  isArrayMethod,
  isStringPredicateMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName,
  stringRuntimeMethodName
} from './stdlib/descriptors/collections.ts'
import {
  cryptoRuntimeMethodNameFromPath,
  isCryptoRuntimeMethod,
  isNodeCryptoImportSource,
  isUnsupportedNodeCryptoMethod
} from './stdlib/descriptors/crypto.ts'
import { debugRuntimeMethodNameFromPath } from './stdlib/descriptors/debug.ts'
import { mathRuntimeArgCount } from './stdlib/descriptors/math.ts'
import { isTimerHandleMethod } from './stdlib/descriptors/timers.ts'
import {
  isChildProcessRuntimeMethod,
  isNodeChildProcessImportSource,
  isUnsupportedChildProcessRuntimeMethod
} from './stdlib/descriptors/child-process.ts'
import {
  isNodePathImportSource,
  isPathRuntimeConstant,
  isPathRuntimeMethod,
  isUnsupportedPathRuntimeMethod
} from './stdlib/descriptors/path.ts'
import {
  isNodeOsImportSource,
  isOsRuntimeConstant,
  isOsRuntimeMethod,
  isUnsupportedOsRuntimeMethod
} from './stdlib/descriptors/os.ts'
import {
  isNodeProcessImportSource,
  isProcessRuntimeMethod,
  isProcessRuntimeProperty,
  processRuntimePropertyValueType,
  isUnsupportedProcessRuntimeProperty,
  isUnsupportedProcessRuntimeMethod
} from './stdlib/descriptors/process.ts'
import {
  isNodeUrlImportSource,
  isUnsupportedUrlRuntimeMethod,
  isUrlRuntimeConstructor,
  isUrlRuntimeMethod
} from './stdlib/descriptors/url.ts'
import type {
  AnyNode,
  Diagnostic,
  CompileOptions,
  ObjectShapeInfo,
  ProgramNode,
  SourceLocation,
  SymbolInfo,
  TypeAliasInfo,
  ValueType
} from './types.ts'

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

type OwnershipGraphEdge = {
  from: string
  to: string
  field: string
  loc: SourceLocation
}

export function checkProgram(program: ProgramNode, options: CompileOptions = {}): { ast: ProgramNode } {
  const checker = new Checker(program, options)
  checker.check()

  return {
    ast: program
  }
}

class Checker {
  program: ProgramNode
  options: CompileOptions
  diagnostics: Diagnostic[]
  scope: Scope
  types: Map<string, TypeAliasInfo>
  classNames: Set<string>
  breakDepth: number
  continueDepth: number
  currentReturnType: ValueType
  currentReturnNullable: boolean
  currentReturnPromiseValueType: ValueType | null
  currentReturnAsync: boolean
  currentClassConstructor: boolean
  asyncDepth: number
  functionDepth: number
  narrowedNullableNames: Set<string>

  constructor(program: ProgramNode, options: CompileOptions = {}) {
    this.program = program
    this.options = options
    this.diagnostics = []
    this.scope = new Scope(null)
    this.types = new Map()
    this.classNames = new Set()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.currentReturnNullable = false
    this.currentReturnPromiseValueType = null
    this.currentReturnAsync = false
    this.currentClassConstructor = false
    this.asyncDepth = 0
    this.functionDepth = 0
    this.narrowedNullableNames = new Set()
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
      } else if (item.type === 'ClassDeclaration') {
        this.classNames.add(item.name)
      }
    }

    this.reportOwnershipCycles()
    throwDiagnostics(this.diagnostics)

    for (const item of this.program.body) {
      if (item.type === 'ImportDeclaration') {
        if (item.typeOnly) {
          continue
        }

        for (const specifier of item.specifiers) {
          this.declare(
            specifier.local,
            {
              kind: 'import',
              mutable: false,
              valueType: this.runtimeImportValueType(item.source, specifier.imported),
              importedName: specifier.imported,
              importSource: item.source,
              loc: specifier.loc
            },
            specifier.loc
          )
        }
      }

      if (item.type === 'FunctionDeclaration') {
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)

        this.declare(
          item.name,
          {
            kind: 'function',
            mutable: false,
            valueType: 'function',
            params: item.params.map((param) => this.resolveParam(param)),
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
          },
          item.loc
        )
      }

      if (item.type === 'ClassDeclaration') {
        const constructorParams =
          item.methods
            .find((method) => method.name === 'constructor')
            ?.params.map((param) => this.resolveParam(param)) ?? []
        const shape = this.resolveClassInstanceShape(item, constructorParams)

        item.shape = shape

        this.declare(
          item.name,
          {
            kind: 'class',
            mutable: false,
            valueType: 'class',
            classMethods: item.methods,
            constructorParams,
            shape,
            loc: item.loc
          },
          item.loc
        )
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

  resolveClassInstanceShape(statement: AnyNode, constructorParams: AnyNode[]): ObjectShapeInfo {
    if (statement.fields?.length > 0) {
      return {
        kind: 'object',
        fields: statement.fields.map((field) => this.resolveClassField(field))
      }
    }

    const fields: AnyNode[] = []
    const seen = new Set<string>()
    const constructor = statement.methods.find((method) => method.name === 'constructor') ?? null

    for (const assignment of this.collectClassConstructorFieldAssignments(constructor)) {
      if (seen.has(assignment.field)) {
        continue
      }

      seen.add(assignment.field)
      fields.push({
        name: assignment.field,
        readonly: false,
        valueType: this.resolveClassConstructorFieldType(assignment.value, constructorParams),
        loc: assignment.loc
      })
    }

    return {
      kind: 'object',
      fields
    }
  }

  resolveClassField(field: AnyNode): AnyNode {
    const fieldInfo = this.resolveFieldDeclaredType(field)

    field.declaredType = field.valueType
    field.valueType = fieldInfo.valueType
    field.nullable = fieldInfo.nullable
    field.arrayElementType = fieldInfo.arrayElementType
    field.arrayElementDeclaredType = fieldInfo.arrayElementDeclaredType
    field.mapKeyType = fieldInfo.mapKeyType
    field.mapValueType = fieldInfo.mapValueType
    field.promiseValueType = fieldInfo.promiseValueType ?? null
    field.setElementType = fieldInfo.setElementType
    field.functionType = fieldInfo.functionType
    field.shape = fieldInfo.shape

    return field
  }

  collectClassConstructorFieldAssignments(constructor: AnyNode | null): AnyNode[] {
    if (constructor == null) {
      return []
    }

    const assignments: AnyNode[] = []

    for (const statement of constructor.body) {
      const assignment =
        statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
          ? statement.expression
          : null

      if (assignment?.target?.type !== 'MemberExpression' || !this.isThisExpression(assignment.target.object)) {
        continue
      }

      assignments.push({
        field: assignment.target.property,
        value: assignment.value,
        loc: assignment.loc
      })
    }

    return assignments
  }

  resolveClassConstructorFieldType(expression: AnyNode, constructorParams: AnyNode[]): ValueType {
    if (expression?.type === 'Reference' && expression.path.length === 1) {
      const param = constructorParams.find((item) => item.name === expression.path[0])

      if (param != null) {
        return param.valueType
      }
    }

    if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression?.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression?.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression?.type === 'ArrayLiteral') {
      return 'array'
    }

    if (expression?.type === 'ObjectLiteral') {
      return 'object'
    }

    return expression?.valueType ?? 'unknown'
  }

  checkTopLevelItem(item: AnyNode): void {
    if (item.type === 'TypeAliasDeclaration') {
      return
    }

    if (item.type === 'ImportDeclaration') {
      this.checkRuntimeBuiltinImport(item)
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
        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = item.async === true
        const previousAsyncDepth = this.asyncDepth
        this.asyncDepth = item.async ? this.asyncDepth + 1 : this.asyncDepth
        const previousFunctionDepth = this.functionDepth
        this.functionDepth += 1

        for (const param of item.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(
            param.name,
            {
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
            },
            param.loc
          )
        }

        try {
          this.checkStatements(item.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.asyncDepth = previousAsyncDepth
          this.functionDepth = previousFunctionDepth
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
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      this.withNarrowedNullableNames(narrowing.trueNames, () => {
        this.checkScopedBody(statement.consequent)
      })

      if (statement.alternate != null) {
        this.withNarrowedNullableNames(narrowing.falseNames, () => {
          this.checkScopedBody(statement.alternate)
        })
      }

      return
    }

    if (statement.type === 'WhileStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      this.withLoop(() => {
        this.withNarrowedNullableNames(narrowing.trueNames, () => {
          this.checkScopedBody(statement.body)
        })
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

      const declared =
        statement.declaredType == null ? null : this.resolveDeclaredType(statement.declaredType, statement.loc)
      const initType = statement.init == null ? 'unknown' : this.checkVariableInitializer(statement.init, declared)
      const valueType = declared?.valueType ?? initType
      const arrayElementType = declared?.arrayElementType ?? this.resolveExpressionArrayElementType(statement.init)
      const arrayElementDeclaredType =
        declared?.arrayElementDeclaredType ?? this.resolveExpressionArrayElementDeclaredType(statement.init)
      const mapType =
        declared?.valueType === 'map'
          ? {
              key: declared.mapKeyType,
              value: declared.mapValueType
            }
          : this.resolveExpressionMapType(statement.init)
      const setElementType =
        declared?.valueType === 'set' ? declared.setElementType : this.resolveExpressionSetElementType(statement.init)
      const promiseValueType =
        declared?.valueType === 'promise'
          ? (declared.promiseValueType ?? null)
          : this.resolveExpressionPromiseValueType(statement.init)

      statement.valueType = valueType
      statement.nullable = declared?.nullable === true || statement.init?.nullable === true
      statement.arrayElementType = arrayElementType
      statement.arrayElementDeclaredType =
        valueType === 'object' && statement.init?.arrayElementDeclaredType === 'fs.Dirent'
          ? 'fs.Dirent'
          : arrayElementDeclaredType
      statement.mapKeyType = mapType?.key ?? null
      statement.mapValueType = mapType?.value ?? null
      statement.promiseValueType = promiseValueType
      statement.setElementType = setElementType
      statement.functionType = declared?.functionType ?? null
      statement.shape =
        declared?.shape ??
        statement.init?.shape ??
        (valueType === 'object' &&
        (statement.init?.arrayElementDeclaredType === 'fs.Dirent' || statement.arrayElementDeclaredType === 'fs.Dirent')
          ? fsDirentObjectShape
          : null)
      statement.className = statement.init?.className ?? null

      if (declared?.shape != null && statement.init?.type === 'ObjectLiteral') {
        this.checkObjectLiteralAgainstShape(statement.init, declared.shape)
      }

      this.declare(
        statement.name,
        {
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
          className: statement.className,
          shape: declared?.shape ?? statement.init?.shape ?? null,
          loc: statement.loc
        },
        statement.loc
      )

      if (declared != null && statement.init != null) {
        this.checkAssignableType(
          initType,
          declared.valueType,
          statement.loc,
          declared.nullable,
          this.expressionCanBeNull(statement.init)
        )

        if (declared.valueType === 'array' && declared.arrayElementType != null) {
          this.checkAssignableType(
            this.resolveExpressionArrayElementType(statement.init),
            declared.arrayElementType,
            statement.loc
          )
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
          this.checkAssignableType(
            this.resolveExpressionSetElementType(statement.init),
            declared.setElementType,
            statement.loc
          )
        }

        if (declared.valueType === 'promise' && declared.promiseValueType != null) {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.init),
            declared.promiseValueType,
            statement.loc
          )
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

      if (
        this.currentReturnAsync &&
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType != null
      ) {
        if (actual === 'promise') {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.argument),
            this.currentReturnPromiseValueType,
            statement.loc
          )
        } else {
          this.checkAssignableType(
            actual,
            this.currentReturnPromiseValueType,
            statement.loc,
            false,
            this.expressionCanBeNull(statement.argument)
          )
        }

        return
      }

      this.checkAssignableType(
        actual,
        this.currentReturnType,
        statement.loc,
        this.currentReturnNullable,
        this.expressionCanBeNull(statement.argument)
      )

      if (this.currentReturnType === 'promise' && this.currentReturnPromiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(statement.argument),
          this.currentReturnPromiseValueType,
          statement.loc
        )
      }
    }
  }

  checkTryStatement(statement: AnyNode): void {
    this.checkStatement(statement.block)

    if (statement.handler != null) {
      this.withScope(() => {
        if (statement.handler.param != null) {
          this.declare(
            statement.handler.param,
            {
              kind: 'catch',
              mutable: false,
              valueType: 'unknown',
              loc: statement.handler.paramLoc
            },
            statement.handler.paramLoc
          )
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
      const symbol = this.resolveReference({
        type: 'Reference',
        path: ['this'],
        loc: expression.loc
      })

      expression.nullable = symbol?.nullable === true
      expression.valueType = symbol?.valueType ?? 'unknown'
      expression.shape = symbol?.shape ?? null
      expression.className = symbol?.className ?? null

      return symbol?.valueType ?? 'unknown'
    }

    if (expression.type === 'Reference') {
      const symbol = this.resolveReference(expression)
      expression.nullable = symbol?.nullable === true && !this.narrowedNullableNames.has(expression.path[0])
      expression.valueType = symbol?.valueType ?? 'unknown'
      expression.arrayElementType = symbol?.arrayElementType ?? null
      expression.arrayElementDeclaredType = symbol?.arrayElementDeclaredType ?? null
      expression.mapKeyType = symbol?.mapKeyType ?? null
      expression.mapValueType = symbol?.mapValueType ?? null
      expression.promiseValueType = symbol?.promiseValueType ?? null
      expression.setElementType = symbol?.setElementType ?? null
      expression.functionType = symbol?.functionType ?? null
      expression.shape = symbol?.shape ?? null
      expression.className = symbol?.className ?? null

      if (
        symbol?.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        symbol.importedName != null &&
        isOsRuntimeConstant(symbol.importedName)
      ) {
        expression.osRuntimeConstant = symbol.importedName
      }

      if (
        symbol?.kind === 'import' &&
        isNodeProcessImportSource(symbol.importSource) &&
        symbol.importedName != null &&
        isProcessRuntimeProperty(symbol.importedName)
      ) {
        expression.processRuntimeProperty = symbol.importedName
        expression.valueType = processRuntimePropertyValueType(symbol.importedName) ?? 'unknown'
      }

      if (
        symbol?.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        symbol.importedName != null &&
        isPathRuntimeConstant(symbol.importedName)
      ) {
        expression.pathRuntimeConstant = symbol.importedName
      }

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
      const argTypes = expression.args.map((arg) => this.checkExpression(arg))
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

          this.report(
            'CCJS_ARG_COUNT',
            `function ${name} expects ${symbol.params.length} argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        for (const [index, param] of symbol.params.entries()) {
          if (index < argTypes.length) {
            this.checkAssignableType(
              argTypes[index],
              param.valueType,
              expression.args[index].loc,
              param.nullable === true,
              this.expressionCanBeNull(expression.args[index])
            )
          }
        }
      }

      return expression.valueType
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression)
    }

    if (expression.type === 'AwaitExpression') {
      if (this.asyncDepth === 0 && this.functionDepth > 0) {
        this.report('CCJS_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      const argumentType = this.checkExpression(expression.argument)
      const valueType =
        argumentType === 'promise'
          ? (this.resolveExpressionPromiseValueType(expression.argument) ?? 'unknown')
          : argumentType

      expression.valueType = valueType

      if (valueType === 'array') {
        expression.arrayElementType = this.resolveExpressionArrayElementType(expression.argument)
        expression.arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.argument)
      }

      if (valueType === 'object') {
        expression.shape = this.resolveExpressionShape(expression.argument)
      }

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

    if (expression.type === 'UpdateExpression') {
      return this.checkUpdateExpression(expression)
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
      this.report(
        'CCJS_ASSIGN_CONST',
        `cannot assign to ${symbol.kind} binding ${expression.target.path[0]}`,
        expression.target.loc
      )
    }

    if (symbol != null) {
      this.checkAssignableType(
        valueType,
        symbol.valueType,
        expression.value.loc,
        symbol.nullable === true,
        this.expressionCanBeNull(expression.value)
      )

      if (symbol.valueType === 'promise' && symbol.promiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(expression.value),
          symbol.promiseValueType,
          expression.value.loc
        )
      }

      if (expression.target.path.length === 1 && symbol.nullable === true) {
        this.narrowedNullableNames.delete(expression.target.path[0])
      }
    }

    return valueType
  }

  checkUpdateExpression(expression: AnyNode): ValueType {
    const targetType = this.checkExpression(expression.argument)

    this.checkAssignableType(targetType, 'number', expression.argument.loc)

    if (expression.argument.type === 'Reference') {
      const symbol = this.resolveReference(expression.argument)

      if (symbol != null && expression.argument.path.length === 1 && !symbol.mutable) {
        this.report(
          'CCJS_ASSIGN_CONST',
          `cannot assign to ${symbol.kind} binding ${expression.argument.path[0]}`,
          expression.argument.loc
        )
      }

      return 'number'
    }

    if (expression.argument.type === 'MemberExpression' || expression.argument.type === 'IndexExpression') {
      return 'number'
    }

    this.report('CCJS_INVALID_ASSIGNMENT_TARGET', 'update target must be a binding or field', expression.loc)

    return 'number'
  }

  checkBinaryExpression(expression: AnyNode): ValueType {
    const left = this.checkExpression(expression.left)
    const leftNarrowing = this.resolveNullableConditionNarrowing(expression.left)
    const right =
      expression.operator === '&&'
        ? this.withNarrowedNullableNames(leftNarrowing.trueNames, () => this.checkExpression(expression.right))
        : expression.operator === '||'
          ? this.withNarrowedNullableNames(leftNarrowing.falseNames, () => this.checkExpression(expression.right))
          : this.checkExpression(expression.right)
    const nullableEquality =
      isEqualityOperator(expression.operator) &&
      ((left === 'null' && this.expressionCanBeNull(expression.right)) ||
        (right === 'null' && this.expressionCanBeNull(expression.left)))

    if (isEqualityOperator(expression.operator) && !nullableEquality && !isEqualityComparableType(left, right)) {
      this.report(
        'CCJS_TYPE_MISMATCH',
        `cannot compare ${left} and ${right} with ${expression.operator}`,
        expression.loc
      )
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
    const osConstantType = this.checkOsConstantMemberExpression(expression)

    if (osConstantType != null) {
      return osConstantType
    }

    const processMemberType = this.checkProcessMemberExpression(expression)

    if (processMemberType != null) {
      return processMemberType
    }

    const pathConstantType = this.checkPathConstantMemberExpression(expression)

    if (pathConstantType != null) {
      return pathConstantType
    }

    const fsConstantType = this.checkFsConstantMemberExpression(expression)

    if (fsConstantType != null) {
      return fsConstantType
    }

    const unsupportedFetchBodyType = this.checkFetchUnsupportedResponseBodyMember(expression)

    if (unsupportedFetchBodyType != null) {
      return unsupportedFetchBodyType
    }

    const objectType = this.checkExpression(expression.object)

    this.reportNullableRuntimeAccess(expression.object, expression.loc)

    if (objectType === 'bytes' && expression.property === 'length') {
      expression.valueType = 'number'
      return 'number'
    }

    if (objectType === 'string' && expression.property === 'length') {
      expression.valueType = 'number'
      expression.stringRuntimeMethod = 'length'
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

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = field.ownership === 'weak' || field.nullable === true || fieldType.nullable
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

    const fieldType = this.resolveFieldDeclaredType(field)
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
    const processAssignmentType = this.checkProcessMemberAssignment(expression)

    if (processAssignmentType != null) {
      return processAssignmentType
    }

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

    if (targetType === 'bytes' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
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

    if (field.readonly && !this.canInitializeReadonlyClassField(expression.target.object)) {
      this.report(
        'CCJS_ASSIGN_READONLY_FIELD',
        `cannot assign to readonly field ${expression.target.property}`,
        expression.target.loc
      )
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      fieldType.nullable,
      this.expressionCanBeNull(expression.value)
    )

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc
      )
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
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc
      )
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc
      )
    }

    return valueType
  }

  checkIndexExpression(expression: AnyNode): ValueType {
    const processIndexType = this.checkProcessIndexExpression(expression)

    if (processIndexType != null) {
      return processIndexType
    }

    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    this.reportNullableRuntimeAccess(expression.object, expression.loc)

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.index.loc,
        false,
        this.expressionCanBeNull(expression.index)
      )

      expression.collectionKind = 'map'
      expression.nullable = true
      expression.valueType = mapType.value ?? 'unknown'
      expression.mapKeyType = mapType.key ?? null
      expression.mapValueType = mapType.value ?? null

      return mapType.value ?? 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'bytes') {
        this.checkAssignableType(indexType, 'number', expression.index.loc)
        expression.valueType = 'number'
        return 'number'
      }

      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        expression.valueType = valueType
        expression.arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)

        if (expression.arrayElementDeclaredType === 'fs.Dirent') {
          expression.shape = fsDirentObjectShape
        }

        return valueType
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

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = field.valueType ?? fieldType.valueType

    expression.nullable = field.ownership === 'weak' || field.nullable === true || fieldType.nullable
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

        if (expression.arrayElementDeclaredType === 'fs.Dirent') {
          expression.shape = fsDirentObjectShape
        }

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

    const fieldType = this.resolveFieldDeclaredType(field)
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

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.target.index.loc,
        false,
        this.expressionCanBeNull(expression.target.index)
      )
      this.checkAssignableType(
        valueType,
        mapType.value,
        expression.value.loc,
        false,
        this.expressionCanBeNull(expression.value)
      )

      expression.target.collectionKind = 'map'
      expression.target.valueType = mapType.value ?? 'unknown'
      expression.target.mapKeyType = mapType.key ?? null
      expression.target.mapValueType = mapType.value ?? null

      return valueType
    }

    if (objectType === 'bytes' && expression.target.index.type !== 'StringLiteral') {
      this.checkAssignableType(indexType, 'number', expression.target.index.loc)
      this.checkAssignableType(valueType, 'number', expression.value.loc)
      expression.target.valueType = 'number'
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

    if (field.readonly && !this.canInitializeReadonlyClassField(expression.target.object)) {
      this.report(
        'CCJS_ASSIGN_READONLY_FIELD',
        `cannot assign to readonly field ${expression.target.index.value}`,
        expression.target.loc
      )
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      fieldType.nullable,
      this.expressionCanBeNull(expression.value)
    )

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc
      )
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
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc
      )
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc
      )
    }

    return valueType
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const binaryType = this.checkBinaryCall(expression)

    if (binaryType != null) {
      return binaryType
    }

    const stringConversionType = this.checkStringConversionCall(expression)

    if (stringConversionType != null) {
      return stringConversionType
    }

    const numberConversionType = this.checkNumberConversionCall(expression)

    if (numberConversionType != null) {
      return numberConversionType
    }

    const numericCastType = this.checkNumericCastCall(expression)

    if (numericCastType != null) {
      return numericCastType
    }

    const stringTrimType = this.checkStringTrimCall(expression)

    if (stringTrimType != null) {
      return stringTrimType
    }

    const stringSliceType = this.checkStringSliceCall(expression)

    if (stringSliceType != null) {
      return stringSliceType
    }

    const stringSplitType = this.checkStringSplitCall(expression)

    if (stringSplitType != null) {
      return stringSplitType
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

    const promiseMethodType = this.checkPromiseMethodCall(expression)

    if (promiseMethodType != null) {
      return promiseMethodType
    }

    const timerHandleMethodType = this.checkTimerHandleMethodCall(expression)

    if (timerHandleMethodType != null) {
      return timerHandleMethodType
    }

    const fsStatsMethodType = this.checkFsStatsMethodCall(expression)

    if (fsStatsMethodType != null) {
      return fsStatsMethodType
    }

    const fetchAbortControllerMethodType = this.checkFetchAbortControllerMethodCall(expression)

    if (fetchAbortControllerMethodType != null) {
      return fetchAbortControllerMethodType
    }

    const fetchResponseMethodType = this.checkFetchResponseMethodCall(expression)

    if (fetchResponseMethodType != null) {
      return fetchResponseMethodType
    }

    const fetchHeadersMethodType = this.checkFetchHeadersMethodCall(expression)

    if (fetchHeadersMethodType != null) {
      return fetchHeadersMethodType
    }

    const fsType = this.checkFsCall(expression)

    if (fsType != null) {
      return fsType
    }

    const fetchType = this.checkFetchCall(expression)

    if (fetchType != null) {
      return fetchType
    }

    const jsonType = this.checkJsonCall(expression)

    if (jsonType != null) {
      return jsonType
    }

    const cryptoType = this.checkCryptoCall(expression)

    if (cryptoType != null) {
      return cryptoType
    }

    const childProcessType = this.checkChildProcessCall(expression)

    if (childProcessType != null) {
      return childProcessType
    }

    const osType = this.checkOsCall(expression)

    if (osType != null) {
      return osType
    }

    const processType = this.checkProcessCall(expression)

    if (processType != null) {
      return processType
    }

    const urlType = this.checkUrlCall(expression)

    if (urlType != null) {
      return urlType
    }

    const pathType = this.checkPathCall(expression)

    if (pathType != null) {
      return pathType
    }

    const debugMemoryType = this.checkDebugMemoryCall(expression)

    if (debugMemoryType != null) {
      return debugMemoryType
    }

    const timerType = this.checkTimerCall(expression)

    if (timerType != null) {
      return timerType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType != null) {
      return promiseStaticType
    }

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType != null) {
      return classMethodType
    }

    const mathType = this.checkMathCall(expression)

    if (mathType != null) {
      return mathType
    }

    const calleeType = this.checkExpression(expression.callee)
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))
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
      this.report(
        'CCJS_ARG_COUNT',
        `function ${expression.callee.path[0]} expects ${symbol.params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, param] of symbol.params.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    return symbol.returnType ?? 'unknown'
  }

  checkBinaryCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const staticMethod = binaryStaticRuntimeMethodNameFromPath(memberExpressionPath(expression.callee))

    if (staticMethod != null) {
      if (this.scope.resolve('Buffer') != null) {
        return null
      }

      if (staticMethod === 'from') {
        if (expression.args.length < 1 || expression.args.length > 2) {
          this.report(
            'CCJS_ARG_COUNT',
            `function Buffer.from expects 1 or 2 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] != null) {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            'string',
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }

        this.checkUtf8EncodingArg(expression, 1, 'Buffer.from')
        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }

      if (staticMethod === 'alloc') {
        if (expression.args.length !== 1) {
          this.report(
            'CCJS_ARG_COUNT',
            `function Buffer.alloc expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] != null) {
          this.checkAssignableType(this.checkExpression(expression.args[0]), 'number', expression.args[0].loc)
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'bytes') {
      return null
    }

    const instanceMethod = binaryInstanceRuntimeMethodName(expression.callee.property)

    if (instanceMethod === 'slice') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `bytes.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (const arg of expression.args) {
        this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc)
      }

      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'bytes'

      return 'bytes'
    }

    if (instanceMethod === 'toString') {
      if (expression.args.length > 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `bytes.toString expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkUtf8EncodingArg(expression, 0, 'bytes.toString')
      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'string'

      return 'string'
    }

    return null
  }

  checkUtf8EncodingArg(expression: AnyNode, index: number, label: string): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    const type = this.checkExpression(arg)

    this.checkAssignableType(type, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    if (arg.type !== 'StringLiteral' || arg.value !== 'utf8') {
      this.report('CCJS_TYPE_MISMATCH', `${label} encoding must be 'utf8' in the MVP`, arg.loc)
    }
  }

  checkCryptoCall(expression: AnyNode): ValueType | null {
    const call = this.resolveCryptoRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (const arg of expression.args) {
        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:crypto ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const method = call.method
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    expression.valueType = method === 'randomInt' ? 'number' : method === 'randomUUID' ? 'string' : 'bytes'
    expression.cryptoRuntimeMethod = method

    if (method === 'getRandomValues') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(
        argTypes[0],
        'bytes',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      return 'bytes'
    }

    if (method === 'randomBytes') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc)
      return 'bytes'
    }

    if (method === 'randomFillSync') {
      if (expression.args.length < 1 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(
        argTypes[0],
        'bytes',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      for (const [index, argType] of argTypes.entries()) {
        if (index > 0) {
          this.checkAssignableType(argType, 'number', expression.args[index].loc)
        }
      }

      return 'bytes'
    }

    if (method === 'randomInt') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'number'
      }

      for (const [index, argType] of argTypes.entries()) {
        this.checkAssignableType(argType, 'number', expression.args[index].loc)
      }

      return 'number'
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:crypto randomUUID options are not implemented by the current C backend',
        expression.loc
      )
    }

    return 'string'
  }

  checkChildProcessCall(expression: AnyNode): ValueType | null {
    const call = this.resolveChildProcessRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (const arg of expression.args) {
        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:child_process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (call.method === 'execSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc)
      }

      this.checkChildProcessUtf8Options(expression.args[1], expression.loc)
    } else {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc)
      }

      const args = expression.args[1]
      const options = expression.args[2]

      if (args?.type !== 'ArrayLiteral') {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          'node:child_process execFileSync currently expects a string[] literal args argument',
          args?.loc ?? expression.loc
        )
      } else {
        for (const element of args.elements) {
          this.checkAssignableType(this.checkExpression(element), 'string', element.loc)
        }
      }

      this.checkChildProcessUtf8Options(options, expression.loc)
    }

    expression.childProcessRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  resolveChildProcessRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveChildProcessRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isChildProcessRuntimeMethod(method)
    }
  }

  resolveChildProcessRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodeChildProcessImportSource(symbol.importSource) && importedName != null) {
        return isChildProcessRuntimeMethod(importedName) || isUnsupportedChildProcessRuntimeMethod(importedName)
          ? importedName
          : null
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeChildProcessImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'childProcess')
      ) {
        return isChildProcessRuntimeMethod(path[1]) || isUnsupportedChildProcessRuntimeMethod(path[1]) ? path[1] : null
      }
    }

    return null
  }

  checkChildProcessUtf8Options(options: AnyNode | null | undefined, loc: SourceLocation | undefined): void {
    if (options?.type !== 'ObjectLiteral') {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently require { encoding: "utf8" }',
        options?.loc ?? loc
      )
      return
    }

    const encoding = options.properties.find((property) => property.key === 'encoding')?.value

    if (encoding?.type !== 'StringLiteral' || encoding.value !== 'utf8') {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently support only { encoding: "utf8" }',
        encoding?.loc ?? options.loc
      )
    }
  }

  checkOsCall(expression: AnyNode): ValueType | null {
    const call = this.resolveOsRuntimeCall(expression)

    if (call == null) {
      return null
    }

    for (const arg of expression.args) {
      this.checkExpression(arg)
    }

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:os ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.osRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  resolveOsRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveOsRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isOsRuntimeMethod(method)
    }
  }

  resolveOsRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodeOsImportSource(symbol.importSource) && importedName != null) {
        return isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName) ? importedName : null
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'os')
      ) {
        return isOsRuntimeMethod(path[1]) || isUnsupportedOsRuntimeMethod(path[1]) ? path[1] : null
      }
    }

    return null
  }

  checkOsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const constant = this.resolveOsRuntimeConstant(memberExpressionPath(expression))

    if (constant == null) {
      return null
    }

    expression.osRuntimeConstant = constant
    expression.valueType = 'string'

    return 'string'
  }

  resolveOsRuntimeConstant(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (
        symbol?.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        importedName != null &&
        isOsRuntimeConstant(importedName)
      ) {
        return importedName
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'os') &&
        isOsRuntimeConstant(path[1])
      ) {
        return path[1]
      }
    }

    return null
  }

  checkProcessCall(expression: AnyNode): ValueType | null {
    const call = this.resolveProcessRuntimeCall(expression)

    if (call == null) {
      return null
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    expression.processRuntimeMethod = call.method

    if (call.method === 'cwd') {
      if (expression.args.length !== 0) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.valueType = 'string'
      return 'string'
    }

    if (expression.args.length > 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (argTypes[0] != null) {
      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc)
    }

    expression.valueType = 'void'
    return 'void'
  }

  resolveProcessRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveProcessRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isProcessRuntimeMethod(method)
    }
  }

  resolveProcessRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodeProcessImportSource(symbol.importSource) && importedName != null) {
        return isProcessRuntimeMethod(importedName) || isUnsupportedProcessRuntimeMethod(importedName)
          ? importedName
          : null
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeProcessImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'process')
      ) {
        return isProcessRuntimeMethod(path[1]) || isUnsupportedProcessRuntimeMethod(path[1]) ? path[1] : null
      }
    }

    return null
  }

  checkProcessMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)

    if (path == null || path.length < 1) {
      return null
    }

    const root = this.scope.resolve(path[0])

    if (root?.kind !== 'import' || !isNodeProcessImportSource(root.importSource)) {
      return null
    }

    if (root.importedName === 'default' || root.importedName === 'process') {
      if (path.length === 2 && isUnsupportedProcessRuntimeProperty(path[1])) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          `node:process ${path[1]} is not implemented by the current C backend`,
          expression.loc
        )
        expression.valueType = 'unknown'
        return 'unknown'
      }

      if (path.length === 2 && isProcessRuntimeProperty(path[1])) {
        expression.processRuntimeProperty = path[1]
        expression.valueType = processRuntimePropertyValueType(path[1]) ?? 'unknown'
        return expression.valueType
      }

      if (path.length === 3 && path[1] === 'env') {
        expression.processRuntimeEnvName = path[2]
        expression.valueType = 'string'
        return 'string'
      }

      if (path.length === 3) {
        const property = `${path[1]}.${path[2]}`

        if (isProcessRuntimeProperty(property)) {
          expression.processRuntimeProperty = property
          expression.valueType = processRuntimePropertyValueType(property) ?? 'unknown'
          return expression.valueType
        }
      }

      return null
    }

    if (path.length === 2 && root.importedName === 'env') {
      expression.processRuntimeEnvName = path[1]
      expression.valueType = 'string'
      return 'string'
    }

    if (path.length === 2 && root.importedName != null) {
      const property = `${root.importedName}.${path[1]}`

      if (isProcessRuntimeProperty(property)) {
        expression.processRuntimeProperty = property
        expression.valueType = processRuntimePropertyValueType(property) ?? 'unknown'
        return expression.valueType
      }
    }

    return null
  }

  checkProcessMemberAssignment(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.target)

    if (path == null || path.length !== 2 || path[1] !== 'exitCode') {
      return null
    }

    const root = this.scope.resolve(path[0])

    if (
      root?.kind !== 'import' ||
      !isNodeProcessImportSource(root.importSource) ||
      (root.importedName !== 'default' && root.importedName !== 'process')
    ) {
      return null
    }

    const valueType = this.checkExpression(expression.value)
    this.checkAssignableType(valueType, 'number', expression.value.loc)
    expression.processRuntimeProperty = 'exitCode'
    expression.valueType = 'number'

    return 'number'
  }

  checkProcessIndexExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.object)

    if (path == null) {
      return null
    }

    const root = this.scope.resolve(path[0])

    if (root?.kind !== 'import' || !isNodeProcessImportSource(root.importSource)) {
      return null
    }

    const isArgv =
      ((root.importedName === 'default' || root.importedName === 'process') && path.length === 2 && path[1] === 'argv') ||
      (root.importedName === 'argv' && path.length === 1)

    if (!isArgv) {
      return null
    }

    const indexType = this.checkExpression(expression.index)
    this.checkAssignableType(indexType, 'number', expression.index.loc)
    expression.processRuntimeProperty = 'argv'
    expression.valueType = 'string'

    return 'string'
  }

  checkUrlCall(expression: AnyNode): ValueType | null {
    const call = this.resolveUrlRuntimeCall(expression)

    if (call == null) {
      return null
    }

    for (const arg of expression.args) {
      this.checkExpression(arg)
    }

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:url ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        expression.args[0].valueType ?? 'unknown',
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.urlRuntimeMethod = call.method

    if (call.method === 'pathToFileURL') {
      expression.valueType = 'object'
      expression.shape = urlObjectShape
      return 'object'
    }

    expression.valueType = 'string'
    return 'string'
  }

  resolveUrlRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveUrlRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isUrlRuntimeMethod(method)
    }
  }

  resolveUrlRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodeUrlImportSource(symbol.importSource) && importedName != null) {
        return isUrlRuntimeMethod(importedName) || isUnsupportedUrlRuntimeMethod(importedName) ? importedName : null
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeUrlImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'url')
      ) {
        return isUrlRuntimeMethod(path[1]) || isUnsupportedUrlRuntimeMethod(path[1]) ? path[1] : null
      }
    }

    return null
  }

  resolveCryptoRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveCryptoRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isCryptoRuntimeMethod(method)
    }
  }

  resolveCryptoRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 2) {
      const globalMethod = cryptoRuntimeMethodNameFromPath(path)

      if (globalMethod != null) {
        return globalMethod
      }

      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodeCryptoImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'crypto')
      ) {
        return isCryptoRuntimeMethod(path[1]) || isUnsupportedNodeCryptoMethod(path[1]) ? path[1] : null
      }
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodeCryptoImportSource(symbol.importSource) && importedName != null) {
        return isCryptoRuntimeMethod(importedName) || isUnsupportedNodeCryptoMethod(importedName) ? importedName : null
      }
    }

    return null
  }

  checkPathCall(expression: AnyNode): ValueType | null {
    const call = this.resolvePathRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (const arg of expression.args) {
        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:path ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const method = call.method
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))
    const returnType = method === 'isAbsolute' ? 'boolean' : method === 'parse' ? 'object' : 'string'

    expression.valueType = returnType
    expression.pathRuntimeMethod = method

    if (method === 'parse') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (argTypes[0] != null) {
        this.checkAssignableType(
          argTypes[0],
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      expression.shape = pathParseObjectShape
      return 'object'
    }

    if (method === 'format') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (argTypes[0] != null) {
        this.checkAssignableType(
          argTypes[0],
          'object',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      return 'string'
    }

    if (method === 'join' || method === 'resolve') {
      for (const [index, argType] of argTypes.entries()) {
        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return returnType
    }

    if (method === 'basename') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (const [index, argType] of argTypes.entries()) {
        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return 'string'
    }

    const expectedArgs = method === 'relative' ? 2 : 1

    if (expression.args.length !== expectedArgs) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, argType] of argTypes.entries()) {
      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    return returnType
  }

  resolvePathRuntimeCall(expression: AnyNode): { method: string; label: string; unsupported: boolean } | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolvePathRuntimeMethod(path)

    if (method == null) {
      return null
    }

    return {
      method,
      label: path == null ? method : path.join('.'),
      unsupported: !isPathRuntimeMethod(method)
    }
  }

  resolvePathRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const symbol = this.scope.resolve(path[0])
      const importedName = symbol?.importedName

      if (symbol?.kind === 'import' && isNodePathImportSource(symbol.importSource) && importedName != null) {
        return isPathRuntimeMethod(importedName) || isUnsupportedPathRuntimeMethod(importedName) ? importedName : null
      }
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path' || symbol.importedName === 'posix')
      ) {
        return isPathRuntimeMethod(path[1]) || isUnsupportedPathRuntimeMethod(path[1]) ? path[1] : null
      }
    }

    if (path.length === 3 && path[1] === 'posix') {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path')
      ) {
        return isPathRuntimeMethod(path[2]) || isUnsupportedPathRuntimeMethod(path[2]) ? path[2] : null
      }
    }

    return null
  }

  checkPathConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = this.resolvePathRuntimeConstant(path)

    if (constant == null) {
      return null
    }

    expression.valueType = 'string'
    expression.pathRuntimeConstant = constant

    return 'string'
  }

  resolvePathRuntimeConstant(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 2) {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path' || symbol.importedName === 'posix') &&
        isPathRuntimeConstant(path[1])
      ) {
        return path[1]
      }
    }

    if (path.length === 3 && path[1] === 'posix') {
      const symbol = this.scope.resolve(path[0])

      if (
        symbol?.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path') &&
        isPathRuntimeConstant(path[2])
      ) {
        return path[2]
      }
    }

    return null
  }

  checkDebugMemoryCall(expression: AnyNode): ValueType | null {
    const method = debugRuntimeMethodNameFromPath(memberExpressionPath(expression.callee))

    if (method == null) {
      return null
    }

    expression.valueType = 'object'
    expression.shape = debugMemoryStatsObjectShape
    expression.debugRuntimeMethod = method

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ccjs.__debug.memory expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    return 'object'
  }

  checkClassMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    this.checkExpression(expression.callee.object)
    const className = this.resolveClassMethodReceiverClassName(expression.callee.object)

    if (className == null) {
      return null
    }

    const classSymbol = this.scope.resolve(className)
    const method = classSymbol?.classMethods?.find((item) => item.name === expression.callee.property)

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (method == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const params = method.params.map((param) => this.resolveParam(param))
    const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

    if (params.length !== expression.args.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `method ${expression.callee.property} expects ${params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, param] of params.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.valueType = returnInfo.valueType
    expression.nullable = returnInfo.nullable
    expression.arrayElementType = returnInfo.arrayElementType
    expression.arrayElementDeclaredType = returnInfo.arrayElementDeclaredType
    expression.mapKeyType = returnInfo.mapKeyType
    expression.mapValueType = returnInfo.mapValueType
    expression.promiseValueType = returnInfo.promiseValueType ?? null
    expression.setElementType = returnInfo.setElementType
    expression.shape = returnInfo.shape

    return returnInfo.valueType
  }

  checkMathCall(expression: AnyNode): ValueType | null {
    if (!isMathRuntimeMethod(expression.callee) || this.scope.resolve('Math') != null) {
      return null
    }

    const method = expression.callee.property
    const expectedArgCount = mathRuntimeArgCount(method) ?? 0

    expression.mathRuntimeMethod = method
    expression.valueType = 'number'

    if (expression.args.length !== expectedArgCount) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Math.${method} expects ${expectedArgCount} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const arg of expression.args) {
      this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc)
    }

    return 'number'
  }

  checkFsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)

    if (path == null || path.length !== 3 || path[1] !== 'constants' || !fsConstantValues.has(path[2])) {
      return null
    }

    const symbol = this.scope.resolve(path[0])

    if (symbol == null || !isFsRuntimeImportSymbol(symbol)) {
      return null
    }

    expression.fsRuntimeConstant = path[2]
    expression.valueType = 'number'

    return 'number'
  }

  checkFsStatsMethodCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'MemberExpression' ||
      !['isFile', 'isDirectory'].includes(expression.callee.property)
    ) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || (shape?.builtin !== 'fs.Stats' && shape?.builtin !== 'fs.Dirent')) {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${shape.builtin === 'fs.Dirent' ? 'Dirent' : 'Stats'}.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (shape.builtin === 'fs.Dirent') {
      expression.fsRuntimeMethod = expression.callee.property === 'isFile' ? 'direntIsFile' : 'direntIsDirectory'
    } else {
      expression.fsRuntimeMethod = expression.callee.property === 'isFile' ? 'statsIsFile' : 'statsIsDirectory'
    }
    expression.valueType = 'boolean'

    return 'boolean'
  }

  checkFetchCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      expression.callee.path[0] !== 'fetch' ||
      this.scope.resolve('fetch') != null
    ) {
      return null
    }

    if (!this.requireLibuvBackend('fetch', expression.loc)) {
      expression.fetchRuntimeMethod = 'fetch'
      expression.valueType = 'promise'
      expression.promiseValueType = 'object'
      expression.shape = fetchResponseObjectShape

      return 'promise'
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `function fetch expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      if (this.isFetchHttpsLiteral(expression.args[0]) && !this.supportsFetchHttps()) {
        this.report(
          'CCJS_FETCH',
          'https fetch URLs require a configured TLS adapter and are not supported by the current C/libuv fetch slice',
          expression.args[0].loc
        )
      }
    }

    if (expression.args[1] != null) {
      this.checkFetchInitObject(expression.args[1])
    }

    expression.fetchRuntimeMethod = 'fetch'
    expression.valueType = 'promise'
    expression.promiseValueType = 'object'
    expression.shape = fetchResponseObjectShape

    return 'promise'
  }

  checkFetchInitObject(expression: AnyNode): void {
    if (expression.type !== 'ObjectLiteral') {
      this.checkExpression(expression)
      this.report(
        'CCJS_FETCH',
        'fetch init must be an object literal in the current C/libuv fetch slice',
        expression.loc
      )
      return
    }

    for (const property of expression.properties) {
      if (!isFetchInitOption(property.key)) {
        this.checkExpression(property.value)
        this.report(
          'CCJS_FETCH',
          `fetch init option ${property.key} is not supported by the current C/libuv fetch slice`,
          property.loc
        )
        continue
      }

      if (property.key === 'method' || property.key === 'redirect') {
        this.checkAssignableType(
          this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )

        if (property.key === 'redirect' && !this.isSupportedFetchRedirectLiteral(property.value)) {
          this.report(
            'CCJS_FETCH',
            "fetch init redirect must be 'follow', 'manual' or 'error' in the current C/libuv fetch slice",
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'body') {
        const bodyType = this.checkExpression(property.value)

        if (bodyType !== 'string' && bodyType !== 'bytes') {
          this.report(
            'CCJS_FETCH',
            'fetch init body must be a string, Buffer or Uint8Array in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'signal') {
        const signalType = this.checkExpression(property.value)
        const signalShape = this.resolveExpressionShape(property.value)

        if (signalType !== 'object' || signalShape?.builtin !== 'fetch.AbortSignal') {
          this.report(
            'CCJS_FETCH',
            'fetch init signal must be an AbortSignal in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.value.type !== 'ObjectLiteral') {
        this.checkExpression(property.value)
        this.report(
          'CCJS_FETCH',
          'fetch init headers must be an object literal in the current C/libuv fetch slice',
          property.value.loc
        )
        continue
      }

      for (const header of property.value.properties) {
        this.checkAssignableType(
          this.checkExpression(header.value),
          'string',
          header.value.loc,
          false,
          this.expressionCanBeNull(header.value)
        )
      }
    }
  }

  isFetchHttpsLiteral(expression: AnyNode): boolean {
    return expression.type === 'StringLiteral' && expression.value.toLowerCase().startsWith('https://')
  }

  supportsFetchHttps(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  runtimeImportValueType(source: string, importedName: string): ValueType {
    if (isNodeOsImportSource(source)) {
      if (isOsRuntimeConstant(importedName)) {
        return 'string'
      }

      if (isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'os') {
        return 'object'
      }
    }

    if (isNodePathImportSource(source)) {
      if (isPathRuntimeConstant(importedName)) {
        return 'string'
      }

      if (isPathRuntimeMethod(importedName) || isUnsupportedPathRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'path' || importedName === 'posix') {
        return 'object'
      }
    }

    if (isNodeUrlImportSource(source)) {
      if (
        isUrlRuntimeMethod(importedName) ||
        isUrlRuntimeConstructor(importedName) ||
        isUnsupportedUrlRuntimeMethod(importedName)
      ) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'url') {
        return 'object'
      }
    }

    if (isNodeProcessImportSource(source)) {
      if (isProcessRuntimeMethod(importedName) || isUnsupportedProcessRuntimeMethod(importedName)) {
        return 'function'
      }

      const propertyType = processRuntimePropertyValueType(importedName)

      if (propertyType != null) {
        return propertyType
      }

      if (importedName === 'default' || importedName === 'process') {
        return 'object'
      }
    }

    if (isNodeChildProcessImportSource(source)) {
      if (isChildProcessRuntimeMethod(importedName) || isUnsupportedChildProcessRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'childProcess') {
        return 'object'
      }
    }

    return 'unknown'
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    const unsupportedMessage = unsupportedRuntimeBuiltinImportMessage(statement.source)

    if (unsupportedMessage != null) {
      this.report('CCJS_NOT_IMPLEMENTED', unsupportedMessage, statement.loc)
      return
    }

    const feature = libuvOnlyRuntimeImports.get(statement.source)

    if (feature != null) {
      this.requireLibuvBackend(feature, statement.loc)
    }
  }

  requireLibuvBackend(feature: string, loc: SourceLocation): boolean {
    if (this.options.loopBackend === 'libuv') {
      return true
    }

    this.report(
      'CCJS_NOT_IMPLEMENTED',
      `${feature} is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv`,
      loc
    )

    return false
  }

  isSupportedFetchRedirectLiteral(expression: AnyNode): boolean {
    if (expression.type !== 'StringLiteral') {
      return true
    }

    return isFetchRedirectMode(expression.value)
  }

  checkFetchAbortControllerMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchAbortControllerMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape?.builtin !== 'fetch.AbortController') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function AbortController.abort expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.fetchRuntimeMethod = 'abort'
    expression.valueType = 'void'

    return 'void'
  }

  checkFetchResponseMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchResponseBodyMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape?.builtin !== 'fetch.Response') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Response.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (!isSupportedFetchResponseBodyMethod(expression.callee.property)) {
      this.report(
        'CCJS_FETCH',
        `Response.${expression.callee.property} is not supported by the current C/libuv fetch slice`,
        expression.loc
      )
      expression.valueType = 'promise'
      expression.promiseValueType = 'unknown'

      return 'promise'
    }

    expression.fetchRuntimeMethod = 'text'
    expression.valueType = 'promise'
    expression.promiseValueType = 'string'

    return 'promise'
  }

  checkFetchUnsupportedResponseBodyMember(expression: AnyNode): ValueType | null {
    if (expression.property !== 'body') {
      return null
    }

    const objectType = this.checkExpression(expression.object)
    const shape = this.resolveExpressionShape(expression.object)

    if (objectType !== 'object' || shape?.builtin !== 'fetch.Response') {
      return null
    }

    this.report(
      'CCJS_FETCH',
      'Response.body streams are not supported by the current C/libuv fetch slice',
      expression.loc
    )
    expression.valueType = 'object'

    return 'object'
  }

  checkFetchHeadersMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchHeadersMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape?.builtin !== 'fetch.Headers') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Headers.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.fetchRuntimeMethod = fetchHeadersRuntimeMethod(expression.callee.property)
    expression.valueType = expression.callee.property === 'get' ? 'string' : 'boolean'
    expression.nullable = expression.callee.property === 'get'

    return expression.valueType
  }

  resolveClassMethodReceiverClassName(expression: AnyNode): string | null {
    if (this.isThisExpression(expression)) {
      return this.scope.resolve('this')?.className ?? expression.className ?? null
    }

    if (expression?.type === 'Reference' && expression.path.length === 1) {
      return this.scope.resolve(expression.path[0])?.className ?? expression.className ?? null
    }

    return expression?.className ?? null
  }

  checkFsCall(expression: AnyNode): ValueType | null {
    const removedInfo = removedFsRuntimeMethodInfo(expression.callee)

    if (removedInfo != null && this.isFsRuntimeRootName(removedInfo.root)) {
      this.report('CCJS_FS_UNSUPPORTED', removedInfo.message, expression.loc)
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const info = fsRuntimeCallInfo(expression.callee)

    if (info == null || !this.isFsRuntimeRoot(info)) {
      return null
    }

    const method = info.method
    const promisesApi = info.viaPromises || this.isFsPromisesImportRoot(info.root)
    const label = info.path.join('.')
    const unsupportedMessage = unsupportedFsRuntimeMethodMessage(info, promisesApi)

    if (unsupportedMessage != null) {
      this.report('CCJS_FS_UNSUPPORTED', unsupportedMessage, expression.loc)
      expression.valueType = 'unknown'

      return 'unknown'
    }

    if (method === 'statSync' || method === 'lstatSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'object'
      expression.shape = fsStatsObjectShape

      return 'object'
    }

    if (method === 'accessSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsNumberArg(expression, 1)
      expression.fsRuntimeMethod = 'accessSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'mkdirSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive'])
      expression.fsRuntimeMethod = 'mkdirSync'
      expression.fsRecursive = options.recursive === true
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'unlinkSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = 'unlinkSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'rmSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive', 'force'])
      expression.fsRuntimeMethod = 'rmSync'
      expression.fsRecursive = options.recursive === true
      expression.fsForce = options.force === true
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'renameSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'renameSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'readFileSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)

      if (expression.args[1] == null) {
        expression.fsRuntimeMethod = 'readFileBytesSync'
        expression.valueType = 'bytes'

        return 'bytes'
      }

      this.checkUtf8EncodingArg(expression, 1, label)
      expression.fsRuntimeMethod = 'readFileSync'
      expression.valueType = 'string'

      return 'string'
    }

    if (method === 'readDirSync') {
      if (expression.args.length < 1 || expression.args.length > (info.nodeName === 'readdirSync' ? 2 : 1)) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${info.nodeName === 'readdirSync' ? '1 or 2' : '1'} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const withFileTypes = this.checkFsReaddirOptionsArg(expression, 1, label)

      expression.fsRuntimeMethod = withFileTypes ? 'readDirDirentsSync' : 'readDirSync'
      expression.valueType = 'array'
      expression.arrayElementType = withFileTypes ? 'object' : 'string'
      expression.arrayElementDeclaredType = withFileTypes ? 'fs.Dirent' : 'string'

      return 'array'
    }

    if (method === 'writeFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'writeFileSync')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'appendFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'appendFileSync')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'copyFileSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'copyFileSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'realpathSync' || method === 'readlinkSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'string'

      return 'string'
    }

    if (method === 'symlinkSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'symlinkSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'readFile') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)

      if (promisesApi && expression.args[1] == null) {
        expression.fsRuntimeMethod = 'readFileBytes'
        expression.valueType = 'promise'
        expression.promiseValueType = 'bytes'

        return 'promise'
      }

      if (expression.args[1] != null) {
        this.checkUtf8EncodingArg(expression, 1, label)
      }

      expression.fsRuntimeMethod = 'readFile'
      expression.valueType = 'promise'
      expression.promiseValueType = 'string'

      return 'promise'
    }

    if (method === 'stat' || method === 'lstat') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'promise'
      expression.promiseValueType = 'object'
      expression.shape = fsStatsObjectShape

      return 'promise'
    }

    if (method === 'access') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsNumberArg(expression, 1)
      expression.fsRuntimeMethod = 'access'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'mkdir') {
      if (expression.args.length < 1 || expression.args.length > (promisesApi ? 2 : 1)) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${promisesApi ? '1 or 2' : '1'} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = promisesApi ? this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive']) : {}
      expression.fsRuntimeMethod = 'mkdir'
      expression.fsRecursive = options.recursive === true
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'unlink') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = 'unlink'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'rm') {
      if (expression.args.length < 1 || expression.args.length > (promisesApi ? 2 : 1)) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${promisesApi ? '1 or 2' : '1'} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = promisesApi ? this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive', 'force']) : {}
      expression.fsRuntimeMethod = 'rm'
      expression.fsRecursive = options.recursive === true
      expression.fsForce = options.force === true
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'rename') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'rename'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'readDir') {
      if (expression.args.length < 1 || expression.args.length > (info.nodeName === 'readdir' ? 2 : 1)) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${info.nodeName === 'readdir' ? '1 or 2' : '1'} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const withFileTypes = this.checkFsReaddirOptionsArg(expression, 1, label)

      expression.fsRuntimeMethod = withFileTypes ? 'readDirDirents' : 'readDir'
      expression.valueType = 'promise'
      expression.promiseValueType = 'array'
      expression.arrayElementType = withFileTypes ? 'object' : 'string'
      expression.arrayElementDeclaredType = withFileTypes ? 'fs.Dirent' : 'string'

      return 'promise'
    }

    if (method === 'appendFile') {
      if (expression.args.length < 2 || expression.args.length > (promisesApi ? 3 : 2)) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${promisesApi ? '2 or 3' : '2'} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'appendFile')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'copyFile') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'copyFile'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'realpath' || method === 'readlink') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'promise'
      expression.promiseValueType = 'string'

      return 'promise'
    }

    if (method === 'symlink') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'symlink'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (expression.args.length < 2 || expression.args.length > (promisesApi ? 3 : 2)) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${label} expects ${promisesApi ? '2 or 3' : '2'} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    this.checkFsStringArg(expression, 0)
    expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'writeFile')
    this.checkUtf8EncodingArg(expression, 2, label)

    expression.valueType = 'promise'
    expression.promiseValueType = 'void'

    return 'promise'
  }

  isFsRuntimeRoot(info: FsRuntimeCallInfo): boolean {
    return this.isFsRuntimeRootName(info.root)
  }

  isFsRuntimeRootName(root: string): boolean {
    const symbol = this.scope.resolve(root)

    if (symbol == null) {
      return false
    }

    return isFsRuntimeImportSymbol(symbol)
  }

  isFsPromisesImportRoot(root: string): boolean {
    const symbol = this.scope.resolve(root)

    return (
      symbol?.kind === 'import' &&
      (symbol.importSource === 'node:fs/promises' ||
        ((symbol.importSource === 'fs' || symbol.importSource === 'node:fs') && symbol.importedName === 'promises'))
    )
  }

  checkFsWriteDataArg(expression: AnyNode, index: number, label: string, textMethod: string): string {
    const arg = expression.args[index]

    if (arg == null) {
      return textMethod
    }

    const type = this.checkExpression(arg)

    if (type === 'bytes') {
      if (textMethod === 'writeFileSync') {
        return 'writeFileBytesSync'
      }

      if (textMethod === 'appendFileSync') {
        return 'appendFileBytesSync'
      }

      return textMethod === 'appendFile' ? 'appendFileBytes' : 'writeFileBytes'
    }

    this.checkAssignableType(type, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    return textMethod
  }

  checkFsStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsNumberArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsReaddirOptionsArg(expression: AnyNode, index: number, label: string): boolean {
    const arg = expression.args[index]

    if (arg == null) {
      return false
    }

    if (arg.type === 'StringLiteral') {
      this.checkUtf8EncodingArg(expression, index, label)

      return false
    }

    const options = this.checkFsBooleanOptionsArg(expression, index, label, ['withFileTypes'])

    return options.withFileTypes === true
  }

  checkFsBooleanOptionsArg(
    expression: AnyNode,
    index: number,
    label: string,
    allowed: string[]
  ): Record<string, boolean> {
    const arg = expression.args[index]
    const result: Record<string, boolean> = {}

    if (arg == null) {
      return result
    }

    if (arg.type !== 'ObjectLiteral') {
      this.report(
        'CCJS_TYPE_MISMATCH',
        `${label} options must be an object literal in the current compiler slice`,
        arg.loc
      )
      this.checkExpression(arg)

      return result
    }

    const allowedSet = new Set(allowed)

    for (const property of arg.properties) {
      if (!allowedSet.has(property.key)) {
        this.report('CCJS_UNKNOWN_FIELD', `unknown ${label} option ${property.key}`, property.loc)
        this.checkExpression(property.value)
        continue
      }

      const valueType = property.value.valueType ?? this.checkExpression(property.value)

      if (valueType !== 'boolean' || property.value.type !== 'BooleanLiteral') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          `${label} option ${property.key} must be a boolean literal in the current compiler slice`,
          property.value.loc
        )
        continue
      }

      result[property.key] = property.value.value === true
    }

    return result
  }

  checkJsonCall(expression: AnyNode, declared: ResolvedTypeInfo | null = null): ValueType | null {
    const method = jsonRuntimeMethodName(expression.callee)

    if (method == null) {
      return null
    }

    if (this.scope.resolve('JSON') != null) {
      return null
    }

    expression.jsonRuntimeMethod = method

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function JSON.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (method === 'parse') {
      this.checkJsonStringArg(expression, 0)

      const valueType = declared != null && isJsonParseDeclaredType(declared.valueType) ? declared.valueType : 'object'

      expression.valueType = valueType
      expression.arrayElementType = declared?.arrayElementType ?? null
      expression.arrayElementDeclaredType = declared?.arrayElementDeclaredType ?? null
      expression.mapKeyType = declared?.mapKeyType ?? null
      expression.mapValueType = declared?.mapValueType ?? null
      expression.promiseValueType = declared?.promiseValueType ?? null
      expression.setElementType = declared?.setElementType ?? null
      expression.shape = valueType === 'object' ? (declared?.shape ?? null) : null

      return valueType
    }

    if (expression.args[0] != null) {
      this.checkExpression(expression.args[0])
    }

    expression.valueType = 'string'

    return 'string'
  }

  checkJsonStringArg(expression: AnyNode, index: number): void {
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
      this.report(
        'CCJS_ARG_COUNT',
        `function Promise.${method} expects at most 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    expression.valueType = 'promise'
    expression.promiseValueType = method === 'resolve' ? (argTypes[0] ?? 'void') : 'unknown'

    return 'promise'
  }

  checkPromiseMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isPromiseMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'promise') {
      return null
    }

    const property = expression.callee.property
    const promiseValueType = this.resolveExpressionPromiseValueType(expression.callee.object) ?? 'unknown'

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `promise.${property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const callback = expression.args[0]

    if (property === 'then') {
      const mappedType =
        callback == null
          ? 'unknown'
          : this.checkPromiseCallback(
              callback,
              [{ name: 'value', valueType: promiseValueType }],
              undefined,
              'promise.then callback'
            )

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      expression.valueType = 'promise'
      expression.promiseValueType = mappedType

      return 'promise'
    }

    if (callback != null) {
      this.checkPromiseCallback(
        callback,
        [{ name: 'error', valueType: 'unknown' }],
        promiseValueType === 'unknown' ? undefined : promiseValueType,
        'promise.catch callback'
      )
    }

    for (const arg of expression.args.slice(1)) {
      this.checkExpression(arg)
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType

    return 'promise'
  }

  checkPromiseCallback(
    expression: AnyNode,
    params: Array<{ name: string; valueType: ValueType }>,
    returnType: ValueType | undefined,
    label: string
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async Promise callbacks are not supported in the current compiler slice; use a named async helper and await it explicitly',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `${label} expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false
    let returnPromiseValueType: ValueType | null = null

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

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.body.loc ?? expression.loc
        returnNullable = this.expressionCanBeNull(expression.body)
        returnPromiseValueType = this.resolveExpressionPromiseValueType(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression == null) {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)

          this.withReturnContext(returnType ?? 'unknown', false, null, () => {
            this.checkStatements(expression.body)
          })

          if (terminalReturnExpression != null) {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = terminalReturnExpression.loc ?? expression.loc
            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
            returnPromiseValueType = this.resolveExpressionPromiseValueType(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = returnExpression.loc ?? expression.loc
          returnNullable = this.expressionCanBeNull(returnExpression)
          returnPromiseValueType = this.resolveExpressionPromiseValueType(returnExpression)
        }
      }
    })

    if (returnType != null) {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = returnType ?? actualReturnType
    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable
    expression.returnPromiseValueType = returnPromiseValueType

    return actualReturnType
  }

  checkTimerHandleMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isTimerHandleMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'timer') {
      return null
    }

    for (const arg of expression.args) {
      this.checkExpression(arg)
    }

    this.report(
      'CCJS_TIMER_REF_UNREF',
      'timer handle ref() and unref() are not supported in the MVP; timer handles are referenced by default',
      expression.loc
    )
    expression.valueType = 'void'

    return 'void'
  }

  checkCollectionMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const property = expression.callee.property
    const objectType = this.checkExpression(expression.callee.object)

    const mapMethod = mapRuntimeMethodName(property)

    if (objectType === 'map' && mapMethod != null) {
      const mapType = this.resolveExpressionMapType(expression.callee.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }

      if (mapMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'map.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      if (mapMethod === 'get' || mapMethod === 'has' || mapMethod === 'delete') {
        this.checkCollectionArgCount(expression, `map.${mapMethod}`, 1)

        if (expression.args[0] != null) {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            mapType.key,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }

        for (const arg of expression.args.slice(1)) {
          this.checkExpression(arg)
        }

        if (mapMethod === 'get') {
          expression.valueType = mapType.value ?? 'unknown'
          expression.nullable = true
          return mapType.value ?? 'unknown'
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      this.checkCollectionArgCount(expression, 'map.set', 2)

      if (expression.args[0] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          mapType.key,
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      if (expression.args[1] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[1]),
          mapType.value,
          expression.args[1].loc,
          false,
          this.expressionCanBeNull(expression.args[1])
        )
      }

      for (const arg of expression.args.slice(2)) {
        this.checkExpression(arg)
      }

      expression.valueType = 'map'
      expression.mapKeyType = mapType.key
      expression.mapValueType = mapType.value

      return 'map'
    }

    const setMethod = setRuntimeMethodName(property)

    if (objectType === 'set' && setMethod != null) {
      const elementType = this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'

      if (setMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'set.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      this.checkCollectionArgCount(expression, `set.${setMethod}`, 1)

      if (expression.args[0] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          elementType,
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      if (setMethod === 'add') {
        expression.valueType = 'set'
        expression.setElementType = elementType
        return 'set'
      }

      expression.valueType = 'boolean'
      return 'boolean'
    }

    return null
  }

  checkTimerCall(expression: AnyNode): ValueType | null {
    const method = timerRuntimeMethodName(expression.callee)

    if (method == null) {
      return null
    }

    if (this.scope.resolve(method) != null) {
      return null
    }

    expression.timerRuntimeMethod = method

    if (timerClearMethodName(method) != null) {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${method} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'timer', expression.args[0].loc)
      }

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'setImmediate') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function setImmediate expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkTimerCallbackArg(expression, 0)
      expression.valueType = 'timer'

      return 'timer'
    }

    if (expression.args.length !== 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${method} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    this.checkTimerCallbackArg(expression, 0)

    if (expression.args[1] != null) {
      this.checkAssignableType(this.checkExpression(expression.args[1]), 'number', expression.args[1].loc)
    }

    expression.valueType = 'timer'

    return 'timer'
  }

  checkTimerCallbackArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]
    const functionType = timerCallbackFunctionType()

    if (arg == null) {
      return
    }

    if (arg.type === 'ArrowFunctionExpression') {
      if (arg.async === true) {
        this.report(
          'CCJS_ASYNC_TIMER_CALLBACK',
          'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
          arg.loc
        )
        return
      }

      this.checkArrowFunctionExpression(arg, functionType)
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'function', arg.loc)

    const symbol = this.getCallableSymbol(arg)

    if (symbol?.params != null && symbol.params.length !== functionType.params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `function callback expects ${functionType.params.length} argument(s), got ${symbol.params.length}`,
        arg.loc
      )
    }

    if (symbol?.async === true || symbol?.returnType === 'promise') {
      this.report(
        'CCJS_ASYNC_TIMER_CALLBACK',
        'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
        arg.loc
      )
      return
    }

    if (symbol != null && symbol.returnType != null) {
      this.checkAssignableType(
        symbol.returnType,
        functionType.returnType,
        arg.loc,
        functionType.returnNullable === true,
        symbol.returnNullable === true
      )
    }
  }

  checkCollectionArgCount(expression: AnyNode, name: string, expected: number): void {
    if (expression.args.length !== expected) {
      this.report(
        'CCJS_ARG_COUNT',
        `${name} expects ${expected} argument(s), got ${expression.args.length}`,
        expression.loc
      )
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
          this.checkAssignableType(
            pushedType,
            elementType,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
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
        this.report(
          'CCJS_ARG_COUNT',
          `array.sort expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkArrayCallback(
          expression.args[0],
          [
            { name: 'left', valueType: elementType },
            { name: 'right', valueType: elementType }
          ],
          'number'
        )
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      return 'array'
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `array.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.callee.property === 'filter') {
      if (expression.args[0] != null) {
        this.checkArrayCallback(
          expression.args[0],
          [
            { name: 'value', valueType: elementType },
            { name: 'index', valueType: 'number' }
          ],
          'boolean'
        )
      }

      for (const arg of expression.args.slice(1)) {
        this.checkExpression(arg)
      }

      return 'array'
    }

    const mappedType =
      expression.args[0] == null
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

  checkArrayCallback(
    expression: AnyNode,
    params: Array<{ name: string; valueType: ValueType }>,
    returnType?: ValueType
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async Array callbacks are not supported in the current compiler slice; use a synchronous callback',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `array callback expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
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

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.body.loc ?? expression.loc
        returnNullable = this.expressionCanBeNull(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression == null) {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)

          this.withReturnContext(returnType ?? 'unknown', false, null, () => {
            this.checkStatements(expression.body)
          })

          if (terminalReturnExpression != null) {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = terminalReturnExpression.loc ?? expression.loc
            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
          }
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
    const statements = Array.isArray(body) ? body : body?.type === 'BlockStatement' ? body.body : null

    if (statements == null || statements.length !== 1) {
      return null
    }

    const [statement] = statements

    return statement?.type === 'ReturnStatement' ? (statement.argument ?? null) : null
  }

  resolveTerminalReturnExpression(body: AnyNode): AnyNode | null {
    const statements = Array.isArray(body) ? body : body?.type === 'BlockStatement' ? body.body : null

    if (statements == null || statements.length === 0) {
      return null
    }

    const statement = statements.at(-1)

    return statement?.type === 'ReturnStatement' ? (statement.argument ?? null) : null
  }

  checkStringConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      expression.callee.path[0] !== 'String'
    ) {
      return null
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `String expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'string'
    }

    if (!['boolean', 'null', 'number', 'string'].includes(argTypes[0])) {
      this.report('CCJS_TYPE_MISMATCH', `cannot convert ${argTypes[0]} to string with String`, expression.args[0].loc)
    }

    return 'string'
  }

  checkNumberConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      expression.callee.path[0] !== 'Number'
    ) {
      return null
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    expression.valueType = 'number'
    expression.nullable = true

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `Number expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkNumericCastCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      !numericCastNames.has(expression.callee.path[0])
    ) {
      return null
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    expression.valueType = 'number'
    expression.numericCast = expression.callee.path[0]

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `${expression.callee.path[0]} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkStringTrimCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression' ? stringRuntimeMethodName(expression.callee.property) : null

    if (method !== 'trim') {
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

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringSliceCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression' ? stringRuntimeMethodName(expression.callee.property) : null

    if (method !== 'slice') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `string.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, argType] of argTypes.entries()) {
      this.checkAssignableType(argType, 'number', expression.args[index].loc)
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringSplitCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression' ? stringRuntimeMethodName(expression.callee.property) : null

    if (method !== 'split') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `string.split expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (argTypes[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.valueType = 'array'
    expression.arrayElementType = 'string'
    expression.arrayElementDeclaredType = 'string'
    expression.stringRuntimeMethod = method

    return 'array'
  }

  checkStringPredicateCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isStringPredicateMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `string.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (argTypes[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.valueType = 'boolean'
    expression.stringRuntimeMethod = expression.callee.property

    return 'boolean'
  }

  checkNewExpression(expression: AnyNode): ValueType {
    const promiseType = this.checkPromiseConstructorExpression(expression)

    if (promiseType != null) {
      return promiseType
    }

    const argTypes = expression.args.map((arg) => this.checkExpression(arg))

    const urlType = this.checkUrlConstructorExpression(expression, argTypes)

    if (urlType != null) {
      return urlType
    }

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    const collectionConstructor = collectionConstructorNameFromPath(expression.callee.path)

    if (collectionConstructor === 'Map') {
      expression.valueType = 'map'
      expression.mapKeyType = 'unknown'
      expression.mapValueType = 'unknown'
      return 'map'
    }

    if (collectionConstructor === 'Set') {
      expression.valueType = 'set'
      expression.setElementType = 'unknown'
      return 'set'
    }

    if (expression.callee.path[0] === 'AbortController' && this.scope.resolve('AbortController') == null) {
      this.requireLibuvBackend('AbortController', expression.loc)

      if (expression.args.length !== 0) {
        this.report(
          'CCJS_ARG_COUNT',
          `AbortController constructor expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.fetchRuntimeMethod = 'abortControllerNew'
      expression.valueType = 'object'
      expression.shape = fetchAbortControllerObjectShape
      return 'object'
    }

    if (binaryConstructorNameFromPath(expression.callee.path) === 'Uint8Array') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `Uint8Array constructor expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (argTypes[0] != null && argTypes[0] !== 'number' && argTypes[0] !== 'array') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          `Uint8Array constructor expects number or number[], got ${argTypes[0]}`,
          expression.args[0].loc
        )
      }

      if (argTypes[0] === 'array') {
        const elementType = this.resolveExpressionArrayElementType(expression.args[0])

        if (elementType != null) {
          this.checkAssignableType(elementType, 'number', expression.args[0].loc)
        }
      }

      expression.valueType = 'bytes'
      return 'bytes'
    }

    if (expression.callee.path[0] === 'Error') {
      this.checkErrorConstructorExpression(expression, argTypes)
      expression.valueType = 'object'
      expression.shape = errorObjectShape
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
      this.report(
        'CCJS_ARG_COUNT',
        `class ${expression.callee.path[0]} constructor expects ${constructorParams.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, param] of constructorParams.entries()) {
      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.className = expression.callee.path[0]
    expression.shape = symbol.shape ?? null
    return 'object'
  }

  checkUrlConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const symbol = this.scope.resolve(expression.callee.path[0])
    const importedName = symbol?.importedName

    if (symbol?.kind !== 'import' || !isNodeUrlImportSource(symbol.importSource) || importedName == null) {
      return null
    }

    if (isUnsupportedUrlRuntimeMethod(importedName)) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:url ${importedName} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (!isUrlRuntimeConstructor(importedName)) {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `URL constructor expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (const [index, argType] of argTypes.entries()) {
      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    expression.urlRuntimeMethod = 'URL'
    expression.valueType = 'object'
    expression.shape = urlObjectShape

    return 'object'
  }

  checkPromiseConstructorExpression(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      expression.callee.path[0] !== 'Promise' ||
      this.scope.resolve('Promise') != null
    ) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `Promise constructor expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const executor = expression.args[0]
    let promiseValueType: ValueType = 'unknown'

    if (executor == null) {
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    if (executor.type !== 'ArrowFunctionExpression') {
      this.checkAssignableType(this.checkExpression(executor), 'function', executor.loc)
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    this.checkArrowFunctionExpression(executor, promiseExecutorFunctionType())

    const resolveName = executor.params[0]?.name
    promiseValueType = resolveName == null ? 'unknown' : this.resolvePromiseExecutorValueType(executor, resolveName)
    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType

    return 'promise'
  }

  resolvePromiseExecutorValueType(executor: AnyNode, resolveName: string): ValueType {
    const types: ValueType[] = []
    const visit = (node: AnyNode | AnyNode[] | null | undefined): void => {
      if (node == null) {
        return
      }

      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }

      if (typeof node !== 'object') {
        return
      }

      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Reference' &&
        node.callee.path.length === 1 &&
        node.callee.path[0] === resolveName
      ) {
        types.push(node.args[0] == null ? 'void' : this.inferCheckedExpressionType(node.args[0]))
      }

      for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'callee') {
          continue
        }

        visit(value as AnyNode | AnyNode[])
      }
    }

    visit(executor.expressionBody ? executor.body : executor.body)

    return commonValueType(types)
  }

  inferCheckedExpressionType(expression: AnyNode): ValueType {
    if (expression.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

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

    return this.checkExpression(expression)
  }

  checkErrorConstructorExpression(expression: AnyNode, argTypes: ValueType[]): void {
    if (expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (argTypes[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    const options = expression.args[1]

    if (options == null) {
      return
    }

    if (options.type !== 'ObjectLiteral') {
      this.report(
        'CCJS_TYPE_MISMATCH',
        'Error options must be an object literal in the current compiler slice',
        options.loc
      )
      return
    }

    for (const property of options.properties) {
      if (property.key !== 'code' && property.key !== 'cause') {
        this.report('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc)
        continue
      }

      if (property.key === 'code') {
        this.checkAssignableType(
          property.value.valueType ?? this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )
      } else {
        const causeType = property.value.valueType ?? this.checkExpression(property.value)

        if (property.value.type !== 'NullLiteral' && causeType !== 'object') {
          this.report(
            'CCJS_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current compiler slice',
            property.value.loc
          )
        }
      }
    }
  }

  checkVariableInitializer(expression: AnyNode, declared: ResolvedTypeInfo | null): ValueType {
    if (
      expression.type === 'ArrowFunctionExpression' &&
      declared?.valueType === 'function' &&
      declared.functionType != null
    ) {
      this.checkArrowFunctionExpression(expression, declared.functionType)
      return 'function'
    }

    if (expression.type === 'CallExpression') {
      const jsonType = this.checkJsonCall(expression, declared)

      if (jsonType != null) {
        return jsonType
      }
    }

    return this.checkExpression(expression)
  }

  checkArrowFunctionExpression(expression: AnyNode, functionType: AnyNode | null = null): void {
    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async arrow callbacks are not supported in the current compiler slice; use an async function declaration',
        expression.loc
      )
      return
    }

    let actualReturnType: ValueType = functionType?.returnType ?? 'unknown'

    this.withScope(() => {
      if (functionType != null && expression.params.length > functionType.params.length) {
        this.report(
          'CCJS_ARG_COUNT',
          `function callback expects at most ${functionType.params.length} parameter(s), got ${expression.params.length}`,
          expression.loc
        )
      }

      for (const [index, param] of expression.params.entries()) {
        const expected = functionType?.params[index]
        const paramInfo =
          param.valueType === 'unknown' && expected != null
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

        param.declaredType =
          param.valueType === 'unknown' ? (expected?.declaredType ?? paramInfo.valueType) : param.valueType
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

        this.declare(
          param.name,
          {
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
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        const previousFunctionDepth = this.functionDepth
        this.functionDepth += 1

        try {
          actualReturnType = this.checkExpression(expression.body)

          if (functionType != null) {
            this.checkAssignableType(
              actualReturnType,
              functionType.returnType,
              expression.body.loc,
              functionType.returnNullable === true,
              this.expressionCanBeNull(expression.body)
            )

            if (functionType.returnType === 'promise' && functionType.returnPromiseValueType != null) {
              this.checkAssignableType(
                this.resolveExpressionPromiseValueType(expression.body),
                functionType.returnPromiseValueType,
                expression.body.loc
              )
            }
          }
        } finally {
          this.functionDepth = previousFunctionDepth
        }
      } else {
        if (functionType == null) {
          const previousFunctionDepth = this.functionDepth
          this.functionDepth += 1

          try {
            this.checkStatements(expression.body)
          } finally {
            this.functionDepth = previousFunctionDepth
          }

          return
        }

        const previousReturnType = this.currentReturnType
        const previousReturnNullable = this.currentReturnNullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        const previousReturnAsync = this.currentReturnAsync
        const previousFunctionDepth = this.functionDepth

        try {
          this.currentReturnType = functionType.returnType
          this.currentReturnNullable = functionType.returnNullable === true
          this.currentReturnPromiseValueType = functionType.returnPromiseValueType ?? null
          this.currentReturnAsync = false
          this.functionDepth += 1
          this.checkStatements(expression.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.functionDepth = previousFunctionDepth
        }
      }
    })

    expression.returnType = functionType?.returnType ?? actualReturnType
    expression.declaredReturnType = functionType?.declaredReturnType ?? expression.returnType
    expression.returnNullable =
      functionType?.returnNullable === true || (expression.expressionBody && expression.body?.nullable === true)
    expression.returnArrayElementType =
      functionType?.returnArrayElementType ?? expression.body?.arrayElementType ?? null
    expression.returnMapKeyType = functionType?.returnMapKeyType ?? expression.body?.mapKeyType ?? null
    expression.returnMapValueType = functionType?.returnMapValueType ?? expression.body?.mapValueType ?? null
    expression.returnPromiseValueType =
      functionType?.returnPromiseValueType ?? expression.body?.promiseValueType ?? null
    expression.returnSetElementType = functionType?.returnSetElementType ?? expression.body?.setElementType ?? null
  }

  checkClassDeclaration(statement: AnyNode): void {
    const fieldNames = new Set<string>()
    const methodNames = new Set<string>()

    if (statement.extendsName != null) {
      this.report('CCJS_CLASS_EXTENDS', 'class inheritance is not supported', statement.extendsLoc ?? statement.loc)
    }

    for (const field of statement.fields ?? []) {
      if (field.static) {
        this.report('CCJS_CLASS_STATIC', 'static class fields are not supported', field.staticLoc ?? field.loc)
      }

      if (fieldNames.has(field.name)) {
        this.report('CCJS_REDECLARED_NAME', `field ${field.name} is already declared in this class`, field.loc)
      }

      fieldNames.add(field.name)
    }

    for (const method of statement.methods) {
      if (method.static) {
        this.report('CCJS_CLASS_STATIC', 'static class methods are not supported', method.staticLoc ?? method.loc)
      }

      if (methodNames.has(method.name)) {
        this.report('CCJS_REDECLARED_NAME', `method ${method.name} is already declared in this class`, method.loc)
      }

      if (fieldNames.has(method.name)) {
        this.report('CCJS_REDECLARED_NAME', `method ${method.name} conflicts with a class field`, method.loc)
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
        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = false
        const previousClassConstructor = this.currentClassConstructor
        this.currentClassConstructor = method.name === 'constructor'
        const previousFunctionDepth = this.functionDepth
        this.functionDepth += 1

        this.declare(
          'this',
          {
            kind: 'this',
            mutable: false,
            valueType: 'object',
            className: statement.name,
            shape: statement.shape ?? null,
            loc: method.loc
          },
          method.loc
        )

        for (const param of method.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(
            param.name,
            {
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
            },
            param.loc
          )
        }

        try {
          this.checkStatements(method.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.currentClassConstructor = previousClassConstructor
          this.functionDepth = previousFunctionDepth
        }
      })
    }
  }

  checkObjectLiteralAgainstShape(expression: AnyNode, shape: ObjectShapeInfo): void {
    const properties = new Map<string, AnyNode>(expression.properties.map((property) => [property.key, property]))

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property == null) {
        this.report('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc)
        continue
      }

      const fieldType = this.resolveFieldDeclaredType(field)
      const propertyType = this.checkExpression(property.value)

      this.checkAssignableType(
        propertyType,
        fieldType.valueType,
        property.loc,
        fieldType.nullable,
        this.expressionCanBeNull(property.value)
      )

      if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
        this.checkAssignableType(
          this.resolveExpressionArrayElementType(property.value),
          fieldType.arrayElementType,
          property.loc
        )
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
        this.checkAssignableType(
          this.resolveExpressionSetElementType(property.value),
          fieldType.setElementType,
          property.loc
        )
      }

      if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(property.value),
          fieldType.promiseValueType,
          property.loc
        )
      }
    }

    for (const property of expression.properties) {
      if (this.findShapeField(shape, property.key) == null) {
        this.report('CCJS_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    if (expression.type === 'ThisExpression') {
      return this.scope.resolve('this')?.shape ?? expression.shape ?? null
    }

    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      return expression.shape ?? null
    }

    const symbol = this.scope.resolve(expression.path[0])

    if (symbol?.shape != null) {
      return symbol.shape
    }

    if (symbol?.valueType === 'object' && symbol.arrayElementDeclaredType === 'fs.Dirent') {
      return fsDirentObjectShape
    }

    return expression.shape ?? null
  }

  isThisExpression(expression: AnyNode): boolean {
    return (
      expression?.type === 'ThisExpression' ||
      (expression?.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this')
    )
  }

  canInitializeReadonlyClassField(expression: AnyNode): boolean {
    return this.currentClassConstructor && this.isThisExpression(expression)
  }

  findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
    return shape.fields.find((field) => field.name === name) ?? null
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
        const narrowing = this.resolveNullableConditionNarrowing(statement.test)

        this.withNarrowedNullableNames(narrowing.trueNames, () => {
          this.checkScopedBody(statement.body)
        })
      })
    })
  }

  checkForOfStatement(statement: AnyNode): void {
    const iterableType = this.checkExpression(statement.iterable)
    const mapEntryShape =
      iterableType === 'map'
        ? this.createMapEntryShape(this.resolveExpressionMapType(statement.iterable), statement.nameLoc)
        : null
    const elementType =
      iterableType === 'array'
        ? (this.resolveExpressionArrayElementType(statement.iterable) ?? 'unknown')
        : iterableType === 'set'
          ? (this.resolveExpressionSetElementType(statement.iterable) ?? 'unknown')
          : iterableType === 'map'
            ? 'object'
            : 'unknown'
    const elementDeclaredType =
      iterableType === 'array'
        ? (this.resolveExpressionArrayElementDeclaredType(statement.iterable) ?? elementType)
        : iterableType === 'set'
          ? elementType
          : iterableType === 'map'
            ? 'object'
            : 'unknown'
    const declared =
      statement.declaredType == null ? null : this.resolveDeclaredType(statement.declaredType, statement.nameLoc)
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
      this.declare(
        statement.name,
        {
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
        },
        statement.nameLoc
      )

      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
    })
  }

  createMapEntryShape(
    mapType: { key: ValueType | null; value: ValueType | null } | null,
    loc: SourceLocation
  ): ObjectShapeInfo {
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
      this.report(
        'CCJS_SWITCH_TYPE',
        `switch discriminant must be number, string or boolean, got ${discriminantType}`,
        statement.discriminant.loc
      )
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
            this.report(
              'CCJS_SWITCH_TYPE',
              `switch case type ${caseType} does not match discriminant type ${discriminantType}`,
              item.test.loc
            )
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

  resolveNullableConditionNarrowing(expression: AnyNode | null | undefined): {
    trueNames: string[]
    falseNames: string[]
  } {
    if (expression?.type !== 'BinaryExpression') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '&&') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const right = this.withNarrowedNullableNames(left.trueNames, () =>
        this.resolveNullableConditionNarrowing(expression.right)
      )

      return {
        trueNames: this.uniqueNames([...left.trueNames, ...right.trueNames]),
        falseNames: this.intersectNames(left.falseNames, this.uniqueNames([...left.trueNames, ...right.falseNames]))
      }
    }

    if (expression.operator === '||') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const right = this.withNarrowedNullableNames(left.falseNames, () =>
        this.resolveNullableConditionNarrowing(expression.right)
      )

      return {
        trueNames: this.intersectNames(left.trueNames, this.uniqueNames([...left.falseNames, ...right.trueNames])),
        falseNames: this.uniqueNames([...left.falseNames, ...right.falseNames])
      }
    }

    if (!['===', '!==', '==', '!='].includes(expression.operator)) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
    const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

    if (maybeNull?.type !== 'NullLiteral' || nullable?.type !== 'Reference' || nullable.path.length !== 1) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    const name = nullable.path[0]
    const symbol = this.scope.resolve(name)

    if (symbol?.nullable !== true) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (['!==', '!='].includes(expression.operator)) {
      return {
        trueNames: [name],
        falseNames: []
      }
    }

    return {
      trueNames: [],
      falseNames: [name]
    }
  }

  reportNullableRuntimeAccess(receiver: AnyNode, loc: SourceLocation): void {
    if (receiver?.nullable !== true) {
      return
    }

    const valueType = receiver.valueType ?? this.inferNullableAccessValueType(receiver)

    if (!this.isRuntimeNullableType(valueType)) {
      return
    }

    this.report('CCJS_WEAK_ACCESS', 'nullable weak value access requires optional chaining or a prior null check', loc)
  }

  inferNullableAccessValueType(expression: AnyNode): ValueType | null {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      return this.scope.resolve(expression.path[0])?.valueType ?? null
    }

    return expression.valueType ?? null
  }

  isRuntimeNullableType(valueType: ValueType | null | undefined): boolean {
    return ['number', 'boolean', 'string', 'bytes', 'object', 'array', 'map', 'set', 'function'].includes(
      valueType ?? ''
    )
  }

  withNarrowedNullableNames<T>(names: string[], callback: () => T): T {
    if (names.length === 0) {
      return callback()
    }

    const previous = this.narrowedNullableNames
    this.narrowedNullableNames = new Set(previous)

    for (const name of names) {
      this.narrowedNullableNames.add(name)
    }

    try {
      return callback()
    } finally {
      this.narrowedNullableNames = previous
    }
  }

  uniqueNames(names: string[]): string[] {
    return [...new Set(names)]
  }

  intersectNames(left: string[], right: string[]): string[] {
    const rightNames = new Set(right)

    return this.uniqueNames(left.filter((name) => rightNames.has(name)))
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

  reportOwnershipCycles(): void {
    const graph = this.buildOwnershipGraph()
    const path: OwnershipGraphEdge[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const reported = new Set<string>()

    const visit = (node: string): void => {
      if (visiting.has(node)) {
        return
      }

      if (visited.has(node)) {
        return
      }

      visiting.add(node)

      for (const edge of graph.get(node) ?? []) {
        const cycleStart = path.findIndex((item) => item.from === edge.to)

        if (edge.to === node || cycleStart >= 0) {
          const cycle = [...(cycleStart < 0 ? [] : path.slice(cycleStart)), edge]
          const key = this.ownershipCycleKey(cycle)

          if (!reported.has(key)) {
            reported.add(key)
            this.report(
              'CCJS_OWNERSHIP_CYCLE',
              `strong ownership cycle detected: ${this.formatOwnershipCycle(cycle)}. Mark one back-reference as weak.`,
              cycle[0]?.loc ?? edge.loc
            )
          }

          continue
        }

        if (!visited.has(edge.to)) {
          path.push(edge)
          visit(edge.to)
          path.pop()
        }
      }

      visiting.delete(node)
      visited.add(node)
    }

    for (const node of graph.keys()) {
      visit(node)
    }
  }

  buildOwnershipGraph(): Map<string, OwnershipGraphEdge[]> {
    const graph = new Map<string, OwnershipGraphEdge[]>()
    const nodeNames = this.ownershipGraphNodeNames()

    for (const name of nodeNames) {
      graph.set(name, [])
    }

    for (const item of this.program.body) {
      if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
        this.addOwnershipFieldEdges(graph, nodeNames, item.name, item.valueType.fields)
      } else if (item.type === 'ClassDeclaration') {
        this.addOwnershipFieldEdges(graph, nodeNames, item.name, item.fields ?? [])
      }
    }

    return graph
  }

  ownershipGraphNodeNames(): Set<string> {
    return new Set([...this.types.keys(), ...this.classNames])
  }

  addOwnershipFieldEdges(
    graph: Map<string, OwnershipGraphEdge[]>,
    nodeNames: Set<string>,
    owner: string,
    fields: AnyNode[]
  ): void {
    for (const field of fields) {
      if (field.ownership === 'weak') {
        continue
      }

      for (const target of this.ownershipTargetsFromTypeName(field.valueType)) {
        if (!nodeNames.has(target)) {
          continue
        }

        graph.get(owner)?.push({
          from: owner,
          to: target,
          field: field.name,
          loc: field.loc
        })
      }
    }
  }

  ownershipTargetsFromTypeName(name: string | null | undefined): string[] {
    if (name == null || name === 'unknown') {
      return []
    }

    const nullableTypeName = nullableTypeNameFromTypeName(name)

    if (nullableTypeName != null) {
      return this.ownershipTargetsFromTypeName(nullableTypeName)
    }

    const arrayElementTypeName = arrayElementTypeNameFromTypeName(name)

    if (arrayElementTypeName != null) {
      return this.ownershipTargetsFromTypeName(arrayElementTypeName)
    }

    const setElementTypeName = setElementTypeNameFromTypeName(name)

    if (setElementTypeName != null) {
      return this.ownershipTargetsFromTypeName(setElementTypeName)
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (mapTypeNames != null) {
      return this.ownershipTargetsFromTypeName(mapTypeNames.value)
    }

    return [name]
  }

  ownershipCycleKey(cycle: OwnershipGraphEdge[]): string {
    return cycle
      .map((edge) => `${edge.from}.${edge.field}->${edge.to}`)
      .sort()
      .join('|')
  }

  formatOwnershipCycle(cycle: OwnershipGraphEdge[]): string {
    return cycle.map((edge) => `${edge.from}.${edge.field} -> ${edge.to}`).join(' -> ')
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

    if (isBytesTypeName(name)) {
      return {
        valueType: 'bytes',
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

    const classSymbol = this.scope.resolve(name)

    if (classSymbol?.kind === 'class' || this.classNames.has(name)) {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classSymbol?.shape ?? null,
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
            params: shape.params.map((param) => {
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
      fields: shape.fields.map((field) => {
        const fieldInfo = this.resolveFieldDeclaredType(field)

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

  resolveFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    if (field.ownership === 'weak') {
      return this.resolveWeakFieldDeclaredType(field)
    }

    return this.resolveDeclaredType(field.declaredType ?? field.valueType, field.loc)
  }

  resolveWeakFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    const declaredName = field.declaredType ?? field.valueType
    const targetName = nullableTypeNameFromTypeName(declaredName) ?? declaredName
    const fieldInfo = this.resolveWeakTargetDeclaredType(targetName, field.loc)

    if (fieldInfo.valueType !== 'unknown' && fieldInfo.valueType !== 'object' && field.weakTypeValidated !== true) {
      this.report(
        'CCJS_WEAK_TYPE',
        `weak field ${field.name} must target an object or class type in the current compiler slice`,
        field.weakLoc ?? field.loc
      )
    }

    field.weakTypeValidated = true

    return {
      ...fieldInfo,
      nullable: true
    }
  }

  resolveWeakTargetDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
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

    if (name === 'object') {
      return {
        valueType: 'object',
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

    if (shape?.kind === 'object') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: this.resolveWeakTargetObjectShape(shape),
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const classSymbol = this.scope.resolve(name)

    if (this.classNames.has(name) || classSymbol?.kind === 'class') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classSymbol?.shape == null ? null : this.resolveWeakTargetObjectShape(classSymbol.shape),
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    return this.resolveDeclaredType(name, loc)
  }

  resolveWeakTargetObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    return {
      ...shape,
      fields: shape.fields.map((field) => {
        const declared = this.resolveWeakTargetShapeFieldType(field)

        return {
          ...field,
          declaredType: field.declaredType ?? field.valueType,
          valueType: declared.valueType,
          nullable: declared.nullable || field.ownership === 'weak',
          arrayElementType: declared.arrayElementType,
          arrayElementDeclaredType: declared.arrayElementDeclaredType,
          mapKeyType: declared.mapKeyType,
          mapValueType: declared.mapValueType,
          promiseValueType: declared.promiseValueType ?? null,
          setElementType: declared.setElementType,
          functionType: null,
          shape: null
        }
      })
    }
  }

  resolveWeakTargetShapeFieldType(field: AnyNode): ResolvedTypeInfo {
    return this.resolveWeakTargetShapeTypeName(field.declaredType ?? field.valueType, field.loc)
  }

  resolveWeakTargetShapeTypeName(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name == null || name === 'unknown') {
      return this.unresolvedTypeInfo()
    }

    const nullableTypeName = nullableTypeNameFromTypeName(name)

    if (nullableTypeName != null) {
      const inner = this.resolveWeakTargetShapeTypeName(nullableTypeName, loc)

      return {
        ...inner,
        nullable: true
      }
    }

    const arrayElementTypeName = arrayElementTypeNameFromTypeName(name)

    if (name === 'array' || arrayElementTypeName != null) {
      const elementInfo =
        arrayElementTypeName == null ? null : this.resolveWeakTargetShapeTypeName(arrayElementTypeName, loc)

      return {
        ...this.unresolvedTypeInfo(),
        valueType: 'array',
        arrayElementType: elementInfo?.valueType ?? 'unknown',
        arrayElementDeclaredType: arrayElementTypeName ?? null
      }
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || mapTypeNames != null) {
      const keyInfo = mapTypeNames == null ? null : this.resolveWeakTargetShapeTypeName(mapTypeNames.key, loc)
      const valueInfo = mapTypeNames == null ? null : this.resolveWeakTargetShapeTypeName(mapTypeNames.value, loc)

      return {
        ...this.unresolvedTypeInfo(),
        valueType: 'map',
        mapKeyType: keyInfo?.valueType ?? 'unknown',
        mapValueType: valueInfo?.valueType ?? 'unknown'
      }
    }

    const setElementTypeName = setElementTypeNameFromTypeName(name)

    if (name === 'set' || setElementTypeName != null) {
      const elementInfo =
        setElementTypeName == null ? null : this.resolveWeakTargetShapeTypeName(setElementTypeName, loc)

      return {
        ...this.unresolvedTypeInfo(),
        valueType: 'set',
        setElementType: elementInfo?.valueType ?? 'unknown'
      }
    }

    if (isBytesTypeName(name)) {
      return {
        ...this.unresolvedTypeInfo(),
        valueType: 'bytes'
      }
    }

    if (isBuiltinValueType(name)) {
      return {
        ...this.unresolvedTypeInfo(),
        valueType: name
      }
    }

    if (
      this.types.get(name)?.kind === 'object' ||
      this.classNames.has(name) ||
      this.scope.resolve(name)?.kind === 'class'
    ) {
      return {
        ...this.unresolvedTypeInfo(),
        valueType: 'object'
      }
    }

    return this.resolveDeclaredType(name, loc)
  }

  unresolvedTypeInfo(): ResolvedTypeInfo {
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

    if (expression.type === 'AwaitExpression') {
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

    if (expression.type === 'AwaitExpression') {
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

  resolveExpressionMapType(
    expression: AnyNode | null | undefined
  ): { key: ValueType | null; value: ValueType | null } | null {
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
      return expression.valueType === 'set' ? (expression.setElementType ?? null) : null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.valueType === 'set' ? (symbol.setElementType ?? null) : null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.valueType === 'set' ? (field.setElementType ?? null) : null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.valueType === 'set' ? (field.setElementType ?? null) : null
    }

    return null
  }

  resolveExpressionPromiseValueType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      return expression.valueType === 'promise' ? (expression.promiseValueType ?? null) : null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(expression.path[0])

      return symbol?.valueType === 'promise' ? (symbol.promiseValueType ?? null) : null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.property)

      return field?.valueType === 'promise' ? (field.promiseValueType ?? null) : null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      const field = shape == null ? null : this.findShapeField(shape, expression.index.value)

      return field?.valueType === 'promise' ? (field.promiseValueType ?? null) : null
    }

    return null
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation): void {
    if (this.scope.hasOwn(name)) {
      this.report('CCJS_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
    this.narrowedNullableNames.delete(name)
  }

  withScope(callback: () => void): void {
    const previous = this.scope
    const previousNarrowedNullableNames = this.narrowedNullableNames
    this.scope = new Scope(previous)
    this.narrowedNullableNames = new Set(previousNarrowedNullableNames)

    try {
      callback()
    } finally {
      this.scope = previous
      this.narrowedNullableNames = previousNarrowedNullableNames
    }
  }

  withReturnContext(
    returnType: ValueType,
    returnNullable: boolean,
    returnPromiseValueType: ValueType | null,
    callback: () => void
  ): void {
    const previousReturnType = this.currentReturnType
    const previousReturnNullable = this.currentReturnNullable
    const previousReturnPromiseValueType = this.currentReturnPromiseValueType
    const previousReturnAsync = this.currentReturnAsync

    try {
      this.currentReturnType = returnType
      this.currentReturnNullable = returnNullable
      this.currentReturnPromiseValueType = returnPromiseValueType
      this.currentReturnAsync = false
      callback()
    } finally {
      this.currentReturnType = previousReturnType
      this.currentReturnNullable = previousReturnNullable
      this.currentReturnPromiseValueType = previousReturnPromiseValueType
      this.currentReturnAsync = previousReturnAsync
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

  checkAssignableType(
    actual: ValueType | null | undefined,
    expected: ValueType | null | undefined,
    loc: SourceLocation,
    expectedNullable = false,
    actualNullable = false
  ): void {
    if (!isAssignableType(actual, expected, expectedNullable, actualNullable)) {
      const actualLabel =
        actualNullable && actual !== 'null' && actual !== 'unknown' && actual != null ? `${actual} | null` : actual

      this.report('CCJS_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
    }
  }

  report(code: string, message: string, loc: SourceLocation): void {
    this.diagnostics.push(diagnostic(code, message, loc))
  }
}

function isPromiseMethod(name: string): boolean {
  return ['catch', 'then'].includes(name)
}

function promiseExecutorFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'resolve',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      },
      {
        name: 'reject',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseSettlementFunctionType(): AnyNode {
  return {
    kind: 'function',
    returnType: 'void',
    returnNullable: false
  }
}

function promiseStaticMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression' || !['resolve', 'reject'].includes(callee.property)) {
    return null
  }

  return callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Promise'
    ? callee.property
    : null
}
