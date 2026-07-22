import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  compilerLibraryOperationForGlobal,
  compilerLibraryOperationForReceiver
} from '../../compiler/extensions/library-set.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'

test('global operations resolve from package-owned binding paths', () => {
  const root = operation('global:host', 'member-read')
  const nested = operation('global:host.release.name', 'member-read')
  const alias = {
    ...operation('global:internal.refresh', 'call'),
    bindingAliases: ['global:host.refresh']
  }
  const libraries = librarySet([root, nested, alias])

  assert.equal(compilerLibraryOperationForGlobal(libraries, ['host'], 'member-read'), root)
  assert.equal(
    compilerLibraryOperationForGlobal(libraries, ['host', 'release', 'name'], 'member-read'),
    nested
  )
  assert.equal(compilerLibraryOperationForGlobal(libraries, ['host', 'refresh'], 'call'), alias)
  assert.equal(compilerLibraryOperationForGlobal(libraries, [], 'member-read'), null)
  assert.equal(compilerLibraryOperationForGlobal(libraries, ['host'], 'call'), null)
  assert.equal(compilerLibraryOperationForGlobal(libraries, ['missing'], 'member-read'), null)
})

test('receiver operations prefer exact bindings and fall back to wildcard bindings', () => {
  const wildcard = {
    ...operation('platform:record.*', 'member-read'),
    receiverTypeId: 'platform:record'
  }
  const exact = {
    ...operation('platform:record.size', 'member-read'),
    receiverTypeId: 'platform:record'
  }
  const libraries = librarySet([wildcard, exact])

  assert.equal(
    compilerLibraryOperationForReceiver(libraries, 'platform:record', 'size', 'member-read'),
    exact
  )
  assert.equal(
    compilerLibraryOperationForReceiver(libraries, 'platform:record', 'dynamicName', 'member-read'),
    wildcard
  )
  assert.equal(
    compilerLibraryOperationForReceiver(libraries, 'platform:record', 'dynamicName', 'member-write'),
    null
  )
})

test('library fingerprint covers recursive result and entrypoint adapter metadata', () => {
  const baseline = createCompilerLibrarySet([fingerprintLibrary()]).fingerprint
  const changedNestedType = createCompilerLibrarySet([
    fingerprintLibrary({ nestedResultTypeId: 'platform:nested:changed' })
  ]).fingerprint
  const changedNestedCppType = createCompilerLibrarySet([
    fingerprintLibrary({ nestedCppType: 'inox::ChangedNested' })
  ]).fingerprint
  const changedNestedField = createCompilerLibrarySet([
    fingerprintLibrary({ nestedFieldName: 'changedName' })
  ]).fingerprint
  const changedGenericResult = createCompilerLibrarySet([
    fingerprintLibrary({ genericResultType: 'number' })
  ]).fingerprint
  const changedCallContract = createCompilerLibrarySet([
    fingerprintLibrary({ assignmentCall: true })
  ]).fingerprint
  const changedEntrypoint = createCompilerLibrarySet([
    fingerprintLibrary({ acceptsEntryPath: false })
  ]).fingerprint

  assert.notEqual(changedNestedType, baseline)
  assert.notEqual(changedNestedCppType, baseline)
  assert.notEqual(changedNestedField, baseline)
  assert.notEqual(changedGenericResult, baseline)
  assert.notEqual(changedCallContract, baseline)
  assert.notEqual(changedEntrypoint, baseline)
})

type FingerprintLibraryOptions = {
  nestedResultTypeId?: string
  nestedCppType?: string
  nestedFieldName?: string
  genericResultType?: 'number' | 'string'
  assignmentCall?: boolean
  acceptsEntryPath?: boolean
}

function fingerprintLibrary(options: FingerprintLibraryOptions = {}): CompilerLibraryDescriptor {
  const nestedTypeId = options.nestedResultTypeId ?? 'platform:nested'
  const nestedCppType = options.nestedCppType ?? 'inox::Nested'

  return {
    id: 'platform:host',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'platform:host',
        typeId: nestedTypeId,
        declarationNames: ['Nested'],
        valueType: 'object',
        cppType: nestedCppType,
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [
          {
            name: options.nestedFieldName ?? 'name',
            valueType: 'string',
            readonly: true
          }
        ]
      }
    ],
    operations: [
      {
        ...operation('global:host.values', 'call'),
        cArgumentKinds: options.assignmentCall === true
          ? ['receiver', 'optional-argument']
          : ['member-name-string-view', 'optional-argument'],
        cCallStyle: options.assignmentCall === true ? 'member-assignment' : 'index',
        resultTypeRef: {
          kind: 'object',
          fields: [
            {
              name: 'release',
              typeRef: {
                kind: 'nominal',
                typeId: nestedTypeId,
                args: [],
                nullable: false,
                ownership: 'value',
                traits: []
              },
              readonly: true
            }
          ],
          nullable: false,
          ownership: 'value',
          traits: []
        },
        cResultMapping: {
          cppType: 'inox::Value',
          fields: [{ name: 'release', cMember: 'release', cppType: nestedCppType }]
        }
      },
      {
        ...operation('global:host.generic', 'call'),
        resultTypeRef: primitiveTypeRef(options.genericResultType ?? 'string')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'platform:host-runtime',
        dependencies: [],
        cPreludeIncludes: ['inox/host.h'],
        capabilities: [],
        cEntrypointAdapter: {
          cFunction: 'inox::host_main',
          acceptsEntryPath: options.acceptsEntryPath ?? true
        }
      }
    ]
  }
}

function primitiveTypeRef(name: 'number' | 'string'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function operation(bindingId: string, kind: LibraryOperationDescriptor['kind']): LibraryOperationDescriptor {
  return {
    libraryId: 'platform:host',
    bindingId,
    operationId: `platform:host#${bindingId}:${kind}`,
    kind,
    runtimeRequirements: []
  }
}

function librarySet(operations: LibraryOperationDescriptor[]): CompilerLibrarySet {
  return {
    fingerprint: 'test',
    declarations: [],
    nativeTypes: [],
    operations,
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
