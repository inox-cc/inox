// @targets cc
// @expect pass
// @stdout Ada

const rows = [['Ada', 'admin']]
const names = rows.map(([name]) => name)

console.log(names[0])
