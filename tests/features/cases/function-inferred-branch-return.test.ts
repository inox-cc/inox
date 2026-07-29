// @targets cc
// @expect pass
// @stdout 7 9

function selectValue(flag: boolean) {
  const fallback = 9

  if (flag) {
    return 7
  }

  return fallback
}

console.log(selectValue(true), selectValue(false))
