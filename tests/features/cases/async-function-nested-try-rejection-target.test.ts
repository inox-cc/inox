// @targets cc
// @expect pass
// @stdout outer

async function rejectFromCatch(): Promise<string> {
  try {
    try {
      await Promise.reject('inner')
    } catch {
      await Promise.reject('outer')
    }

    return 'missed'
  } catch {
    return 'outer'
  }
}

console.log(await rejectFromCatch())
