#ifndef INOX_DGRAM_H
#define INOX_DGRAM_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
#include "inox/string_view.h"
#endif

typedef struct inox_dgram_socket inox_dgram_socket;

struct DgramAddress {
  char address[64];
  const char* family;
  int port;
};

typedef inox_status (*DgramRecvFn)(
  void* user,
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port
);
typedef void (*DgramCloseFn)(void* user, inox_dgram_socket* socket);

#define INOX_DGRAM_BIND_REUSEADDR 1u

#ifdef __cplusplus

class DgramSocket {
private:
  inox_dgram_socket* socket_;

public:
  explicit DgramSocket(inox_dgram_socket* socket);

  static inox_status create(inox_loop* loop, DgramRecvFn recv, void* user, inox_dgram_socket** out);

  inox_status bind(const char* host, int port, unsigned int flags = 0) const;
  inox_status onMessage(DgramRecvFn recv, void* user) const;
  inox_status onClose(DgramCloseFn close, void* user) const;
  inox_status connect(const char* host, int port) const;
  inox_status disconnect() const;
  inox_status recvStart() const;
  inox_status recvStop() const;
  inox_status send(inox::StringView bytes, const char* host, int port) const;
  void close() const;
  inox_status address(DgramAddress* out) const;
  inox_status remoteAddress(DgramAddress* out) const;
  inox_status localPort(int* out_port) const;
  inox_status setBroadcast(bool enabled) const;
  inox_status setTTL(int ttl) const;
  inox_status getSendBufferSize(int* out_size) const;
  inox_status setSendBufferSize(int size) const;
  inox_status getRecvBufferSize(int* out_size) const;
  inox_status setRecvBufferSize(int size) const;
  inox_status ref() const;
  inox_status unref() const;
};

#endif

#endif
