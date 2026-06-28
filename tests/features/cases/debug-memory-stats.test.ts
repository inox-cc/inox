// @targets c
// @expect pass
// @stdout 1

const stats = inox.__debug.memory()
console.log(stats.allocCount >= 0)
