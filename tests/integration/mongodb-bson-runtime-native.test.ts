import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertMongoBsonRuntime } from '../helpers/mongodb-bson-runtime.ts'

export async function assertNativeMongoBsonRuntime(compilerPath: string): Promise<void> {
  await assertMongoBsonRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeMongoBsonRuntime(join(rootDir, 'dist/inox'))
}
