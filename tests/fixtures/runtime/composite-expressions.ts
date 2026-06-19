// @targets c
// @expect diagnostic
// @diagnostic INOX_C_NUMBER_EXPR

const user = { name: 'Ada', scores: [1, 2, 3] }
const total = user.scores[0] + user['scores'][1] * 2
user.name = 'Grace'
console.log(user.name, total, total === 5 && true)
