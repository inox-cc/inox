#include "ccjs/fetch.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "ccjs/net.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct ccjs_fetch_operation {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_socket* socket;
  ccjs_fetch_done_fn done;
  void* user;
  char host[256];
  char path[512];
  char request[4096];
  size_t request_len;
  int port;
  char response[8192];
  size_t response_len;
  int completed;
} ccjs_fetch_operation;

typedef struct ccjs_fetch_promise_request {
  ccjs_loop* loop;
  ccjs_promise* promise;
  char* url;
  size_t url_len;
} ccjs_fetch_promise_request;

enum {
  CCJS_FETCH_RESPONSE_STATUS_INDEX = 0,
  CCJS_FETCH_RESPONSE_OK_INDEX = 1,
  CCJS_FETCH_RESPONSE_URL_INDEX = 2,
  CCJS_FETCH_RESPONSE_BODY_INDEX = 3
};

static ccjs_status ccjs_fetch_parse_url(const char* url, char* host, size_t host_len, int* port, char* path, size_t path_len);
static ccjs_status ccjs_fetch_copy_url(ccjs_allocator* allocator, const char* url, size_t url_len, char** out);
static ccjs_status ccjs_fetch_build_request(ccjs_fetch_operation* request, const ccjs_fetch_init* init);
static ccjs_status ccjs_fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len);
static ccjs_status ccjs_fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text);
static ccjs_status ccjs_fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value);
static int ccjs_fetch_header_name_equals(const char* name, size_t name_len, const char* expected);
static int ccjs_fetch_headers_include(const ccjs_fetch_header* headers, size_t header_count, const char* name);
static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status);
static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_operation* request);
static const char* ccjs_fetch_find_header_end(const char* bytes, size_t len);
static int ccjs_fetch_parse_status(const char* bytes, size_t len);
static int ccjs_fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out);
static ccjs_status ccjs_fetch_finish(ccjs_fetch_operation* request, ccjs_status status, const ccjs_fetch_response* response);
static ccjs_status ccjs_fetch_promise_done(void* user, ccjs_status status, const ccjs_fetch_response* response);
static ccjs_status ccjs_fetch_response_new(
  ccjs_allocator* allocator,
  const char* url,
  size_t url_len,
  const ccjs_fetch_response* response,
  ccjs_value* out
);
static ccjs_status ccjs_fetch_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status);
static ccjs_status ccjs_fetch_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out);
static const char* ccjs_fetch_error_message(ccjs_status status);
static void ccjs_fetch_promise_request_free(ccjs_fetch_promise_request* request);

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  return ccjs_fetch_request(loop, url, 0, done, user);
}

ccjs_status ccjs_fetch_request(ccjs_loop* loop, const char* url, const ccjs_fetch_init* init, ccjs_fetch_done_fn done, void* user) {
  if (loop == 0 || loop->allocator == 0 || url == 0 || done == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_fetch_operation* request =
    allocator->alloc(allocator->user, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));

  if (request == 0) {
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fetch_operation));
  request->loop = loop;
  request->allocator = allocator;
  request->done = done;
  request->user = user;

  ccjs_status status = ccjs_fetch_parse_url(url, request->host, sizeof(request->host), &request->port, request->path, sizeof(request->path));

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));
    return status;
  }

  status = ccjs_fetch_build_request(request, init);

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));
    return status;
  }

  status = ccjs_net_connect(
    loop,
    request->host,
    request->port,
    ccjs_fetch_on_connect,
    ccjs_fetch_on_data,
    ccjs_fetch_on_close,
    request,
    &request->socket
  );

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));
    return status;
  }

  return CCJS_OK;
}

ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out) {
  return ccjs_fetch_with_init(loop, url, url_len, 0, out);
}

