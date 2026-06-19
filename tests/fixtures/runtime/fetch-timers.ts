// @targets c
// @expect diagnostic
// @diagnostic INOX_NOT_IMPLEMENTED

const response = await fetch('data:text/plain,hello')
const text = await response.text()

await new Promise(resolve => {
  setTimeout(() => resolve(null), 1)
})
console.log(text)
