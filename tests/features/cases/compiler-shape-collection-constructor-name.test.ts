// @targets cc
// @expect pass
// @stdout 0
// @stdout 1

import { collectionConstructorNameFromPath } from '../../../stdlib/global/collections/compiler/descriptor.ts'

console.log(collectionConstructorNameFromPath(['Set']) === 'Set')
console.log(collectionConstructorNameFromPath(['Map']) === 'Map')
