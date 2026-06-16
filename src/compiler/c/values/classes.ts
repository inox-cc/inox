import { diagnostic } from '../../diagnostics.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { isReadonlyCObjectShapeField } from '../types.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType } from '../value-types.ts'
import { emitObjectValueReference, resolveCObjectExpressionName } from './objects.ts'
import type { CEmitContext, CFunctionContext } from '../context.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
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

type CClassInfoMap = Map<string, CClassInfo>
type CClassMethodMap = Map<string, AnyNode>
type CConstructorArgMap = Map<string, AnyNode>
type CStringSet = Set<string>
type ClassMaybeNode = AnyNode | null | undefined

function classDeps(context: CFunctionContext): ClassLoweringDependencies {
  return context.classLoweringDependencies
}

function createClassInfoMap(): CClassInfoMap {
  return new Map()
}

function createClassMethodMap(): CClassMethodMap {
  return new Map()
}

function createConstructorArgMap(): CConstructorArgMap {
  return new Map()
}

function createStringSet(): CStringSet {
  return new Set()
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function classFieldOwnership(field: CObjectShapeField): string {
  if (field.ownership != null) {
    return field.ownership
  }

  return 'strong'
}

export function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]): CClassInfoMap {
  const infos = createClassInfoMap()

  for (const item of classes) {
    const constructorMethod = findClassConstructorMethod(item)
    const assignments = collectClassConstructorAssignments(item, constructorMethod, diagnostics)
    const fields = resolveClassFields(item, constructorMethod, assignments)
    const methods = createClassMethodMap()

    for (const method of item.methods) {
      if (method.name !== 'constructor') {
        methods.set(method.name, method)
      }
    }

    infos.set(item.name, {
      name: item.name,
      node: item,
      constructor: constructorMethod,
      assignments,
      fields,
      methods
    })
  }

  return infos
}

function findClassConstructorMethod(classNode: AnyNode): AnyNode | null {
  for (const method of classNode.methods) {
    if (method.name === 'constructor') {
      return method
    }
  }

  return null
}

export function collectClassMethods(context: CEmitContext): CClassMethod[] {
  const methods: CClassMethod[] = []

  for (const info of context.classInfos.values()) {
    for (const method of info.methods.values()) {
      methods.push({
        info,
        method
      })
    }
  }

  return methods
}

