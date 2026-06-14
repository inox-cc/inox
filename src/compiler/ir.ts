import {
  collectIrFeatures,
  collectRuntimeRequirements,
  collectSyntaxFeatureUsages
} from './ir/features.ts'
import { fsGlobalUsagePathForRuntimeMethod } from './stdlib/descriptors/fs.ts'
import {
  collectFunctionDeclarations,
  collectIrTopLevelNodes,
  collectTopLevelItems
} from './ir/top-level.ts'
import type {
  AnyNode,
  IrFunctionEffect,
  IrGlobalUsage,
  IrProgram,
  IrThrowValueType,
  IrTopLevelItem,
  ProgramNode
} from './types.ts'

export {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodes,
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram,
  hasIrFunctionDeclaration
} from './ir/top-level.ts'
export type { IrFunctionNodeEntry, IrModuleRecord } from './ir/top-level.ts'
export {
  collectIrFeatureRequirements,
  collectIrRuntimeRequirements,
  collectIrSyntaxFeatureUsages
} from './ir/features.ts'

const jsStdGlobalRoots = new Set([
  'Array',
  'Buffer',
  'Date',
  'Error',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'JSON',
  'Map',
  'Math',
  'Promise',
  'Set',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'crypto',
  'fetch',
  'fs',
  'http',
  'performance',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'setTimeout',
  'setInterval',
  'setImmediate'
])

type IrLocalThrowValueTypeOptions = {
  errorObjectNames?: Iterable<string>
  functionThrowValueTypes?: ReadonlyMap<string, readonly IrThrowValueType[]>
}

export function lowerHirToIr(program: ProgramNode): IrProgram {
  const features = collectIrFeatures(program)
  const topLevelItems = collectTopLevelItems(program)

  return {
    type: 'IrProgram',
    version: 1,
    features,
    runtimeRequirements: collectRuntimeRequirements(features),
    topLevelItems,
    functionDeclarations: collectFunctionDeclarations(program, topLevelItems),
    functionEffects: collectIrFunctionEffects([{ body: program.body, topLevelItems }]),
    syntaxFeatures: collectSyntaxFeatureUsages(program),
    globalUsages: collectGlobalUsages(program),
    body: program.body
  }
}

export function collectIrFunctionEffects(
  programs: Array<{ body: AnyNode[]; topLevelItems: IrTopLevelItem[] }>
): IrFunctionEffect[] {
  return collectFunctionEffects(programs.flatMap((program) => collectIrTopLevelNodes(program, 'function')))
}

export function collectIrStoredFunctionEffects(
  programs: Array<{ functionEffects: IrFunctionEffect[] }>
): IrFunctionEffect[] {
  return programs.flatMap((program) => program.functionEffects)
}

export function collectIrLocalThrowValueTypes(
  statement: AnyNode | null | undefined,
  options: IrLocalThrowValueTypeOptions = {}
): IrThrowValueType[] {
  const functionThrowValueTypes = new Map<string, IrThrowValueType[]>(
    [...(options.functionThrowValueTypes ?? new Map<string, IrThrowValueType[]>())].map(([name, types]) => [
      name,
      [...types]
    ])
  )
  const functionNames = new Set(functionThrowValueTypes.keys())
  const errorObjectNames = new Set(options.errorObjectNames ?? [])

  return uniqueThrowValueTypes(
    collectEscapingThrowValueTypesFromStatement(
      statement,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      false
    )
  )
}

export function collectIrGlobalUsages(programs: Array<{ globalUsages: IrGlobalUsage[] }>): IrGlobalUsage[] {
  return programs.flatMap((program) => program.globalUsages)
}

export function collectIrGlobalRoots(programs: Array<{ globalUsages: IrGlobalUsage[] }>): string[] {
  return [...new Set(collectIrGlobalUsages(programs).map((usage) => usage.root))].sort()
}

function collectGlobalUsages(program: ProgramNode): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  visitGlobalUsage(program, usages)

  return usages
}

