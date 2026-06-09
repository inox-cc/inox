// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ASYNC

async function getValue(): number {
  return await Promise.resolve(2)
}

export async function main(): void {
  const value = await getValue()
  console.log(value)
}
