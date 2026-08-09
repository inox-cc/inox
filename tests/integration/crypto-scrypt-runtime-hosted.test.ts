import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoScryptRuntime } from '../helpers/crypto-scrypt-runtime.ts'

export async function assertHostedCryptoScryptRuntime(): Promise<void> {
  await assertCryptoScryptRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoScryptRuntime()
}
