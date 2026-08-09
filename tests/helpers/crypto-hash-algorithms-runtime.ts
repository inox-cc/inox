import { assertCryptoRuntime, type CryptoRuntimeCompiler } from './crypto-encoding-runtime.ts'

const resultPrefix = 'INOX_CRYPTO_ALGORITHMS '
const hashes = [
  'd9a3f5296a4a0c47ee46282ed56b5dab5378bf31',
  '698de5de95f184d7dc679796cafbf32a39592a8954dc6cfb4028dbb2',
  '43d2242f526a93c0ac2c7575109da34e7da8fb19d9fc448114e11a10e2e8c589',
  'bf156bd68cb09a8f48aa5b20b5a979ee1f8bdaea9c61c588b864c7460956d90a6c20fa9278469d5b5ca5482dbc3d7199',
  '29b4aabb10267d2618d2ae29c3511c2ae27f1c87eb36e72846c368a46c5f48e26464532b9a67f23d89365d4b5e7b6fe0b40541a5d550228b69d33148ff673c8e'
]
const hmacs = [
  '145c93959c7f72ec3cba093b7aeb7804c6a49da3',
  '59a145f547d9a55faed833aa7c24486ac0374f12630ae7d915af5075',
  'c4b8c153b947cef0b1946aae6038699c2ca844b4498a2f917718ff6317169b6d',
  '7c81794f4d25e51bd2fafef7f62a68662ba0504297972b6ca57e8ea4d008a9cb7007885cdacbb4623990722244d26ec9',
  '5f83628e7b3d14f5d537920dff58cbd7b3db5b4c9dfb5e9f05388992d881e28dcd2345a4845694b4952866e2bd5cd7aa3c307a833e3c2c4d897412680c240ca9'
]

const source = `import { createHmac, getHashes, hash } from 'node:crypto'

console.log('${resultPrefix}hashes', getHashes().join(','))
console.log(
  '${resultPrefix}digest',
  hash('sha1', 'inox'),
  hash('sha224', 'inox'),
  hash('sha256', 'inox'),
  hash('sha384', 'inox'),
  hash('sha512', 'inox')
)
console.log(
  '${resultPrefix}hmac',
  createHmac('sha1', 'key').update('inox').digest('hex'),
  createHmac('sha224', 'key').update('inox').digest('hex'),
  createHmac('sha256', 'key').update('inox').digest('hex'),
  createHmac('sha384', 'key').update('inox').digest('hex'),
  createHmac('sha512', 'key').update('inox').digest('hex')
)
`

export async function assertCryptoHashAlgorithmsRuntime(compiler: CryptoRuntimeCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'hash-algorithms', source, resultPrefix, [
    `${resultPrefix}hashes sha1,sha224,sha256,sha384,sha512`,
    `${resultPrefix}digest ${hashes.join(' ')}`,
    `${resultPrefix}hmac ${hmacs.join(' ')}`
  ])
}
