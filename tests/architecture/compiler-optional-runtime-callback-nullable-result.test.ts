import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('optional runtime callback допускает null в nullable результате', () => {
  const result = compileSource(
    `
      type Environment = {
        read?: (path: string) => string | null
        write: (path: string, source: string) => void
      }

      export function writeFileIfChanged(path: string, source: string, environment: Environment): void {
        if (environment.read?.(path) === source) {
          return
        }

        environment.write(path, source)
      }
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox_callback_call\(inox_optional_callback_\d+/)
  assert.match(result.code, /inox_optional_call_\d+\.tag != INOX_TAG_UNDEFINED/)
  assert.match(result.code, /inox_optional_call_\d+\.tag != INOX_TAG_NULL/)
  assert.doesNotMatch(result.code, /if \(inox_optional_call_\d+\.tag != INOX_TAG_STRING/)
})
