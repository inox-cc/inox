// @targets cc
// @expect pass
// @stdout 7

async function createValue(): Promise<number> {
  const value = await new Promise<number>((resolve) => {
    resolve(7)
  })

  return value
}

console.log(await createValue())
