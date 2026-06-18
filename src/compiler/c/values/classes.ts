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
  emitCFieldFlags(field: CObjectShapeField): string
  emitCValueExpression(expression: AnyNode, context: ClassFunctionContext): PreparedExpression
  emitPreparedCallArgs(expression: AnyNode, params: CFunctionParam[], context: ClassFunctionContext): PreparedCallArgs
}

type ClassMethodCallInfo = {
  info: CClassInfo
  methodName: string
  objectExpression: string
  objectLines: string[]
}

type CClassInfoMap = Map<string, CClassInfo>
type CClassMethodMap = Map<string, AnyNode>
type CConstructorArgMap = Map<string, AnyNode>
type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type CStringMap = Map<string, string>
type CStringSet = Set<string>
type ClassExpressionNode = AnyNode
type ClassMaybeNode = AnyNode | null | undefined

type ClassEmitContext = {
  classInfos: CClassInfoMap
}

type ClassFunctionContext = {
  boxedVariables: CStringSet
  classInfos?: CClassInfoMap
  classInstanceTypes?: CStringMap
  classLoweringDependencies?: ClassLoweringDependencies
  cleanupEnabled: boolean
  diagnostics: Diagnostic[]
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  objectShapes: CObjectShapeFieldMap
  ownedValues: string[]
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: CStringMap
}

function emitFallbackClassFieldFlags(_field: CObjectShapeField): string {
  return '0'
}

