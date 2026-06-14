// @targets c
// @expect diagnostic
// @diagnostic CCJS_NOT_IMPLEMENTED

const response = fetch('data:text/plain,hello')
console.log(response)
