// @targets cc
// @expect pass
// @stdout recovered

async function recover(): Promise<string> {
  try {
    try {
      await Promise.reject('inner')
    } catch {
      await Promise.resolve(1)
    }

    return 'recovered'
  } catch {
    return 'outer'
  }
}

console.log(await recover())
