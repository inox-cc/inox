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

export function cryptoRuntimeMethodNameFromPath(path: string[]): CryptoRuntimeMethod | null {
  if (!isCryptoRuntimeMethodPath(path)) {
    return null
  }

  return cryptoRuntimeMethodNameFromKnownPath(path)
}

export function cryptoRuntimeMethodNameFromKnownPath(_path: string[]): CryptoRuntimeMethod {
  return 'getRandomValues'
}

export function isCryptoRuntimeMethodPath(path: string[]): boolean {
  if (path.length !== 2 || path[0] !== 'crypto') {
    return false
  }

  return path[1] === 'getRandomValues'
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
