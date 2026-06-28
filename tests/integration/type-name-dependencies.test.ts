import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeTypeName, typeNameDependencyNames, weakTypeNameFromTypeName } from '../../compiler/type-names.ts'

test('type name helpers normalize names and collect alias dependencies', () => {
  assert.equal(normalizeTypeName('Record<string, ExternalUser | null>'), 'record<string,nullable<ExternalUser>>')
  assert.equal(normalizeTypeName('weak<Parent | null>'), 'weak<nullable<Parent>>')
  assert.equal(weakTypeNameFromTypeName('weak<nullable<Parent>>'), 'nullable<Parent>')
  assert.deepEqual(
    typeNameDependencyNames(
      'record<string,ExternalUser>|nullable<Result>|weak<Owner>|object|union<string,number>|Map<string,Project>'
    ),
    ['ExternalUser', 'Result', 'Owner', 'Project']
  )
})
