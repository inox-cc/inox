// @targets js,c
// @expect pass

await fs.writeFile('/private/tmp/ccjs-fs-smoke.txt', 'hello fs')
const text = await fs.readFile('/private/tmp/ccjs-fs-smoke.txt', 'utf8')
console.log(text)

