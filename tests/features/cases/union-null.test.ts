// @targets cc
// @expect pass
// @stdout Ada

const value: string | null = 'Ada'
console.log(value ?? 'none')
