#include "inox/tls.h"

#include <openssl/bio.h>
#include <openssl/err.h>
#include <openssl/pem.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>

#include <climits>
#include <new>
#include <utility>

#include "inox/net.h"

struct inox_tls_server {
  inox_allocator* allocator;
  SSL_CTX* ctx;
};

struct inox_tls_server_connection {
  inox_allocator* allocator;
  NetSocket socket;
  SSL* ssl;
  BIO* net_bio;
  inox_tls_server_handshake_fn handshake;
  inox_tls_server_data_fn data;
  inox_tls_server_error_fn error;
  inox_tls_server_close_fn close;
  void* user;
  int handshake_done;
  int handshake_reported;
  int closing;
};

namespace {

inox::Callback serverCallback(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* user
) {
  inox_value value = inox_undefined_value();

  if (allocator == nullptr ||
      inox_callback_new(allocator, call, user, nullptr, &value) != INOX_OK) {
    inox::throw_value(inox::String("TypeError: TLS server callback allocation failed"));
    return inox::Callback();
  }

  return inox::Callback(inox::adopt(value));
}

inox_status callbackResult(inox_value* out) {
  if (out != nullptr) {
    *out = inox_undefined_value();
  }

  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

inox_status sslErrorStatus(inox_tls_server_connection* connection, int result) {
  if (connection == nullptr || connection->ssl == nullptr) {
    return INOX_ERR_TYPE;
  }

  const int error = SSL_get_error(connection->ssl, result);

  if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
    return INOX_OK;
  }

  if (error == SSL_ERROR_ZERO_RETURN) {
    return INOX_ERR_UNSUPPORTED;
  }

  (void)ERR_get_error();
  return INOX_ERR_FIELD;
}

inox_status flushNetBio(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->net_bio == nullptr) {
    return INOX_ERR_TYPE;
  }

  char buffer[16384];

  for (;;) {
    const int read = BIO_read(connection->net_bio, buffer, static_cast<int>(sizeof(buffer)));

    if (read > 0) {
      if (connection->socket.tag != INOX_TAG_CLASS_INSTANCE) {
        return INOX_ERR_FIELD;
      }

      connection->socket.write(inox::StringView(buffer, static_cast<std::size_t>(read)));

      if (inox::thrown()) {
        inox::take_exception();
        return INOX_ERR_TYPE;
      }

      continue;
    }

    if (read < 0 && !BIO_should_retry(connection->net_bio)) {
      return INOX_ERR_FIELD;
    }

    return INOX_OK;
  }
}

inox_status reportHandshake(
  inox_tls_server_connection* connection,
  inox_status status
) {
  if (connection == nullptr || connection->handshake_reported) {
    return INOX_OK;
  }

  connection->handshake_reported = 1;

  if (connection->handshake != nullptr) {
    return connection->handshake(connection->user, connection, status);
  }

  return INOX_OK;
}

inox_status reportError(inox_tls_server_connection* connection, inox_status status) {
  if (connection == nullptr) {
    return INOX_OK;
  }

  if (!connection->handshake_reported) {
    return reportHandshake(connection, status);
  }

  if (connection->error != nullptr) {
    return connection->error(connection->user, connection, status);
  }

  return INOX_OK;
}

void closeConnection(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->closing) {
    return;
  }

  connection->closing = 1;

  if (connection->socket.tag == INOX_TAG_CLASS_INSTANCE) {
    connection->socket.destroy();

    if (inox::thrown()) {
      inox::take_exception();
    }
  }
}

inox_status failConnection(inox_tls_server_connection* connection, inox_status status) {
  const inox_status callback_status = reportError(connection, status);
  closeConnection(connection);
  return callback_status;
}

inox_status driveHandshake(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->ssl == nullptr) {
    return INOX_ERR_TYPE;
  }

  const int result = SSL_do_handshake(connection->ssl);
  const inox_status flush_status = flushNetBio(connection);

  if (flush_status != INOX_OK) {
    return failConnection(connection, flush_status);
  }

  if (result == 1) {
    connection->handshake_done = 1;
    return reportHandshake(connection, INOX_OK);
  }

  const inox_status status = sslErrorStatus(connection, result);
  return status == INOX_OK ? INOX_OK : failConnection(connection, status);
}

