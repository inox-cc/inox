import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoCipherRuntime } from '../helpers/crypto-cipher-runtime.ts'

export async function assertNativeCryptoCipherRuntime(compilerPath: string): Promise<void> {
  await assertCryptoCipherRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoCipherRuntime(join(rootDir, 'dist/inox'))
}
