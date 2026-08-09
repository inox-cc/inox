import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

import ts from 'typescript'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const projectRoot = resolve('.')
const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/index.ts', 'compiler/node-host.ts'])

type VocabularyEntry = {
  owner: string
  token: string
}

type SemanticTail = VocabularyEntry & {
  column: number
  file: string
  line: number
}

test('portable compiler не содержит descriptor-derived vocabulary imported packages', async () => {
  const vocabulary = await importedPackageVocabulary()
  const tails: SemanticTail[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const source = await readFile(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

    visit(sourceFile, sourceFile, vocabulary, tails)
  }

  assert.deepEqual(
    tails,
    [],
    'imported package ids, bindings, runtime requirements and C++ symbols must remain package-owned'
  )
})

async function importedPackageVocabulary(): Promise<VocabularyEntry[]> {
  const libraries = (await discoverCompilerLibraries()).filter((library) => library.kind !== 'global')
  const entries: VocabularyEntry[] = []

  for (const library of libraries) {
    addVocabulary(entries, library.id, library.importSource)
    addVocabulary(entries, library.id, library.compilerEntrypoint)

    for (const source of library.nativeSources) {
      addVocabulary(entries, library.id, source)
    }

    for (const includeDir of library.nativeIncludeDirs) {
      addVocabulary(entries, library.id, includeDir)
    }

    const descriptor = library.compilerPackage

    if (descriptor === null) {
      continue
    }

    for (const requirement of descriptor.runtimeRequirements) {
      addVocabulary(entries, library.id, requirement.id)

      for (const include of requirement.cPreludeIncludes) {
        addVocabulary(entries, library.id, include)
      }
    }

    for (const nativeType of descriptor.nativeTypes ?? []) {
      addVocabulary(entries, library.id, nativeType.typeId)
      addCppTypeVocabulary(entries, library.id, nativeType.cppType)
    }

    for (const operation of descriptor.operations) {
      addVocabulary(entries, library.id, operation.bindingId)
      addVocabulary(entries, library.id, operation.operationId)
      addQualifiedVocabulary(entries, library.id, operation.cExpression)
      addCppTypeVocabulary(entries, library.id, operation.cResultMapping?.cppType)

      for (const alias of operation.bindingAliases ?? []) {
        addVocabulary(entries, library.id, alias)
      }

      for (const variant of operation.variants ?? []) {
        addQualifiedVocabulary(entries, library.id, variant.cExpression)
        addCppTypeVocabulary(entries, library.id, variant.cResultMapping?.cppType)
      }
    }
  }

  return uniqueVocabulary(entries)
}

function addCppTypeVocabulary(entries: VocabularyEntry[], owner: string, value: string | null | undefined): void {
  if (value === null || typeof value === 'undefined' || value === 'void' || value.startsWith('std::')) {
    return
  }

  if (value === 'inox::Value' || value === 'inox::String') {
    return
  }

  addVocabulary(entries, owner, value)
}

function addQualifiedVocabulary(entries: VocabularyEntry[], owner: string, value: string | null | undefined): void {
  if (value !== null && typeof value !== 'undefined' && (value.includes('.') || value.includes('::'))) {
    addVocabulary(entries, owner, value)
  }
}

function addVocabulary(entries: VocabularyEntry[], owner: string, token: string | null | undefined): void {
  if (token !== null && typeof token !== 'undefined' && token.length >= 4) {
    entries.push({ owner, token })
  }
}

function uniqueVocabulary(entries: VocabularyEntry[]): VocabularyEntry[] {
  const unique = new Map<string, VocabularyEntry>()

  for (const entry of entries) {
    unique.set(`${entry.owner}\0${entry.token}`, entry)
  }

  return Array.from(unique.values()).sort((left, right) => left.token.localeCompare(right.token))
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  vocabulary: VocabularyEntry[],
  tails: SemanticTail[]
): void {
  if (ts.isStringLiteralLike(node) && !isAllowedHostImport(node, sourceFile)) {
    for (const entry of vocabulary) {
      if (node.text.includes(entry.token)) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

        tails.push({
          ...entry,
          column: position.character + 1,
          file: projectPath(sourceFile.fileName),
          line: position.line + 1
        })
      }
    }
  }

  ts.forEachChild(node, (child) => visit(child, sourceFile, vocabulary, tails))
}

function isAllowedHostImport(node: ts.StringLiteralLike, sourceFile: ts.SourceFile): boolean {
  const parent = node.parent

  return (
    hostAdapterFiles.has(projectPath(sourceFile.fileName)) &&
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node &&
    node.text.startsWith('node:')
  )
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
