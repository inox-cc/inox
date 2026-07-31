export function consume<T>(value: T, callback: (value: T) => void): void {
  callback(value)
}