function emitFallbackClassValueExpression(
  _expression: ClassExpressionNode,
  _context: ClassFunctionContext
): PreparedExpression {
  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitFallbackPreparedClassCallArgs(
  _expression: ClassExpressionNode,
  _params: CFunctionParam[],
  _context: ClassFunctionContext
): PreparedCallArgs {
  return {
    lines: [],
    args: []
  }
}

function emitClassFieldFlags(context: ClassFunctionContext, field: CObjectShapeField): string {
  const deps = context.classLoweringDependencies

  if (deps != null) {
    return deps.emitCFieldFlags(field)
  }

  context.diagnostics.push(diagnostic('CCJS_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackClassFieldFlags(field)
}

function emitClassValueExpression(
  context: ClassFunctionContext,
  expression: ClassExpressionNode
): PreparedExpression {
  const deps = context.classLoweringDependencies

  if (deps != null) {
    return deps.emitCValueExpression(expression, context)
  }

  context.diagnostics.push(diagnostic('CCJS_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackClassValueExpression(expression, context)
}

function emitPreparedClassCallArgs(
  context: ClassFunctionContext,
  expression: ClassExpressionNode,
  params: CFunctionParam[]
): PreparedCallArgs {
  const deps = context.classLoweringDependencies

  if (deps != null) {
    return deps.emitPreparedCallArgs(expression, params, context)
  }

  context.diagnostics.push(diagnostic('CCJS_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackPreparedClassCallArgs(expression, params, context)
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

function classFieldOwnership(field: CObjectShapeField): string {
  const ownership = field.ownership

  if (ownership != null) {
    return ownership
  }

  return 'strong'
}

export function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]): CClassInfoMap {
  const infos = createClassInfoMap()
  const classNodes: ClassExpressionNode[] = classes

  for (const item of classNodes) {
    const constructorMethod = findClassConstructorMethod(item)
    const assignments = collectClassConstructorAssignments(item, constructorMethod, diagnostics)
    const fields = resolveClassFields(item, constructorMethod, assignments)
    const methods = createClassMethodMap()
    const methodNodes: ClassExpressionNode[] = item.methods

    for (const method of methodNodes) {
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
  const methods: ClassExpressionNode[] = classNode.methods

  for (const method of methods) {
    if (method.name === 'constructor') {
      return method
    }
  }

  return null
}

export function collectClassMethods(context: ClassEmitContext): CClassMethod[] {
  const methods: CClassMethod[] = []
  const classInfos = context.classInfos

  for (const info of classInfos.values()) {
    const methodList: ClassExpressionNode[] = info.node.methods

    for (const method of methodList) {
      if (method.name === 'constructor') {
        continue
      }

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
): AnyNode[] {
  const assignments: AnyNode[] = []

  if (constructorMethod != null) {
    const statements: ClassExpressionNode[] = constructorMethod.body

    for (const statement of statements) {
      let assignment: AnyNode | null = null

      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
        assignment = statement.expression
      }

      if (assignment != null) {
        const field = thisFieldName(assignment.target)

        if (field != null) {
          assignments.push(createClassConstructorAssignment(field, assignment))
          continue
        }
      }

      diagnostics.push(
        diagnostic(
          'CCJS_C_CLASS',
          `class ${classNode.name} constructor currently supports only this.field assignments in the C backend`,
          nodeLocOrFallback(statement, constructorMethod)
        )
      )
    }
  }

  return assignments
}

function createClassConstructorAssignment(field: string, assignment: AnyNode): AnyNode {
  return {
    field,
    value: assignment.value,
    loc: assignment.loc
  }
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
  const valueType = field.valueType
  const fieldOwnership = field.ownership

  if (fieldOwnership != null) {
    ownership = fieldOwnership
  }

  return {
    name: field.name,
    readonlyField: isReadonlyCObjectShapeField(field),
    ownership,
    valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
    functionType: field.functionType
  }
}

function inferClassConstructorFieldType(expression: ClassMaybeNode, constructorMethod: AnyNode | null): string {
  if (expression == null) {
    return 'unknown'
  }

  if (expression.type === 'Reference' && expression.path.length === 1 && constructorMethod != null) {
    const paramName = expression.path[0]
    const param = findClassParam(constructorMethod.params, paramName)

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
  const source: ClassExpressionNode[] = params

  for (const param of source) {
    if (param.name === name) {
      return param
    }
  }

  return null
}

function isThisFieldExpression(expression: ClassMaybeNode): boolean {
  return thisFieldName(expression) != null
}

function thisFieldName(expression: ClassMaybeNode): string | null {
  if (expression == null || expression.type !== 'MemberExpression') {
    return null
  }

  if (isThisObjectExpression(expression.object)) {
    return expression.property
  }

  return null
}

function isThisObjectExpression(expression: ClassMaybeNode): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'ThisExpression') {
    return true
  }

  return (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === 'this'
  )
}

function nodeLocOrFallback(node: ClassMaybeNode, fallback: ClassMaybeNode): SourceLocation | null {
  if (node != null && node.loc != null) {
    return node.loc
  }

  if (fallback != null) {
    return fallback.loc
  }

  return null
}

export function emitClassObjectVariableDeclaration(statement: AnyNode, context: ClassFunctionContext): string[] {
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info != null) {
    return emitSupportedClassObjectVariableDeclaration(statement, info, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_CLASS',
      'this class constructor is not supported by the current C backend slice',
      nodeLocOrFallback(statement.init, statement)
    )
  )

  return [`ccjs_value ${statement.name} = ccjs_undefined_value();`]
}

function emitSupportedClassObjectVariableDeclaration(
  statement: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerClassInstanceType(context, statement.name, info.name)
  registerClassObjectShape(context, statement.name, info)

  return emitCClassObjectInitLines(statement.name, statement.init, info, context)
}

function registerClassInstanceType(context: ClassFunctionContext, name: string, className: string): void {
  const classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes != null) {
    classInstanceTypes.set(name, className)
  }
}

export function emitCClassObjectValueExpression(expression: AnyNode, context: ClassFunctionContext): PreparedExpression {
  const info = resolveClassConstructorInfo(expression, context)
  const temp = nextCName(context, 'ccjs_class_object')
  registerOwnedValue(context, temp)

  if (info != null) {
    return {
      lines: emitCClassObjectInitLines(temp, expression, info, context),
      expression: temp
    }
  }

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

function emitCClassObjectInitLines(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const shapeName = nextCName(context, `ccjs_shape_${info.name}`)
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of info.fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitClassFieldFlags(context, field)} },`)
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
    const value = emitClassValueExpression(context, valueExpression)
    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

export function registerClassObjectShape(context: ClassFunctionContext, name: string, info: CClassInfo): void {
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
      setElementType: field.setElementType,
      shape: field.shape,
      functionType: field.functionType
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
  const params = classConstructorParams(info)

  for (let index = 0; index < params.length; index++) {
    const param = params[index]
    if (expression.args[index] != null) {
      args.set(param.name, expression.args[index])
    }
  }

  return args
}

function classConstructorParams(info: CClassInfo): AnyNode[] {
  const constructorMethod = info.constructor

  if (constructorMethod != null) {
    return constructorMethod.params
  }

  return []
}

function substituteClassConstructorParams(node: ClassMaybeNode, args: CConstructorArgMap): AnyNode {
  if (node == null) {
    return {
      type: 'InvalidExpression'
    }
  }

  if (node.type === 'Reference' && node.path.length === 1 && args.has(node.path[0])) {
    const name = node.path[0]
    const replacement = args.get(name)

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
  const sourceElements: ClassExpressionNode[] = node.elements

  for (const element of sourceElements) {
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
  const sourceProperties: ClassExpressionNode[] = node.properties

  for (const property of sourceProperties) {
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
  const sourceArgs: ClassExpressionNode[] = node.args

  for (const arg of sourceArgs) {
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

function resolveClassConstructorInfo(expression: ClassMaybeNode, context: ClassFunctionContext): CClassInfo | null {
  if (expression == null || expression.type !== 'NewExpression') {
    return null
  }

  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const classInfos = context.classInfos

  if (classInfos == null) {
    return null
  }

  const className = expression.callee.path[0]
  const info = classInfos.get(className)

  if (info != null) {
    return info
  }

  return null
}

export function isClassConstructorExpression(expression: AnyNode, context: ClassFunctionContext): boolean {
  return resolveClassConstructorInfo(expression, context) != null
}

export function emitPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext
): PreparedExpression | null {
  const call = resolveClassMethodCallInfo(expression, context)

  if (call != null) {
    return emitPreparedResolvedClassMethodCallExpression(expression, context, call)
  }

  return null
}

function emitPreparedResolvedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext,
  call: ClassMethodCallInfo
): PreparedExpression {
  const method = resolveClassMethod(call.info, call.methodName)

  if (method != null) {
    return emitKnownPreparedClassMethodCallExpression(expression, context, call, method)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_UNKNOWN_FIELD',
      `unknown method ${call.methodName}`,
      nodeLocOrFallback(expression.callee, expression)
    )
  )

  return {
    lines: [],
    expression: ''
  }
}

function emitKnownPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext,
  call: ClassMethodCallInfo,
  method: AnyNode
): PreparedExpression {
  if (method.params.length !== expression.args.length) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `method ${expression.callee.property} expects ${method.params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  const prepared = emitPreparedClassCallArgs(context, expression, method.params)
  const callExpression = emitClassMethodCallExpression(call, method, prepared)
  const callLines: string[] = []

  pushAllLines(callLines, call.objectLines)
  pushAllLines(callLines, prepared.lines)

  if (isManagedRuntimeReturnType(method.returnType)) {
    const value = nextCName(context, 'ccjs_method_value')
    const tag = cRuntimeValueTag(method.returnType)
    registerOwnedValue(context, value)
    const lines: string[] = []
    pushAllLines(lines, callLines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))
    lines.push(`${value} = ${callExpression};`)
    lines.push(emitRuntimeValueCheck(value, tag, context))

    return {
      lines,
      expression: value
    }
  }

  let expressionText = callExpression

  if (method.returnType === 'void') {
    expressionText = `${callExpression}`
  }

  return {
    lines: callLines,
    expression: expressionText
  }
}

function emitClassMethodCallExpression(call: ClassMethodCallInfo, method: AnyNode, prepared: PreparedCallArgs): string {
  const args: string[] = [call.objectExpression]

  for (const arg of prepared.args) {
    args.push(arg)
  }

  return `${emitCClassMethodName(call.info.name, method.name)}(${joinStrings(args, ', ')})`
}

function resolveClassMethodCallInfo(expression: ClassMaybeNode, context: ClassFunctionContext): ClassMethodCallInfo | null {
  if (expression == null || expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.callee.object)

  if (objectName) {
    const className = classNameForObject(context, objectName)

    if (className != null) {
      const info = classInfoForName(context, className)

      if (info != null) {
        return {
          info,
          methodName: expression.callee.property,
          objectExpression: emitObjectValueReference(objectName, context),
          objectLines: []
        }
      }
    }
  }

  const receiverClassName = expression.callee.object.className

  if (receiverClassName != null) {
    const info = classInfoForName(context, receiverClassName)

    if (info != null) {
      const object = emitClassValueExpression(context, expression.callee.object)

      return {
        info,
        methodName: expression.callee.property,
        objectExpression: object.expression,
        objectLines: object.lines
      }
    }
  }

  return null
}

function classNameForObject(context: ClassFunctionContext, objectName: string): string | null {
  const classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes == null) {
    return null
  }

  const className = classInstanceTypes.get(objectName)

  if (className != null) {
    return className
  }

  return null
}

function classInfoForName(context: ClassFunctionContext, className: string): CClassInfo | null {
  const classInfos = context.classInfos

  if (classInfos == null) {
    return null
  }

  const info = classInfos.get(className)

  if (info != null) {
    return info
  }

  return null
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
