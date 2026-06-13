export async function asyncFunction(): Promise<string> {
  return new Promise((resolve) => {
    const str1 = 'ccjs cmake example'
    const num = 123
    resolve(`${str1} ${num}`)
  })
}
