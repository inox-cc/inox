import { fileURLToPath } from 'node:url'

import { assertMongoServerEntryRuntime } from '../helpers/mongodb-server-entry-runtime.ts'

export async function assertHostedMongoServerEntryRuntime(): Promise<void> {
  await assertMongoServerEntryRuntime({
    args: ['compiler/index.ts'],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedMongoServerEntryRuntime()
}
