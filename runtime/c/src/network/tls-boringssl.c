#include "ccjs/tls.h"
#include "ccjs/net.h"

#include <openssl/bio.h>
#include <openssl/err.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>

#include <stdlib.h>
#include <string.h>

struct ccjs_tls_client {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_socket* socket;
  SSL_CTX* ctx;
  SSL* ssl;
  BIO* net_bio;
  ccjs_tls_connect_fn connect;
  ccjs_tls_data_fn data;
  ccjs_tls_close_fn close;
  void* user;
  int handshake_done;
  int connect_reported;
  int closing;
};

static ccjs_status ccjs_tls_configure_verify(SSL_CTX* ctx);
static ccjs_status ccjs_tls_client_setup_ssl(ccjs_tls_client* client, const char* servername);
static ccjs_status ccjs_tls_on_tcp_connect(void* user, ccjs_net_socket* socket, ccjs_status status);
static ccjs_status ccjs_tls_on_tcp_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_tls_on_tcp_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_tls_drive_handshake(ccjs_tls_client* client);
static ccjs_status ccjs_tls_drain_plaintext(ccjs_tls_client* client);
static ccjs_status ccjs_tls_flush_net_bio(ccjs_tls_client* client);
static ccjs_status ccjs_tls_report_connect(ccjs_tls_client* client, ccjs_status status);
static ccjs_status ccjs_tls_fail_async(ccjs_tls_client* client, ccjs_status status);
static ccjs_status ccjs_tls_ssl_error_status(ccjs_tls_client* client, int result);
static void ccjs_tls_client_free(ccjs_tls_client* client);

