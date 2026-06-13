// @targets c
// @expect pass

type User = {
  name: string,
  score: number
}

async function work(): Promise<User> {
  try {
    const prefix: User = { name: 'Ada', score: 7 }
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.name)
    }
    console.log(prefix.score)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: User = await work()
  console.log(result.name, result.score)
}
