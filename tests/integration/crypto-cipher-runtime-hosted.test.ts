import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoCipherRuntime } from '../helpers/crypto-cipher-runtime.ts'

export async function assertHostedCryptoCipherRuntime(): Promise<void> {
  await assertCryptoCipherRuntime({
    args: [join(rootDir, 'compiler/index.ts')],
    command: process.execPath,
    label: 'hosted'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertHostedCryptoCipherRuntime()
}
