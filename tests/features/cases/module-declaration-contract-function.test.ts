// @targets c
// @expect pass
// @stdout Ada:5

import { makeContractUser } from './modules/declaration-contract.ts'

const user = makeContractUser('Ada')
console.log(user.name + ':' + String(user.score))
