#include "inox/tls.h"
#include "inox/net.h"

#include <openssl/bio.h>
#include <openssl/err.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>

#include <stdlib.h>
#include <string.h>

struct inox_tls_client {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_net_socket* socket;
  SSL_CTX* ctx;
  SSL* ssl;
  BIO* net_bio;
  inox_tls_connect_fn connect;
  inox_tls_data_fn data;
  inox_tls_close_fn close;
  void* user;
  int handshake_done;
  int connect_reported;
  int closing;
};

static inox_status inox_tls_configure_verify(SSL_CTX* ctx);
static inox_status inox_tls_client_setup_ssl(inox_tls_client* client, const char* servername);
static inox_status inox_tls_on_tcp_connect(void* user, inox_net_socket* socket, inox_status status);
static void inox_tls_on_tcp_data(void* user, NetSocket socket, inox::StringView bytes);
static void inox_tls_on_tcp_close(void* user, inox_net_socket* socket);
static inox_status inox_tls_drive_handshake(inox_tls_client* client);
static inox_status inox_tls_drain_plaintext(inox_tls_client* client);
static inox_status inox_tls_flush_net_bio(inox_tls_client* client);
static inox_status inox_tls_report_connect(inox_tls_client* client, inox_status status);
static inox_status inox_tls_fail_async(inox_tls_client* client, inox_status status);
static inox_status inox_tls_ssl_error_status(inox_tls_client* client, int result);
static void inox_tls_client_free(inox_tls_client* client);

