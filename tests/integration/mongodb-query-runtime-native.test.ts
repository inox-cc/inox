import { fileURLToPath } from 'node:url'

import { assertMongoQueryRuntime } from '../helpers/mongodb-query-runtime.ts'

export async function assertNativeMongoQueryRuntime(compilerPath: string): Promise<void> {
  await assertMongoQueryRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const compilerPath = process.argv[2]

  if (compilerPath === null || typeof compilerPath === 'undefined') {
    throw new Error('compiler path is required')
  }

  await assertNativeMongoQueryRuntime(compilerPath)
}
