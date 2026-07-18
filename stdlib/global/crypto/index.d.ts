export {}

declare global {
  interface Crypto {
    getRandomValues(bytes: Uint8Array): Uint8Array
  }

  const crypto: Crypto
}
