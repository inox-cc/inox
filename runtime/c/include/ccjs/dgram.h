#ifndef CCJS_DGRAM_H
#define CCJS_DGRAM_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_dgram_socket ccjs_dgram_socket;

typedef ccjs_status (*ccjs_dgram_recv_fn)(
  void* user,
  ccjs_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port
);

ccjs_status ccjs_dgram_socket_new(
  ccjs_loop* loop,
  ccjs_dgram_recv_fn recv,
  void* user,
  ccjs_dgram_socket** out
);
ccjs_status ccjs_dgram_bind(ccjs_dgram_socket* socket, const char* host, int port);
ccjs_status ccjs_dgram_recv_start(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_recv_stop(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_send(ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port);
ccjs_status ccjs_dgram_local_port(ccjs_dgram_socket* socket, int* out_port);
void ccjs_dgram_close(ccjs_dgram_socket* socket);

#endif
