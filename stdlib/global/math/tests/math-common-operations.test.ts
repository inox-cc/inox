// @targets cc
// @expect pass
// @stdout 1 1 8 -1 0 1 0 5 1 1 4 1

console.log(
  Math.PI > 3,
  Math.E > 2,
  Math.pow(2, 3),
  Math.sign(-4),
  Math.log(1),
  Math.exp(0),
  Math.atan2(0, 1),
  Math.hypot(3, 4),
  Math.max() < -1e300,
  Math.min() > 1e300,
  Math.max(1, 4, 2),
  Math.min(3, 1, 2)
)
