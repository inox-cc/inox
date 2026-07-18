import { readFileSync } from 'node:fs'

import type {
  CompilerLibraryDescriptor,
  CompilerLibraryPackageDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor
} from '../../../compiler/extensions/types.ts'
import { parseCompilerLibraryGlobalDeclarations } from '../../../compiler/extensions/global-declarations.ts'
import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryPackage as collectionsCompilerLibraryPackage } from '../../../stdlib/global/collections/compiler/index.ts'
import { compilerLibraryPackage as consoleCompilerLibraryPackage } from '../../../stdlib/global/console/compiler/index.ts'

/** Adds the explicitly selected console package to a synthetic library set. */
export function createCompilerLibrarySetWithConsole(libraries: CompilerLibraryDescriptor[]): CompilerLibrarySet {
  return createCompilerLibrarySetWithCollections([
    compilerLibraryPackageWithGlobalDeclaration(consoleCompilerLibraryPackage, 'stdlib/global/console/index.d.ts'),
    ...libraries
  ])
}

/** Adds the explicitly selected collections package to a synthetic library set. */
export function createCompilerLibrarySetWithCollections(libraries: CompilerLibraryDescriptor[]): CompilerLibrarySet {
  const selected: CompilerLibraryDescriptor[] = [
    compilerLibraryPackageWithGlobalDeclaration(
      collectionsCompilerLibraryPackage,
      'stdlib/global/collections/index.d.ts'
    )
  ]

  for (let index = 0; index < libraries.length; index = index + 1) {
    selected.push(libraries[index])
  }

  return createCompilerLibrarySetWithSyntheticGlobalDeclarations(selected)
}

export function createCompilerLibrarySetWithSyntheticGlobalDeclarations(
  libraries: CompilerLibraryDescriptor[]
): CompilerLibrarySet {
  const declared: CompilerLibraryDescriptor[] = []

  for (let index = 0; index < libraries.length; index = index + 1) {
    declared.push(withSyntheticGlobalDeclarations(libraries[index]))
  }

  return createCompilerLibrarySet(declared)
}

export function compilerLibraryPackageWithGlobalDeclaration(
  compilerPackage: CompilerLibraryPackageDescriptor,
  declarationPath: string
): CompilerLibraryDescriptor {
  return {
    ...compilerPackage,
    declarations: [
      {
        libraryId: compilerPackage.id,
        kind: 'global',
        source: declarationPath,
        declarationSource: readFileSync(declarationPath, 'utf8'),
        compilerImplemented: true
      }
    ]
  }
}

