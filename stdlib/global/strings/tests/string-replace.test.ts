// @targets cc
// @expect pass
// @stdout x-a|a[b][a][c]c|$-$1

console.log('a-a'.replace('a', 'x') + '|' + 'abc'.replace('b', "[$&][$`][$']") + '|' + 'a'.replace('a', '$$-$1'))