inox_status drainPlaintext(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->ssl == nullptr) {
    return INOX_ERR_TYPE;
  }

  char buffer[8192];

  for (;;) {
    const int read = SSL_read(connection->ssl, buffer, static_cast<int>(sizeof(buffer)));

    if (read > 0) {
      if (connection->data != nullptr) {
        const inox_status status = connection->data(
          connection->user,
          connection,
          buffer,
          static_cast<std::size_t>(read)
        );

        if (status != INOX_OK) {
          return status;
        }
      }

      continue;
    }

    const inox_status status = sslErrorStatus(connection, read);
    const inox_status flush_status = flushNetBio(connection);

    if (flush_status != INOX_OK) {
      return failConnection(connection, flush_status);
    }

    if (status == INOX_OK) {
      return INOX_OK;
    }

    if (status == INOX_ERR_FIELD) {
      return failConnection(connection, status);
    }

    closeConnection(connection);
    return INOX_OK;
  }
}

void freeConnection(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->allocator == nullptr) {
    return;
  }

  inox_allocator* allocator = connection->allocator;

  if (connection->ssl != nullptr) {
    SSL_free(connection->ssl);
    connection->ssl = nullptr;
  }

  if (connection->net_bio != nullptr) {
    BIO_free(connection->net_bio);
    connection->net_bio = nullptr;
  }

  connection->~inox_tls_server_connection();
  allocator->free(
    allocator->user,
    connection,
    sizeof(inox_tls_server_connection),
    alignof(inox_tls_server_connection)
  );
}

inox_status onTcpData(
  void* user,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_STRING) {
    return INOX_ERR_TYPE;
  }

  inox_tls_server_connection* connection = static_cast<inox_tls_server_connection*>(user);
  inox::String data{inox::Value(args[0])};
  const inox::StringView bytes = data;

  if (connection == nullptr || connection->net_bio == nullptr ||
      (bytes.bytes == nullptr && bytes.len != 0)) {
    return INOX_ERR_TYPE;
  }

  std::size_t offset = 0;

  while (offset < bytes.len) {
    const int written = BIO_write(
      connection->net_bio,
      bytes.bytes + offset,
      static_cast<int>(bytes.len - offset)
    );

    if (written <= 0) {
      if (BIO_should_retry(connection->net_bio)) {
        const inox_status status = connection->handshake_done
          ? drainPlaintext(connection)
          : driveHandshake(connection);

        if (status != INOX_OK || connection->closing) {
          return callbackResult(out);
        }

        continue;
      }

      (void)failConnection(connection, INOX_ERR_FIELD);
      return callbackResult(out);
    }

    offset += static_cast<std::size_t>(written);

    if (!connection->handshake_done) {
      const inox_status status = driveHandshake(connection);

      if (status != INOX_OK || connection->closing) {
        return callbackResult(out);
      }
    }

    if (connection->handshake_done) {
      const inox_status status = drainPlaintext(connection);

      if (status != INOX_OK || connection->closing) {
        return callbackResult(out);
      }
    }
  }

  return callbackResult(out);
}

inox_status onTcpError(
  void* user,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  if (user == nullptr || args == nullptr || arg_count != 1 ||
      args[0].tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  (void)failConnection(static_cast<inox_tls_server_connection*>(user), INOX_ERR_FIELD);
  return callbackResult(out);
}

inox_status onTcpClose(
  void* user,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_BOOL) {
    return INOX_ERR_TYPE;
  }

  inox_tls_server_connection* connection = static_cast<inox_tls_server_connection*>(user);

  if (connection == nullptr) {
    return INOX_ERR_TYPE;
  }

  connection->socket = NetSocket();

  if (!connection->handshake_reported) {
    (void)reportHandshake(connection, INOX_ERR_FIELD);
  }

  if (connection->close != nullptr) {
    connection->close(connection->user, connection);
  }

  freeConnection(connection);
  return callbackResult(out);
}