function collectClassConstructorAssignments(
  classNode: AnyNode,
  constructorMethod: AnyNode | null,
  diagnostics: Diagnostic[]
) {
  if (constructorMethod == null) {
    return []
  }

  const assignments: AnyNode[] = []

  for (const statement of constructorMethod.body) {
    let assignment: AnyNode | null = null

    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      assignment = statement.expression
    }

    if (assignment == null || !isThisFieldExpression(assignment.target)) {
      diagnostics.push(
        diagnostic(
          'CCJS_C_CLASS',
          `class ${classNode.name} constructor currently supports only this.field assignments in the C backend`,
          nodeLocOrFallback(statement, constructorMethod)
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

function resolveClassFields(
  classNode: AnyNode,
  constructorMethod: AnyNode | null,
  assignments: AnyNode[]
): CObjectShapeField[] {
  let shapeFields: CObjectShapeField[] | null = null

  if (classNode.shape != null && classNode.shape.fields != null) {
    shapeFields = classNode.shape.fields
  }

  if (shapeFields != null) {
    const fields: CObjectShapeField[] = []

    for (const field of shapeFields) {
      fields.push(resolveClassShapeField(field))
    }

    return fields
  }

  const fields: CObjectShapeField[] = []
  const seen = createStringSet()

  for (const assignment of assignments) {
    if (seen.has(assignment.field)) {
      continue
    }

    seen.add(assignment.field)
    const valueType = inferClassConstructorFieldType(assignment.value, constructorMethod)
    fields.push({
      name: assignment.field,
      readonlyField: false,
      ownership: 'strong',
      valueType
    })
  }

  return fields
}

function resolveClassShapeField(field: CObjectShapeField): CObjectShapeField {
  let ownership = 'strong'
  let valueType = 'unknown'

  if (field.ownership != null) {
    ownership = field.ownership
  }

  if (field.valueType != null) {
    valueType = field.valueType
  }

  return {
    name: field.name,
    readonlyField: isReadonlyCObjectShapeField(field),
    ownership,
    valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  }
}

function inferClassConstructorFieldType(expression: ClassMaybeNode, constructorMethod: AnyNode | null): string {
  if (expression == null) {
    return 'unknown'
  }

  if (expression.type === 'Reference' && expression.path.length === 1 && constructorMethod != null) {
    const param = findClassParam(constructorMethod.params, expression.path[0])

    if (param != null) {
      if (param.valueType != null) {
        return param.valueType
      }

      return 'unknown'
    }
  }

  if (expression.valueType != null) {
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

  if (expression.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression.type === 'ArrayLiteral') {
    return 'array'
  }

  return 'unknown'
}

function findClassParam(params: AnyNode[], name: string): AnyNode | null {
  for (const param of params) {
    if (param.name === name) {
      return param
    }
  }

  return null
}

function isThisFieldExpression(expression: ClassMaybeNode): boolean {
  if (expression == null || expression.type !== 'MemberExpression') {
    return false
  }

  return isThisObjectExpression(expression.object)
}

function isThisObjectExpression(expression: ClassMaybeNode): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'ThisExpression') {
    return true
  }

  return expression.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this'
}

function nodeLocOrFallback(node: ClassMaybeNode, fallback: ClassMaybeNode): SourceLocation | undefined {
  if (node != null && node.loc != null) {
    return node.loc
  }

  if (fallback != null) {
    return fallback.loc
  }

  return undefined
}

export function emitClassObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CLASS',
        'this class constructor is not supported by the current C backend slice',
        nodeLocOrFallback(statement.init, statement)
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
          nodeLocOrFallback(expression, null)
        )
      )

    const lines: string[] = []
    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ccjs_undefined_value();`)

    return {
      lines,
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
  pushAllLines(lines, emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context))

  const constructorArgs = mapClassConstructorArgs(expression, info)

  for (const assignment of info.assignments) {
    const fieldIndex = findClassFieldIndex(info.fields, assignment.field)

    if (fieldIndex === -1) {
      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown class field ${assignment.field}`, nodeLocOrFallback(assignment, expression))
      )
      continue
    }

    const valueExpression = substituteClassConstructorParams(assignment.value, constructorArgs)
    const value = classDeps(context).emitCValueExpression(valueExpression, context)
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

export function registerClassObjectShape(context: CFunctionContext, name: string, info: CClassInfo): void {
  const fields: CObjectShapeField[] = []

  for (const field of info.fields) {
    fields.push({
      name: field.name,
      ownership: classFieldOwnership(field),
      readonlyField: isReadonlyCObjectShapeField(field),
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    })
  }

  context.objectShapes.set(name, fields)
}

function findClassFieldIndex(fields: CObjectShapeField[], name: string): number {
  for (let index = 0; index < fields.length; index++) {
    if (fields[index].name === name) {
      return index
    }
  }

  return -1
}

function mapClassConstructorArgs(expression: AnyNode, info: CClassInfo): CConstructorArgMap {
  const args = createConstructorArgMap()
  let params: AnyNode[] = []

  if (info.constructor != null) {
    params = info.constructor.params
  }

  for (let index = 0; index < params.length; index++) {
    const param = params[index]
    if (expression.args[index] != null) {
      args.set(param.name, expression.args[index])
    }
  }

  return args
}

