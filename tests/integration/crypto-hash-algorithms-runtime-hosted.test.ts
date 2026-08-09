import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoHashAlgorithmsRuntime } from '../helpers/crypto-hash-algorithms-runtime.ts'

export async function assertHostedCryptoHashAlgorithmsRuntime(): Promise<void> {
  await assertCryptoHashAlgorithmsRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoHashAlgorithmsRuntime()
}
