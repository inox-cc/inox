import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoKdfRuntime } from '../helpers/crypto-kdf-runtime.ts'

export async function assertNativeCryptoKdfRuntime(compilerPath: string): Promise<void> {
  await assertCryptoKdfRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoKdfRuntime(join(rootDir, 'dist/inox'))
}
