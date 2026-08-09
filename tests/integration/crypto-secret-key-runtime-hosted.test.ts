import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoSecretKeyRuntime } from '../helpers/crypto-secret-key-runtime.ts'

export async function assertHostedCryptoSecretKeyRuntime(): Promise<void> {
  await assertCryptoSecretKeyRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoSecretKeyRuntime()
}
