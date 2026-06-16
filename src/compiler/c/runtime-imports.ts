import { collectIrTopLevelNodes } from '../ir.ts'
import type { IrProgram } from '../types.ts'

type RuntimeImportSourceSet = Set<string>
type RuntimeImportNameSet = Set<string>

export function collectRuntimeImportNames(
  irPrograms: IrProgram[],
  sources: RuntimeImportSourceSet,
  importedNames: RuntimeImportNameSet
): RuntimeImportNameSet {
  const names: RuntimeImportNameSet = new Set()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (sources.has(item.source) === false) {
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
  sources: RuntimeImportSourceSet,
  importedName: string
): RuntimeImportNameSet {
  const names: RuntimeImportNameSet = new Set()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (sources.has(item.source) === false) {
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

export function collectHttpRuntimeImportNames(irPrograms: IrProgram[]): RuntimeImportNameSet {
  const names: RuntimeImportNameSet = new Set()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (isHttpRuntimeImportSource(item.source) === false) {
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

export function collectHttpRuntimeCreateServerNames(irPrograms: IrProgram[]): RuntimeImportNameSet {
  const names: RuntimeImportNameSet = new Set()

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodes(ir, 'import')) {
      if (isHttpRuntimeImportSource(item.source) === false) {
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

export function irProgramsUseRuntimeImport(programs: IrProgram[], sources: RuntimeImportSourceSet): boolean {
  for (const program of programs) {
    for (const item of collectIrTopLevelNodes(program, 'import')) {
      if (sources.has(item.source)) {
        return true
      }
    }
  }

  return false
}

function isHttpRuntimeImportSource(source: string): boolean {
  return source === 'http' || source === 'node:http'
}
