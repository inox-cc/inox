import process from 'node:process'

import { startDnsAcceptance } from './dns.ts'
import { startHttpAcceptance } from './http.ts'
import { startHttpClientAcceptance } from './http-client.ts'
import { startHttpsClientAcceptance } from './https-client.ts'
import { startTcpAcceptance } from './tcp.ts'
import { startUdpAcceptance } from './udp.ts'

const port = Number(process.argv[2]) ?? 0
const nonce = process.argv[3]
const httpsPort = Number(process.argv[4]) ?? 0

startTcpAcceptance()
startUdpAcceptance()
startDnsAcceptance()
startHttpAcceptance(port, nonce)
startHttpClientAcceptance()
startHttpsClientAcceptance(httpsPort, nonce)
