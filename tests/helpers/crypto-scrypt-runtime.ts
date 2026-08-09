import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_SCRYPT '
const defaultResult = '745731af4484f323968969eda289aeee005b5903ac561e64a5aca121797bf773'
const customResult = '45133c3dfba48c82235df51a5349924110eee893752f0d4168d2e2aee5722d82'

const source = `import { Buffer } from 'node:buffer'
import { scryptSync } from 'node:crypto'

const options = { N: 16, r: 1, p: 1, maxmem: 4096 }

console.log('${resultPrefix}default', scryptSync('password', 'salt', 32).toString('hex'))
console.log(
  '${resultPrefix}options',
  scryptSync(Buffer.from('password'), Buffer.from('salt'), 32, options).toString('hex'),
  scryptSync('password', 'salt', 32, {
    cost: 16,
    blockSize: 1,
    parallelization: 1,
    maxmem: 4096
  }).toString('hex'),
  scryptSync('password', 'salt', 0, options).length
)

let rejected = 0

try { scryptSync('password', 'salt', -1, options) } catch { rejected = rejected + 1 }
try { scryptSync('password', 'salt', 32, { N: 3 }) } catch { rejected = rejected + 1 }
try { scryptSync('password', 'salt', 32, { N: 16, cost: 16 }) } catch { rejected = rejected + 1 }
try { scryptSync('password', 'salt', 32, { N: 1024, r: 8, p: 1, maxmem: 1024 }) } catch { rejected = rejected + 1 }

console.log('${resultPrefix}rejected', rejected)
`

export async function assertCryptoScryptRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'scrypt', source, resultPrefix, [
    `${resultPrefix}default ${defaultResult}`,
    `${resultPrefix}options ${customResult} ${customResult} 0`,
    `${resultPrefix}rejected 4`
  ])
}
