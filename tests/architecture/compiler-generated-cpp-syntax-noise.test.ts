import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ не использует C-style syntax для пустых parameters и числовых casts', () => {
  const result = compileSource(
    `
      function run(): void {
        const values = [1]
        let count = 0
        count++
        ++count
        console.log(values.length)
      }

      run()
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /void run\(\)/)
  assert.match(result.code, /static void inox_main\(\)/)
  assert.match(result.code, /int main\(\)/)
  assert.doesNotMatch(result.code, /\b(?:run|inox_main|main)\(void\)/)
  assert.doesNotMatch(result.code, /\(\(double\)/)
  assert.doesNotMatch(result.code, /inox_update_previous_/)
  assert.match(result.code, /\n\s+\+\+count;/)
})
