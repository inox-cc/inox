# HTTP Server Example

This example is a small `node:http` server written in TypeScript for the inox C++
target. The C++ backend requires libuv for networking.

Build and run it through the regular CLI with the hosted compiler:

```bash
pnpm run example:http-server
```

The command automatically selects and prepares libuv, builds the executable
under `dist/http-server` and passes `examples/http-server/public` to the server
as its static directory.
Use `pnpm run example:http-server:inox` to run the same flow through the native
`dist/inox` compiler after `pnpm run build`.

Probe it from another terminal:

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/time
curl -H 'X-Inox-Test: network' http://127.0.0.1:8080/network
curl http://127.0.0.1:8080/index.html
curl http://127.0.0.1:8080/hello.txt
curl http://127.0.0.1:8080/../index.ts
```

Files are served from `examples/http-server/public`; missing files and parent
directory paths return the shared 404 response.

The HTTP acceptance probe creates an isolated CLI build, starts the executable,
verifies real responses and removes the temporary build directory. Stop any
manually running instance first, then run:

```bash
pnpm run test:example:http-server
```

After `pnpm run build`, the independent native-compiler acceptance does the same
through `dist/inox build`:

```bash
pnpm run test:example:http-server:inox
```

The probe verifies these response content types:

- `/health`: `application/json`
- `/network`: `application/json` plus incoming/request socket metadata and response-header inspection
- `/`: `text/html; charset=utf-8`
- `/hello.txt`: `text/plain; charset=utf-8`
