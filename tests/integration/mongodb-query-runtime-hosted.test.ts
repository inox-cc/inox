import { fileURLToPath } from 'node:url'

import { assertMongoQueryRuntime } from '../helpers/mongodb-query-runtime.ts'

export async function assertHostedMongoQueryRuntime(): Promise<void> {
  await assertMongoQueryRuntime({
    args: ['compiler/index.ts'],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedMongoQueryRuntime()
}
