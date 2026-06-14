import { collectIrTopLevelNodes } from '../ir.ts'
import type { IrProgram, AnyNode } from '../types.ts'

export function collectRuntimeImportNames(
  irPrograms: IrProgram[],
  sources: ReadonlySet<string>,
  importedNames: ReadonlySet<string>
): Set<string> {
  const names = new Set<string>()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (!sources.has(item.source)) {
        continue
      }

      for (const specifier of item.specifiers) {
        if (importedNames.has(specifier.imported)) {
          names.add(specifier.local)
        }
      }
    }
  }

  return names
}

export function collectRuntimeNamedImportNames(
  irPrograms: IrProgram[],
  sources: ReadonlySet<string>,
  importedName: string
): Set<string> {
  const names = new Set<string>()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (!sources.has(item.source)) {
        continue
      }

      for (const specifier of item.specifiers) {
        if (specifier.imported === importedName) {
          names.add(specifier.local)
        }
      }
    }
  }

  return names
}

export function collectHttpRuntimeImportNames(irPrograms: IrProgram[]): Set<string> {
  const names = new Set<string>()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (!['http', 'node:http'].includes(item.source)) {
        continue
      }

      for (const specifier of item.specifiers) {
        if (specifier.imported === 'default' || specifier.imported === 'http') {
          names.add(specifier.local)
        }
      }
    }
  }

  return names
}

export function collectHttpRuntimeCreateServerNames(irPrograms: IrProgram[]): Set<string> {
  const names = new Set<string>()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (!['http', 'node:http'].includes(item.source)) {
        continue
      }

      for (const specifier of item.specifiers) {
        if (specifier.imported === 'createServer') {
          names.add(specifier.local)
        }
      }
    }
  }

  return names
}

export function irProgramsUseRuntimeImport(programs: IrProgram[], sources: ReadonlySet<string>): boolean {
  return programs.some((program) => containsRuntimeImport(program.body, sources))
}

function containsRuntimeImport(node: unknown, sources: ReadonlySet<string>): boolean {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some((item) => containsRuntimeImport(item, sources))
  }

  if (typeof node !== 'object') {
    return false
  }

  const item = node as AnyNode

  if (item.type === 'ImportDeclaration' && sources.has(item.source)) {
    return true
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    if (containsRuntimeImport(value, sources)) {
      return true
    }
  }

  return false
}
