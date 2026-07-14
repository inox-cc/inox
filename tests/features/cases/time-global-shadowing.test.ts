// @targets cc
// @expect pass
// @stdout 7
// @stdout 9

type LocalClock = {
  now: () => number
}

const Date: LocalClock = { now: () => 7 }
const performance: LocalClock = { now: () => 9 }

console.log(Date.now())
console.log(performance.now())
