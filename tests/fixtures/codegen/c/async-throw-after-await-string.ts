// @targets c
// @expect pass
// @stdout bad

async function failString(): Promise<string> {
  const seed: number = await Promise.resolve(1)
  throw 'bad'
}

export async function main(): Promise<void> {
  const promise = failString()

  try {
    const value = await promise
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}
