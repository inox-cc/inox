// @targets c
// @expect pass
// @stdout binary 2 7 9 hi

const bytes = Buffer.from('hi', 'utf8')
const out = new Uint8Array(4)

out[0] = bytes[0]
out[1] = 7
out[2] = 9

const slice = out.slice(1, 3)
const text = bytes.toString()

console.log('binary', bytes.length, out[1], slice[1], text)
