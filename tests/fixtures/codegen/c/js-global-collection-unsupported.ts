// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_COLLECTION

const values: Set<string> = new Set('Ada')
console.log(values)