function visitGlobalUsage(node: unknown, usages: IrGlobalUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitGlobalUsage(item, usages)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  if (item.type === 'CallExpression' && item.fsRuntimeMethod != null) {
    const path = fsGlobalUsagePathForRuntimeMethod(item.fsRuntimeMethod)

    if (path != null) {
      usages.push({
        root: 'fs',
        path,
        loc: item.loc
      })

      for (const arg of item.args ?? []) {
        visitGlobalUsage(arg, usages)
      }

      return
    }
  }

  if (item.type === 'MemberExpression' || item.type === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      return
    }
  }

  if (item.type === 'IndexExpression' || item.type === 'OptionalIndexExpression') {
    const path = globalUsagePath(item.object)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      visitGlobalUsage(item.index, usages)
      return
    }
  }

  if (item.type === 'Reference' && item.path.length > 0 && jsStdGlobalRoots.has(item.path[0])) {
    usages.push({
      root: item.path[0],
      path: item.path,
      loc: item.loc
    })
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    visitGlobalUsage(value, usages)
  }
}

function globalUsagePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression?.type === 'Reference' && expression.path.length > 0 && jsStdGlobalRoots.has(expression.path[0])) {
    return expression.path
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    const objectPath = globalUsagePath(expression.object)

    return objectPath == null ? null : [...objectPath, expression.property]
  }

  return null
}

function collectFunctionEffects(functions: AnyNode[]): IrFunctionEffect[] {
  const functionNames = new Set(functions.map((item) => item.name))
  const functionThrowValueTypes = new Map<string, IrThrowValueType[]>(functions.map((item) => [item.name, []]))
  let changed = true

  while (changed) {
    changed = false

    for (const item of functions) {
      const types = uniqueThrowValueTypes(
        collectEscapingThrowValueTypesFromStatements(
          item.body,
          functionThrowValueTypes,
          functionNames,
          new Set(),
          false
        )
      )
      const previous = functionThrowValueTypes.get(item.name) ?? []

      if (!sameThrowValueTypes(previous, types)) {
        functionThrowValueTypes.set(item.name, types)
        changed = true
      }
    }
  }

  return functions.map((item) => {
    const throwValueTypes = functionThrowValueTypes.get(item.name) ?? []

    return {
      name: item.name,
      throws: throwValueTypes.length > 0,
      throwValueTypes
    }
  })
}

function collectEscapingThrowValueTypesFromStatements(
  statements: AnyNode[],
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  return statements.flatMap((statement) =>
    collectEscapingThrowValueTypesFromStatement(
      statement,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  )
}

function collectEscapingThrowValueTypesFromStatement(
  statement: AnyNode | null | undefined,
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ThrowStatement') {
    return hasErrorTarget ? [] : [inferThrowValueTypeForAnalysis(statement.argument, errorObjectNames)]
  }

  if (statement.type === 'VariableDeclaration') {
    const types = collectEscapingThrowValueTypesFromExpression(
      statement.init,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )

    if (isErrorValueExpressionForAnalysis(statement.init, errorObjectNames)) {
      errorObjectNames.add(statement.name)
    }

    return types
  }

  if (statement.type === 'ExpressionStatement') {
    return collectEscapingThrowValueTypesFromExpression(
      statement.expression,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (statement.type === 'ReturnStatement') {
    return collectEscapingThrowValueTypesFromExpression(
      statement.argument,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (statement.type === 'BlockStatement') {
    return collectEscapingThrowValueTypesFromStatements(
      statement.body,
      functionThrowValueTypes,
      functionNames,
      new Set(errorObjectNames),
      hasErrorTarget
    )
  }

  if (statement.type === 'IfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        statement.condition,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.consequent,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.alternate,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      )
    ]
  }

  if (statement.type === 'WhileStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        statement.condition,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      )
    ]
  }

  if (statement.type === 'ForStatement') {
    return [
      ...(statement.init?.type === 'VariableDeclaration'
        ? collectEscapingThrowValueTypesFromStatement(
            statement.init,
            functionThrowValueTypes,
            functionNames,
            new Set(errorObjectNames),
            hasErrorTarget
          )
        : collectEscapingThrowValueTypesFromExpression(
            statement.init,
            functionThrowValueTypes,
            functionNames,
            errorObjectNames,
            hasErrorTarget
          )),
      ...collectEscapingThrowValueTypesFromExpression(
        statement.test,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromExpression(
        statement.update,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      )
    ]
  }

  if (statement.type === 'ForOfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        statement.iterable,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.body,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      )
    ]
  }

  if (statement.type === 'SwitchStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        statement.discriminant,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...statement.cases.flatMap((item) => [
        ...collectEscapingThrowValueTypesFromExpression(
          item.test,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        ),
        ...collectEscapingThrowValueTypesFromStatements(
          item.consequent,
          functionThrowValueTypes,
          functionNames,
          new Set(errorObjectNames),
          hasErrorTarget
        )
      ])
    ]
  }

  if (statement.type === 'TryStatement') {
    const blockHasTarget = statement.handler != null ? true : hasErrorTarget

    return [
      ...collectEscapingThrowValueTypesFromStatement(
        statement.block,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        blockHasTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.handler?.body,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromStatement(
        statement.finalizer,
        functionThrowValueTypes,
        functionNames,
        new Set(errorObjectNames),
        hasErrorTarget
      )
    ]
  }

  return []
}

