import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted compiler всегда собирается в Release', async () => {
  const source = await readFile('scripts/build.ts', 'utf8')

  assert.match(source, /'-DCMAKE_BUILD_TYPE=Release'/)
  assert.match(
    source,
    /\['--build', cmakeBuildDir, '--target', 'inox', '--parallel', '--config', 'Release'\]/
  )
})
