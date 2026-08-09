import { fileURLToPath } from 'node:url'

import { assertMongoBsonRuntime } from '../helpers/mongodb-bson-runtime.ts'

export async function assertHostedMongoBsonRuntime(): Promise<void> {
  await assertMongoBsonRuntime({
    args: ['compiler/index.ts'],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedMongoBsonRuntime()
}