function substituteClassConstructorParams(node: ClassMaybeNode, args: CConstructorArgMap): AnyNode {
  if (node == null) {
    return {
      type: 'InvalidExpression'
    }
  }

  if (node.type === 'Reference' && node.path.length === 1 && args.has(node.path[0])) {
    const replacement = args.get(node.path[0])

    if (replacement != null) {
      return replacement
    }
  }

  if (node.type === 'ArrayLiteral') {
    return substituteArrayLiteral(node, args)
  }

  if (node.type === 'ObjectLiteral') {
    return substituteObjectLiteral(node, args)
  }

  if (node.type === 'MemberExpression') {
    return {
      type: node.type,
      object: substituteClassConstructorParams(node.object, args),
      property: node.property,
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'IndexExpression') {
    return {
      type: node.type,
      object: substituteClassConstructorParams(node.object, args),
      index: substituteClassConstructorParams(node.index, args),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    return substituteCallLikeExpression(node, args)
  }

  if (node.type === 'BinaryExpression') {
    return {
      type: node.type,
      operator: node.operator,
      left: substituteClassConstructorParams(node.left, args),
      right: substituteClassConstructorParams(node.right, args),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'UnaryExpression') {
    return {
      type: node.type,
      operator: node.operator,
      argument: substituteClassConstructorParams(node.argument, args),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'TypeAssertionExpression') {
    return {
      type: node.type,
      expression: substituteClassConstructorParams(node.expression, args),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  return node
}

function substituteArrayLiteral(node: AnyNode, args: CConstructorArgMap): AnyNode {
  const elements: AnyNode[] = []

  for (const element of node.elements) {
    elements.push(substituteClassConstructorParams(element, args))
  }

  return {
    type: node.type,
    elements,
    valueType: node.valueType,
    loc: node.loc
  }
}

function substituteObjectLiteral(node: AnyNode, args: CConstructorArgMap): AnyNode {
  const properties: AnyNode[] = []

  for (const property of node.properties) {
    properties.push({
      key: property.key,
      value: substituteClassConstructorParams(property.value, args),
      loc: property.loc
    })
  }

  return {
    type: node.type,
    properties,
    valueType: node.valueType,
    shape: node.shape,
    loc: node.loc
  }
}

function substituteCallLikeExpression(node: AnyNode, args: CConstructorArgMap): AnyNode {
  const callArgs: AnyNode[] = []

  for (const arg of node.args) {
    callArgs.push(substituteClassConstructorParams(arg, args))
  }

  return {
    type: node.type,
    callee: substituteClassConstructorParams(node.callee, args),
    args: callArgs,
    valueType: node.valueType,
    loc: node.loc
  }
}

function resolveClassConstructorInfo(expression: ClassMaybeNode, context: CFunctionContext): CClassInfo | null {
  if (expression == null || expression.type !== 'NewExpression') {
    return null
  }

  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const info = context.classInfos.get(expression.callee.path[0])

  if (info != null) {
    return info
  }

  return null
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
        nodeLocOrFallback(expression.callee, expression)
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
  const callExpression = emitClassMethodCallExpression(call, call.method, prepared)

  if (isManagedRuntimeReturnType(call.method.returnType)) {
    const value = nextCName(context, 'ccjs_method_value')
    const tag = cRuntimeValueTag(call.method.returnType)
    registerOwnedValue(context, value)
    const lines: string[] = []
    pushAllLines(lines, prepared.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))
    lines.push(`${value} = ${callExpression};`)
    lines.push(emitRuntimeValueCheck(value, tag, context))

    return {
      lines,
      expression: value
    }
  }

  let expressionText = callExpression

  if (call.method.returnType === 'void') {
    expressionText = `${callExpression}`
  }

  return {
    lines: prepared.lines,
    expression: expressionText
  }
}

function emitClassMethodCallExpression(call: ClassMethodCallInfo, method: AnyNode, prepared: PreparedCallArgs): string {
  const args: string[] = [call.objectExpression]

  for (const arg of prepared.args) {
    args.push(arg)
  }

  return `${emitCClassMethodName(call.info.name, method.name)}(${args.join(', ')})`
}

function resolveClassMethodCallInfo(expression: ClassMaybeNode, context: CFunctionContext): ClassMethodCallInfo | null {
  if (expression == null || expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
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
    method: resolveClassMethod(info, expression.callee.property),
    objectExpression: emitObjectValueReference(objectName, context)
  }
}

function resolveClassMethod(info: CClassInfo, name: string): AnyNode | null {
  const method = info.methods.get(name)

  if (method != null) {
    return method
  }

  return null
}

export function emitCClassMethodName(className: string, methodName: string): string {
  return `ccjs_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}
