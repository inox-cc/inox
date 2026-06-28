import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeTypeName, typeNameDependencyNames } from '../../compiler/type-names.ts'

test('type name helpers normalize names and collect alias dependencies', () => {
  assert.equal(normalizeTypeName('Record<string, ExternalUser | null>'), 'record<string,nullable<ExternalUser>>')
  assert.deepEqual(
    typeNameDependencyNames('record<string,ExternalUser>|nullable<Result>|object|union<string,number>|Map<string,Project>'),
    ['ExternalUser', 'Result', 'Project']
  )
})