export function compilerLibrary(id: string, dependencies: string[] = []): CompilerLibraryDescriptor {
  return {
    id,
    dependencies,
    declarations: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

export function globalDeclarationLibrary(
  id: string,
  declarationSource: string,
  operations: LibraryOperationDescriptor[] = []
): CompilerLibraryDescriptor {
  return {
    id,
    dependencies: [],
    declarations: [
      {
        libraryId: id,
        kind: 'global',
        source: `stdlib/${id.replace(':', '/')}/index.d.ts`,
        declarationSource,
        compilerImplemented: true
      }
    ],
    nativeTypes: [],
    operations,
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function withSyntheticGlobalDeclarations(library: CompilerLibraryDescriptor): CompilerLibraryDescriptor {
  const declaredNames = declaredGlobalValueNames(library)
  const operationRoots = operationGlobalRootMembers(library)
  const missingNames: string[] = []

  for (const name of operationRoots.keys()) {
    if (!declaredNames.has(name)) {
      missingNames.push(name)
    }
  }

  if (missingNames.length === 0) {
    return library
  }

  missingNames.sort()
  let declarationSource = 'export {}\ndeclare global {\n'

  for (const name of missingNames) {
    const members = operationRoots.get(name) ?? new Set()

    if (members.size === 0 || libraryHasGlobalRootOperation(library, name)) {
      declarationSource = `${declarationSource}  const ${name}: unknown;\n`
      continue
    }

    const typeName = `__InoxSyntheticGlobal_${library.id}_${name}`.replace(/[^A-Za-z0-9_$]/g, '_')
    const sortedMembers = Array.from(members).sort()

    declarationSource = `${declarationSource}  interface ${typeName} {\n`

    for (const member of sortedMembers) {
      declarationSource = `${declarationSource}    ${member}: unknown;\n`
    }

    declarationSource = `${declarationSource}  }\n  const ${name}: ${typeName};\n`
  }

  declarationSource = `${declarationSource}}\n`

  return {
    ...library,
    declarations: [
      ...library.declarations,
      {
        libraryId: library.id,
        kind: 'global',
        source: `tests/architecture/fixtures/${library.id}-synthetic-globals.d.ts`,
        declarationSource,
        compilerImplemented: true
      }
    ],
    operations: withSyntheticGlobalRootFields(library, operationRoots)
  }
}

function declaredGlobalValueNames(library: CompilerLibraryDescriptor): Set<string> {
  const names: Set<string> = new Set()
  const parsed = parseCompilerLibraryGlobalDeclarations(library.declarations)

  for (const declaration of parsed.declarations) {
    for (const item of declaration.program.body) {
      if (
        item.type === 'FunctionDeclaration' ||
        item.type === 'VariableDeclaration' ||
        item.type === 'ClassDeclaration'
      ) {
        names.add(item.name)
      }
    }
  }

  return names
}

function operationGlobalRootMembers(library: CompilerLibraryDescriptor): Map<string, Set<string>> {
  const roots: Map<string, Set<string>> = new Map()

  for (const operation of library.operations) {
    const resultFields = operation.resultShapeFields ?? []

    addOperationGlobalPath(roots, operation.bindingId, resultFields)

    const aliases = operation.bindingAliases ?? []

    for (const alias of aliases) {
      addOperationGlobalPath(roots, alias, resultFields)
    }
  }

  return roots
}

function addOperationGlobalPath(
  roots: Map<string, Set<string>>,
  bindingId: string,
  resultFields: Array<{ name: string }>
): void {
  if (!bindingId.startsWith('global:')) {
    return
  }

  const path = bindingId.slice('global:'.length)
  const separator = path.indexOf('.')
  const name = separator < 0 ? path : path.slice(0, separator)

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    return
  }

  let members = roots.get(name)

  if (typeof members === 'undefined') {
    members = new Set()
    roots.set(name, members)
  }

  if (separator < 0) {
    for (const field of resultFields) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field.name)) {
        members.add(field.name)
      }
    }
    return
  }

  const remainder = path.slice(separator + 1)
  const nextSeparator = remainder.indexOf('.')
  const member = nextSeparator < 0 ? remainder : remainder.slice(0, nextSeparator)

  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(member)) {
    members.add(member)
  }
}

function libraryHasGlobalRootOperation(library: CompilerLibraryDescriptor, name: string): boolean {
  const bindingId = `global:${name}`

  for (const operation of library.operations) {
    if (operation.kind !== 'member-read') {
      continue
    }

    if (operation.bindingId === bindingId || (operation.bindingAliases ?? []).includes(bindingId)) {
      return true
    }
  }

  return false
}

function withSyntheticGlobalRootFields(
  library: CompilerLibraryDescriptor,
  roots: Map<string, Set<string>>
): CompilerLibraryDescriptor['operations'] {
  const operations: CompilerLibraryDescriptor['operations'] = []

  for (const operation of library.operations) {
    let rootName: string | null = null

    for (const name of roots.keys()) {
      const bindingId = `global:${name}`

      if (
        operation.kind === 'member-read' &&
        (operation.bindingId === bindingId || (operation.bindingAliases ?? []).includes(bindingId))
      ) {
        rootName = name
        break
      }
    }

    if (rootName === null) {
      operations.push(operation)
      continue
    }

    const fields = [...(operation.resultShapeFields ?? [])]
    const fieldNames = new Set(fields.map((field) => field.name))
    const members = roots.get(rootName) ?? new Set()

    for (const member of members) {
      if (!fieldNames.has(member)) {
        fields.push({ name: member, valueType: 'unknown', readonly: false })
      }
    }

    operations.push({
      ...operation,
      resultShapeFields: fields
    })
  }

  return operations
}
