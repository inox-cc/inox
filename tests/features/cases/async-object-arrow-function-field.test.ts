// @targets cc
// @expect pass
// @stdout stored async arrow

type Host = {
  read(value: string): Promise<string>
}

const host: Host = {
  read: async (value) => {
    await Promise.resolve()
    return value
  }
}

const value = await host.read('stored async arrow')
console.log(value)
