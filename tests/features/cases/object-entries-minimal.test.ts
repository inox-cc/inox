// @targets c
// @expect pass
// @stdout [[name, Ada], [score, 7]]

const user = { name: 'Ada', score: 7 }
console.log(Object.entries(user))