ccjs_status ccjs_tls_connect(
  ccjs_loop* loop,
  const char* host,
  int port,
  const char* servername,
  ccjs_tls_connect_fn connect,
  ccjs_tls_data_fn data,
  ccjs_tls_close_fn close,
  void* user,
  ccjs_tls_client** out
) {
  if (loop == 0 || loop->allocator == 0 || host == 0 || port <= 0 || port > 65535 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_allocator* allocator = loop->allocator;
  ccjs_tls_client* client = allocator->alloc(allocator->user, sizeof(ccjs_tls_client), _Alignof(ccjs_tls_client));

  if (client == 0) {
    return CCJS_ERR_OOM;
  }

  memset(client, 0, sizeof(ccjs_tls_client));
  client->loop = loop;
  client->allocator = allocator;
  client->connect = connect;
  client->data = data;
  client->close = close;
  client->user = user;

  ccjs_status status = ccjs_tls_client_setup_ssl(client, servername == 0 ? host : servername);

  if (status != CCJS_OK) {
    ccjs_tls_client_free(client);
    return status;
  }

  status = ccjs_net_connect(
    loop,
    host,
    port,
    ccjs_tls_on_tcp_connect,
    ccjs_tls_on_tcp_data,
    ccjs_tls_on_tcp_close,
    client,
    &client->socket
  );

  if (status != CCJS_OK) {
    ccjs_tls_client_free(client);
    return status;
  }

  *out = client;
  return CCJS_OK;
}

ccjs_status ccjs_tls_client_write(ccjs_tls_client* client, const char* bytes, size_t len) {
  return ccjs_tls_client_write_with_callback(client, bytes, len, 0, 0);
}

ccjs_status ccjs_tls_client_write_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
) {
  if (client == 0 || client->ssl == 0 || client->closing || (bytes == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (!client->handshake_done) {
    return CCJS_ERR_UNSUPPORTED;
  }

  size_t offset = 0;

  while (offset < len) {
    size_t chunk = len - offset > 16384 ? 16384 : len - offset;
    int written = SSL_write(client->ssl, bytes + offset, (int)chunk);

    if (written <= 0) {
      ccjs_status status = ccjs_tls_ssl_error_status(client, written);
      ccjs_status flush_status = ccjs_tls_flush_net_bio(client);

      if (flush_status != CCJS_OK) {
        return flush_status;
      }

      if (status == CCJS_OK) {
        return CCJS_ERR_UNSUPPORTED;
      }

      return status;
    }

    offset += (size_t)written;
    ccjs_status flush_status = ccjs_tls_flush_net_bio(client);

    if (flush_status != CCJS_OK) {
      return flush_status;
    }
  }

  if (callback != 0) {
    return callback(user, client, CCJS_OK);
  }

  return CCJS_OK;
}

ccjs_status ccjs_tls_client_end(ccjs_tls_client* client, const char* bytes, size_t len) {
  return ccjs_tls_client_end_with_callback(client, bytes, len, 0, 0);
}

ccjs_status ccjs_tls_client_end_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
) {
  if (client == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status status = CCJS_OK;

  if (bytes != 0 || len != 0) {
    status = ccjs_tls_client_write_with_callback(client, bytes, len, callback, user);
  } else if (callback != 0) {
    status = callback(user, client, CCJS_OK);
  }

  if (status != CCJS_OK) {
    return status;
  }

  if (client->ssl != 0 && client->handshake_done) {
    (void)SSL_shutdown(client->ssl);
    (void)ccjs_tls_flush_net_bio(client);
  }

  ccjs_tls_client_close(client);
  return CCJS_OK;
}

ccjs_status ccjs_tls_client_destroy(ccjs_tls_client* client) {
  if (client == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_tls_client_close(client);
  return CCJS_OK;
}

void ccjs_tls_client_close(ccjs_tls_client* client) {
  if (client == 0 || client->closing) {
    return;
  }

  client->closing = 1;

  if (client->socket != 0) {
    ccjs_net_socket_close(client->socket);
  }
}

static ccjs_status ccjs_tls_configure_verify(SSL_CTX* ctx) {
  if (ctx == 0) {
    return CCJS_ERR_TYPE;
  }

  SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, 0);

#if defined(CCJS_TLS_CA_BUNDLE) || defined(CCJS_TLS_CA_PATH)
#if defined(CCJS_TLS_CA_BUNDLE)
  const char* ca_bundle = CCJS_TLS_CA_BUNDLE;
#else
  const char* ca_bundle = 0;
#endif
#if defined(CCJS_TLS_CA_PATH)
  const char* ca_path = CCJS_TLS_CA_PATH;
#else
  const char* ca_path = 0;
#endif

  return SSL_CTX_load_verify_locations(ctx, ca_bundle, ca_path) == 1 ? CCJS_OK : CCJS_ERR_FIELD;
#else
  return SSL_CTX_set_default_verify_paths(ctx) == 1 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
#endif
}

static ccjs_status ccjs_tls_client_setup_ssl(ccjs_tls_client* client, const char* servername) {
  if (client == 0 || servername == 0) {
    return CCJS_ERR_TYPE;
  }

  client->ctx = SSL_CTX_new(TLS_client_method());

  if (client->ctx == 0) {
    return CCJS_ERR_OOM;
  }

  ccjs_status status = ccjs_tls_configure_verify(client->ctx);

  if (status != CCJS_OK) {
    return status;
  }

  client->ssl = SSL_new(client->ctx);

  if (client->ssl == 0) {
    return CCJS_ERR_OOM;
  }

  if (SSL_set_tlsext_host_name(client->ssl, servername) != 1 || SSL_set1_host(client->ssl, servername) != 1) {
    return CCJS_ERR_FIELD;
  }

  BIO* ssl_bio = 0;
  BIO* net_bio = 0;

  if (BIO_new_bio_pair(&ssl_bio, 0, &net_bio, 0) != 1) {
    return CCJS_ERR_OOM;
  }

  SSL_set_bio(client->ssl, ssl_bio, ssl_bio);
  client->net_bio = net_bio;
  SSL_set_connect_state(client->ssl);

  return CCJS_OK;
}

static ccjs_status ccjs_tls_on_tcp_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  ccjs_tls_client* client = (ccjs_tls_client*)user;

  if (client == 0) {
    return CCJS_OK;
  }

  if (status != CCJS_OK) {
    return ccjs_tls_fail_async(client, status);
  }

  if (ccjs_net_socket_read_start(socket) != CCJS_OK) {
    return ccjs_tls_fail_async(client, CCJS_ERR_FIELD);
  }

  return ccjs_tls_drive_handshake(client);
}

static ccjs_status ccjs_tls_on_tcp_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  ccjs_tls_client* client = (ccjs_tls_client*)user;

  if (client == 0 || client->net_bio == 0 || bytes == 0) {
    return CCJS_OK;
  }

  size_t offset = 0;

  while (offset < len) {
    int written = BIO_write(client->net_bio, bytes + offset, (int)(len - offset));

    if (written <= 0) {
      return ccjs_tls_fail_async(client, CCJS_ERR_FIELD);
    }

    offset += (size_t)written;
  }

  if (!client->handshake_done) {
    return ccjs_tls_drive_handshake(client);
  }

  return ccjs_tls_drain_plaintext(client);
}