ccjs_status ccjs_fetch_with_init(
  ccjs_loop* loop,
  const char* url,
  size_t url_len,
  const ccjs_fetch_init* init,
  ccjs_promise** out
) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (loop == 0 || loop->allocator == 0 || url == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = 0;
  ccjs_status status = ccjs_promise_new(loop, &promise);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_fetch_promise_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_fetch_promise_request), _Alignof(ccjs_fetch_promise_request));

  if (request == 0) {
    ccjs_promise_release(promise);
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fetch_promise_request));
  request->loop = loop;
  request->promise = promise;
  request->url_len = url_len;
  ccjs_promise_retain(promise);

  status = ccjs_fetch_copy_url(allocator, url, url_len, &request->url);

  if (status == CCJS_OK) {
    status = ccjs_fetch_request(loop, request->url, init, ccjs_fetch_promise_done, request);
  }

  if (status != CCJS_OK) {
    ccjs_status reject_status = ccjs_fetch_reject_status(loop, promise, status);
    ccjs_fetch_promise_request_free(request);

    if (reject_status != CCJS_OK) {
      ccjs_promise_release(promise);
      return reject_status;
    }
  }

  *out = promise;

  return CCJS_OK;
}

ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out) {
  if (loop == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  ccjs_value body = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get(response, "__ccjsBody", 10, &body);

  if (status != CCJS_OK) {
    return status;
  }

  if (body.tag != CCJS_TAG_STRING || body.as.ref == 0) {
    ccjs_release(body);
    return CCJS_ERR_TYPE;
  }

  status = ccjs_promise_resolved(loop, body, out);
  ccjs_release(body);

  return status;
}

static ccjs_status ccjs_fetch_parse_url(const char* url, char* host, size_t host_len, int* port, char* path, size_t path_len) {
  const char* prefix = "http://";
  size_t prefix_len = strlen(prefix);

  if (strncmp(url, prefix, prefix_len) != 0 || host == 0 || port == 0 || path == 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* cursor = url + prefix_len;
  const char* host_start = cursor;

  while (*cursor != '\0' && *cursor != ':' && *cursor != '/') {
    cursor += 1;
  }

  size_t parsed_host_len = (size_t)(cursor - host_start);

  if (parsed_host_len == 0 || parsed_host_len >= host_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(host, host_start, parsed_host_len);
  host[parsed_host_len] = '\0';
  *port = 80;

  if (*cursor == ':') {
    cursor += 1;
    int parsed_port = 0;

    if (!isdigit((unsigned char)*cursor)) {
      return CCJS_ERR_UNSUPPORTED;
    }

    while (isdigit((unsigned char)*cursor)) {
      parsed_port = parsed_port * 10 + (*cursor - '0');
      cursor += 1;
    }

    if (parsed_port <= 0 || parsed_port > 65535) {
      return CCJS_ERR_UNSUPPORTED;
    }

    *port = parsed_port;
  }

  const char* parsed_path = *cursor == '/' ? cursor : "/";
  size_t parsed_path_len = strlen(parsed_path);

  if (parsed_path_len == 0 || parsed_path_len >= path_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(path, parsed_path, parsed_path_len + 1);
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_copy_url(ccjs_allocator* allocator, const char* url, size_t url_len, char** out) {
  if (allocator == 0 || url == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = allocator->alloc(allocator->user, url_len + 1, _Alignof(char));

  if (*out == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(*out, url, url_len);
  (*out)[url_len] = '\0';

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_build_request(ccjs_fetch_operation* request, const ccjs_fetch_init* init) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  const char* method = "GET";
  size_t method_len = 3;
  const ccjs_fetch_header* headers = 0;
  size_t header_count = 0;
  const char* body = 0;
  size_t body_len = 0;

  if (init != 0) {
    if (init->method != 0 && init->method_len > 0) {
      method = init->method;
      method_len = init->method_len;
    }

    headers = init->headers;
    header_count = init->header_count;
    body = init->body;
    body_len = init->body_len;
  }

  if (method == 0 || method_len == 0 || method_len > 32) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (header_count > 0 && headers == 0) {
    return CCJS_ERR_TYPE;
  }

  if (body_len > 0 && body == 0) {
    return CCJS_ERR_TYPE;
  }

  size_t offset = 0;
  ccjs_status status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, method, method_len);

  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, " ");
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, request->path);
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, " HTTP/1.1\r\nHost: ");
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, request->host);
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");

  for (size_t index = 0; status == CCJS_OK && index < header_count; index += 1) {
    const ccjs_fetch_header* header = headers + index;

    if (header->name == 0 || header->name_len == 0 || header->value == 0) {
      return CCJS_ERR_TYPE;
    }

    status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, header->name, header->name_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, ": ");
    if (status == CCJS_OK) status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, header->value, header->value_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == CCJS_OK && body_len > 0 && !ccjs_fetch_headers_include(headers, header_count, "Content-Length")) {
    status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "Content-Length: ");
    if (status == CCJS_OK) status = ccjs_fetch_append_size(request->request, sizeof(request->request), &offset, body_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == CCJS_OK && !ccjs_fetch_headers_include(headers, header_count, "Connection")) {
    status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "Connection: close\r\n");
  }

  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  if (status == CCJS_OK && body_len > 0) {
    status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, body, body_len);
  }

  if (status != CCJS_OK) {
    return status;
  }

  request->request_len = offset;
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len) {
  if (out == 0 || offset == 0 || (len > 0 && bytes == 0)) {
    return CCJS_ERR_TYPE;
  }

  if (*offset > out_size || len > out_size - *offset) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (len > 0) {
    memcpy(out + *offset, bytes, len);
  }

  *offset += len;
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text) {
  if (text == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_fetch_append_bytes(out, out_size, offset, text, strlen(text));
}

static ccjs_status ccjs_fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value) {
  char buffer[32];
  int written = snprintf(buffer, sizeof(buffer), "%zu", value);

  if (written < 0 || (size_t)written >= sizeof(buffer)) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_fetch_append_bytes(out, out_size, offset, buffer, (size_t)written);
}

