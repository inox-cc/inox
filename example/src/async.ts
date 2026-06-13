export function asyncText(): Promise<string> {
  return new Promise((resolve) => {
    const str1 = 'ccjs cmake example'
    const num = 123

    setTimeout(() => {
      resolve(`${str1} 😀 ${String(num)}`)
    }, 1000)
  })
}
