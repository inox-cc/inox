// @targets cc
// @expect pass
// @stdout 1
// @stdout true

const box = JSON.parse('{"v":[1,true]}')

for (const value of box.v) {
  console.log(value)
}