function collectEscapingThrowValueTypesFromExpression(
  expression: AnyNode | null | undefined,
  functionThrowValueTypes: Map<string, IrThrowValueType[]>,
  functionNames: Set<string>,
  errorObjectNames: Set<string>,
  hasErrorTarget: boolean
): IrThrowValueType[] {
  if (expression == null) {
    return []
  }

  if (expression.type === 'CallExpression') {
    const callTypes =
      !hasErrorTarget &&
      expression.callee.type === 'Reference' &&
      expression.callee.path.length === 1 &&
      functionNames.has(expression.callee.path[0])
        ? (functionThrowValueTypes.get(expression.callee.path[0]) ?? [])
        : []

    return [
      ...callTypes,
      ...collectEscapingThrowValueTypesFromExpression(
        expression.callee,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...expression.args.flatMap((arg) =>
        collectEscapingThrowValueTypesFromExpression(
          arg,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        )
      )
    ]
  }

  if (expression.type === 'NewExpression' || expression.type === 'OptionalCallExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        expression.callee,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...expression.args.flatMap((arg) =>
        collectEscapingThrowValueTypesFromExpression(
          arg,
          functionThrowValueTypes,
          functionNames,
          errorObjectNames,
          hasErrorTarget
        )
      )
    ]
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return collectEscapingThrowValueTypesFromExpression(
      expression.object,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        expression.object,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromExpression(
        expression.index,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    ]
  }

  if (expression.type === 'AssignmentExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        expression.target,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromExpression(
        expression.value,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    ]
  }

  if (expression.type === 'BinaryExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(
        expression.left,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      ),
      ...collectEscapingThrowValueTypesFromExpression(
        expression.right,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    ]
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    return collectEscapingThrowValueTypesFromExpression(
      expression.argument,
      functionThrowValueTypes,
      functionNames,
      errorObjectNames,
      hasErrorTarget
    )
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.flatMap((item) =>
      collectEscapingThrowValueTypesFromExpression(
        item,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.flatMap((property) =>
      collectEscapingThrowValueTypesFromExpression(
        property.value,
        functionThrowValueTypes,
        functionNames,
        errorObjectNames,
        hasErrorTarget
      )
    )
  }

  return []
}

function inferThrowValueTypeForAnalysis(
  expression: AnyNode | null | undefined,
  errorObjectNames: Set<string>
): IrThrowValueType {
  if (isErrorValueExpressionForAnalysis(expression, errorObjectNames)) {
    return 'error'
  }

  if (
    expression?.type === 'StringLiteral' ||
    expression?.type === 'TemplateLiteral' ||
    expression?.valueType === 'string'
  ) {
    return 'string'
  }

  return 'other'
}

function isErrorValueExpressionForAnalysis(
  expression: AnyNode | null | undefined,
  errorObjectNames: Set<string>
): boolean {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  return expression?.type === 'Reference' && expression.path.length === 1 && errorObjectNames.has(expression.path[0])
}

function isErrorConstructorExpression(expression: AnyNode | null | undefined): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Error'
  )
}

function uniqueThrowValueTypes(types: IrThrowValueType[]): IrThrowValueType[] {
  return [...new Set(types)]
}

function sameThrowValueTypes(left: IrThrowValueType[], right: IrThrowValueType[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item))
}
