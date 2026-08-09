import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoHashAlgorithmsRuntime } from '../helpers/crypto-hash-algorithms-runtime.ts'

export async function assertNativeCryptoHashAlgorithmsRuntime(compilerPath: string): Promise<void> {
  await assertCryptoHashAlgorithmsRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoHashAlgorithmsRuntime(join(rootDir, 'dist/inox'))
}
