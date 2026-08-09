import dns from 'node:dns'
import { lookup, lookupService } from 'node:dns/promises'

export function startDnsAcceptance(): void {
  dns.lookup('localhost', { family: 4 }, (error, address, family) => {
    if (error === null && address.length > 0 && family === 4) {
      console.log('INOX_DNS_CALLBACK_OK')
    }

    checkCallbackAll()
  })
}

function checkCallbackAll(): void {
  dns.lookup('localhost', { family: 4, all: true, order: 'ipv4first' }, (error, addresses) => {
    let foundIpv4 = false

    for (const item of addresses) {
      if (item.address.length > 0 && item.family === 4) {
        foundIpv4 = true
      }
    }

    if (error === null && foundIpv4) {
      console.log('INOX_DNS_ALL_CALLBACK_OK')
    }

    dns.lookupService('127.0.0.1', 80, (serviceError, hostname, service) => {
      if (serviceError === null && hostname.length > 0 && service.length > 0) {
        console.log('INOX_DNS_SERVICE_CALLBACK_OK')
      }

      checkPromiseLookups()
    })
  })
}

async function checkPromiseLookups(): Promise<void> {
  const fromProperty = await dns.promises.lookup('localhost', 4)
  const fromModule = await lookup('localhost', { family: 4 })
  const all = await lookup('localhost', { family: 4, all: true, order: 'ipv4first' })
  const service = await lookupService('127.0.0.1', 80)
  let foundIpv4 = false

  for (const item of all) {
    if (item.address.length > 0 && item.family === 4) {
      foundIpv4 = true
    }
  }

  if (
    fromProperty.address.length > 0 &&
    fromProperty.family === 4 &&
    fromModule.address.length > 0 &&
    fromModule.family === 4 &&
    foundIpv4 &&
    service.hostname.length > 0 &&
    service.service.length > 0
  ) {
    console.log('INOX_DNS_PROMISE_OK')
  }
}
