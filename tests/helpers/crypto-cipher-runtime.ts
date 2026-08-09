import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_CIPHER '
const iv = '101112131415161718191a1b'
const cases = [
  ['aes-128-gcm', '000102030405060708090a0b0c0d0e0f', 'ac4b6fc3606fc18065b139', '6f424ba8a2779c517ea9e979c6f04469'],
  [
    'aes-192-gcm',
    '000102030405060708090a0b0c0d0e0f1011121314151617',
    '5e324b796ca8b49792eabb',
    'e1a5c74d6451478df3a0a27c76bfddf6'
  ],
  [
    'aes-256-gcm',
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    '159bf47a26e94ddcb8196c',
    '35057350915e96a091045588d5c2043c'
  ]
]

const source = `import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv } from 'node:crypto'

const iv = Buffer.from('${iv}', 'hex')
const key128 = Buffer.from('${cases[0]?.[1]}', 'hex')
const key192 = Buffer.from('${cases[1]?.[1]}', 'hex')
const key256 = Buffer.from('${cases[2]?.[1]}', 'hex')

const cipher128 = createCipheriv('aes-128-gcm', key128, iv)
cipher128.setAAD('metadata')
console.log(
  '${resultPrefix}aes128',
  cipher128.update('hello world', 'utf8', 'hex') + cipher128.final('hex'),
  cipher128.getAuthTag().toString('hex')
)

const cipher192 = createCipheriv('aes-192-gcm', key192, iv)
cipher192.setAAD('metadata')
console.log(
  '${resultPrefix}aes192',
  cipher192.update('hello world', 'utf8', 'hex') + cipher192.final('hex'),
  cipher192.getAuthTag().toString('hex')
)

const cipher256 = createCipheriv('aes-256-gcm', key256, iv)
cipher256.setAAD('metadata')
const encrypted = cipher256.update('hello world', 'utf8', 'hex') + cipher256.final('hex')
const tag = cipher256.getAuthTag().toString('hex')
console.log('${resultPrefix}aes256', encrypted, tag)

const decipher = createDecipheriv('aes-256-gcm', key256, iv)
decipher.setAAD(Buffer.from('metadata')).setAuthTag(tag, 'hex')
console.log(
  '${resultPrefix}clear',
  decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
)

const options = { authTagLength: 12 }
const shortCipher = createCipheriv('aes-256-gcm', key256, iv, options)
shortCipher.setAAD('6d65746164617461', { encoding: 'hex' })
const shortEncrypted = shortCipher.update(Buffer.from('hello world')).toString('hex') + shortCipher.final().toString('hex')
const shortTag = shortCipher.getAuthTag()
const shortDecipher = createDecipheriv('aes-256-gcm', key256, iv, options)
shortDecipher.setAAD('metadata').setAuthTag(shortTag)
const shortClear = shortDecipher.update(Buffer.from(shortEncrypted, 'hex')).toString('utf8') + shortDecipher.final().toString('utf8')
console.log('${resultPrefix}short', shortEncrypted, shortTag.toString('hex'), shortClear)

let rejected = 0

try {
  const invalid = createDecipheriv('aes-256-gcm', key256, iv)
  invalid.setAAD('metadata').setAuthTag(Buffer.alloc(16))
  invalid.update(encrypted, 'hex')
  invalid.final()
} catch { rejected = rejected + 1 }

try { createCipheriv('aes-256-gcm', Buffer.alloc(16), iv) } catch { rejected = rejected + 1 }
try { createCipheriv('aes-256-gcm', key256, iv, { authTagLength: 5 }) } catch { rejected = rejected + 1 }

console.log('${resultPrefix}rejected', rejected)
`

export async function assertCryptoCipherRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'cipher', source, resultPrefix, [
    `${resultPrefix}aes128 ${cases[0]?.[2]} ${cases[0]?.[3]}`,
    `${resultPrefix}aes192 ${cases[1]?.[2]} ${cases[1]?.[3]}`,
    `${resultPrefix}aes256 ${cases[2]?.[2]} ${cases[2]?.[3]}`,
    `${resultPrefix}clear hello world`,
    `${resultPrefix}short ${cases[2]?.[2]} 35057350915e96a091045588 hello world`,
    `${resultPrefix}rejected 3`
  ])
}
