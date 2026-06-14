// @targets c
// @expect pass

async function getValue(): Promise<number> {
  return Promise.resolve(2)
}

const value = await getValue()
console.log(value)

