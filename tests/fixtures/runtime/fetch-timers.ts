// @targets js
// @expect pass

const response = await fetch('data:text/plain,hello')
const text = await response.text()

await new Promise(resolve => setTimeout(resolve, 1))
console.log(text)

