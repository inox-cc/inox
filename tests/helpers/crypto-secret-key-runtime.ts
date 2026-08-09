import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_SECRET_KEY '

const source = `import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHmac, createSecretKey } from 'node:crypto'

const key = createSecretKey('00112233445566778899aabbccddeeff', 'hex')
const exported = key.export()
console.log(
  '${resultPrefix}metadata',
  key.type,
  key.symmetricKeySize,
  key.asymmetricKeyType === undefined,
  exported.toString('hex')
)

const raw = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
const directHmac = createHmac('sha256', raw).update('payload').digest('hex')
const objectHmac = createHmac('sha256', key).update('payload').digest('hex')
console.log('${resultPrefix}hmac', directHmac === objectHmac)

const iv = Buffer.from('0102030405060708090a0b0c', 'hex')
const cipher = createCipheriv('aes-128-gcm', key, iv)
const encrypted = cipher.update('secret')
const tag = cipher.final()
const authTag = cipher.getAuthTag()
const decipher = createDecipheriv('aes-128-gcm', key, iv)
decipher.setAuthTag(authTag)
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.update(tag), decipher.final()])
console.log('${resultPrefix}cipher', decrypted.toString())

const empty = createSecretKey(Buffer.alloc(0))
console.log('${resultPrefix}empty', empty.symmetricKeySize, empty.export().length)
`

export async function assertCryptoSecretKeyRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'secret-key', source, resultPrefix, [
    `${resultPrefix}metadata secret 16 1 00112233445566778899aabbccddeeff`,
    `${resultPrefix}hmac 1`,
    `${resultPrefix}cipher secret`,
    `${resultPrefix}empty 0 0`
  ])
}
