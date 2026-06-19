import type { AnyNode, ProgramNode } from '../types.ts'
import type { CompilerHost } from '../host.ts'

type ExportNode = AnyNode & {
  exported: boolean
  name: string
  type: string
}

export function collectExports(ast: ProgramNode): Map<string, ExportNode> {
  const exports: Map<string, ExportNode> = new Map()

  for (let index = 0; index < ast.body.length; index = index + 1) {
    const item = ast.body[index] as ExportNode

    if (
      (item.type === 'FunctionDeclaration' ||
        item.type === 'VariableDeclaration' ||
        item.type === 'TypeAliasDeclaration') &&
      item.exported === true
    ) {
      exports.set(item.name, item)
    }
  }

  return exports
}

export function moduleId(path: string, _host: CompilerHost): string {
  return `file://${path}`
}
