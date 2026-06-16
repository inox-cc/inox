export const cryptoRuntimeMethods = [
  'createHash',
  'createHmac',
  'getHashes',
  'getRandomValues',
  'hash',
  'randomBytes',
  'randomFillSync',
  'randomInt',
  'randomUUID',
  'timingSafeEqual'
]

export type CryptoRuntimeMethod = string

const cryptoRuntimeMethodSet = createStringSet(cryptoRuntimeMethods)
const cryptoGlobalRuntimeMethodSet = createStringSet(['getRandomValues'])
const nodeCryptoImportSources = createStringSet(['node:crypto'])

export const unsupportedNodeCryptoMethods = [
  'argon2',
  'argon2Sync',
  'checkPrime',
  'checkPrimeSync',
  'createCipheriv',
  'createDecipheriv',
  'createDiffieHellman',
  'createDiffieHellmanGroup',
  'createECDH',
  'createPrivateKey',
  'createPublicKey',
  'createSecretKey',
  'createSign',
  'createVerify',
  'decapsulate',
  'diffieHellman',
  'encapsulate',
  'generateKey',
  'generateKeyPair',
  'generateKeyPairSync',
  'generateKeySync',
  'generatePrime',
  'generatePrimeSync',
  'getCipherInfo',
  'getCiphers',
  'getCurves',
  'getDiffieHellman',
  'getFips',
  'hkdf',
  'hkdfSync',
  'pbkdf2',
  'pbkdf2Sync',
  'privateDecrypt',
  'privateEncrypt',
  'publicDecrypt',
  'publicEncrypt',
  'randomFill',
  'randomUUIDv7',
  'scrypt',
  'scryptSync',
  'secureHeapUsed',
  'setEngine',
  'setFips',
  'sign',
  'verify'
]

const unsupportedNodeCryptoMethodSet = createStringSet(unsupportedNodeCryptoMethods)

export function cryptoRuntimeMethodNameFromPath(
  path: string[] | null | undefined
): CryptoRuntimeMethod | null {
  if (path == null || path.length !== 2) {
    return null
  }

  const root = pathSegment(path, 0)
  const method = pathSegment(path, 1)

  if (root === 'crypto' && method != null) {
    if (isCryptoRuntimeMethod(method) && cryptoGlobalRuntimeMethodSet.has(method)) {
      return method
    }
  }

  return null
}

export function isCryptoRuntimeMethod(method: string): boolean {
  return cryptoRuntimeMethodSet.has(method)
}

export function isNodeCryptoImportSource(source: string | null | undefined): boolean {
  return source != null && nodeCryptoImportSources.has(source)
}

export function isUnsupportedNodeCryptoMethod(method: string): boolean {
  return unsupportedNodeCryptoMethodSet.has(method)
}

function createStringSet(values: string[]): Set<string> {
  const set: Set<string> = new Set()

  for (const value of values) {
    set.add(value)
  }

  return set
}

function pathSegment(path: string[], index: number): string | null {
  if (index < 0 || index >= path.length) {
    return null
  }

  return path[index]
}