static int ccjs_fetch_header_name_equals(const char* name, size_t name_len, const char* expected) {
  if (name == 0 || expected == 0 || strlen(expected) != name_len) {
    return 0;
  }

  for (size_t index = 0; index < name_len; index += 1) {
    if (tolower((unsigned char)name[index]) != tolower((unsigned char)expected[index])) {
      return 0;
    }
  }

  return 1;
}

static int ccjs_fetch_headers_include(const ccjs_fetch_header* headers, size_t header_count, const char* name) {
  if (headers == 0 || name == 0) {
    return 0;
  }

  for (size_t index = 0; index < header_count; index += 1) {
    if (ccjs_fetch_header_name_equals(headers[index].name, headers[index].name_len, name)) {
      return 1;
    }
  }

  return 0;
}

static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  if (ccjs_net_socket_read_start(socket) != CCJS_OK) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  return ccjs_net_socket_write(socket, request->request, request->request_len);
}

static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (request->response_len + len > sizeof(request->response)) {
    return ccjs_fetch_finish(request, CCJS_ERR_UNSUPPORTED, 0);
  }

  memcpy(request->response + request->response_len, bytes, len);
  request->response_len += len;

  return ccjs_fetch_try_complete(request);
}

static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (request == 0) {
    return;
  }

  if (!request->completed) {
    ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  request->allocator->free(request->allocator->user, request, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));
}

static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_operation* request) {
  const char* header_end = ccjs_fetch_find_header_end(request->response, request->response_len);

  if (header_end == 0) {
    return CCJS_OK;
  }

  size_t header_len = (size_t)(header_end - request->response);
  size_t content_len = 0;

  if (!ccjs_fetch_parse_content_length(request->response, header_len, &content_len)) {
    return CCJS_OK;
  }

  if (request->response_len < header_len + content_len) {
    return CCJS_OK;
  }

  int status = ccjs_fetch_parse_status(request->response, header_len);

  if (status <= 0) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  ccjs_fetch_response response = {
    status,
    status >= 200 && status < 300,
    request->response,
    header_len,
    request->response + header_len,
    content_len
  };

  return ccjs_fetch_finish(request, CCJS_OK, &response);
}

