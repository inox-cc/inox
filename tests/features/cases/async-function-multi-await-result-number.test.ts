// @targets cc
// @expect pass
// @stdout 3

async function add(): Promise<number> {
  const first = await Promise.resolve(1)
  const second = await Promise.resolve(2)
  return first + second
}

console.log(await add())
