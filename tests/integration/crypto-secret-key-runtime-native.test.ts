import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoSecretKeyRuntime } from '../helpers/crypto-secret-key-runtime.ts'

export async function assertNativeCryptoSecretKeyRuntime(compilerPath: string): Promise<void> {
  await assertCryptoSecretKeyRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoSecretKeyRuntime(join(rootDir, 'dist/inox'))
}
