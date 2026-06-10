import { collectIrFeatureRequirements, collectIrGlobalRoots, collectIrPrograms, collectIrTopLevelNodeEntries, findIrEntryProgram, hasIrFunctionDeclaration } from './ir.ts'
import type { IrModuleRecord } from './ir.ts'
import type { AnyNode, IrProgram } from './types.ts'

type JsEmitOptions = {
  callMain?: boolean
  emitTypes?: boolean
  stripExports?: boolean
}

export function emitJsFromIr(ir: IrProgram, options: JsEmitOptions = {}): string {
  const lines: string[] = emitJsPrelude([ir], options)

  if (lines.length > 0) {
    lines.push('')
  }

  lines.push(...emitProgramBody(ir, options))

  if (hasIrFunctionDeclaration(ir, 'main') && options.callMain !== false) {
    lines.push('')
    lines.push('const ccjsMainResult = main()')
    lines.push('if (ccjsMainResult && typeof ccjsMainResult.then === \'function\') {')
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

export function emitTsFromIr(ir: IrProgram, options: JsEmitOptions = {}): string {
  return emitJsFromIr(ir, {
    ...options,
    emitTypes: true
  })
}

export function emitJsBundleFromIrModules(irModules: IrModuleRecord[], entry: string, options: JsEmitOptions = {}): string {
  const irPrograms = collectIrPrograms(irModules)
  const entryIr = findIrEntryProgram(irModules, entry)
  const lines: string[] = emitJsPrelude(irPrograms, options)

  if (lines.length > 0) {
    lines.push('')
  }

  for (const module of irModules) {
    lines.push(`// ${module.path}`)
    lines.push(...emitProgramBody(module.ir, {
      ...options,
      stripExports: true
    }))
    lines.push('')
  }

  if (hasIrFunctionDeclaration(entryIr, 'main') && options.callMain !== false) {
    lines.push('const ccjsMainResult = main()')
    lines.push('if (ccjsMainResult && typeof ccjsMainResult.then === \'function\') {')
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

export function emitTsBundleFromIrModules(irModules: IrModuleRecord[], entry: string, options: JsEmitOptions = {}): string {
  return emitJsBundleFromIrModules(irModules, entry, {
    ...options,
    emitTypes: true
  })
}

function emitProgramBody(ir: IrProgram, options: JsEmitOptions = {}): string[] {
  const lines: string[] = []

  for (const entry of collectIrTopLevelNodeEntries(ir)) {
    if (entry.kind === 'import') {
      continue
    }

    if (entry.kind === 'type') {
      lines.push(...emitTypeAlias(entry.node, options))
    } else if (entry.kind === 'function') {
      lines.push(...emitFunction(entry.node, options))
    } else if (entry.kind === 'class') {
      lines.push(...emitClass(entry.node, options))
    } else {
      lines.push(...emitStatement(entry.node, options))
    }
  }

  return lines
}

function emitJsPrelude(programs: IrProgram[], options: JsEmitOptions = {}): string[] {
  const lines: string[] = []
  const helperLines: string[] = []
  const globalRoots = new Set(collectIrGlobalRoots(programs))
  const features = new Set(collectIrFeatureRequirements(programs))

  if (globalRoots.has('fs')) {
    lines.push('import * as fs from \'node:fs/promises\'')
  }

  if (globalRoots.has('http')) {
    lines.push('import * as http from \'node:http\'')
  }

  if (features.has('array-pop-null')) {
    helperLines.push(...emitArrayPopHelper(options))
  }

  if (features.has('map-get-null')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitMapGetHelper(options))
  }

  if (features.has('map-index-set')) {
    if (helperLines.length > 0) {
      helperLines.push('')
    }

    helperLines.push(...emitMapSetHelper(options))
  }

  if (helperLines.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(...helperLines)
  }

  return lines
}

function emitArrayPopHelper(options: JsEmitOptions): string[] {
  return options.emitTypes === true
    ? [
        'function ccjsArrayPop<T>(array: T[]): T | null {',
        '  return array.length === 0 ? null : array.pop()!',
        '}'
      ]
    : [
        'function ccjsArrayPop(array) {',
        '  return array.length === 0 ? null : array.pop()',
        '}'
      ]
}

function emitMapGetHelper(options: JsEmitOptions): string[] {
  return options.emitTypes === true
    ? [
        'function ccjsMapGet<K, V>(map: Map<K, V>, key: K): V | null {',
        '  return map.has(key) ? map.get(key)! : null',
        '}'
      ]
    : [
        'function ccjsMapGet(map, key) {',
        '  return map.has(key) ? map.get(key) : null',
        '}'
      ]
}

function emitMapSetHelper(options: JsEmitOptions): string[] {
  return options.emitTypes === true
    ? [
        'function ccjsMapSet<K, V>(map: Map<K, V>, key: K, value: V): V {',
        '  map.set(key, value)',
        '  return value',
        '}'
      ]
    : [
        'function ccjsMapSet(map, key, value) {',
        '  map.set(key, value)',
        '  return value',
        '}'
      ]
}

function emitFunction(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const head = `${exported ? 'export ' : ''}${node.async ? 'async ' : ''}function ${node.name}(${emitFunctionParams(node.params, options)})${emitReturnTypeAnnotation(node, options)} {`
  const body = node.body.flatMap(statement => indent(emitStatement(statement, options)))

  return [
    head,
    ...body,
    '}'
  ]
}

function emitClass(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const lines = [
    `${exported ? 'export ' : ''}class ${node.name} {`
  ]

  for (const method of node.methods) {
    lines.push(...indent(emitMethod(method, options)))
  }

  lines.push('}')

  return lines
}

function emitMethod(method: AnyNode, options: JsEmitOptions = {}): string[] {
  const returnType = method.name === 'constructor' ? '' : emitReturnTypeAnnotation(method, options)
  const head = `${method.name}(${emitFunctionParams(method.params, options)})${returnType} {`
  const body = method.body.flatMap(statement => indent(emitStatement(statement, options)))

  return [
    head,
    ...body,
    '}'
  ]
}

function emitFunctionParams(params: AnyNode[], options: JsEmitOptions = {}): string {
  return params.map(param => options.emitTypes === true
    ? `${param.name}: ${emitTsValueType(param.declaredType ?? param.valueType, param)}`
    : param.name).join(', ')
}

function emitReturnTypeAnnotation(node: AnyNode, options: JsEmitOptions = {}): string {
  return options.emitTypes === true ? `: ${emitTsValueType(node.declaredReturnType ?? node.returnType, {
    arrayElementType: node.returnArrayElementType,
    mapKeyType: node.returnMapKeyType,
    mapValueType: node.returnMapValueType,
    promiseValueType: node.returnPromiseValueType,
    nullable: node.returnNullable,
    setElementType: node.returnSetElementType
  })}` : ''
}

function emitTsValueType(valueType: string | null | undefined, metadata: AnyNode = {}): string {
  const baseType = emitTsBaseType(valueType, metadata)

  return metadata.nullable === true && baseType !== 'null' && !baseType.endsWith(' | null')
    ? `${baseType} | null`
    : baseType
}

function emitTsBaseType(valueType: string | null | undefined, metadata: AnyNode): string {
  const nullableType = genericTypeArgs(valueType, 'nullable')

  if (nullableType.length === 1) {
    return `${emitTsValueType(nullableType[0])} | null`
  }

  if (valueType === 'array') {
    return emitTsArrayType(metadata.arrayElementType ?? 'unknown')
  }

  const arrayType = genericTypeArgs(valueType, 'array')

  if (arrayType.length === 1) {
    return emitTsArrayType(arrayType[0])
  }

  if (valueType === 'map') {
    return `Map<${emitTsValueType(metadata.mapKeyType ?? 'unknown')}, ${emitTsValueType(metadata.mapValueType ?? 'unknown')}>`
  }

  const mapType = genericTypeArgs(valueType, 'map')

  if (mapType.length === 2) {
    return `Map<${emitTsValueType(mapType[0])}, ${emitTsValueType(mapType[1])}>`
  }

  if (valueType === 'set') {
    return `Set<${emitTsValueType(metadata.setElementType ?? 'unknown')}>`
  }

  const setType = genericTypeArgs(valueType, 'set')

  if (setType.length === 1) {
    return `Set<${emitTsValueType(setType[0])}>`
  }

  if (valueType === 'promise') {
    return `Promise<${emitTsValueType(metadata.promiseValueType ?? 'unknown')}>`
  }

  const promiseType = genericTypeArgs(valueType, 'promise')

  if (promiseType.length === 1) {
    return `Promise<${emitTsValueType(promiseType[0])}>`
  }

  if (valueType === 'function') {
    return 'Function'
  }

  if (valueType === 'object') {
    return 'object'
  }

  if (valueType === 'bytes') {
    return 'Buffer'
  }

  return valueType ?? 'unknown'
}

function emitTsArrayType(elementType: string): string {
  const type = emitTsValueType(elementType)

  return type.includes(' | ') ? `(${type})[]` : `${type}[]`
}

function genericTypeArgs(valueType: string | null | undefined, name: string): string[] {
  const match = new RegExp(`^${name}<(.+)>$`).exec(valueType ?? '')

  return match == null ? [] : splitGenericArgs(match[1])
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

function emitVariableTypeAnnotation(statement: AnyNode, options: JsEmitOptions = {}): string {
  if (options.emitTypes !== true) {
    return ''
  }

  const type = emitTsValueType(statement.declaredType ?? statement.valueType, statement)

  return type === 'unknown' ? '' : `: ${type}`
}

function emitTypeAlias(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (options.emitTypes !== true || shouldSkipSyntheticTypeAlias(statement)) {
    return []
  }

  const exported = statement.exported && !options.stripExports
  const prefix = `${exported ? 'export ' : ''}type ${statement.name} = `
  const valueType = statement.valueType

  if (valueType?.kind === 'object') {
    return [
      `${prefix}{`,
      ...valueType.fields.map(field => `  ${field.readonly ? 'readonly ' : ''}${field.name}: ${emitTsValueType(field.valueType, field)},`),
      '}'
    ]
  }

  if (valueType?.kind === 'function') {
    const params = valueType.params
      .map(param => `${param.name}: ${emitTsValueType(param.valueType, param)}`)
      .join(', ')
    const returnType = emitTsValueType(valueType.returnType, {
      ...valueType,
      arrayElementType: valueType.returnArrayElementType,
      mapKeyType: valueType.returnMapKeyType,
      mapValueType: valueType.returnMapValueType,
      nullable: valueType.returnNullable,
      promiseValueType: valueType.returnPromiseValueType,
      setElementType: valueType.returnSetElementType
    })

    return [`${prefix}(${params}) => ${returnType}`]
  }

  return [`${prefix}unknown`]
}

function shouldSkipSyntheticTypeAlias(statement: AnyNode): boolean {
  return statement.syntheticTypeImport === true && statement.importedName === statement.name
}

function emitStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body.flatMap(item => indent(emitStatement(item, options))),
      '}'
    ]
  }

  if (statement.type === 'IfStatement') {
    return emitIfStatement(statement, options)
  }

  if (statement.type === 'WhileStatement') {
    return emitWhileStatement(statement, options)
  }

  if (statement.type === 'ForStatement') {
    return emitForStatement(statement, options)
  }

  if (statement.type === 'ForOfStatement') {
    return emitForOfStatement(statement, options)
  }

  if (statement.type === 'SwitchStatement') {
    return emitSwitchStatement(statement, options)
  }

  if (statement.type === 'TryStatement') {
    return emitTryStatement(statement, options)
  }

  if (statement.type === 'BreakStatement') {
    return ['break']
  }

  if (statement.type === 'ContinueStatement') {
    return ['continue']
  }

  if (statement.type === 'VariableDeclaration') {
    const init = statement.init == null ? '' : ` = ${emitExpression(statement.init, options)}`
    const exported = statement.exported && !options.stripExports
    return [`${exported ? 'export ' : ''}${statement.kind} ${statement.name}${emitVariableTypeAnnotation(statement, options)}${init}`]
  }

  if (statement.type === 'ExpressionStatement') {
    return [`${emitExpression(statement.expression, options)}`]
  }

  if (statement.type === 'ReturnStatement') {
    return [statement.argument == null ? 'return' : `return ${emitExpression(statement.argument, options)}`]
  }

  if (statement.type === 'ThrowStatement') {
    return [`throw ${emitExpression(statement.argument, options)}`]
  }

  return []
}

function emitIfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    `if (${emitExpression(statement.condition, options)}) {`,
    ...indent(emitStatementBody(statement.consequent, options))
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(...indent(emitStatementBody(statement.alternate, options)))
  lines.push('}')

  return lines
}

function emitWhileStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `while (${emitExpression(statement.condition, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `for (${emitForInitializer(statement.init, options)}; ${statement.test == null ? '' : emitExpression(statement.test, options)}; ${statement.update == null ? '' : emitExpression(statement.update, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForOfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (isMapForOfStatement(statement)) {
    const entry = `ccjsMapEntry_${statement.name}`

    return [
      `for (const ${entry} of ${emitExpression(statement.iterable, options)}) {`,
      ...indent([
        `${statement.kind} ${statement.name} = { key: ${entry}[0], value: ${entry}[1] }`,
        ...emitStatementBody(statement.body, options)
      ]),
      '}'
    ]
  }

  return [
    `for (${statement.kind} ${statement.name} of ${emitExpression(statement.iterable, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function isMapForOfStatement(statement: AnyNode): boolean {
  return statement.type === 'ForOfStatement' && statement.iterable?.valueType === 'map'
}

function emitSwitchStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    `switch (${emitExpression(statement.discriminant, options)}) {`
  ]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default:' : `  case ${emitExpression(item.test, options)}:`)
    lines.push(...item.consequent.flatMap(statement => indent(indent(emitStatement(statement, options)))))
  }

  lines.push('}')

  return lines
}

function emitTryStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    'try {',
    ...indent(emitStatementBody(statement.block, options))
  ]

  if (statement.handler != null) {
    lines.push(statement.handler.param == null ? '} catch {' : `} catch (${statement.handler.param}) {`)
    lines.push(...indent(emitStatementBody(statement.handler.body, options)))
  }

  if (statement.finalizer != null) {
    lines.push('} finally {')
    lines.push(...indent(emitStatementBody(statement.finalizer, options)))
  }

  lines.push('}')

  return lines
}

function emitStatementBody(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (statement.type === 'BlockStatement') {
    return statement.body.flatMap(item => emitStatement(item, options))
  }

  return emitStatement(statement, options)
}

function emitForInitializer(init: AnyNode | null, options: JsEmitOptions = {}): string {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    const value = init.init == null ? '' : ` = ${emitExpression(init.init, options)}`
    return `${init.kind} ${init.name}${emitVariableTypeAnnotation(init, options)}${value}`
  }

  return emitExpression(init, options)
}

function emitExpression(expression: AnyNode, options: JsEmitOptions = {}): string {
  if (expression.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression.type === 'TemplateLiteral') {
    return expression.raw
  }

  if (expression.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression.type === 'NullLiteral') {
    return 'null'
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'Reference') {
    return expression.path.join('.')
  }

  if (expression.type === 'MemberExpression') {
    return `${emitExpression(expression.object, options)}.${expression.property}`
  }

  if (expression.type === 'IndexExpression') {
    if (isMapIndexGet(expression)) {
      return `ccjsMapGet(${emitExpression(expression.object, options)}, ${emitExpression(expression.index, options)})`
    }

    return `${emitExpression(expression.object, options)}[${emitExpression(expression.index, options)}]`
  }

  if (expression.type === 'OptionalMemberExpression') {
    return `${emitExpression(expression.object, options)}?.${expression.property}`
  }

  if (expression.type === 'OptionalIndexExpression') {
    return `${emitExpression(expression.object, options)}?.[${emitExpression(expression.index, options)}]`
  }

  if (expression.type === 'OptionalCallExpression') {
    return `${emitExpression(expression.callee, options)}?.(${expression.args.map(arg => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'CallExpression') {
    const fsBytesCall = emitFsBytesCallExpression(expression, options)

    if (fsBytesCall != null) {
      return fsBytesCall
    }

    if (isArrayPopCall(expression)) {
      return `ccjsArrayPop(${emitExpression(expression.callee.object, options)})`
    }

    if (isMapGetCall(expression)) {
      return `ccjsMapGet(${emitExpression(expression.callee.object, options)}, ${emitExpression(expression.args[0], options)})`
    }

    return `${emitExpression(expression.callee, options)}(${expression.args.map(arg => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'NewExpression') {
    return `new ${emitExpression(expression.callee, options)}(${expression.args.map(arg => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'AwaitExpression') {
    return `await ${emitExpression(expression.argument, options)}`
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const params = emitArrowFunctionParams(expression, options)
    const returnType = emitArrowReturnTypeAnnotation(expression, options)

    if (expression.expressionBody) {
      return `${params}${returnType} => ${emitExpression(expression.body, options)}`
    }

    return `${params}${returnType} => {\n${indent(expression.body.flatMap(statement => emitStatement(statement, options))).join('\n')}\n}`
  }

  if (expression.type === 'AssignmentExpression') {
    if (isMapIndexSet(expression)) {
      return `ccjsMapSet(${emitExpression(expression.target.object, options)}, ${emitExpression(expression.target.index, options)}, ${emitExpression(expression.value, options)})`
    }

    return `${emitExpression(expression.target, options)} = ${emitExpression(expression.value, options)}`
  }

  if (expression.type === 'BinaryExpression') {
    return `(${emitExpression(expression.left, options)} ${emitJsOperator(expression.operator)} ${emitExpression(expression.right, options)})`
  }

  if (expression.type === 'UnaryExpression') {
    return `(${expression.operator}${emitExpression(expression.argument, options)})`
  }

  if (expression.type === 'ArrayLiteral') {
    return `[${expression.elements.map(element => emitExpression(element, options)).join(', ')}]`
  }

  if (expression.type === 'ObjectLiteral') {
    return `{ ${expression.properties.map(property => emitObjectProperty(property, options)).join(', ')} }`
  }

  return 'undefined'
}

function emitArrowFunctionParams(expression: AnyNode, options: JsEmitOptions = {}): string {
  if (options.emitTypes !== true) {
    return expression.params.length === 1
      ? expression.params[0].name
      : `(${expression.params.map(param => param.name).join(', ')})`
  }

  return `(${expression.params.map(param => {
    const type = emitTsValueType(param.declaredType ?? param.valueType, param)

    return type === 'unknown' ? param.name : `${param.name}: ${type}`
  }).join(', ')})`
}

function emitArrowReturnTypeAnnotation(expression: AnyNode, options: JsEmitOptions = {}): string {
  if (options.emitTypes !== true) {
    return ''
  }

  const type = emitTsValueType(expression.declaredReturnType ?? expression.returnType, {
    arrayElementType: expression.returnArrayElementType,
    mapKeyType: expression.returnMapKeyType,
    mapValueType: expression.returnMapValueType,
    promiseValueType: expression.returnPromiseValueType,
    nullable: expression.returnNullable,
    setElementType: expression.returnSetElementType
  })

  return type === 'unknown' ? '' : `: ${type}`
}

function emitJsOperator(operator: string): string {
  if (operator === '==') {
    return '==='
  }

  if (operator === '!=') {
    return '!=='
  }

  return operator
}

function emitObjectProperty(property: AnyNode, options: JsEmitOptions = {}): string {
  return `${emitObjectKey(property.key)}: ${emitExpression(property.value, options)}`
}

function emitObjectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function isArrayPopCall(expression: AnyNode): boolean {
  return expression.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && expression.callee.property === 'pop'
    && expression.args.length === 0
}

function isMapGetCall(expression: AnyNode): boolean {
  return expression.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && expression.callee.property === 'get'
    && expression.nullable === true
    && expression.args.length === 1
}

function emitFsBytesCallExpression(expression: AnyNode, options: JsEmitOptions): string | null {
  if (expression.fsRuntimeMethod === 'readFileBytes') {
    return `fs.readFile(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'writeFileBytes') {
    return `fs.writeFile(${emitExpression(expression.args[0], options)}, ${emitExpression(expression.args[1], options)})`
  }

  return null
}

function isMapIndexGet(expression: AnyNode): boolean {
  return expression.type === 'IndexExpression'
    && expression.collectionKind === 'map'
    && expression.nullable === true
}

function isMapIndexSet(expression: AnyNode): boolean {
  return expression.type === 'AssignmentExpression'
    && expression.target?.type === 'IndexExpression'
    && expression.target.collectionKind === 'map'
}

function indent(lines: string[]): string[] {
  return lines.map(line => `  ${line}`)
}
