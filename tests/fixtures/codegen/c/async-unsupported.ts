// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ASYNC

async function getValue(): Promise<number> {
  return Promise.resolve(2)
}

export async function main(): Promise<void> {
  const value = await getValue()
  console.log(value)
}
