import type { AnyNode, ProgramNode } from './types.ts'

type LowerContext = {
  types: Map<string, AnyNode>
}

type LowerResolvedType = {
  valueType: string | null
  nullable: boolean
  arrayElementType: string | null
  mapKeyType: string | null
  mapValueType: string | null
  setElementType: string | null
  shape: AnyNode | null
  functionType: AnyNode | null
}

export function lowerProgram(ast: ProgramNode): ProgramNode {
  const context = {
    types: collectTypes(ast)
  }

  return {
    type: 'HirProgram',
    body: ast.body.map(item => lowerTopLevelItem(item, context))
  }
}

function lowerTopLevelItem(item: AnyNode, context: LowerContext): AnyNode {
  if (item.type === 'ImportDeclaration') {
    return {
      type: 'ImportDeclaration',
      typeOnly: item.typeOnly,
      specifiers: item.specifiers,
      source: item.source,
      loc: item.loc
    }
  }

  if (item.type === 'FunctionDeclaration') {
    const returnType = resolveDeclaredType(item.returnType, context)

    return {
      type: 'FunctionDeclaration',
      exported: item.exported,
      async: item.async,
      name: item.name,
      loc: item.loc,
      params: item.params.map(param => lowerParam(param, context)),
      returnType: returnType.valueType ?? item.returnType,
      returnNullable: returnType.nullable,
      returnArrayElementType: returnType.arrayElementType,
      returnMapKeyType: returnType.mapKeyType,
      returnMapValueType: returnType.mapValueType,
      returnSetElementType: returnType.setElementType,
      body: item.body.map(statement => lowerStatement(statement, context))
    }
  }

  if (item.type === 'ClassDeclaration') {
    return {
      type: 'ClassDeclaration',
      exported: item.exported,
      name: item.name,
      loc: item.loc,
      methods: item.methods.map(method => {
        const returnType = resolveDeclaredType(method.returnType, context)

        return {
          type: 'MethodDefinition',
          name: method.name,
          loc: method.loc,
          params: method.params.map(param => lowerParam(param, context)),
          returnType: returnType.valueType ?? method.returnType,
          returnNullable: returnType.nullable,
          body: method.body.map(statement => lowerStatement(statement, context))
        }
      })
    }
  }

  return lowerStatement(item, context)
}

