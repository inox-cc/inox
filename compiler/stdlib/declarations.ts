import type { AnyNode, ProgramNode, ValueType } from '../types.ts'
import { stdlibModuleDeclarationPath } from './node/modules.ts'

export function isStdlibDeclarationRuntimeImportTypingSource(source: string): boolean {
  return stdlibModuleDeclarationPath(source) !== null
}

export function findStdlibDeclarationExport(program: ProgramNode, name: string): AnyNode | null {
  for (const item of program.body) {
    if (item.exported === true && item.name === name) {
      return item
    }
  }

  return null
}

export function stdlibDeclarationExportValueType(program: ProgramNode, name: string): ValueType | null {
  const declaration = findStdlibDeclarationExport(program, name)

  if (declaration === null || typeof declaration === 'undefined') {
    return null
  }

  return stdlibDeclarationNodeValueType(declaration)
}

export function stdlibDeclarationNodeValueType(declaration: AnyNode): ValueType | null {
  if (declaration.type === 'FunctionDeclaration') {
    return 'function'
  }

  if (declaration.type === 'ClassDeclaration') {
    return 'function'
  }

  if (declaration.type !== 'VariableDeclaration') {
    return null
  }

  const valueType = declaration.valueType

  if (typeof valueType === 'string' && valueType !== '') {
    return valueType.slice(0)
  }

  const declaredType = declaration.declaredType

  if (typeof declaredType !== 'string' || declaredType === '') {
    return 'unknown'
  }

  return stdlibDeclarationTypeNameValueType(declaredType.slice(0))
}

function stdlibDeclarationTypeNameValueType(typeName: string): ValueType {
  if (
    typeName === 'boolean' ||
    typeName === 'function' ||
    typeName === 'number' ||
    typeName === 'string' ||
    typeName === 'unknown' ||
    typeName === 'void'
  ) {
    return typeName
  }

  if (typeName === 'Buffer' || typeName === 'Uint8Array') {
    return 'bytes'
  }

  if (typeName.startsWith('array<') || typeName.endsWith('[]')) {
    return 'array'
  }

  if (typeName.startsWith('promise<') || typeName.startsWith('Promise<')) {
    return 'promise'
  }

  return 'object'
}
