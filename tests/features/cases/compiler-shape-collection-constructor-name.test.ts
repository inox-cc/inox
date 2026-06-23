// @targets c
// @expect pass
// @stdout 1
// @stdout 1

import { collectionConstructorNameFromPath } from '../../../compiler/stdlib/descriptors/collections.ts'

console.log(collectionConstructorNameFromPath(['Set']) === 'Set')
console.log(collectionConstructorNameFromPath(['Map']) === 'Map')
