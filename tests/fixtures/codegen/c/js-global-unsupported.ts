// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_JS_GLOBAL

const response = fetch('data:text/plain,hello')
console.log(response)

