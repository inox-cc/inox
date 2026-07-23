import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compilerAnyNodeObjectFields } from '../../compiler/backends/cpp/values/any-node-fields.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'
import {
  compileMemoryPackageToCppModules,
  compileMemoryPackageToIrModules,
  compileSource,
  compileSourceToIr
} from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import {
  arrayNativeTypeId,
  arrayRuntimeRequirement
} from '../../stdlib/global/collections/compiler/index.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('self-hosted AnyNode fallback reserves generic TypeRef metadata', () => {
  assert.ok(compilerAnyNodeObjectFields.includes('typeRef'))
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'typeRef').length, 1)
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'returnTypeRef').length, 1)
  assert.equal(compilerAnyNodeObjectFields.includes('arrayElementShape'), false)

  const shape = anyNodeObjectShape({ line: 1, column: 1 })
  const returnTypeRef = shape.fields.find((candidate) => candidate.name === 'returnTypeRef')

  assert.equal(returnTypeRef?.valueType, 'object')
  assert.equal(returnTypeRef?.nullable, true)
  assert.equal(shape.fields.some((candidate) => candidate.name === 'arrayElementShape'), false)
  assert.equal(shape.fields.some((candidate) => candidate.name === 'arrayElementDeclaredType'), false)
})

test('AnyNode array metadata resolves through the package TypeRef provider', () => {
  const result = compileSourceToIr(
    `
function size(expression: AnyNode): number {
  const argumentKinds = expression.libraryCArgumentKinds

  if (argumentKinds !== null && typeof argumentKinds !== 'undefined') {
    return argumentKinds.length
  }

  return 0
}
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const size = result.ir.body.find((node) => node.name === 'size')
  const declaration = size?.body?.find((node: AnyNode) => node.name === 'argumentKinds')
  const condition = size?.body?.find((node: AnyNode) => node.type === 'IfStatement')
  const length = condition?.consequent?.body?.[0]?.argument

  assert.equal(declaration?.typeRef?.kind, 'nominal')
  assert.equal(declaration?.typeRef?.typeId, arrayNativeTypeId)
  assert.deepEqual(length?.libraryRuntimeRequirements, [arrayRuntimeRequirement])
})

test('AnyNode import names remain strings in C lowering', () => {
  const result = compileSource(
    `
function namesDiffer(specifier: AnyNode): boolean {
  return specifier.local !== specifier.imported
}
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /get\(specifier, "local"\)/)
  assert.match(result.code, /get\(specifier, "imported"\)/)
  assert.equal((result.code.match(/INOX_TAG_STRING/g) ?? []).length, 2)
  assert.doesNotMatch(result.code, /INOX_TAG_NUMBER/)
})

test('imported object preserves nested AnyNode array element TypeRef', async () => {
  const result = await compileMemoryPackageToCppModules(
    '/project/main.ts',
    [
      {
        path: '/project/types.ts',
        source: `
export type AnyNode = { type?: string; [key: string]: any }
export type ModuleRecord = { imports: array<AnyNode> }
`
      },
      {
        path: '/project/main.ts',
        source: `
import type { ModuleRecord } from './types.ts'

export function namesDiffer(module: ModuleRecord): boolean {
  const item = module.imports[0]
  const specifier = item.specifiers[0]
  return specifier.local !== specifier.imported
}
`
      }
    ],
    {
      callMain: false,
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/project'
    }
  )
  const main = result.files.find((file) => file.path === 'main.cc')

  assert.ok(main)
  assert.ok((main.code.match(/INOX_TAG_STRING/g) ?? []).length >= 2)
  assert.doesNotMatch(main.code, /INOX_TAG_NUMBER/)
})

test('declaration import preserves nested AnyNode array element TypeRef', async () => {
  const provider = await compileMemoryPackageToIrModules(
    '/project/types.ts',
    [
      {
        path: '/project/types.ts',
        source: `
export type AnyNode = { type?: string; [key: string]: any }
export type ObjectShapeInfo = {
  kind: 'object'
  typeParameters?: AnyNode[]
  baseTypes?: string[]
  builtin?: string | null
  dynamic?: boolean
  dynamicField?: AnyNode | null
  fields: AnyNode[]
  functionCompanions?: boolean
  libraryTypeId?: string | null
  libraryCppType?: string | null
  [key: string]: any
}
`
      }
    ],
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const resolvedProgram = provider.graph.modules.find(
    (module) => module.path === '/project/types.ts'
  )?.declarationProgram

  assert.ok(resolvedProgram)

  const metadataProvider = await compileMemoryPackageToIrModules(
    '/project/metadata.ts',
    [
      {
        path: '/project/metadata.ts',
        source: `
import type { ObjectShapeInfo } from './types.ts'
export type Metadata = { shape: ObjectShapeInfo | null }
export function compatibilityMetadata(): Metadata { return { shape: null } }
`
      }
    ],
    {
      declarationImports: [{ sourcePath: '/project/types.ts', resolvedProgram }],
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )
  const metadataProgram = metadataProvider.graph.modules.find(
    (module) => module.path === '/project/metadata.ts'
  )?.declarationProgram

  assert.ok(metadataProgram)

  const result = await compileMemoryPackageToIrModules(
    '/project/main.ts',
    [
      {
        path: '/project/main.ts',
        source: `
import { compatibilityMetadata } from './metadata.ts'

export function firstFieldName(): string {
  const metadata = compatibilityMetadata()
  const fields = metadata.shape?.fields ?? []
  return fields[0].name
}
`
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/types.ts',
          resolvedProgram
        },
        {
          sourcePath: '/project/metadata.ts',
          resolvedProgram: metadataProgram
        }
      ],
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )
  const main = result.graph.modules.find((module) => module.path === '/project/main.ts')

  assert.ok(main?.ir)
})
