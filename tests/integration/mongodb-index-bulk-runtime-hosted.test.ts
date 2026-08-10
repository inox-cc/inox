import { fileURLToPath } from 'node:url'

import { assertMongoIndexBulkRuntime } from '../helpers/mongodb-index-bulk-runtime.ts'

export async function assertHostedMongoIndexBulkRuntime(): Promise<void> {
  await assertMongoIndexBulkRuntime({
    args: ['compiler/index.ts'],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedMongoIndexBulkRuntime()
}