bool configureIdentity(
  SSL_CTX* ctx,
  const char* certificate,
  std::size_t certificate_len,
  const char* private_key,
  std::size_t private_key_len
) {
  if (ctx == nullptr || certificate == nullptr || private_key == nullptr ||
      certificate_len == 0 || private_key_len == 0 ||
      certificate_len > static_cast<std::size_t>(INT_MAX) ||
      private_key_len > static_cast<std::size_t>(INT_MAX)) {
    return false;
  }

  BIO* certificate_bio = BIO_new_mem_buf(
    certificate,
    static_cast<int>(certificate_len)
  );
  BIO* private_key_bio = BIO_new_mem_buf(
    private_key,
    static_cast<int>(private_key_len)
  );

  if (certificate_bio == nullptr || private_key_bio == nullptr) {
    BIO_free(certificate_bio);
    BIO_free(private_key_bio);
    return false;
  }

  X509* parsed_certificate = PEM_read_bio_X509(certificate_bio, nullptr, nullptr, nullptr);
  EVP_PKEY* parsed_private_key = PEM_read_bio_PrivateKey(private_key_bio, nullptr, nullptr, nullptr);
  BIO_free(certificate_bio);
  BIO_free(private_key_bio);

  if (parsed_certificate == nullptr || parsed_private_key == nullptr) {
    X509_free(parsed_certificate);
    EVP_PKEY_free(parsed_private_key);
    return false;
  }

  const bool configured =
    SSL_CTX_use_certificate(ctx, parsed_certificate) == 1 &&
    SSL_CTX_use_PrivateKey(ctx, parsed_private_key) == 1 &&
    SSL_CTX_check_private_key(ctx) == 1;
  X509_free(parsed_certificate);
  EVP_PKEY_free(parsed_private_key);
  return configured;
}

} // namespace

