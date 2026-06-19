// @targets c
// @expect diagnostic
// @diagnostic INOX_C_JS_GLOBAL

const parsed = Date.parse('2026-06-09T00:00:00Z')
console.log(parsed)