static const char* ccjs_fetch_find_header_end(const char* bytes, size_t len) {
  if (bytes == 0 || len < 4) {
    return 0;
  }

  for (size_t index = 0; index + 3 < len; index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n' && bytes[index + 2] == '\r' && bytes[index + 3] == '\n') {
      return bytes + index + 4;
    }
  }

  return 0;
}

static int ccjs_fetch_parse_status(const char* bytes, size_t len) {
  const char* first_space = memchr(bytes, ' ', len);

  if (first_space == 0 || first_space + 3 >= bytes + len) {
    return -1;
  }

  int status = 0;

  for (int index = 1; index <= 3; index += 1) {
    char ch = first_space[index];

    if (!isdigit((unsigned char)ch)) {
      return -1;
    }

    status = status * 10 + (ch - '0');
  }

  return status;
}

static int ccjs_fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out) {
  const char* key = "Content-Length:";
  size_t key_len = strlen(key);

  for (size_t index = 0; index + key_len < header_len; index += 1) {
    if (strncasecmp(bytes + index, key, key_len) == 0) {
      const char* cursor = bytes + index + key_len;
      size_t value = 0;

      while (*cursor == ' ' || *cursor == '\t') {
        cursor += 1;
      }

      if (!isdigit((unsigned char)*cursor)) {
        return 0;
      }

      while (isdigit((unsigned char)*cursor)) {
        value = value * 10 + (size_t)(*cursor - '0');
        cursor += 1;
      }

      *out = value;
      return 1;
    }
  }

  return 0;
}

static ccjs_status ccjs_fetch_finish(ccjs_fetch_operation* request, ccjs_status status, const ccjs_fetch_response* response) {
  if (request->completed) {
    return CCJS_OK;
  }

  request->completed = 1;
  ccjs_status callback_status = request->done(request->user, status, response);

  if (request->socket != 0) {
    ccjs_net_socket_close(request->socket);
  }

  return callback_status;
}

