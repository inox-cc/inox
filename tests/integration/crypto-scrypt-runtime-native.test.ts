import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoScryptRuntime } from '../helpers/crypto-scrypt-runtime.ts'

export async function assertNativeCryptoScryptRuntime(compilerPath: string): Promise<void> {
  await assertCryptoScryptRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoScryptRuntime(join(rootDir, 'dist/inox'))
}
