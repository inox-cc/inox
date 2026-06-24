// @targets c
// @expect pass
// @stdout 2
// @stdout 4

const data = JSON.parse('{"v":[{"1":2},{"3":4,"5":6}]}')

for (const item of data.v) {
  console.log(Object.values(item)[0])
}
