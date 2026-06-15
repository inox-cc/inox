import type { AnyNode, ProgramNode } from '../types.ts'
import type { CompilerHost } from '../host.ts'

export function collectExports(ast: ProgramNode): Map<string, AnyNode> {
  const exports = new Map<string, AnyNode>()

  for (const item of ast.body) {
    if (
      (item.type === 'FunctionDeclaration' ||
        item.type === 'VariableDeclaration' ||
        item.type === 'TypeAliasDeclaration') &&
      item.exported
    ) {
      exports.set(item.name, item)
    }
  }

  return exports
}

export function moduleId(path: string, host: CompilerHost): string {
  return host.pathToFileUrl(path)
}
