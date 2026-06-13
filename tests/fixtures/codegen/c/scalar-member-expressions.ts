// @targets c
// @expect pass
// @stdout 10 1

const user = { score: 7, active: true }
const values = [3, true]
const total = user.score + values[0]
const same = user.active === values[1]
console.log(total, same)

