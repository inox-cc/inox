import { stringListIncludes } from './string-list.ts'

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

const cryptoGlobalRuntimeMethods: string[] = ['getRandomValues']

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

export function cryptoRuntimeMethodNameFromPath(
  path: string[]
): CryptoRuntimeMethod | null {
  if (path.length !== 2) {
    return null
  }

  const root = pathSegment(path, 0)
  const method = pathSegment(path, 1)

  if (root === 'crypto' && method != null) {
    if (isCryptoRuntimeMethod(method) && stringListIncludes(cryptoGlobalRuntimeMethods, method)) {
      return method
    }
  }

  return null
}

export function isCryptoRuntimeMethod(method: string): boolean {
  return stringListIncludes(cryptoRuntimeMethods, method)
}

export function isNodeCryptoImportSource(source: string | null | undefined): boolean {
  if (source !== 'node:crypto') {
    return false
  }

  return true
}

export function isUnsupportedNodeCryptoMethod(method: string): boolean {
  return stringListIncludes(unsupportedNodeCryptoMethods, method)
}

function pathSegment(path: string[], index: number): string | null {
  if (index < 0 || index >= path.length) {
    return null
  }

  return path[index]
}
