// @targets cc
// @expect pass
// @stdout 1 1 1 1

const notANumber = 0 / 0
const negativeZero = Math.round(-0.1)

console.log(
  Math.min(notANumber, 1) !== Math.min(notANumber, 1),
  Math.max(notANumber, 1) !== Math.max(notANumber, 1),
  1 / negativeZero < 0,
  Math.sign(-0) === 0
)
