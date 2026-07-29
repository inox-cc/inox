// @targets cc
// @expect pass
// @stdout 7 9

async function read(flag: boolean) {
  const fallback = 9

  if (flag) {
    return 7
  }

  return fallback
}

console.log(await read(true), await read(false))