static ccjs_status ccjs_fetch_promise_done(void* user, ccjs_status status, const ccjs_fetch_response* response) {
  ccjs_fetch_promise_request* request = (ccjs_fetch_promise_request*)user;

  if (request == 0 || request->promise == 0 || request->loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status result = CCJS_OK;

  if (status != CCJS_OK || response == 0) {
    result = ccjs_fetch_reject_status(request->loop, request->promise, status == CCJS_OK ? CCJS_ERR_FIELD : status);
  } else {
    ccjs_value value = ccjs_undefined_value();
    result = ccjs_fetch_response_new(request->loop->allocator, request->url, request->url_len, response, &value);

    if (result == CCJS_OK) {
      ccjs_status resolve_status = ccjs_promise_resolve(request->promise, value);
      ccjs_release(value);
      result = resolve_status;
    } else {
      result = ccjs_fetch_reject_status(request->loop, request->promise, result);
    }
  }

  ccjs_fetch_promise_request_free(request);

  return result;
}

static ccjs_status ccjs_fetch_response_new(
  ccjs_allocator* allocator,
  const char* url,
  size_t url_len,
  const ccjs_fetch_response* response,
  ccjs_value* out
) {
  static const ccjs_field_info fields[] = { { "status", CCJS_FIELD_READONLY },
                                            { "ok", CCJS_FIELD_READONLY },
                                            { "url", CCJS_FIELD_READONLY },
                                            { "__ccjsBody", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 4, fields };

  if (allocator == 0 || response == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value object = ccjs_undefined_value();
  ccjs_value url_value = ccjs_undefined_value();
  ccjs_value body_value = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &shape, &object);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, url == 0 ? "" : url, url_len, &url_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(
      allocator,
      response->body == 0 ? "" : response->body,
      response->body == 0 ? 0 : response->body_len,
      &body_value
    );
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_STATUS_INDEX, ccjs_number_value((ccjs_number)response->status));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_OK_INDEX, ccjs_bool_value(response->ok));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_URL_INDEX, url_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_BODY_INDEX, body_value);
  }

  ccjs_release(url_value);
  ccjs_release(body_value);

  if (status != CCJS_OK) {
    ccjs_release(object);
    return status;
  }

  *out = object;

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status) {
  if (loop == 0 || promise == 0 || loop->allocator == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_value error = ccjs_undefined_value();
  ccjs_status error_status = ccjs_fetch_error_from_status(loop->allocator, status, &error);

  if (error_status != CCJS_OK) {
    return ccjs_promise_reject(promise, ccjs_number_value((ccjs_number)status));
  }

  ccjs_status reject_status = ccjs_promise_reject(promise, error);
  ccjs_release(error);

  return reject_status == CCJS_OK ? CCJS_OK : reject_status;
}

static ccjs_status ccjs_fetch_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out) {
  static const ccjs_field_info fields[] = { { "name", CCJS_FIELD_READONLY },
                                            { "message", CCJS_FIELD_READONLY },
                                            { "code", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 3, fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value error = ccjs_undefined_value();
  ccjs_value name = ccjs_undefined_value();
  ccjs_value message = ccjs_undefined_value();
  ccjs_value code = ccjs_undefined_value();
  const char* message_text = ccjs_fetch_error_message(status);
  ccjs_status result = ccjs_object_new(allocator, &shape, &error);

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, "FetchError", 10, &name);
  }

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, message_text, strlen(message_text), &message);
  }

  if (result == CCJS_OK) {
    result = ccjs_string_from_literal(allocator, "ERR_FETCH", 9, &code);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 0, name);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 1, message);
  }

  if (result == CCJS_OK) {
    result = ccjs_object_init_known(error, 2, code);
  }

  ccjs_release(name);
  ccjs_release(message);
  ccjs_release(code);

  if (result != CCJS_OK) {
    ccjs_release(error);
    return result;
  }

  *out = error;

  return CCJS_OK;
}

static const char* ccjs_fetch_error_message(ccjs_status status) {
  if (status == CCJS_ERR_UNSUPPORTED) {
    return "unsupported fetch URL or response";
  }

  if (status == CCJS_ERR_OOM) {
    return "fetch allocation failed";
  }

  return "fetch request failed";
}

static void ccjs_fetch_promise_request_free(ccjs_fetch_promise_request* request) {
  if (request == 0 || request->loop == 0 || request->loop->allocator == 0) {
    return;
  }

  ccjs_allocator* allocator = request->loop->allocator;

  if (request->url != 0) {
    allocator->free(allocator->user, request->url, request->url_len + 1, _Alignof(char));
  }

  ccjs_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(ccjs_fetch_promise_request), _Alignof(ccjs_fetch_promise_request));
}

#else

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  (void)loop;
  (void)url;
  (void)done;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_request(ccjs_loop* loop, const char* url, const ccjs_fetch_init* init, ccjs_fetch_done_fn done, void* user) {
  (void)loop;
  (void)url;
  (void)init;
  (void)done;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out) {
  return ccjs_fetch_with_init(loop, url, url_len, 0, out);
}

ccjs_status ccjs_fetch_with_init(
  ccjs_loop* loop,
  const char* url,
  size_t url_len,
  const ccjs_fetch_init* init,
  ccjs_promise** out
) {
  (void)loop;
  (void)url;
  (void)url_len;
  (void)init;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out) {
  (void)loop;
  (void)response;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

#endif
