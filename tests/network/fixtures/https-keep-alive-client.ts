import https, { type Agent } from 'node:https'

function read(
  port: number,
  path: string,
  nonce: string,
  agent: Agent,
  servername: string = 'localhost'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { 'X-Inox-Https-Keep-Alive': nonce },
        agent,
        rejectUnauthorized: false,
        servername
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          resolve(body)
        })
        response.on('error', (error) => {
          reject(error)
        })
      }
    )

    request.on('error', (error) => {
      reject(error)
    })
  })
}

function readIsolated(port: number, path: string, nonce: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { 'X-Inox-Https-Keep-Alive': nonce },
        agent: false,
        rejectUnauthorized: false,
        servername: 'localhost'
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          resolve(body)
        })
        response.on('error', (error) => {
          reject(error)
        })
      }
    )

    request.on('error', (error) => {
      reject(error)
    })
  })
}

export function startHttpsKeepAliveClientAcceptance(port: number, otherPort: number, nonce: string): void {
  runHttpsKeepAliveClientAcceptance(port, otherPort, nonce)
}

async function runHttpsKeepAliveClientAcceptance(port: number, otherPort: number, nonce: string): Promise<void> {
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: 1000 })
  const first = await read(port, '/first', nonce, agent)
  const second = await read(port, '/second', nonce, agent)
  const queued = await Promise.all([
    read(port, '/queued-first', nonce, agent),
    read(port, '/queued-second', nonce, agent)
  ])
  const origins = await Promise.all([
    read(port, '/origin-block', nonce, agent),
    read(otherPort, '/other-origin', nonce, agent)
  ])
  const tlsPolicy = await read(port, '/tls-policy', nonce, agent, 'different.test')
  agent.destroy()
  const afterDestroy = await read(port, '/after-destroy', nonce, agent)
  const isolatedFirst = await readIsolated(port, '/isolated-first', nonce)
  const isolatedSecond = await readIsolated(port, '/isolated-second', nonce)
  const global = await read(port, '/global', nonce, https.globalAgent)

  if (
    first === 'https-keep-alive-first ' + nonce &&
    second === 'https-keep-alive-second ' + nonce &&
    queued[0] === 'https-keep-alive-queued-first ' + nonce &&
    queued[1] === 'https-keep-alive-queued-second ' + nonce &&
    origins[0] === 'https-keep-alive-origin-block ' + nonce &&
    origins[1] === 'https-keep-alive-other-origin ' + nonce &&
    tlsPolicy === 'https-keep-alive-tls-policy ' + nonce &&
    afterDestroy === 'https-keep-alive-after-destroy ' + nonce &&
    isolatedFirst === 'https-keep-alive-isolated-first ' + nonce &&
    isolatedSecond === 'https-keep-alive-isolated-second ' + nonce &&
    global === 'https-keep-alive-global ' + nonce
  ) {
    console.log('INOX_HTTPS_KEEP_ALIVE_CLIENT_OK')
  }
}
