import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { quietCMakeConfigureArgs } from '../../scripts/lib/cmake-args.ts'

export function assertBuildCMakeConfigureIsQuiet(): void {
  const args = quietCMakeConfigureArgs(['-S', 'source', '-B', 'build'])

  assert.equal(args[0], '--log-level=WARNING')
  assert.deepEqual(args.slice(1), ['-S', 'source', '-B', 'build'])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertBuildCMakeConfigureIsQuiet()
}
