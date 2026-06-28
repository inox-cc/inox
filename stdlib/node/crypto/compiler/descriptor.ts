import { nodeStringListIncludes } from '../../../../compiler/stdlib/node/string-list.ts'
import type { IrGlobalUsage } from '../../../../compiler/types.ts'

export const nodeCryptoImportSource = 'node:crypto'
export const nodeCryptoModuleObjectImportNames = ['default', 'crypto']

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

type NodeCryptoGlobalNameSet = Set<string>

export type NodeCryptoCGlobalUsageContext = {
  cryptoImportNames?: NodeCryptoGlobalNameSet
}

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
  return nodeStringListIncludes(cryptoRuntimeMethods, method)
}

export function isSupportedNodeCryptoCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeCryptoCGlobalUsageContext
): boolean {
  return (
    isCryptoRuntimeMethodPath(usage.path) ||
    (usage.path.length === 2 &&
      nodeCryptoNameSetHas(context.cryptoImportNames, usage.root) &&
      isCryptoRuntimeMethod(usage.path[1]))
  )
}

export function isNodeCryptoImportSource(source: string | null | undefined): boolean {
  return source === nodeCryptoImportSource
}

export function isUnsupportedNodeCryptoMethod(method: string): boolean {
  return nodeStringListIncludes(unsupportedNodeCryptoMethods, method)
}

function nodeCryptoNameSetHas(names: NodeCryptoGlobalNameSet | undefined, root: string): boolean {
  if (names === null || typeof names === 'undefined') {
    return false
  }

  return names.has(root)
}
