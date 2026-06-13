declare const crypto: {
  getRandomValues<T extends Buffer | Uint8Array>(bytes: T): T
}
