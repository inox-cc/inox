import { createPublicKey as createNodePublicKey, generateKeyPairSync as generateNodeKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_SIGNATURE '

export async function assertCryptoSignatureRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  const privatePem = await readFile(join(rootDir, 'tests/network/fixtures/https-key.pem'), 'utf8')
  const publicPem = createNodePublicKey(privatePem).export({ format: 'pem', type: 'spki' }).toString()
  const { privateKey: ecPrivateKey, publicKey: ecPublicKey } = generateNodeKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  })
  const ecPrivatePem = ecPrivateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const ecPublicPem = ecPublicKey.export({ format: 'pem', type: 'spki' }).toString()
  const source = `import { Buffer } from 'node:buffer'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'

const privatePem = Buffer.from(${JSON.stringify(privatePem)})
const publicPem = Buffer.from(${JSON.stringify(publicPem)})
const privateKey = createPrivateKey(privatePem)
const publicKey = createPublicKey(privateKey)
const importedPublicKey = createPublicKey(publicPem)
const signature = sign('sha256', 'payload', privateKey)

console.log(
  '${resultPrefix}key',
  privateKey.type,
  privateKey.asymmetricKeyType,
  publicKey.type,
  publicKey.asymmetricKeyType,
  importedPublicKey.type
)
console.log(
  '${resultPrefix}verify',
  verify('sha256', 'payload', publicKey, signature),
  verify('sha256', 'payload', importedPublicKey, signature),
  verify('sha256', 'tampered', publicKey, signature)
)

const bytes = Buffer.from('binary payload')
const directSignature = sign('sha384', bytes, ${JSON.stringify(privatePem)})
console.log(
  '${resultPrefix}direct',
  verify('sha384', bytes, ${JSON.stringify(publicPem)}, directSignature),
  directSignature.length > 0
)

const ecPrivateKey = createPrivateKey(${JSON.stringify(ecPrivatePem)})
const ecPublicKey = createPublicKey(${JSON.stringify(ecPublicPem)})
const ecSignature = sign('sha512', 'ec payload', ecPrivateKey)
console.log(
  '${resultPrefix}ec',
  ecPrivateKey.asymmetricKeyType,
  ecPublicKey.asymmetricKeyType,
  verify('sha512', 'ec payload', ecPublicKey, ecSignature)
)

let rejected = 0
try { createPrivateKey('not a key') } catch { rejected = rejected + 1 }
try { sign('sha256', 'payload', publicKey) } catch { rejected = rejected + 1 }
console.log('${resultPrefix}rejected', rejected)
`

  await assertCryptoRuntime(compiler, 'signature', source, resultPrefix, [
    `${resultPrefix}key private rsa public rsa public`,
    `${resultPrefix}verify 1 1 0`,
    `${resultPrefix}direct 1 1`,
    `${resultPrefix}ec ec ec 1`,
    `${resultPrefix}rejected 2`
  ])
}
