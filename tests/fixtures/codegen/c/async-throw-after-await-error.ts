// @targets c
// @expect pass
// @stdout boom

async function failError(): Promise<string> {
  const seed: number = await Promise.resolve(2)
  throw new Error('boom')
}

const promise = failError()

try {
  const value = await promise
  console.log(value)
} catch (error) {
  console.log(error.message)
}

