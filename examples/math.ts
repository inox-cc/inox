// @targets c
// @expect pass
// @stdout math 29

const value =
  Math.floor(3.8) +
  Math.ceil(2.1) +
  Math.round(1.6) +
  Math.trunc(4.9) +
  Math.abs(-5) +
  Math.min(8, 2) +
  Math.max(1, 6) +
  Math.sqrt(9) +
  Math.sin(0) +
  Math.cos(0)

console.log('math', value)
