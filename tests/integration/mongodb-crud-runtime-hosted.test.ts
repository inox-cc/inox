import { fileURLToPath } from 'node:url'

import { assertMongoCrudRuntime } from '../helpers/mongodb-crud-runtime.ts'

export async function assertHostedMongoCrudRuntime(): Promise<void> {
  await assertMongoCrudRuntime({
    args: ['compiler/index.ts'],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedMongoCrudRuntime()
}
