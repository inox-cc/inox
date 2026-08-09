import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoRsaEncryptionRuntime } from '../helpers/crypto-rsa-encryption-runtime.ts'

export async function assertHostedCryptoRsaEncryptionRuntime(): Promise<void> {
  await assertCryptoRsaEncryptionRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoRsaEncryptionRuntime()
}
