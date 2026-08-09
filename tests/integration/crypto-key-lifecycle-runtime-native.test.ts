import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoKeyLifecycleRuntime } from '../helpers/crypto-key-lifecycle-runtime.ts'

export async function assertNativeCryptoKeyLifecycleRuntime(compilerPath: string): Promise<void> {
  await assertCryptoKeyLifecycleRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoKeyLifecycleRuntime(join(rootDir, 'dist/inox'))
}
