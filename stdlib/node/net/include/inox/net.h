#ifndef INOX_NET_H
#define INOX_NET_H

#include <stddef.h>
#include "inox/loop.h"

typedef struct inox_net_server inox_net_server;
typedef struct inox_net_socket inox_net_socket;

typedef struct inox_net_address {
  char address[64];
  const char* family;
  int port;
} inox_net_address;

typedef inox_status (*inox_net_connection_fn)(void* user, inox_net_server* server, inox_net_socket* socket);
typedef inox_status (*inox_net_server_fn)(void* user, inox_net_server* server);
typedef inox_status (*inox_net_server_error_fn)(void* user, inox_net_server* server, inox_status status);
typedef inox_status (*inox_net_connect_fn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*inox_net_data_fn)(void* user, inox_net_socket* socket, const char* bytes, size_t len);
typedef void (*inox_net_close_fn)(void* user, inox_net_socket* socket);
typedef inox_status (*inox_net_socket_fn)(void* user, inox_net_socket* socket);
typedef inox_status (*inox_net_socket_error_fn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*inox_net_socket_write_fn)(void* user, inox_net_socket* socket, inox_status status);

inox_status inox_net_server_new(
  inox_loop* loop,
  inox_net_connection_fn connection,
  void* user,
  inox_net_server** out
);
inox_status inox_net_server_on_connection(inox_net_server* server, inox_net_connection_fn connection, void* user);
inox_status inox_net_server_on_listening(inox_net_server* server, inox_net_server_fn listening, void* user);
inox_status inox_net_server_on_close(inox_net_server* server, inox_net_server_fn close, void* user);
inox_status inox_net_server_on_error(inox_net_server* server, inox_net_server_error_fn error, void* user);
inox_status inox_net_server_listen(inox_net_server* server, const char* host, int port, int backlog);
inox_status inox_net_server_address(inox_net_server* server, inox_net_address* out);
inox_status inox_net_server_local_port(inox_net_server* server, int* out_port);
void inox_net_server_close(inox_net_server* server);

inox_status inox_net_connect(
  inox_loop* loop,
  const char* host,
  int port,
  inox_net_connect_fn connect,
  inox_net_data_fn data,
  inox_net_close_fn close,
  void* user,
  inox_net_socket** out
);
void inox_net_socket_set_callbacks(
  inox_net_socket* socket,
  inox_net_data_fn data,
  inox_net_close_fn close,
  void* user
);
inox_status inox_net_socket_on_connect(inox_net_socket* socket, inox_net_socket_fn connect, void* user);
inox_status inox_net_socket_on_ready(inox_net_socket* socket, inox_net_socket_fn ready, void* user);
inox_status inox_net_socket_on_data(inox_net_socket* socket, inox_net_data_fn data, void* user);
inox_status inox_net_socket_on_end(inox_net_socket* socket, inox_net_socket_fn end, void* user);
inox_status inox_net_socket_on_close(inox_net_socket* socket, inox_net_socket_fn close, void* user);
inox_status inox_net_socket_on_error(inox_net_socket* socket, inox_net_socket_error_fn error, void* user);
inox_status inox_net_socket_on_drain(inox_net_socket* socket, inox_net_socket_fn drain, void* user);
inox_status inox_net_socket_read_start(inox_net_socket* socket);
inox_status inox_net_socket_read_stop(inox_net_socket* socket);
inox_status inox_net_socket_set_encoding(inox_net_socket* socket, const char* encoding, size_t encoding_len);
inox_status inox_net_socket_address(inox_net_socket* socket, inox_net_address* out);
inox_status inox_net_socket_remote_address(inox_net_socket* socket, inox_net_address* out);
inox_status inox_net_socket_get_bytes_read(inox_net_socket* socket, size_t* out_bytes);
inox_status inox_net_socket_get_bytes_written(inox_net_socket* socket, size_t* out_bytes);
inox_status inox_net_socket_set_no_delay(inox_net_socket* socket, int enabled);
inox_status inox_net_socket_set_keep_alive(inox_net_socket* socket, int enabled, unsigned int initial_delay);
inox_status inox_net_socket_ref(inox_net_socket* socket);
inox_status inox_net_socket_unref(inox_net_socket* socket);
inox_status inox_net_socket_write(inox_net_socket* socket, const char* bytes, size_t len);
inox_status inox_net_socket_write_with_callback(
  inox_net_socket* socket,
  const char* bytes,
  size_t len,
  inox_net_socket_write_fn callback,
  void* user
);
inox_status inox_net_socket_end(inox_net_socket* socket, const char* bytes, size_t len);
inox_status inox_net_socket_end_with_callback(
  inox_net_socket* socket,
  const char* bytes,
  size_t len,
  inox_net_socket_write_fn callback,
  void* user
);
inox_status inox_net_socket_write_and_close(inox_net_socket* socket, const char* bytes, size_t len);
inox_status inox_net_socket_destroy(inox_net_socket* socket);
void inox_net_socket_close(inox_net_socket* socket);

#endif
