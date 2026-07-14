import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

type FingerprintFixtureOptions = {
  defaultValue?: 'safe' | 'fast'
  fastExpression?: string
  conditionalCapability?: string
}

export function compilerLibraryFingerprintFixture(
  options: FingerprintFixtureOptions = {}
): CompilerLibraryDescriptor {
  const libraryId = 'global:fingerprint-fixture'
  const optionId = `${libraryId}#mode`

  return {
    id: libraryId,
    dependencies: [],
    declarations: [],
    options: [
      {
        libraryId,
        optionId,
        cliAliases: ['--fingerprint-fixture-mode'],
        valueType: 'string',
        defaultValue: options.defaultValue ?? 'safe',
        allowedValues: ['safe', 'fast']
      }
    ],
    runtimeInitializers: [
      {
        libraryId,
        initializerId: `${libraryId}#runtime`,
        runtimeRequirement: libraryId,
        cType: 'FingerprintRuntime',
        cName: 'fingerprintRuntime',
        arguments: [
          {
            optionId,
            source: 'value',
            cValueKind: 'mapped',
            cValueMap: [
              { value: 'safe', cExpression: 'FingerprintMode::Safe' },
              { value: 'fast', cExpression: options.fastExpression ?? 'FingerprintMode::Fast' }
            ]
          }
        ]
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: libraryId,
        dependencies: [],
        cPreludeIncludes: ['fingerprint-fixture.h'],
        capabilities: [],
        conditionalCapabilities: [
          {
            capability: options.conditionalCapability ?? 'entropy',
            conditions: [{ optionId, source: 'value', values: ['fast'] }]
          }
        ]
      }
    ]
  }
}
