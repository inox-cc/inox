// @targets js,c
// @platforms hosted,node,embedded-adapter
// @features wall-clock,monotonic-clock
// @expect pass

const wall = Date.now()
const monotonic = performance.now()

console.log(wall >= 0, monotonic >= 0)

