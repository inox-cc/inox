// @targets cc
// @expect pass
// @stdout explicit arrow

const label = (value: string): string => value + ' arrow'
console.log(label('explicit'))
