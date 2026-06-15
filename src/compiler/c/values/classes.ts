import { diagnostic } from '../../diagnostics.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CEmitContext,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, emitCIdentifier } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType } from '../value-types.ts'
import { emitObjectValueReference, resolveCObjectExpressionName } from './objects.ts'
import type { AnyNode, Diagnostic } from '../../types.ts'
import type {
  CClassInfo,
  CClassMethod,
  CFunctionParam,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression,
  CPreparedCallArgs as PreparedCallArgs
} from '../types.ts'

export type ClassLoweringDependencies = {
  emitCFieldFlags: (field: CObjectShapeField) => string
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedCallArgs: (expression: AnyNode, params: CFunctionParam[], context: CFunctionContext) => PreparedCallArgs
}

type ClassMethodCallInfo = {
  info: CClassInfo
  method: AnyNode | null
  objectExpression: string
}

function classDeps(context: CFunctionContext): ClassLoweringDependencies {
  return context.classLoweringDependencies
}

export function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]): Map<string, CClassInfo> {
  const infos = new Map<string, CClassInfo>()

  for (const item of classes) {
    const constructor = item.methods.find((method) => method.name === 'constructor') ?? null
    const assignments = collectClassConstructorAssignments(item, constructor, diagnostics)
    const fields = resolveClassFields(item, constructor, assignments)
    const methods = new Map<string, AnyNode>()

    for (const method of item.methods) {
      if (method.name !== 'constructor') {
        methods.set(method.name, method)
      }
    }

    infos.set(item.name, {
      name: item.name,
      node: item,
      constructor,
      assignments,
      fields,
      methods
    })
  }

  return infos
}

export function collectClassMethods(context: CEmitContext): CClassMethod[] {
  return [...context.classInfos.values()].flatMap((info) =>
    [...info.methods.values()].map((method) => ({
      info,
      method
    }))
  )
}

function collectClassConstructorAssignments(
  classNode: AnyNode,
  constructor: AnyNode | null,
  diagnostics: Diagnostic[]
) {
  if (constructor == null) {
    return []
  }

  const assignments: AnyNode[] = []

  for (const statement of constructor.body) {
    const assignment =
      statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
        ? statement.expression
        : null

    if (assignment == null || !isThisFieldExpression(assignment.target)) {
      diagnostics.push(
        diagnostic(
          'CCJS_C_CLASS',
          `class ${classNode.name} constructor currently supports only this.field assignments in the C backend`,
          statement.loc ?? constructor.loc
        )
      )
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

function resolveClassFields(classNode: AnyNode, constructor: AnyNode | null, assignments: AnyNode[]) {
  const shapeFields = classNode.shape?.fields

  if (shapeFields != null) {
    return shapeFields.map((field) => ({
      name: field.name,
      readonly: field.readonly === true,
      ownership: field.ownership ?? 'strong',
      valueType: field.valueType ?? 'unknown',
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  }

  const fields: AnyNode[] = []
  const seen = new Set<string>()

  for (const assignment of assignments) {
    if (seen.has(assignment.field)) {
      continue
    }

    seen.add(assignment.field)
    fields.push({
      name: assignment.field,
      readonly: false,
      ownership: 'strong',
      valueType: inferClassConstructorFieldType(assignment.value, constructor)
    })
  }

  return fields
}

function inferClassConstructorFieldType(expression: AnyNode, constructor: AnyNode | null) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && constructor != null) {
    const param = constructor.params.find((item) => item.name === expression.path[0])

    if (param != null) {
      return param.valueType ?? 'unknown'
    }
  }

  if (expression?.valueType != null) {
    return expression.valueType
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

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  return 'unknown'
}

function isThisFieldExpression(expression: AnyNode) {
  return (
    expression?.type === 'MemberExpression' &&
    isThisObjectExpression(expression.object) &&
    typeof expression.property === 'string'
  )
}

function isThisObjectExpression(expression: AnyNode) {
  return (
    expression?.type === 'ThisExpression' ||
    (expression?.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this')
  )
}

export function emitClassObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CLASS',
        'this class constructor is not supported by the current C backend slice',
        statement.init?.loc ?? statement.loc
      )
    )
    return [`ccjs_value ${statement.name} = ccjs_undefined_value();`]
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  context.classInstanceTypes.set(statement.name, info.name)
  registerClassObjectShape(context, statement.name, info)

  return emitCClassObjectInitLines(statement.name, statement.init, info, context)
}

export function emitCClassObjectValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const info = resolveClassConstructorInfo(expression, context)
  const temp = nextCName(context, 'ccjs_class_object')
  registerOwnedValue(context, temp)

  if (info == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CLASS',
        'this class constructor is not supported by the current C backend slice',
        expression?.loc
      )
    )

    return {
      lines: [...emitPrepareOwnedValueWrite(temp), `${temp} = ccjs_undefined_value();`],
      expression: temp
    }
  }

  return {
    lines: emitCClassObjectInitLines(temp, expression, info, context),
    expression: temp
  }
}