inox_status inox_tls_server_create(
  inox_loop* loop,
  const char* certificate,
  std::size_t certificate_len,
  const char* private_key,
  std::size_t private_key_len,
  inox_tls_server** out
) {
  if (loop == nullptr || loop->allocator == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  *out = nullptr;
  inox_allocator* allocator = loop->allocator;
  auto* server = static_cast<inox_tls_server*>(allocator->alloc(
    allocator->user,
    sizeof(inox_tls_server),
    alignof(inox_tls_server)
  ));

  if (server == nullptr) {
    return INOX_ERR_OOM;
  }

  new (server) inox_tls_server{};
  server->allocator = allocator;
  server->ctx = SSL_CTX_new(TLS_server_method());

  if (server->ctx == nullptr ||
      !configureIdentity(
        server->ctx,
        certificate,
        certificate_len,
        private_key,
        private_key_len
      )) {
    inox_tls_server_destroy(server);
    return INOX_ERR_FIELD;
  }

  *out = server;
  return INOX_OK;
}

void inox_tls_server_destroy(inox_tls_server* server) {
  if (server == nullptr || server->allocator == nullptr) {
    return;
  }

  inox_allocator* allocator = server->allocator;

  if (server->ctx != nullptr) {
    SSL_CTX_free(server->ctx);
    server->ctx = nullptr;
  }

  server->~inox_tls_server();
  allocator->free(
    allocator->user,
    server,
    sizeof(inox_tls_server),
    alignof(inox_tls_server)
  );
}

inox_status inox_tls_server_accept(
  inox_tls_server* server,
  inox_value socket,
  inox_tls_server_handshake_fn handshake,
  inox_tls_server_data_fn data,
  inox_tls_server_error_fn error,
  inox_tls_server_close_fn close,
  void* user,
  inox_tls_server_connection** out
) {
  if (server == nullptr || server->allocator == nullptr || server->ctx == nullptr ||
      socket.tag != INOX_TAG_CLASS_INSTANCE || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  *out = nullptr;
  inox_allocator* allocator = server->allocator;
  auto* connection = static_cast<inox_tls_server_connection*>(allocator->alloc(
    allocator->user,
    sizeof(inox_tls_server_connection),
    alignof(inox_tls_server_connection)
  ));

  if (connection == nullptr) {
    return INOX_ERR_OOM;
  }

  new (connection) inox_tls_server_connection{};
  connection->allocator = allocator;
  connection->socket = NetSocket(inox::Value(socket));
  connection->handshake = handshake;
  connection->data = data;
  connection->error = error;
  connection->close = close;
  connection->user = user;
  connection->ssl = SSL_new(server->ctx);

  BIO* ssl_bio = nullptr;
  BIO* net_bio = nullptr;

  if (connection->ssl == nullptr || BIO_new_bio_pair(&ssl_bio, 0, &net_bio, 0) != 1) {
    BIO_free(ssl_bio);
    BIO_free(net_bio);
    freeConnection(connection);
    return INOX_ERR_OOM;
  }

  SSL_set_bio(connection->ssl, ssl_bio, ssl_bio);
  connection->net_bio = net_bio;
  SSL_set_accept_state(connection->ssl);
  inox::Callback tcp_close = serverCallback(allocator, onTcpClose, connection);
  inox::Callback tcp_data = serverCallback(allocator, onTcpData, connection);
  inox::Callback tcp_error = serverCallback(allocator, onTcpError, connection);

  if (inox::thrown()) {
    inox::take_exception();
    freeConnection(connection);
    return INOX_ERR_OOM;
  }

  connection->socket.on("close", std::move(tcp_close));

  if (!inox::thrown()) {
    connection->socket.on("data", std::move(tcp_data));
  }

  if (!inox::thrown()) {
    connection->socket.on("error", std::move(tcp_error));
  }

  *out = connection;

  if (inox::thrown()) {
    inox::take_exception();
    (void)failConnection(connection, INOX_ERR_OOM);
    return INOX_OK;
  }

  (void)driveHandshake(connection);
  return INOX_OK;
}

inox_status inox_tls_server_connection_socket(
  inox_tls_server_connection* connection,
  inox_value* out
) {
  if (connection == nullptr || out == nullptr ||
      connection->socket.tag != INOX_TAG_CLASS_INSTANCE) {
    return INOX_ERR_TYPE;
  }

  *out = connection->socket.raw();
  inox_retain(*out);
  return INOX_OK;
}

inox_status inox_tls_server_connection_write(
  inox_tls_server_connection* connection,
  const char* bytes,
  std::size_t len
) {
  if (connection == nullptr || connection->ssl == nullptr || connection->closing ||
      !connection->handshake_done || (bytes == nullptr && len != 0)) {
    return INOX_ERR_TYPE;
  }

  std::size_t offset = 0;

  while (offset < len) {
    const std::size_t chunk = len - offset > 16384 ? 16384 : len - offset;
    const int written = SSL_write(
      connection->ssl,
      bytes + offset,
      static_cast<int>(chunk)
    );

    if (written <= 0) {
      const inox_status status = sslErrorStatus(connection, written);
      const inox_status flush_status = flushNetBio(connection);

      if (flush_status != INOX_OK) {
        return flush_status;
      }

      return status == INOX_OK ? INOX_ERR_UNSUPPORTED : status;
    }

    offset += static_cast<std::size_t>(written);
    const inox_status flush_status = flushNetBio(connection);

    if (flush_status != INOX_OK) {
      return flush_status;
    }
  }

  return INOX_OK;
}

inox_status inox_tls_server_connection_shutdown(inox_tls_server_connection* connection) {
  if (connection == nullptr || connection->ssl == nullptr || connection->closing ||
      !connection->handshake_done) {
    return INOX_ERR_TYPE;
  }

  (void)SSL_shutdown(connection->ssl);
  return flushNetBio(connection);
}

inox_status inox_tls_server_connection_destroy(inox_tls_server_connection* connection) {
  if (connection == nullptr) {
    return INOX_ERR_TYPE;
  }

  closeConnection(connection);
  return INOX_OK;
}
