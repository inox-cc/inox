// @targets cc
// @expect pass
// @stdout inner
// @stdout outer
// @stdout done

async function finish(): Promise<string> {
  try {
    try {
      await Promise.reject('inner')
    } catch {
      await Promise.resolve(1)
    } finally {
      console.log('inner')
    }

    return 'done'
  } catch {
    return 'missed'
  } finally {
    console.log('outer')
  }
}

console.log(await finish())
