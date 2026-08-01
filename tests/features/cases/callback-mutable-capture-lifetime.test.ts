// @targets cc
// @expect pass
// @stdout 1 2 1

function makeCounter(): () => number {
  let count = 0

  return () => {
    count = count + 1
    return count
  }
}

const first = makeCounter()
const second = makeCounter()

console.log(first(), first(), second())
