import process from 'node:process'

import { startHttpAcceptance } from './http.ts'
import { startTcpAcceptance } from './tcp.ts'
import { startUdpAcceptance } from './udp.ts'

const port = Number(process.argv[2]) ?? 0
const nonce = process.argv[3]

startTcpAcceptance()
startUdpAcceptance()
startHttpAcceptance(port, nonce)
