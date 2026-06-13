// @targets c
// @expect pass

async function work(label: string): Promise<string> {
  try {
    const prefix: string = label
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(label)
  }
}

export async function main(): Promise<void> {
  const promise = work('Ada')
  console.log(await promise)
}
