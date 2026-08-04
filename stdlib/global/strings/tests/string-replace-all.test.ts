// @targets cc
// @expect pass
// @stdout x-x|-😀-x-

console.log('a-a'.replaceAll('a', 'x') + '|' + '😀x'.replaceAll('', '-'))
