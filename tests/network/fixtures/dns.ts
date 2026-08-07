import dns from 'node:dns'
import { lookup } from 'node:dns/promises'

export function startDnsAcceptance(): void {
  dns.lookup('localhost', { family: 4 }, (error, address, family) => {
    if (error === null && address.length > 0 && family === 4) {
      console.log('INOX_DNS_CALLBACK_OK')
    }

    checkPromiseLookups()
  })
}

async function checkPromiseLookups(): Promise<void> {
  const fromProperty = await dns.promises.lookup('localhost', 4)
  const fromModule = await lookup('localhost', { family: 4 })

  if (
    fromProperty.address.length > 0 &&
    fromProperty.family === 4 &&
    fromModule.address.length > 0 &&
    fromModule.family === 4
  ) {
    console.log('INOX_DNS_PROMISE_OK')
  }
}