static void ccjs_tls_on_tcp_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  ccjs_tls_client* client = (ccjs_tls_client*)user;

  if (client == 0) {
    return;
  }

  client->socket = 0;

  if (!client->connect_reported) {
    (void)ccjs_tls_report_connect(client, CCJS_ERR_FIELD);
  }

  if (client->close != 0) {
    client->close(client->user, client);
  }

  ccjs_tls_client_free(client);
}

static ccjs_status ccjs_tls_drive_handshake(ccjs_tls_client* client) {
  if (client == 0 || client->ssl == 0) {
    return CCJS_ERR_TYPE;
  }

  int result = SSL_do_handshake(client->ssl);
  ccjs_status flush_status = ccjs_tls_flush_net_bio(client);

  if (flush_status != CCJS_OK) {
    return ccjs_tls_fail_async(client, flush_status);
  }

  if (result == 1) {
    if (SSL_get_verify_result(client->ssl) != X509_V_OK) {
      return ccjs_tls_fail_async(client, CCJS_ERR_FIELD);
    }

    client->handshake_done = 1;
    return ccjs_tls_report_connect(client, CCJS_OK);
  }

  ccjs_status status = ccjs_tls_ssl_error_status(client, result);

  if (status == CCJS_OK) {
    return CCJS_OK;
  }

  return ccjs_tls_fail_async(client, status);
}

static ccjs_status ccjs_tls_drain_plaintext(ccjs_tls_client* client) {
  if (client == 0 || client->ssl == 0) {
    return CCJS_ERR_TYPE;
  }

  char buffer[8192];

  for (;;) {
    int read = SSL_read(client->ssl, buffer, (int)sizeof(buffer));

    if (read > 0) {
      if (client->data != 0) {
        ccjs_status status = client->data(client->user, client, buffer, (size_t)read);

        if (status != CCJS_OK) {
          return status;
        }
      }

      continue;
    }

    ccjs_status status = ccjs_tls_ssl_error_status(client, read);
    ccjs_status flush_status = ccjs_tls_flush_net_bio(client);

    if (flush_status != CCJS_OK) {
      return ccjs_tls_fail_async(client, flush_status);
    }

    if (status == CCJS_OK) {
      return CCJS_OK;
    }

    if (status == CCJS_ERR_FIELD) {
      return ccjs_tls_fail_async(client, status);
    }

    ccjs_tls_client_close(client);
    return CCJS_OK;
  }
}

static ccjs_status ccjs_tls_flush_net_bio(ccjs_tls_client* client) {
  if (client == 0 || client->net_bio == 0) {
    return CCJS_ERR_TYPE;
  }

  char buffer[16384];

  for (;;) {
    int read = BIO_read(client->net_bio, buffer, (int)sizeof(buffer));

    if (read > 0) {
      if (client->socket == 0) {
        return CCJS_ERR_FIELD;
      }

      ccjs_status status = ccjs_net_socket_write(client->socket, buffer, (size_t)read);

      if (status != CCJS_OK) {
        return status;
      }

      continue;
    }

    if (read < 0 && !BIO_should_retry(client->net_bio)) {
      return CCJS_ERR_FIELD;
    }

    return CCJS_OK;
  }
}

static ccjs_status ccjs_tls_report_connect(ccjs_tls_client* client, ccjs_status status) {
  if (client == 0 || client->connect_reported) {
    return CCJS_OK;
  }

  client->connect_reported = 1;

  if (client->connect != 0) {
    return client->connect(client->user, client, status);
  }

  return CCJS_OK;
}

static ccjs_status ccjs_tls_fail_async(ccjs_tls_client* client, ccjs_status status) {
  if (client == 0) {
    return CCJS_OK;
  }

  ccjs_status callback_status = ccjs_tls_report_connect(client, status);
  ccjs_tls_client_close(client);

  return callback_status;
}

static ccjs_status ccjs_tls_ssl_error_status(ccjs_tls_client* client, int result) {
  if (client == 0 || client->ssl == 0) {
    return CCJS_ERR_TYPE;
  }

  int error = SSL_get_error(client->ssl, result);

  if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
    return CCJS_OK;
  }

  if (error == SSL_ERROR_ZERO_RETURN) {
    return CCJS_ERR_UNSUPPORTED;
  }

  (void)ERR_get_error();
  return CCJS_ERR_FIELD;
}

static void ccjs_tls_client_free(ccjs_tls_client* client) {
  if (client == 0 || client->allocator == 0) {
    return;
  }

  ccjs_allocator* allocator = client->allocator;

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

  allocator->free(allocator->user, client, sizeof(ccjs_tls_client), _Alignof(ccjs_tls_client));
}
