import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoEncodingRuntime } from '../helpers/crypto-encoding-runtime.ts'

export async function assertHostedCryptoEncodingRuntime(): Promise<void> {
  await assertCryptoEncodingRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoEncodingRuntime()
}
