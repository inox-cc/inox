import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../../../../scripts/lib/repo-root.ts'
import { runCommand } from '../../../../../scripts/lib/run-command.ts'
import type { LibraryIntegrationCompiler } from '../../../../../tests/helpers/library-integration-tests.ts'

export type MongoBsonRuntimeCompiler = {
  args: string[]
  command: string
  label: string
}

export function mongoRuntimeCompiler(compiler: LibraryIntegrationCompiler): MongoBsonRuntimeCompiler {
  if (compiler.kind === 'hosted') {
    return {
      args: ['compiler/index.ts'],
      command: process.execPath,
      label: 'hosted'
    }
  }

  return {
    args: [],
    command: compiler.path,
    label: 'native'
  }
}

const resultPrefix = 'INOX_MONGODB_BSON '
const source = `import { BSON, ObjectId } from 'mongodb'

const id = new ObjectId('507f1f77bcf86cd799439011')
const derived = ObjectId.createFromTime(1)
const encoded = BSON.serialize({
  id,
  name: 'inox',
  count: 3,
  enabled: true,
  tags: ['a', 'b'],
  nested: { value: 'yes' },
  data: new Uint8Array([1, 2, 3]),
  createdAt: new Date(1234),
  empty: null
})
const decoded = BSON.deserialize(encoded)
const reencoded = BSON.serialize(decoded)
let equal = encoded.length === reencoded.length

for (let index = 0; index < encoded.length; index = index + 1) {
  if (encoded[index] !== reencoded[index]) equal = false
}

console.log('${resultPrefix}object-id', id.toString(), id.equals('507f1f77bcf86cd799439011'), ObjectId.isValid(id), ObjectId.isValid('bad'))
console.log('${resultPrefix}time', derived.toString())
console.log('${resultPrefix}round-trip', equal, decoded.name, decoded.count)
`

export async function assertMongoBsonRuntime(compiler: MongoBsonRuntimeCompiler): Promise<void> {
  const workspace = join(rootDir, `dist/test-tmp/mongodb-bson-runtime-${compiler.label}`)
  const input = join(workspace, 'index.ts')
  const output = join(workspace, 'output')

  try {
    await rm(workspace, { recursive: true, force: true })
    await mkdir(workspace, { recursive: true })
    await writeFile(input, source)

    const result = await runCommand(compiler.command, [
      ...compiler.args,
      'run',
      input,
      '--out-dir',
      output,
      '--name',
      'mongodb-bson-runtime'
    ])

    assert.equal(
      result.code,
      0,
      `${compiler.label} mongodb BSON runtime failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    )
    assert.equal(result.stderr, '')

    const lines = result.stdout.split('\n').filter((line) => line.startsWith(resultPrefix))

    assert.deepEqual(lines, [
      `${resultPrefix}object-id 507f1f77bcf86cd799439011 1 1 0`,
      `${resultPrefix}time 000000010000000000000000`,
      `${resultPrefix}round-trip 1 inox 3`
    ])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
