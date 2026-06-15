export const cryptoRuntimeMethods = [
  'createHash',
  'getRandomValues',
  'randomBytes',
  'randomFillSync',
  'randomInt',
  'randomUUID'
] as const

export type CryptoRuntimeMethod = (typeof cryptoRuntimeMethods)[number]

const cryptoRuntimeMethodSet = new Set<string>(cryptoRuntimeMethods)
const cryptoGlobalRuntimeMethodSet = new Set<string>(['getRandomValues'])
const nodeCryptoImportSources = new Set(['node:crypto'])

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
  'createHmac',
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
  'getHashes',
  'hash',
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
  'timingSafeEqual',
  'verify'
] as const

const unsupportedNodeCryptoMethodSet = new Set<string>(unsupportedNodeCryptoMethods)

export function cryptoRuntimeMethodNameFromPath(
  path: readonly string[] | null | undefined
): CryptoRuntimeMethod | null {
  if (path == null || path.length !== 2 || path[0] !== 'crypto') {
    return null
  }

  return isCryptoRuntimeMethod(path[1]) && cryptoGlobalRuntimeMethodSet.has(path[1]) ? path[1] : null
}

export function isCryptoRuntimeMethod(method: string): method is CryptoRuntimeMethod {
  return cryptoRuntimeMethodSet.has(method)
}

export function isNodeCryptoImportSource(source: string | null | undefined): boolean {
  return source != null && nodeCryptoImportSources.has(source)
}

export function isUnsupportedNodeCryptoMethod(method: string): boolean {
  return unsupportedNodeCryptoMethodSet.has(method)
}
