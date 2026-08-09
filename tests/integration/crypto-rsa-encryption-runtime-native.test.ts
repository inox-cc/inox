import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoRsaEncryptionRuntime } from '../helpers/crypto-rsa-encryption-runtime.ts'

export async function assertNativeCryptoRsaEncryptionRuntime(compilerPath: string): Promise<void> {
  await assertCryptoRsaEncryptionRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoRsaEncryptionRuntime(join(rootDir, 'dist/inox'))
}
