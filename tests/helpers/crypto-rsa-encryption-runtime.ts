import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_RSA_ENCRYPTION '

const source = `import { Buffer } from 'node:buffer'
import { generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto'

const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })
const encrypted = publicEncrypt(pair.publicKey, Buffer.from('secret'))
const decrypted = privateDecrypt(pair.privateKey, encrypted)
console.log('${resultPrefix}key-object', decrypted.toString(), encrypted.length > 0)
const emptyEncrypted = publicEncrypt(pair.publicKey, Buffer.alloc(0))
console.log('${resultPrefix}empty', privateDecrypt(pair.privateKey, emptyEncrypted).length)

const publicPem = pair.publicKey.export({ format: 'pem', type: 'spki' })
const privatePem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' })
const pemEncrypted = publicEncrypt(publicPem, Buffer.from('pem'))
console.log('${resultPrefix}pem', privateDecrypt(privatePem, pemEncrypted).toString())

let rejected = 0
try { publicEncrypt(pair.publicKey, Buffer.alloc(100)) } catch { rejected = rejected + 1 }
try { privateDecrypt(pair.publicKey, encrypted) } catch { rejected = rejected + 1 }
const ecPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
try { publicEncrypt(ecPair.publicKey, Buffer.from('ec')) } catch { rejected = rejected + 1 }
try { privateDecrypt(pair.privateKey, Buffer.alloc(encrypted.length)) } catch { rejected = rejected + 1 }
console.log('${resultPrefix}rejected', rejected)
`

export async function assertCryptoRsaEncryptionRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'rsa-encryption', source, resultPrefix, [
    `${resultPrefix}key-object secret 1`,
    `${resultPrefix}empty 0`,
    `${resultPrefix}pem pem`,
    `${resultPrefix}rejected 4`
  ])
}