inox_status inox_tls_connect(
  inox_loop* loop,
  const char* host,
  int port,
  const char* servername,
  inox_tls_connect_fn connect,
  inox_tls_data_fn data,
  inox_tls_close_fn close,
  void* user,
  inox_tls_client** out
) {
  if (loop == 0 || loop->allocator == 0 || host == 0 || port <= 0 || port > 65535 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_allocator* allocator = loop->allocator;
  inox_tls_client* client =
    (inox_tls_client*)allocator->alloc(allocator->user, sizeof(inox_tls_client), alignof(inox_tls_client));

  if (client == 0) {
    return INOX_ERR_OOM;
  }

  memset(client, 0, sizeof(inox_tls_client));
  client->loop = loop;
  client->allocator = allocator;
  client->connect = connect;
  client->data = data;
  client->close = close;
  client->user = user;

  inox_status status = inox_tls_client_setup_ssl(client, servername == 0 ? host : servername);

  if (status != INOX_OK) {
    inox_tls_client_free(client);
    return status;
  }

  NetSocket socket = NetSocket::connect(
    loop,
    host,
    port,
    inox_tls_on_tcp_connect,
    inox_tls_on_tcp_data,
    inox_tls_on_tcp_close,
    client
  );

  if (inox::thrown()) {
    inox::take_exception();
    inox_tls_client_free(client);
    return INOX_ERR_TYPE;
  }

  client->socket = socket.raw();
  *out = client;
  return INOX_OK;
}

inox_status inox_tls_client_write(inox_tls_client* client, const char* bytes, size_t len) {
  return inox_tls_client_write_with_callback(client, bytes, len, 0, 0);
}

inox_status inox_tls_client_write_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
) {
  if (client == 0 || client->ssl == 0 || client->closing || (bytes == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  if (!client->handshake_done) {
    return INOX_ERR_UNSUPPORTED;
  }

  size_t offset = 0;

  while (offset < len) {
    size_t chunk = len - offset > 16384 ? 16384 : len - offset;
    int written = SSL_write(client->ssl, bytes + offset, (int)chunk);

    if (written <= 0) {
      inox_status status = inox_tls_ssl_error_status(client, written);
      inox_status flush_status = inox_tls_flush_net_bio(client);

      if (flush_status != INOX_OK) {
        return flush_status;
      }

      if (status == INOX_OK) {
        return INOX_ERR_UNSUPPORTED;
      }

      return status;
    }

    offset += (size_t)written;
    inox_status flush_status = inox_tls_flush_net_bio(client);

    if (flush_status != INOX_OK) {
      return flush_status;
    }
  }

  if (callback != 0) {
    return callback(user, client, INOX_OK);
  }

  return INOX_OK;
}

inox_status inox_tls_client_end(inox_tls_client* client, const char* bytes, size_t len) {
  return inox_tls_client_end_with_callback(client, bytes, len, 0, 0);
}

inox_status inox_tls_client_end_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
) {
  if (client == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = INOX_OK;

  if (bytes != 0 || len != 0) {
    status = inox_tls_client_write_with_callback(client, bytes, len, callback, user);
  } else if (callback != 0) {
    status = callback(user, client, INOX_OK);
  }

  if (status != INOX_OK) {
    return status;
  }

  if (client->ssl != 0 && client->handshake_done) {
    (void)SSL_shutdown(client->ssl);
    (void)inox_tls_flush_net_bio(client);
  }

  inox_tls_client_close(client);
  return INOX_OK;
}

inox_status inox_tls_client_destroy(inox_tls_client* client) {
  if (client == 0) {
    return INOX_ERR_TYPE;
  }

  inox_tls_client_close(client);
  return INOX_OK;
}

void inox_tls_client_close(inox_tls_client* client) {
  if (client == 0 || client->closing) {
    return;
  }

  client->closing = 1;

  if (client->socket != 0) {
    NetSocket(client->socket).close();
  }
}

static inox_status inox_tls_configure_verify(SSL_CTX* ctx) {
  if (ctx == 0) {
    return INOX_ERR_TYPE;
  }

  SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, 0);

#if defined(INOX_TLS_CA_BUNDLE) || defined(INOX_TLS_CA_PATH)
#if defined(INOX_TLS_CA_BUNDLE)
  const char* ca_bundle = INOX_TLS_CA_BUNDLE;
#else
  const char* ca_bundle = 0;
#endif
#if defined(INOX_TLS_CA_PATH)
  const char* ca_path = INOX_TLS_CA_PATH;
#else
  const char* ca_path = 0;
#endif

  return SSL_CTX_load_verify_locations(ctx, ca_bundle, ca_path) == 1 ? INOX_OK : INOX_ERR_FIELD;
#else
  return SSL_CTX_set_default_verify_paths(ctx) == 1 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status inox_tls_client_setup_ssl(inox_tls_client* client, const char* servername) {
  if (client == 0 || servername == 0) {
    return INOX_ERR_TYPE;
  }

  client->ctx = SSL_CTX_new(TLS_client_method());

  if (client->ctx == 0) {
    return INOX_ERR_OOM;
  }

  inox_status status = inox_tls_configure_verify(client->ctx);

  if (status != INOX_OK) {
    return status;
  }

  client->ssl = SSL_new(client->ctx);

  if (client->ssl == 0) {
    return INOX_ERR_OOM;
  }

  if (SSL_set_tlsext_host_name(client->ssl, servername) != 1 || SSL_set1_host(client->ssl, servername) != 1) {
    return INOX_ERR_FIELD;
  }

  BIO* ssl_bio = 0;
  BIO* net_bio = 0;

  if (BIO_new_bio_pair(&ssl_bio, 0, &net_bio, 0) != 1) {
    return INOX_ERR_OOM;
  }

  SSL_set_bio(client->ssl, ssl_bio, ssl_bio);
  client->net_bio = net_bio;
  SSL_set_connect_state(client->ssl);

  return INOX_OK;
}

static inox_status inox_tls_on_tcp_connect(void* user, inox_net_socket* socket, inox_status status) {
  inox_tls_client* client = (inox_tls_client*)user;

  if (client == 0) {
    return INOX_OK;
  }

  if (status != INOX_OK) {
    return inox_tls_fail_async(client, status);
  }

  NetSocket(socket).readStart();

  if (inox::thrown()) {
    inox::take_exception();
    return inox_tls_fail_async(client, INOX_ERR_FIELD);
  }

  return inox_tls_drive_handshake(client);
}

static void inox_tls_on_tcp_data(void* user, NetSocket socket, inox::StringView bytes) {
  (void)socket;
  inox_tls_client* client = (inox_tls_client*)user;

  if (client == 0 || client->net_bio == 0 || (bytes.bytes == 0 && bytes.len != 0)) {
    return;
  }

  size_t offset = 0;

  while (offset < bytes.len) {
    int written = BIO_write(client->net_bio, bytes.bytes + offset, (int)(bytes.len - offset));

    if (written <= 0) {
      (void)inox_tls_fail_async(client, INOX_ERR_FIELD);
      return;
    }

    offset += (size_t)written;
  }

  if (!client->handshake_done) {
    (void)inox_tls_drive_handshake(client);
    return;
  }

  (void)inox_tls_drain_plaintext(client);
}

static void inox_tls_on_tcp_close(void* user, inox_net_socket* socket) {
  (void)socket;
  inox_tls_client* client = (inox_tls_client*)user;

  if (client == 0) {
    return;
  }

  client->socket = 0;

  if (!client->connect_reported) {
    (void)inox_tls_report_connect(client, INOX_ERR_FIELD);
  }

  if (client->close != 0) {
    client->close(client->user, client);
  }

  inox_tls_client_free(client);
}

static inox_status inox_tls_drive_handshake(inox_tls_client* client) {
  if (client == 0 || client->ssl == 0) {
    return INOX_ERR_TYPE;
  }

  int result = SSL_do_handshake(client->ssl);
  inox_status flush_status = inox_tls_flush_net_bio(client);

  if (flush_status != INOX_OK) {
    return inox_tls_fail_async(client, flush_status);
  }

  if (result == 1) {
    if (SSL_get_verify_result(client->ssl) != X509_V_OK) {
      return inox_tls_fail_async(client, INOX_ERR_FIELD);
    }

    client->handshake_done = 1;
    return inox_tls_report_connect(client, INOX_OK);
  }

  inox_status status = inox_tls_ssl_error_status(client, result);

  if (status == INOX_OK) {
    return INOX_OK;
  }

  return inox_tls_fail_async(client, status);
}

static inox_status inox_tls_drain_plaintext(inox_tls_client* client) {
  if (client == 0 || client->ssl == 0) {
    return INOX_ERR_TYPE;
  }

  char buffer[8192];

  for (;;) {
    int read = SSL_read(client->ssl, buffer, (int)sizeof(buffer));

    if (read > 0) {
      if (client->data != 0) {
        inox_status status = client->data(client->user, client, buffer, (size_t)read);

        if (status != INOX_OK) {
          return status;
        }
      }

      continue;
    }

    inox_status status = inox_tls_ssl_error_status(client, read);
    inox_status flush_status = inox_tls_flush_net_bio(client);

    if (flush_status != INOX_OK) {
      return inox_tls_fail_async(client, flush_status);
    }

    if (status == INOX_OK) {
      return INOX_OK;
    }

    if (status == INOX_ERR_FIELD) {
      return inox_tls_fail_async(client, status);
    }

    inox_tls_client_close(client);
    return INOX_OK;
  }
}

static inox_status inox_tls_flush_net_bio(inox_tls_client* client) {
  if (client == 0 || client->net_bio == 0) {
    return INOX_ERR_TYPE;
  }

  char buffer[16384];

  for (;;) {
    int read = BIO_read(client->net_bio, buffer, (int)sizeof(buffer));

    if (read > 0) {
      if (client->socket == 0) {
        return INOX_ERR_FIELD;
      }

      NetSocket(client->socket).write(inox::StringView(buffer, (size_t)read));

      if (inox::thrown()) {
        inox::take_exception();
        return INOX_ERR_TYPE;
      }

      continue;
    }

    if (read < 0 && !BIO_should_retry(client->net_bio)) {
      return INOX_ERR_FIELD;
    }

    return INOX_OK;
  }
}

static inox_status inox_tls_report_connect(inox_tls_client* client, inox_status status) {
  if (client == 0 || client->connect_reported) {
    return INOX_OK;
  }

  client->connect_reported = 1;

  if (client->connect != 0) {
    return client->connect(client->user, client, status);
  }

  return INOX_OK;
}

static inox_status inox_tls_fail_async(inox_tls_client* client, inox_status status) {
  if (client == 0) {
    return INOX_OK;
  }

  inox_status callback_status = inox_tls_report_connect(client, status);
  inox_tls_client_close(client);

  return callback_status;
}

static inox_status inox_tls_ssl_error_status(inox_tls_client* client, int result) {
  if (client == 0 || client->ssl == 0) {
    return INOX_ERR_TYPE;
  }

  int error = SSL_get_error(client->ssl, result);

  if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
    return INOX_OK;
  }

  if (error == SSL_ERROR_ZERO_RETURN) {
    return INOX_ERR_UNSUPPORTED;
  }

  (void)ERR_get_error();
  return INOX_ERR_FIELD;
}

static void inox_tls_client_free(inox_tls_client* client) {
  if (client == 0 || client->allocator == 0) {
    return;
  }

  inox_allocator* allocator = client->allocator;

  if (client->ssl != 0) {
    SSL_free(client->ssl);
    client->ssl = 0;
  }

  if (client->net_bio != 0) {
    BIO_free(client->net_bio);
    client->net_bio = 0;
  }

  if (client->ctx != 0) {
    SSL_CTX_free(client->ctx);
    client->ctx = 0;
  }

  allocator->free(allocator->user, client, sizeof(inox_tls_client), alignof(inox_tls_client));
}
