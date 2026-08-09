import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_KEY_LIFECYCLE '

const source = `import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'

const rsaPair = generateKeyPairSync('rsa', { modulusLength: 1024 })
const rsaPublicKey = rsaPair.publicKey
const rsaPrivateKey = rsaPair.privateKey
const rsaPublicPem = rsaPublicKey.export({ format: 'pem', type: 'spki' })
const rsaPrivatePem = rsaPrivateKey.export({ format: 'pem', type: 'pkcs8' })
const rsaSignature = sign('sha256', 'generated rsa', rsaPrivateKey)
console.log(
  '${resultPrefix}rsa',
  rsaPublicKey.type,
  rsaPrivateKey.type,
  rsaPublicPem.startsWith('-----BEGIN PUBLIC KEY-----'),
  rsaPrivatePem.startsWith('-----BEGIN PRIVATE KEY-----'),
  verify('sha256', 'generated rsa', createPublicKey(rsaPublicPem), rsaSignature),
  createPrivateKey(rsaPrivatePem).asymmetricKeyType
)

const ecPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const ecPublicPem = ecPair.publicKey.export({ format: 'pem', type: 'spki' })
const ecPrivatePem = ecPair.privateKey.export({ format: 'pem', type: 'pkcs8' })
const ecSignature = sign('sha384', 'generated ec', ecPair.privateKey)
console.log(
  '${resultPrefix}ec',
  ecPair.publicKey.asymmetricKeyType,
  ecPublicPem.startsWith('-----BEGIN PUBLIC KEY-----'),
  ecPrivatePem.startsWith('-----BEGIN PRIVATE KEY-----'),
  verify('sha384', 'generated ec', createPublicKey(ecPublicPem), ecSignature)
)

let rejected = 0
try { rsaPublicKey.export({ format: 'pem', type: 'pkcs8' }) } catch { rejected = rejected + 1 }
try { generateKeyPairSync('ec', { namedCurve: 'unknown-curve' }) } catch { rejected = rejected + 1 }
console.log('${resultPrefix}rejected', rejected)
`

export async function assertCryptoKeyLifecycleRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'key-lifecycle', source, resultPrefix, [
    `${resultPrefix}rsa public private 1 1 1 rsa`,
    `${resultPrefix}ec ec 1 1 1`,
    `${resultPrefix}rejected 2`
  ])
}
