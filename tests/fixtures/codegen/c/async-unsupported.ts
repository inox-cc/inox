// @targets c
// @expect pass

function getPromise(): Promise<number> {
  return Promise.resolve(2)
}

export async function main(): Promise<void> {
  const value = await getPromise()
  console.log(value)
}
