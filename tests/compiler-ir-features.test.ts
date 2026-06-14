import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectIrFeatureRequirements,
  collectIrFeatures,
  collectIrRuntimeRequirements,
  collectIrSyntaxFeatureUsages,
  collectRuntimeRequirements,
  collectSyntaxFeatureUsages
} from '../src/compiler/ir/features.ts'
import {
  collectIrFeatureRequirements as collectIrFeatureRequirementsFromFacade,
  collectIrRuntimeRequirements as collectIrRuntimeRequirementsFromFacade,
  collectIrSyntaxFeatureUsages as collectIrSyntaxFeatureUsagesFromFacade,
  lowerHirToIr
} from '../src/compiler/ir.ts'
import type { IrFeature, IrRuntimeRequirement, ProgramNode } from '../src/compiler/types.ts'

test('collects IR features from runtime-shaped nodes', () => {
  const program: ProgramNode = {
    type: 'Program',
    body: [
      {
        type: 'CallExpression',
        callee: { type: 'MemberExpression', object: { type: 'Reference', path: ['JSON'] }, property: 'parse' },
        args: []
      },
      {
        type: 'CallExpression',
        callee: { type: 'Reference', path: ['setTimeout'] },
        args: []
      },
      {
        type: 'ArrayLiteral',
        elements: [{ type: 'NumberLiteral', value: 1 }]
      }
    ]
  }

  assert.deepEqual(collectIrFeatures(program), ['collections', 'json', 'runtime-values', 'timers'])
  assert.deepEqual(lowerHirToIr(program).runtimeRequirements, [
    'async-runtime',
    'callback-values',
    'collections',
    'json',
    'managed-values',
    'objects',
    'string-bytes',
    'timers'
  ])
})

test('maps and aggregates IR runtime requirements', () => {
  assert.deepEqual(collectRuntimeRequirements(['array-pop-null', 'crypto', 'fs', 'number-from-string-null']), [
    'async-runtime',
    'binary',
    'fs',
    'managed-values'
  ])

  const programs: { features: IrFeature[] }[] = [
    { features: ['timers', 'json'] },
    { features: ['json', 'binary'] }
  ]
  const runtimePrograms: { runtimeRequirements: IrRuntimeRequirement[] }[] = [
    { runtimeRequirements: ['timers', 'async-runtime'] },
    { runtimeRequirements: ['binary', 'timers'] }
  ]

  assert.deepEqual(collectIrFeatureRequirements(programs), ['binary', 'json', 'timers'])
  assert.deepEqual(collectIrFeatureRequirementsFromFacade(programs), ['binary', 'json', 'timers'])
  assert.deepEqual(collectIrRuntimeRequirements(runtimePrograms), ['async-runtime', 'binary', 'timers'])
  assert.deepEqual(collectIrRuntimeRequirementsFromFacade(runtimePrograms), ['async-runtime', 'binary', 'timers'])
})

test('collects and aggregates IR syntax feature usages', () => {
  const program: ProgramNode = {
    type: 'Program',
    body: [
      { type: 'ClassDeclaration', name: 'Box', loc: { line: 1, column: 1 } },
      {
        type: 'FunctionDeclaration',
        name: 'load',
        async: true,
        params: [],
        returnType: 'void',
        loc: { line: 2, column: 1 }
      }
    ]
  }
  const usages = collectSyntaxFeatureUsages(program)

  assert.deepEqual(
    usages.map((usage) => usage.feature),
    ['class', 'async-function']
  )
  assert.deepEqual(collectIrSyntaxFeatureUsages([{ syntaxFeatures: usages }]), usages)
  assert.deepEqual(collectIrSyntaxFeatureUsagesFromFacade([{ syntaxFeatures: usages }]), usages)
})
