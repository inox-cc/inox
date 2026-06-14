import type { AnyNode, ProgramNode, SourceLocation } from '../types.ts'

export function insertImportSyntheticDeclarations(
  program: ProgramNode,
  declarationsByImport: Map<number, AnyNode[]>
): ProgramNode {
  if (declarationsByImport.size === 0) {
    return program
  }

  const body: AnyNode[] = []
  let importIndex = 0

  for (const item of program.body) {
    body.push(item)

    if (item.type === 'ImportDeclaration') {
      body.push(...(declarationsByImport.get(importIndex) ?? []))
      importIndex += 1
    }
  }

  return {
    ...program,
    body
  }
}

export function createImportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  const exported = importedProgram.body.find((item) => item.exported && item.name === specifier.imported)

  if (exported == null) {
    return null
  }

  if (exported.type === 'FunctionDeclaration') {
    return createFunctionAliasDeclaration(specifier.local, exported, specifier.loc)
  }

  return {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name: specifier.local,
    loc: specifier.loc,
    declaredType: exported.declaredType ?? null,
    valueType: exported.valueType ?? 'unknown',
    init: {
      type: 'Reference',
      path: [specifier.imported],
      loc: specifier.loc,
      valueType: exported.valueType ?? 'unknown'
    }
  }
}

export function createTypeImportDeclaration(specifier: AnyNode, exported: AnyNode): AnyNode {
  return {
    ...exported,
    exported: false,
    name: specifier.local,
    loc: specifier.loc,
    syntheticTypeImport: true,
    importedName: specifier.imported,
    valueType: cloneTypeAliasValue(exported.valueType)
  }
}

function cloneTypeAliasValue(valueType: AnyNode): AnyNode {
  if (valueType?.kind === 'object') {
    return {
      ...valueType,
      fields: valueType.fields.map((field) => ({
        ...field
      }))
    }
  }

  if (valueType?.kind === 'function') {
    return {
      ...valueType,
      params: valueType.params.map((param) => ({
        ...param
      }))
    }
  }

  return {
    ...valueType
  }
}

function createFunctionAliasDeclaration(name: string, target: AnyNode, loc: SourceLocation): AnyNode {
  const params = target.params.map((param) => ({
    ...param
  }))
  const call = {
    type: 'CallExpression',
    callee: {
      type: 'Reference',
      path: [target.name],
      loc,
      valueType: 'function'
    },
    args: params.map((param) => ({
      type: 'Reference',
      path: [param.name],
      loc: param.loc,
      valueType: param.valueType
    })),
    loc,
    valueType: target.returnType
  }

  return {
    type: 'FunctionDeclaration',
    exported: false,
    async: target.async,
    name,
    loc,
    params,
    returnType: target.returnType,
    body:
      target.returnType === 'void'
        ? [
            {
              type: 'ExpressionStatement',
              expression: call,
              loc
            }
          ]
        : [
            {
              type: 'ReturnStatement',
              argument: call,
              loc
            }
          ]
  }
}
