// @targets c
// @expect pass
// @stdout [Ada, 7]

const user = { name: 'Ada', score: 7 }
console.log(Object.values(user))
