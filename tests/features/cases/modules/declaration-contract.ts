type ContractUser = {
  name: string
  score: number
}

export function makeContractUser(name: string): ContractUser {
  return {
    name,
    score: name.length + 2
  }
}
