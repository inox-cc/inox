import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_KDF '
const pbkdf2Results = [
  'ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957cae93136266537a8d7bf4b76',
  '93200ffa96c5776d38fa10abdf8f5bfc0054b9718513df472d2331d2d1e66a3f',
  'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
  '54f775c6d790f21930459162fc535dbf04a939185127016a04176a0730c6f1f4',
  'e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53c'
]
const hkdfResults = [
  'a0bc90fe7a3fef57087f96ceeaccea0241f6e00a3fe35a789ced78dfbc7c95f5',
  '0ff75af37d8684eb5b7a470cd4dedabd33995a58af80d43175f5ce7bf4a15587',
  '9ca0d662557439e3b83365f2da4626d35da195c6d9d1779f09838cf9e408966e',
  '415163ccceef9d7e2325f45cf2c21989d3a3eb6078e7e48dc8ba6b35c8b75db9',
  '24156e2c35525baaf3d0fbb92b734c8032a110a3f12e2596e441e1924870d84c'
]

const source = `import { Buffer } from 'node:buffer'
import { hkdfSync, pbkdf2Sync } from 'node:crypto'

console.log(
  '${resultPrefix}pbkdf2',
  pbkdf2Sync('password', 'salt', 2, 32, 'sha1').toString('hex'),
  pbkdf2Sync(Buffer.from('password'), 'salt', 2, 32, 'sha224').toString('hex'),
  pbkdf2Sync('password', Buffer.from('salt'), 2, 32, 'sha256').toString('hex'),
  pbkdf2Sync('password', 'salt', 2, 32, 'sha384').toString('hex'),
  pbkdf2Sync('password', 'salt', 2, 32, 'sha512').toString('hex')
)
console.log(
  '${resultPrefix}hkdf',
  hkdfSync('sha1', 'key', 'salt', 'info', 32).toString('hex'),
  hkdfSync('sha224', 'key', 'salt', 'info', 32).toString('hex'),
  hkdfSync('sha256', Buffer.from('key'), 'salt', 'info', 32).toString('hex'),
  hkdfSync('sha384', 'key', Buffer.from('salt'), 'info', 32).toString('hex'),
  hkdfSync('sha512', 'key', 'salt', Buffer.from('info'), 32).toString('hex')
)

let rejected = 0

try { pbkdf2Sync('password', 'salt', 0, 32, 'sha256') } catch { rejected = rejected + 1 }
try { pbkdf2Sync('password', 'salt', 2, 0, 'sha256') } catch { rejected = rejected + 1 }
try { hkdfSync('sha1', 'key', 'salt', 'info', 5101) } catch { rejected = rejected + 1 }
try { hkdfSync('sha256', 'key', 'salt', Buffer.alloc(1025), 32) } catch { rejected = rejected + 1 }

console.log('${resultPrefix}rejected', rejected)
`

export async function assertCryptoKdfRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'kdf', source, resultPrefix, [
    `${resultPrefix}pbkdf2 ${pbkdf2Results.join(' ')}`,
    `${resultPrefix}hkdf ${hkdfResults.join(' ')}`,
    `${resultPrefix}rejected 4`
  ])
}