function emitCClassObjectInitLines(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: CFunctionContext
): string[] {
  const shapeName = nextCName(context, `ccjs_shape_${info.name}`)
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of info.fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${classDeps(context).emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${info.fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(...emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context))

  const constructorArgs = mapClassConstructorArgs(expression, info)

  for (const assignment of info.assignments) {
    const fieldIndex = info.fields.findIndex((field) => field.name === assignment.field)

    if (fieldIndex === -1) {
      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown class field ${assignment.field}`, assignment.loc ?? expression.loc)
      )
      continue
    }

    const value = classDeps(context).emitCValueExpression(
      substituteClassConstructorParams(assignment.value, constructorArgs) as AnyNode,
      context
    )
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

export function registerClassObjectShape(context: CFunctionContext, name: string, info: CClassInfo): void {
  context.objectShapes.set(
    name,
    info.fields.map((field) => ({
      name: field.name,
      ownership: field.ownership ?? 'strong',
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
}

function mapClassConstructorArgs(expression: AnyNode, info: CClassInfo): Map<string, AnyNode> {
  const args = new Map<string, AnyNode>()
  const params = info.constructor?.params ?? []

  for (const [index, param] of params.entries()) {
    if (expression.args[index] != null) {
      args.set(param.name, expression.args[index])
    }
  }

  return args
}

function substituteClassConstructorParams(node: unknown, args: Map<string, AnyNode>): unknown {
  if (node == null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((item) => substituteClassConstructorParams(item, args))
  }

  const current = node as AnyNode

  if (current.type === 'Reference' && current.path.length === 1 && args.has(current.path[0])) {
    return args.get(current.path[0])
  }

  const copy: AnyNode = {}

  for (const [key, value] of Object.entries(node)) {
    copy[key] = substituteClassConstructorParams(value, args)
  }

  return copy
}

function resolveClassConstructorInfo(expression: AnyNode, context: CFunctionContext): CClassInfo | null {
  if (
    expression?.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return context.classInfos.get(expression.callee.path[0]) ?? null
}

export function isClassConstructorExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return resolveClassConstructorInfo(expression, context) != null
}

export function emitPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const call = resolveClassMethodCallInfo(expression, context)

  if (call == null) {
    return null
  }

  if (call.method == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_UNKNOWN_FIELD',
        `unknown method ${expression.callee.property}`,
        expression.callee.loc ?? expression.loc
      )
    )
    return {
      lines: [],
      expression: ''
    }
  }

  if (call.method.params.length !== expression.args.length) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `method ${expression.callee.property} expects ${call.method.params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  const prepared = classDeps(context).emitPreparedCallArgs(expression, call.method.params, context)
  const callExpression = `${emitCClassMethodName(call.info.name, call.method.name)}(${[
    call.objectExpression,
    ...prepared.args
  ].join(', ')})`

  if (isManagedRuntimeReturnType(call.method.returnType)) {
    const value = nextCName(context, 'ccjs_method_value')
    const tag = cRuntimeValueTag(call.method.returnType)
    registerOwnedValue(context, value)

    return {
      lines: [
        ...prepared.lines,
        ...emitPrepareOwnedValueWrite(value),
        `${value} = ${callExpression};`,
        emitRuntimeValueCheck(value, tag, context)
      ],
      expression: value
    }
  }

  return {
    lines: prepared.lines,
    expression: call.method.returnType === 'void' ? `${callExpression}` : callExpression
  }
}

function resolveClassMethodCallInfo(expression: AnyNode, context: CFunctionContext): ClassMethodCallInfo | null {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.callee.object)

  if (objectName == null) {
    return null
  }

  const className = context.classInstanceTypes.get(objectName)

  if (className == null) {
    return null
  }

  const info = context.classInfos.get(className)

  if (info == null) {
    return null
  }

  return {
    info,
    method: info.methods.get(expression.callee.property) ?? null,
    objectExpression: emitObjectValueReference(objectName, context)
  }
}

export function emitCClassMethodName(className: string, methodName: string): string {
  return `ccjs_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}