function lowerStatement(statement: AnyNode, context: LowerContext): AnyNode {
  if (statement.type === 'BlockStatement') {
    return {
      type: 'BlockStatement',
      body: statement.body.map(item => lowerStatement(item, context))
    }
  }

  if (statement.type === 'IfStatement') {
    return {
      type: 'IfStatement',
      condition: lowerExpression(statement.condition, context),
      consequent: lowerStatement(statement.consequent, context),
      alternate: statement.alternate == null ? null : lowerStatement(statement.alternate, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'WhileStatement') {
    return {
      type: 'WhileStatement',
      condition: lowerExpression(statement.condition, context),
      body: lowerStatement(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForStatement') {
    return {
      type: 'ForStatement',
      init: statement.init == null ? null : lowerForInitializer(statement.init, context),
      test: statement.test == null ? null : lowerExpression(statement.test, context),
      update: statement.update == null ? null : lowerExpression(statement.update, context),
      body: lowerStatement(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForOfStatement') {
    return {
      type: 'ForOfStatement',
      kind: statement.kind,
      name: statement.name,
      loc: statement.loc,
      nameLoc: statement.nameLoc,
      iterable: lowerExpression(statement.iterable, context),
      body: lowerStatement(statement.body, context)
    }
  }

  if (statement.type === 'SwitchStatement') {
    return {
      type: 'SwitchStatement',
      discriminant: lowerExpression(statement.discriminant, context),
      cases: statement.cases.map(item => ({
        type: 'SwitchCase',
        test: item.test == null ? null : lowerExpression(item.test, context),
        consequent: item.consequent.map(statement => lowerStatement(statement, context)),
        loc: item.loc
      })),
      loc: statement.loc
    }
  }

  if (statement.type === 'TryStatement') {
    return {
      type: 'TryStatement',
      block: lowerStatement(statement.block, context),
      handler: statement.handler == null
        ? null
        : {
            ...statement.handler,
            body: lowerStatement(statement.handler.body, context)
          },
      finalizer: statement.finalizer == null ? null : lowerStatement(statement.finalizer, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'BreakStatement' || statement.type === 'ContinueStatement') {
    return statement
  }

  if (statement.type === 'VariableDeclaration') {
    const init = statement.init == null ? null : lowerExpression(statement.init, context)
    const declared = resolveDeclaredType(statement.declaredType, context)
    const inferredMapType = inferMapType(init)

    return {
      type: 'VariableDeclaration',
      kind: statement.kind,
      exported: statement.exported,
      name: statement.name,
      loc: statement.loc,
      declaredType: statement.declaredType,
      nullable: declared.nullable || init?.nullable === true,
      shape: declared.shape,
      functionType: declared.functionType,
      arrayElementType: declared.arrayElementType ?? inferArrayElementType(init),
      mapKeyType: declared.mapKeyType ?? inferredMapType?.key ?? null,
      mapValueType: declared.mapValueType ?? inferredMapType?.value ?? null,
      setElementType: declared.setElementType ?? inferSetElementType(init),
      valueType: declared.valueType ?? statement.declaredType ?? init?.valueType ?? 'unknown',
      init
    }
  }

  if (statement.type === 'ExpressionStatement') {
    return {
      type: 'ExpressionStatement',
      expression: lowerExpression(statement.expression, context)
    }
  }

  if (statement.type === 'ReturnStatement') {
    return {
      type: 'ReturnStatement',
      argument: statement.argument == null ? null : lowerExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ThrowStatement') {
    return {
      type: 'ThrowStatement',
      argument: lowerExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  return statement
}

function lowerForInitializer(init: AnyNode, context: LowerContext): AnyNode {
  if (init.type === 'VariableDeclaration') {
    return lowerStatement(init, context)
  }

  return lowerExpression(init, context)
}

function lowerParam(param: AnyNode, context: LowerContext): AnyNode {
  const declared = resolveDeclaredType(param.valueType, context)

  return {
    ...param,
    valueType: declared.valueType ?? param.valueType,
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    setElementType: declared.setElementType,
    functionType: declared.functionType,
    shape: declared.shape
  }
}

function resolveDeclaredType(name: string | null | undefined, context: LowerContext): LowerResolvedType {
  if (name == null) {
    return {
      valueType: null,
      nullable: false,
      arrayElementType: null,
      mapKeyType: null,
      mapValueType: null,
      setElementType: null,
      shape: null,
      functionType: null
    }
  }

  const nullableTypeName = nullableTypeNameFromTypeName(name)

  if (nullableTypeName != null) {
    const inner = resolveDeclaredType(nullableTypeName, context)

    return {
      ...inner,
      nullable: true
    }
  }

  const arrayElementTypeName = arrayElementTypeNameFromTypeName(name)

  if (name === 'array' || arrayElementTypeName != null) {
    const elementType = arrayElementTypeName == null ? null : resolveDeclaredType(arrayElementTypeName, context)

    return {
      valueType: 'array',
      nullable: false,
      arrayElementType: elementType?.valueType ?? 'unknown',
      mapKeyType: null,
      mapValueType: null,
      setElementType: null,
      shape: null,
      functionType: null
    }
  }

  const mapTypeNames = mapTypeNamesFromTypeName(name)

  if (name === 'map' || mapTypeNames != null) {
    const keyType = mapTypeNames == null ? null : resolveDeclaredType(mapTypeNames.key, context)
    const valueType = mapTypeNames == null ? null : resolveDeclaredType(mapTypeNames.value, context)

    return {
      valueType: 'map',
      nullable: false,
      arrayElementType: null,
      mapKeyType: keyType?.valueType ?? 'unknown',
      mapValueType: valueType?.valueType ?? 'unknown',
      setElementType: null,
      shape: null,
      functionType: null
    }
  }

  const setElementTypeName = setElementTypeNameFromTypeName(name)

  if (name === 'set' || setElementTypeName != null) {
    const elementType = setElementTypeName == null ? null : resolveDeclaredType(setElementTypeName, context)

    return {
      valueType: 'set',
      nullable: false,
      arrayElementType: null,
      mapKeyType: null,
      mapValueType: null,
      setElementType: elementType?.valueType ?? 'unknown',
      shape: null,
      functionType: null
    }
  }

  if (isBuiltinValueType(name)) {
    return {
      valueType: name,
      nullable: false,
      arrayElementType: null,
      mapKeyType: null,
      mapValueType: null,
      setElementType: null,
      shape: null,
      functionType: null
    }
  }

  const type = context.types.get(name)

  if (type?.kind === 'object') {
    return {
      valueType: 'object',
      nullable: false,
      arrayElementType: null,
      mapKeyType: null,
      mapValueType: null,
      setElementType: null,
      shape: resolveObjectShape(type, context),
      functionType: null
    }
  }

  if (type?.kind === 'function') {
    const returnType = resolveDeclaredType(type.returnType, context)

    return {
      valueType: 'function',
      nullable: false,
      arrayElementType: null,
      mapKeyType: null,
      mapValueType: null,
      setElementType: null,
      shape: null,
      functionType: {
        ...type,
        params: type.params.map(param => {
          const declared = resolveDeclaredType(param.valueType, context)

          return {
            ...param,
            valueType: declared.valueType ?? param.valueType,
            nullable: declared.nullable,
            arrayElementType: declared.arrayElementType,
            mapKeyType: declared.mapKeyType,
            mapValueType: declared.mapValueType,
            setElementType: declared.setElementType,
            shape: declared.shape,
            functionType: declared.functionType
          }
        }),
        returnType: returnType.valueType ?? type.returnType,
        returnNullable: returnType.nullable,
        returnArrayElementType: returnType.arrayElementType,
        returnMapKeyType: returnType.mapKeyType,
        returnMapValueType: returnType.mapValueType,
        returnSetElementType: returnType.setElementType
      }
    }
  }

  return {
    valueType: null,
    nullable: false,
    arrayElementType: null,
    mapKeyType: null,
    mapValueType: null,
    setElementType: null,
    shape: null,
    functionType: null
  }
}

function resolveObjectShape(shape: AnyNode, context: LowerContext): AnyNode {
  return {
    ...shape,
    fields: shape.fields.map(field => {
      const declared = resolveDeclaredType(field.valueType, context)

      return {
        ...field,
        declaredType: field.valueType,
        valueType: declared.valueType ?? field.valueType,
        nullable: declared.nullable,
        arrayElementType: declared.arrayElementType,
        mapKeyType: declared.mapKeyType,
        mapValueType: declared.mapValueType,
        setElementType: declared.setElementType,
        shape: declared.shape,
        functionType: declared.functionType
      }
    })
  }
}

function inferArrayElementType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'array' ? expression.arrayElementType ?? null : null
}

function inferMapType(expression: AnyNode | null): { key: string | null, value: string | null } | null {
  return expression?.valueType === 'map'
    ? {
        key: expression.mapKeyType ?? null,
        value: expression.mapValueType ?? null
      }
    : null
}

function inferSetElementType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'set' ? expression.setElementType ?? null : null
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
    : {
        key: 'unknown',
        value: 'unknown'
      }
}

function setElementTypeNameFromTypeName(name: string): string | null {
  const match = /^set<(.+)>$/.exec(name)

  if (match == null) {
    return null
  }

  const args = splitGenericArgs(match[1])

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

function commonArrayElementType(types: string[]): string {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every(type => type === first) ? first : 'unknown'
}

function isBuiltinValueType(name: string): boolean {
  return ['array', 'boolean', 'function', 'null', 'number', 'object', 'string', 'void'].includes(name)
}

function lowerExpression(expression: AnyNode, context: LowerContext = { types: new Map() }): AnyNode {
  if (expression.type === 'StringLiteral') {
    return {
      ...expression,
      valueType: 'string'
    }
  }

  if (expression.type === 'TemplateLiteral') {
    return {
      ...expression,
      valueType: 'string'
    }
  }

  if (expression.type === 'NumberLiteral') {
    return {
      ...expression,
      valueType: 'number'
    }
  }

  if (expression.type === 'BooleanLiteral') {
    return {
      ...expression,
      valueType: 'boolean'
    }
  }

  if (expression.type === 'NullLiteral') {
    return {
      ...expression,
      valueType: 'null'
    }
  }

  if (expression.type === 'ThisExpression') {
    return {
      ...expression,
      valueType: 'object'
    }
  }

  if (expression.type === 'Reference') {
    return {
      ...expression,
      valueType: 'unknown'
    }
  }

  if (expression.type === 'MemberExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'IndexExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      index: lowerExpression(expression.index, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      arrayElementType: expression.arrayElementType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'OptionalIndexExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      index: lowerExpression(expression.index, context),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      arrayElementType: expression.arrayElementType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'OptionalCallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'unknown',
      arrayElementType: expression.arrayElementType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      setElementType: expression.setElementType ?? null
    }
  }

  if (expression.type === 'CallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'unknown',
      arrayElementType: expression.arrayElementType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      setElementType: expression.setElementType ?? null
    }
  }

  if (expression.type === 'NewExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'object',
      arrayElementType: expression.arrayElementType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      setElementType: expression.setElementType ?? null
    }
  }

  if (expression.type === 'AwaitExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return {
      ...expression,
      body: expression.expressionBody ? lowerExpression(expression.body, context) : expression.body.map(statement => lowerStatement(statement, context)),
      valueType: 'function'
    }
  }

  if (expression.type === 'AssignmentExpression') {
    const value = lowerExpression(expression.value, context)

    return {
      ...expression,
      target: lowerExpression(expression.target, context),
      value,
      valueType: value.valueType
    }
  }

  if (expression.type === 'BinaryExpression') {
    const left = lowerExpression(expression.left, context)
    const right = lowerExpression(expression.right, context)

    return {
      ...expression,
      left,
      right,
      valueType: inferBinaryExpressionType(expression.operator, left, right)
    }
  }

  if (expression.type === 'UnaryExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: expression.operator === '!' ? 'boolean' : 'number'
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = expression.elements.map(element => lowerExpression(element, context))

    return {
      ...expression,
      elements,
      arrayElementType: commonArrayElementType(elements.map(element => element.valueType)),
      valueType: 'array'
    }
  }

  if (expression.type === 'ObjectLiteral') {
    return {
      ...expression,
      properties: expression.properties.map(property => ({
        ...property,
        value: lowerExpression(property.value, context)
      })),
      valueType: 'object'
    }
  }

  return {
    ...expression,
    valueType: 'unknown'
  }
}

function inferBinaryExpressionType(operator, left, right) {
  if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
    return 'boolean'
  }

  if (operator === '??') {
    return left.valueType === 'null' || left.valueType === 'unknown' ? right.valueType : left.valueType
  }

  if (operator === '+' && (left.valueType === 'string' || right.valueType === 'string')) {
    return 'string'
  }

  return 'number'
}

function collectTypes(ast) {
  const types = new Map()

  for (const item of ast.body) {
    if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
      types.set(item.name, {
        kind: 'object',
        fields: item.valueType.fields.map(field => ({
          name: field.name,
          readonly: field.readonly,
          valueType: field.valueType,
          loc: field.loc
        }))
      })
    } else if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'function') {
      types.set(item.name, {
        kind: 'function',
        params: item.valueType.params.map(param => ({
          name: param.name,
          valueType: param.valueType,
          loc: param.loc
        })),
        returnType: item.valueType.returnType
      })
    }
  }

  return types
}
