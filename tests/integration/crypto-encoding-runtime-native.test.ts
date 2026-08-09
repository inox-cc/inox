import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoEncodingRuntime } from '../helpers/crypto-encoding-runtime.ts'

export async function assertNativeCryptoEncodingRuntime(compilerPath: string): Promise<void> {
  await assertCryptoEncodingRuntime({
    args: [],
    command: compilerPath,
    label: 'native'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeCryptoEncodingRuntime(join(rootDir, 'dist/inox'))
}
