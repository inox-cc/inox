import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoSignatureRuntime } from '../helpers/crypto-signature-runtime.ts'

export async function assertNativeCryptoSignatureRuntime(compilerPath: string): Promise<void> {
  await assertCryptoSignatureRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoSignatureRuntime(join(rootDir, 'dist/inox'))
}
