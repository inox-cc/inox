# node:dns

`node:dns` provides libuv-backed operating-system name lookup APIs.

Supported API:

- `dns.lookup(hostname, callback)`
- `dns.lookup(hostname, family, callback)`
- `dns.lookup(hostname, { family, all, order }, callback)`
- `dns.lookupService(address, port, callback)`
- the equivalent `dns.promises` methods
- the equivalent `node:dns/promises` entrypoint

`family` accepts `0`, `4`, or `6`. `all: true` returns every address as
`{ address, family }`. `order` accepts `verbatim`, `ipv4first`, or
`ipv6first`. `lookupService()` accepts an IPv4 or IPv6 address and a port.

The package requires the libuv loop backend. The embedded backend reports a
compile-time diagnostic.

Protocol-level `resolve*()`, `reverse()`, custom `Resolver` instances, DNS
server configuration, lookup hints, and the deprecated boolean option
`verbatim` are not implemented.
