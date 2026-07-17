import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compactDeclarationEffectModule } from '../../scripts/lib/declaration-effect-compaction.ts'

test('self-host declaration effect pass discards recursive type metadata', () => {
  const module = {
    ast: { type: 'Program', body: [{ type: 'FunctionDeclaration', typeRef: { kind: 'unknown' } }] },
    declarationProgram: { type: 'Program', body: [{ type: 'FunctionDeclaration' }] },
    hir: { type: 'Program', body: [{ type: 'FunctionDeclaration', shape: { kind: 'object', fields: [] } }] },
    ir: {
      type: 'IrProgram',
      body: [
        {
          type: 'FunctionDeclaration',
          name: 'compile',
          body: [{ type: 'ThrowStatement', valueType: 'string', typeRef: { kind: 'primitive', name: 'string' } }],
          params: [{ name: 'value', shape: { kind: 'object', fields: [{ name: 'nested', valueType: 'array' }] } }],
          returnShape: { kind: 'object', fields: [] },
          returnTypeRef: { kind: 'unknown' }
        }
      ],
      features: ['collections'],
      functionEffects: [],
      runtimeRequirements: ['global:collections'],
      topLevelItems: [{ kind: 'function', index: 0 }]
    },
    imports: [],
    path: '/project/compiler/compiler.ts',
    reexports: [],
    source: 'export function compile() {}'
  }

  compactDeclarationEffectModule(module)

  assert.deepEqual(module, {
    declarationProgram: null,
    ir: {
      type: 'IrProgram',
      body: [
        {
          type: 'FunctionDeclaration',
          name: 'compile',
          body: [{ type: 'ThrowStatement', valueType: 'string' }]
        }
      ],
      functionEffects: [],
      topLevelItems: [{ kind: 'function', index: 0 }]
    },
    imports: [],
    path: '/project/compiler/compiler.ts',
    reexports: []
  })
})
