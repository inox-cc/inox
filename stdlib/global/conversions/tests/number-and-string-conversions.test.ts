// @targets c
// @expect pass
// @stdout 42
// @stdout 7

console.log(Number('42') ?? 0)
console.log(String(7))
