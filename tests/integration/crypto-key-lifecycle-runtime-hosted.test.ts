import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoKeyLifecycleRuntime } from '../helpers/crypto-key-lifecycle-runtime.ts'

export async function assertHostedCryptoKeyLifecycleRuntime(): Promise<void> {
  await assertCryptoKeyLifecycleRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoKeyLifecycleRuntime()
}
