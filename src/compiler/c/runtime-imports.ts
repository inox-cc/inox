import { collectIrTopLevelNodes } from '../ir.ts'
import type { IrProgram } from '../types.ts'

type RuntimeImportSourceSet = Set<string>
type RuntimeImportNameSet = Set<string>
type RuntimeImportSpecifier = {
  imported: string
  local: string
}
type RuntimeImportNode = {
  source: string
  specifiers: RuntimeImportSpecifier[]
}

export function collectRuntimeImportNames(
  irPrograms: IrProgram[],
  sources: RuntimeImportSourceSet,
  importedNames: RuntimeImportNameSet
): RuntimeImportNameSet {
  const names: RuntimeImportNameSet = new Set()

  for (let programIndex = 0; programIndex < irPrograms.length; programIndex = programIndex + 1) {
    const ir = irProgramAt(irPrograms, programIndex)
    const items = collectRuntimeImportNodes(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = runtimeImportNodeAt(items, itemIndex)

      if (sources.has(item.source) === false) {
        continue
      }

      for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
        const specifier = runtimeImportSpecifierAt(item.specifiers, specifierIndex)

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

  for (let programIndex = 0; programIndex < irPrograms.length; programIndex = programIndex + 1) {
    const ir = irProgramAt(irPrograms, programIndex)
    const items = collectRuntimeImportNodes(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = runtimeImportNodeAt(items, itemIndex)

      if (sources.has(item.source) === false) {
        continue
      }

      for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
        const specifier = runtimeImportSpecifierAt(item.specifiers, specifierIndex)

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

  for (let programIndex = 0; programIndex < irPrograms.length; programIndex = programIndex + 1) {
    const ir = irProgramAt(irPrograms, programIndex)
    const items = collectRuntimeImportNodes(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = runtimeImportNodeAt(items, itemIndex)

      if (isHttpRuntimeImportSource(item.source) === false) {
        continue
      }

      for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
        const specifier = runtimeImportSpecifierAt(item.specifiers, specifierIndex)

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

  for (let programIndex = 0; programIndex < irPrograms.length; programIndex = programIndex + 1) {
    const ir = irProgramAt(irPrograms, programIndex)
    const items = collectRuntimeImportNodes(ir)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = runtimeImportNodeAt(items, itemIndex)

      if (isHttpRuntimeImportSource(item.source) === false) {
        continue
      }

      for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
        const specifier = runtimeImportSpecifierAt(item.specifiers, specifierIndex)

        if (specifier.imported === 'createServer') {
          names.add(specifier.local)
        }
      }
    }
  }

  return names
}

export function irProgramsUseRuntimeImport(programs: IrProgram[], sources: RuntimeImportSourceSet): boolean {
  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = irProgramAt(programs, programIndex)
    const items = collectRuntimeImportNodes(program)

    for (let itemIndex = 0; itemIndex < items.length; itemIndex = itemIndex + 1) {
      const item = runtimeImportNodeAt(items, itemIndex)

      if (sources.has(item.source)) {
        return true
      }
    }
  }

  return false
}

function irProgramAt(programs: IrProgram[], index: number): IrProgram {
  return programs[index]
}

function collectRuntimeImportNodes(program: IrProgram): RuntimeImportNode[] {
  return collectIrTopLevelNodes(program, 'import') as RuntimeImportNode[]
}

function runtimeImportNodeAt(nodes: RuntimeImportNode[], index: number): RuntimeImportNode {
  return nodes[index]
}

function runtimeImportSpecifierAt(specifiers: RuntimeImportSpecifier[], index: number): RuntimeImportSpecifier {
  return specifiers[index]
}

function isHttpRuntimeImportSource(source: string): boolean {
  return source === 'http' || source === 'node:http'
}
