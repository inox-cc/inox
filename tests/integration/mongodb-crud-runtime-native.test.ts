import { fileURLToPath } from 'node:url'

import { assertMongoCrudRuntime } from '../helpers/mongodb-crud-runtime.ts'

export async function assertNativeMongoCrudRuntime(compilerPath: string): Promise<void> {
  await assertMongoCrudRuntime({
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

  await assertNativeMongoCrudRuntime(compilerPath)
}
