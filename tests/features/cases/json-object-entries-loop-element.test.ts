// @targets c
// @expect pass
// @stdout [1, 2]
// @stdout [3, 4]

const data = JSON.parse('{"v":[{"1":2},{"3":4,"5":6}]}')

for (const item of data.v) {
  console.log(Object.entries(item)[0])
}
