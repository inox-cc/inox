// @targets c
// @expect pass
// @stdout bad

async function failString(): Promise<string> {
  const seed: number = await Promise.resolve(1)
  throw 'bad'
}

const promise = failString()

try {
  const value = await promise
  console.log(value)
} catch (error) {
  console.log(error)
}

