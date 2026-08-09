import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoKdfRuntime } from '../helpers/crypto-kdf-runtime.ts'

export async function assertHostedCryptoKdfRuntime(): Promise<void> {
  await assertCryptoKdfRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoKdfRuntime()
}
