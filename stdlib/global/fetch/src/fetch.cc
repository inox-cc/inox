#include "inox/fetch.h"

#include <cstring>
#include <utility>
#include <vector>

#include "inox/loop.h"

struct FetchNativeResponse {
  int status;
  bool ok;
  bool redirected;
  const char* url;
  size_t url_len;
  const char* status_text;
  size_t status_text_len;
  const char* headers;
  size_t headers_len;
  const char* body;
  size_t body_len;
};

struct FetchNativeHeader {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
};

struct FetchNativeInit {
  const char* method;
  size_t method_len;
  const FetchNativeHeader* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
  inox_value signal;
  const char* redirect;
  size_t redirect_len;
};

using FetchDoneFn = inox_status (*)(void* user, inox_status status, const FetchNativeResponse* response);

static inox_status fetch_backend_with_init(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const FetchNativeInit* init,
  inox_promise** out
);
static inox_status fetch_backend_response_text(inox_loop* loop, inox_value response, inox_promise** out);
static inox_status fetch_backend_headers_get(inox_allocator* allocator, inox_value headers, const char* name, size_t name_len, inox_value* out);
static inox_status fetch_backend_headers_has(inox_value headers, const char* name, size_t name_len, int* out);
static inox_status fetch_backend_abort_controller_new(inox_allocator* allocator, inox_value* out);
static inox_status fetch_backend_abort_controller_abort(inox_value controller);
static inox_status fetch_backend_signal_aborted(inox_value signal, int* out);

enum {
  INOX_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX = 0,
  INOX_FETCH_ABORT_SIGNAL_ABORTED_INDEX = 0
};

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "inox/net.h"
#include "inox/object.h"
#include "inox/string.h"
#include "inox/tls.h"

#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct FetchOperation {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_net_socket* socket;
  inox_tls_client* tls;
  inox_timer_handle* abort_timer;
  FetchDoneFn done;
  void* user;
  inox_value signal;
  char url[1024];
  size_t url_len;
  char host[256];
  char path[512];
  char request[4096];
  size_t request_len;
  int port;
  int secure;
  int redirect_mode;
  int redirect_count;
  int redirected;
  int replayable;
  int waiting_redirect_close;
  char response[8192];
  size_t response_len;
  int completed;
};

struct FetchPromiseRequest {
  inox_loop* loop;
  inox_promise* promise;
  char* url;
  size_t url_len;
};

enum {
  INOX_FETCH_RESPONSE_STATUS_INDEX = 0,
  INOX_FETCH_RESPONSE_OK_INDEX = 1,
  INOX_FETCH_RESPONSE_URL_INDEX = 2,
  INOX_FETCH_RESPONSE_STATUS_TEXT_INDEX = 3,
  INOX_FETCH_RESPONSE_REDIRECTED_INDEX = 4,
  INOX_FETCH_RESPONSE_HEADERS_INDEX = 5,
  INOX_FETCH_RESPONSE_BODY_INDEX = 6
};

enum {
  INOX_FETCH_HEADERS_RAW_INDEX = 0
};

enum {
  INOX_FETCH_REDIRECT_FOLLOW = 0,
  INOX_FETCH_REDIRECT_ERROR = 1,
  INOX_FETCH_REDIRECT_MANUAL = 2
};

#define INOX_FETCH_MAX_REDIRECTS 20

static inox_status
fetch_parse_url(
  const char* url,
  size_t url_len,
  int* secure,
  char* host,
  size_t host_len,
  int* port,
  char* path,
  size_t path_len
);
static inox_status fetch_copy_url(inox_allocator* allocator, const char* url, size_t url_len, char** out);
static inox_status fetch_set_url(FetchOperation* request, const char* url, size_t url_len);
static inox_status fetch_request_view(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const FetchNativeInit* init,
  FetchDoneFn done,
  void* user
);
static inox_status fetch_build_request(FetchOperation* request, const FetchNativeInit* init);
static inox_status fetch_start_connection(FetchOperation* request);
static inox_status fetch_operation_is_aborted(FetchOperation* request, int* out);
static void fetch_operation_free(FetchOperation* request);
static inox_status fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len);
static inox_status fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text);
static inox_status fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value);
static int fetch_header_name_equals(const char* name, size_t name_len, const char* expected);
static int fetch_headers_include(const FetchNativeHeader* headers, size_t header_count, const char* name);
static inox_status fetch_redirect_mode_from_init(const FetchNativeInit* init, int* out);
static inox_status fetch_on_connect(void* user, inox_net_socket* socket, inox_status status);
static inox_status fetch_on_data(void* user, inox_net_socket* socket, const char* bytes, size_t len);
static void fetch_on_close(void* user, inox_net_socket* socket);
static inox_status fetch_on_tls_connect(void* user, inox_tls_client* client, inox_status status);
static inox_status fetch_on_tls_data(void* user, inox_tls_client* client, const char* bytes, size_t len);
static void fetch_on_tls_close(void* user, inox_tls_client* client);
static inox_status fetch_on_transport_connect(FetchOperation* request, inox_status status);
static inox_status fetch_on_transport_data(FetchOperation* request, const char* bytes, size_t len);
static void fetch_on_transport_close(FetchOperation* request);
static inox_status fetch_transport_write(FetchOperation* request, const char* bytes, size_t len);
static void fetch_transport_close(FetchOperation* request);
static inox_status fetch_abort_poll(void* user);
static inox_status fetch_try_complete(FetchOperation* request);
static const char* fetch_find_header_end(const char* bytes, size_t len);
static int fetch_parse_status_line(
  const char* bytes,
  size_t len,
  int* status,
  const char** status_text,
  size_t* status_text_len
);
static int fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out);
static int fetch_find_header_value(
  const char* bytes,
  size_t header_len,
  const char* name,
  size_t name_len,
  const char** value,
  size_t* value_len
);
static int fetch_header_value_contains_token(const char* value, size_t value_len, const char* token);
static inox_status fetch_decode_chunked_body(char* bytes, size_t len, size_t* out_len, int* complete);
static inox_status fetch_scan_chunked_body(char* bytes, size_t len, size_t* out_len, int* complete, int decode);
static const char* fetch_find_crlf(const char* bytes, size_t len);
static int fetch_hex_digit(char value);
static int fetch_is_redirect_status(int status);
static inox_status fetch_resolve_redirect_url(
  FetchOperation* request,
  const char* location,
  size_t location_len,
  char* out,
  size_t out_len
);
static inox_status fetch_follow_redirect(FetchOperation* request, const char* location, size_t location_len);
static inox_status fetch_finish(FetchOperation* request, inox_status status, const FetchNativeResponse* response);
static inox_status fetch_promise_done(void* user, inox_status status, const FetchNativeResponse* response);
static inox_status fetch_response_new(
  inox_allocator* allocator,
  const char* url,
  size_t url_len,
  const FetchNativeResponse* response,
  inox_value* out
);
static inox_status fetch_headers_new(inox_allocator* allocator, const char* headers, size_t headers_len, inox_value* out);
static inox_status fetch_reject_status(inox_loop* loop, inox_promise* promise, inox_status status);
static inox_status fetch_error_from_status(inox_allocator* allocator, inox_status status, inox_value* out);
static inox_status fetch_error_field(
  inox_allocator* allocator,
  inox_value error,
  uint32_t index,
  const char* value,
  size_t value_len
);
static const char* fetch_error_message(inox_status status);
static void fetch_promise_request_free(FetchPromiseRequest* request);

static inox_status fetch_request_view(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const FetchNativeInit* init,
  FetchDoneFn done,
  void* user
) {
  if (loop == 0 || loop->allocator == 0 || url == 0 || done == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = loop->allocator;
  FetchOperation* request =
    (FetchOperation*)allocator->alloc(allocator->user, sizeof(FetchOperation), alignof(FetchOperation));

  if (request == 0) {
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(FetchOperation));
  request->loop = loop;
  request->allocator = allocator;
  request->done = done;
  request->user = user;
  request->signal = inox_undefined_value();
  request->redirect_mode = INOX_FETCH_REDIRECT_FOLLOW;
  request->replayable = 1;

  inox_status status = fetch_set_url(request, url, url_len);

  if (status != INOX_OK) {
    fetch_operation_free(request);
    return status;
  }

  status = fetch_build_request(request, init);

  if (status != INOX_OK) {
    fetch_operation_free(request);
    return status;
  }

  int aborted = 0;
  status = fetch_operation_is_aborted(request, &aborted);

  if (status != INOX_OK) {
    fetch_operation_free(request);
    return status;
  }

  if (aborted) {
    fetch_operation_free(request);
    return INOX_ERR_THROW;
  }

  if (request->signal.tag != INOX_TAG_UNDEFINED && request->signal.tag != INOX_TAG_NULL) {
    status = inox_loop_set_interval(loop, 1, fetch_abort_poll, request, 0, &request->abort_timer);

    if (status != INOX_OK) {
      fetch_operation_free(request);
      return status;
    }
  }

  status = fetch_start_connection(request);

  if (status != INOX_OK) {
    if (request->abort_timer != 0) {
      inox_loop_clear_timer(request->abort_timer);
      request->abort_timer = 0;
    }

    fetch_operation_free(request);
    return status;
  }

  return INOX_OK;
}

static inox_status fetch_backend_with_init(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const FetchNativeInit* init,
  inox_promise** out
) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (loop == 0 || loop->allocator == 0 || url == 0) {
    return INOX_ERR_TYPE;
  }

  inox_promise* promise = 0;
  inox_status status = inox_promise_new(loop, &promise);

  if (status != INOX_OK) {
    return status;
  }

  inox_allocator* allocator = loop->allocator;
  FetchPromiseRequest* request =
    (FetchPromiseRequest*)allocator->alloc(allocator->user, sizeof(FetchPromiseRequest), alignof(FetchPromiseRequest));

  if (request == 0) {
    inox_promise_release(promise);
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(FetchPromiseRequest));
  request->loop = loop;
  request->promise = promise;
  request->url_len = url_len;
  inox_promise_retain(promise);

  status = fetch_copy_url(allocator, url, url_len, &request->url);

  if (status == INOX_OK) {
    status = fetch_request_view(loop, request->url, request->url_len, init, fetch_promise_done, request);
  }

  if (status != INOX_OK) {
    inox_status reject_status = fetch_reject_status(loop, promise, status);
    fetch_promise_request_free(request);

    if (reject_status != INOX_OK) {
      inox_promise_release(promise);
      return reject_status;
    }
  }

  *out = promise;

  return INOX_OK;
}

static inox_status fetch_backend_response_text(inox_loop* loop, inox_value response, inox_promise** out) {
  if (loop == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  inox_value body = inox_undefined_value();
  inox_status status = inox_object_get(response, "__inoxBody", 10, &body);

  if (status != INOX_OK) {
    return status;
  }

  if (body.tag != INOX_TAG_STRING || body.as.ref == 0) {
    inox_release(body);
    return INOX_ERR_TYPE;
  }

  status = inox_promise_resolved(loop, body, out);
  inox_release(body);

  return status;
}

static inox_status fetch_backend_headers_get(inox_allocator* allocator, inox_value headers, const char* name, size_t name_len, inox_value* out) {
  if (allocator == 0 || name == 0 || name_len == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value raw = inox_undefined_value();
  inox_status status = inox_object_get_known(headers, INOX_FETCH_HEADERS_RAW_INDEX, &raw);

  if (status != INOX_OK) {
    return status;
  }

  if (raw.tag != INOX_TAG_STRING || raw.as.ref == 0) {
    inox_release(raw);
    return INOX_ERR_TYPE;
  }

  inox_string* raw_string = (inox_string*)raw.as.ref;
  const char* value = 0;
  size_t value_len = 0;

  if (fetch_find_header_value(raw_string->bytes, raw_string->len, name, name_len, &value, &value_len)) {
    status = inox::String::fromLiteral(allocator, value, value_len, out);
  } else {
    *out = inox_null_value();
    status = INOX_OK;
  }

  inox_release(raw);
  return status;
}

static inox_status fetch_backend_headers_has(inox_value headers, const char* name, size_t name_len, int* out) {
  if (name == 0 || name_len == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_value raw = inox_undefined_value();
  inox_status status = inox_object_get_known(headers, INOX_FETCH_HEADERS_RAW_INDEX, &raw);

  if (status != INOX_OK) {
    return status;
  }

  if (raw.tag != INOX_TAG_STRING || raw.as.ref == 0) {
    inox_release(raw);
    return INOX_ERR_TYPE;
  }

  inox_string* raw_string = (inox_string*)raw.as.ref;
  const char* value = 0;
  size_t value_len = 0;
  *out = fetch_find_header_value(raw_string->bytes, raw_string->len, name, name_len, &value, &value_len) ? 1 : 0;

  inox_release(raw);
  return INOX_OK;
}

static inox_status fetch_backend_abort_controller_new(inox_allocator* allocator, inox_value* out) {
  static const inox_field_info signal_fields[] = { { "aborted", 0 } };
  static const inox_shape signal_shape = { 1, signal_fields };
  static const inox_field_info controller_fields[] = { { "signal", INOX_FIELD_READONLY } };
  static const inox_shape controller_shape = { 1, controller_fields };

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value signal = inox_undefined_value();
  inox_value controller = inox_undefined_value();
  inox_status status = inox_object_new(allocator, &signal_shape, &signal);

  if (status == INOX_OK) {
    status = inox_object_init_known(signal, INOX_FETCH_ABORT_SIGNAL_ABORTED_INDEX, inox_bool_value(false));
  }

  if (status == INOX_OK) {
    status = inox_object_new(allocator, &controller_shape, &controller);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(controller, INOX_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX, signal);
  }

  inox_release(signal);

  if (status != INOX_OK) {
    inox_release(controller);
    return status;
  }

  *out = controller;

  return INOX_OK;
}

static inox_status fetch_backend_abort_controller_abort(inox_value controller) {
  inox_value signal = inox_undefined_value();
  inox_status status = inox_object_get_known(controller, INOX_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX, &signal);

  if (status == INOX_OK) {
    status = inox_object_init_known(signal, INOX_FETCH_ABORT_SIGNAL_ABORTED_INDEX, inox_bool_value(true));
  }

  inox_release(signal);

  return status;
}

static inox_status fetch_backend_signal_aborted(inox_value signal, int* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_value aborted = inox_undefined_value();
  inox_status status = inox_object_get_known(signal, INOX_FETCH_ABORT_SIGNAL_ABORTED_INDEX, &aborted);

  if (status != INOX_OK) {
    return status;
  }

  if (aborted.tag != INOX_TAG_BOOL) {
    inox_release(aborted);
    return INOX_ERR_TYPE;
  }

  *out = aborted.as.boolean ? 1 : 0;
  inox_release(aborted);

  return INOX_OK;
}

static inox_status fetch_parse_url(
  const char* url,
  size_t url_len,
  int* secure,
  char* host,
  size_t host_len,
  int* port,
  char* path,
  size_t path_len
) {
  const char* http_prefix = "http://";
  const char* https_prefix = "https://";
  size_t http_prefix_len = strlen(http_prefix);
  size_t https_prefix_len = strlen(https_prefix);
  size_t prefix_len = 0;

  if (url == 0 || secure == 0 || host == 0 || port == 0 || path == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (url_len >= http_prefix_len && memcmp(url, http_prefix, http_prefix_len) == 0) {
    *secure = 0;
    prefix_len = http_prefix_len;
  } else if (url_len >= https_prefix_len && memcmp(url, https_prefix, https_prefix_len) == 0) {
    *secure = 1;
    prefix_len = https_prefix_len;
  } else {
    return INOX_ERR_UNSUPPORTED;
  }

  size_t offset = prefix_len;
  const size_t host_start = offset;

  while (offset < url_len && url[offset] != ':' && url[offset] != '/' && url[offset] != '?' && url[offset] != '#') {
    offset += 1;
  }

  size_t parsed_host_len = offset - host_start;

  if (parsed_host_len == 0 || parsed_host_len >= host_len) {
    return INOX_ERR_UNSUPPORTED;
  }

  memcpy(host, url + host_start, parsed_host_len);
  host[parsed_host_len] = '\0';

  *port = *secure ? 443 : 80;

  if (offset < url_len && url[offset] == ':') {
    offset += 1;
    int parsed_port = 0;

    if (offset >= url_len || !isdigit((unsigned char)url[offset])) {
      return INOX_ERR_UNSUPPORTED;
    }

    while (offset < url_len && isdigit((unsigned char)url[offset])) {
      parsed_port = parsed_port * 10 + (url[offset] - '0');
      offset += 1;
    }

    if (parsed_port <= 0 || parsed_port > 65535) {
      return INOX_ERR_UNSUPPORTED;
    }

    *port = parsed_port;
  }

  const char* parsed_path = "/";
  size_t parsed_path_available = 1;
  char query_path[512];

  if (offset < url_len && url[offset] == '/') {
    parsed_path = url + offset;
    parsed_path_available = url_len - offset;
  } else if (offset < url_len && url[offset] == '?') {
    size_t query_len = url_len - offset;

    if (query_len + 2 > sizeof(query_path)) {
      return INOX_ERR_UNSUPPORTED;
    }

    query_path[0] = '/';
    memcpy(query_path + 1, url + offset, query_len);
    query_path[query_len + 1] = '\0';
    parsed_path = query_path;
    parsed_path_available = query_len + 1;
  }

  size_t parsed_path_len = 0;

  while (parsed_path_len < parsed_path_available && parsed_path[parsed_path_len] != '#') {
    parsed_path_len += 1;
  }

  if (parsed_path_len == 0 || parsed_path_len >= path_len) {
    return INOX_ERR_UNSUPPORTED;
  }

  memcpy(path, parsed_path, parsed_path_len);
  path[parsed_path_len] = '\0';
  return INOX_OK;
}

static inox_status fetch_copy_url(inox_allocator* allocator, const char* url, size_t url_len, char** out) {
  if (allocator == 0 || url == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = (char*)allocator->alloc(allocator->user, url_len + 1, alignof(char));

  if (*out == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(*out, url, url_len);
  (*out)[url_len] = '\0';

  return INOX_OK;
}

static inox_status fetch_set_url(FetchOperation* request, const char* url, size_t url_len) {
  if (request == 0 || url == 0) {
    return INOX_ERR_TYPE;
  }

  if (url_len == 0 || url_len >= sizeof(request->url)) {
    return INOX_ERR_UNSUPPORTED;
  }

  memcpy(request->url, url, url_len);
  request->url[url_len] = '\0';
  request->url_len = url_len;

  return fetch_parse_url(
    request->url,
    request->url_len,
    &request->secure,
    request->host,
    sizeof(request->host),
    &request->port,
    request->path,
    sizeof(request->path)
  );
}

static inox_status fetch_start_connection(FetchOperation* request) {
  if (request == 0 || request->loop == 0) {
    return INOX_ERR_TYPE;
  }

  request->socket = 0;
  request->tls = 0;

  if (request->secure) {
    return inox_tls_connect(
      request->loop,
      request->host,
      request->port,
      request->host,
      fetch_on_tls_connect,
      fetch_on_tls_data,
      fetch_on_tls_close,
      request,
      &request->tls
    );
  }

  return NetSocket::connect(
    request->loop,
    request->host,
    request->port,
    fetch_on_connect,
    fetch_on_data,
    fetch_on_close,
    request,
    &request->socket
  );
}

static inox_status fetch_build_request(FetchOperation* request, const FetchNativeInit* init) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  const char* method = "GET";
  size_t method_len = 3;
  const FetchNativeHeader* headers = 0;
  size_t header_count = 0;
  const char* body = 0;
  size_t body_len = 0;
  request->replayable = 1;
  request->request_len = 0;

  if (init != 0) {
    if (init->method != 0 && init->method_len > 0) {
      method = init->method;
      method_len = init->method_len;
    }

    headers = init->headers;
    header_count = init->header_count;
    body = init->body;
    body_len = init->body_len;
    request->replayable = method_len == 3 && strncasecmp(method, "GET", 3) == 0 && header_count == 0 && body_len == 0;

    inox_status redirect_status = fetch_redirect_mode_from_init(init, &request->redirect_mode);

    if (redirect_status != INOX_OK) {
      return redirect_status;
    }

    if (init->signal.tag != INOX_TAG_UNDEFINED && init->signal.tag != INOX_TAG_NULL) {
      if (init->signal.tag != INOX_TAG_OBJECT || init->signal.as.ref == 0) {
        return INOX_ERR_TYPE;
      }

      request->signal = init->signal;
      inox_retain(request->signal);
    }
  }

  if (method == 0 || method_len == 0 || method_len > 32) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (header_count > 0 && headers == 0) {
    return INOX_ERR_TYPE;
  }

  if (body_len > 0 && body == 0) {
    return INOX_ERR_TYPE;
  }

  size_t offset = 0;
  inox_status status = fetch_append_bytes(request->request, sizeof(request->request), &offset, method, method_len);

  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, " ");
  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, request->path);
  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, " HTTP/1.1\r\nHost: ");
  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, request->host);
  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");

  for (size_t index = 0; status == INOX_OK && index < header_count; index += 1) {
    const FetchNativeHeader* header = headers + index;

    if (header->name == 0 || header->name_len == 0 || header->value == 0) {
      return INOX_ERR_TYPE;
    }

    status = fetch_append_bytes(request->request, sizeof(request->request), &offset, header->name, header->name_len);
    if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, ": ");
    if (status == INOX_OK) status = fetch_append_bytes(request->request, sizeof(request->request), &offset, header->value, header->value_len);
    if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == INOX_OK && body_len > 0 && !fetch_headers_include(headers, header_count, "Content-Length")) {
    status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "Content-Length: ");
    if (status == INOX_OK) status = fetch_append_size(request->request, sizeof(request->request), &offset, body_len);
    if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == INOX_OK && !fetch_headers_include(headers, header_count, "Connection")) {
    status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "Connection: close\r\n");
  }

  if (status == INOX_OK) status = fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  if (status == INOX_OK && body_len > 0) {
    status = fetch_append_bytes(request->request, sizeof(request->request), &offset, body, body_len);
  }

  if (status != INOX_OK) {
    return status;
  }

  request->request_len = offset;
  return INOX_OK;
}

static inox_status fetch_operation_is_aborted(FetchOperation* request, int* out) {
  if (request == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (request->signal.tag == INOX_TAG_UNDEFINED || request->signal.tag == INOX_TAG_NULL) {
    return INOX_OK;
  }

  return fetch_backend_signal_aborted(request->signal, out);
}

static void fetch_operation_free(FetchOperation* request) {
  if (request == 0 || request->allocator == 0) {
    return;
  }

  inox_release(request->signal);
  request->allocator->free(request->allocator->user, request, sizeof(FetchOperation), alignof(FetchOperation));
}

static inox_status fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len) {
  if (out == 0 || offset == 0 || (len > 0 && bytes == 0)) {
    return INOX_ERR_TYPE;
  }

  if (*offset > out_size || len > out_size - *offset) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (len > 0) {
    memcpy(out + *offset, bytes, len);
  }

  *offset += len;
  return INOX_OK;
}

static inox_status fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text) {
  if (text == 0) {
    return INOX_ERR_TYPE;
  }

  return fetch_append_bytes(out, out_size, offset, text, strlen(text));
}

static inox_status fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value) {
  char buffer[32];
  int written = snprintf(buffer, sizeof(buffer), "%zu", value);

  if (written < 0 || (size_t)written >= sizeof(buffer)) {
    return INOX_ERR_FIELD;
  }

  return fetch_append_bytes(out, out_size, offset, buffer, (size_t)written);
}

static int fetch_header_name_equals(const char* name, size_t name_len, const char* expected) {
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

static int fetch_headers_include(const FetchNativeHeader* headers, size_t header_count, const char* name) {
  if (headers == 0 || name == 0) {
    return 0;
  }

  for (size_t index = 0; index < header_count; index += 1) {
    if (fetch_header_name_equals(headers[index].name, headers[index].name_len, name)) {
      return 1;
    }
  }

  return 0;
}

static inox_status fetch_redirect_mode_from_init(const FetchNativeInit* init, int* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  if (init == 0 || init->redirect == 0 || init->redirect_len == 0) {
    *out = INOX_FETCH_REDIRECT_FOLLOW;
    return INOX_OK;
  }

  if (init->redirect_len == 6 && strncasecmp(init->redirect, "follow", 6) == 0) {
    *out = INOX_FETCH_REDIRECT_FOLLOW;
    return INOX_OK;
  }

  if (init->redirect_len == 5 && strncasecmp(init->redirect, "error", 5) == 0) {
    *out = INOX_FETCH_REDIRECT_ERROR;
    return INOX_OK;
  }

  if (init->redirect_len == 6 && strncasecmp(init->redirect, "manual", 6) == 0) {
    *out = INOX_FETCH_REDIRECT_MANUAL;
    return INOX_OK;
  }

  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_on_connect(void* user, inox_net_socket* socket, inox_status status) {
  FetchOperation* request = (FetchOperation*)user;

  if (status != INOX_OK) {
    return fetch_on_transport_connect(request, status);
  }

  if (NetSocket(socket).readStart() != INOX_OK) {
    return fetch_finish(request, INOX_ERR_FIELD, 0);
  }

  return fetch_on_transport_connect(request, INOX_OK);
}

static inox_status fetch_on_data(void* user, inox_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  return fetch_on_transport_data((FetchOperation*)user, bytes, len);
}

static void fetch_on_close(void* user, inox_net_socket* socket) {
  (void)socket;
  fetch_on_transport_close((FetchOperation*)user);
}

static inox_status fetch_on_tls_connect(void* user, inox_tls_client* client, inox_status status) {
  (void)client;
  return fetch_on_transport_connect((FetchOperation*)user, status);
}

static inox_status fetch_on_tls_data(void* user, inox_tls_client* client, const char* bytes, size_t len) {
  (void)client;
  return fetch_on_transport_data((FetchOperation*)user, bytes, len);
}

static void fetch_on_tls_close(void* user, inox_tls_client* client) {
  (void)client;
  fetch_on_transport_close((FetchOperation*)user);
}

static inox_status fetch_on_transport_connect(FetchOperation* request, inox_status status) {
  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  int aborted = 0;
  status = fetch_operation_is_aborted(request, &aborted);

  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  if (aborted) {
    return fetch_finish(request, INOX_ERR_THROW, 0);
  }

  return fetch_transport_write(request, request->request, request->request_len);
}

static inox_status fetch_on_transport_data(FetchOperation* request, const char* bytes, size_t len) {
  int aborted = 0;
  inox_status status = fetch_operation_is_aborted(request, &aborted);

  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  if (aborted) {
    return fetch_finish(request, INOX_ERR_THROW, 0);
  }

  if (request->response_len + len > sizeof(request->response)) {
    return fetch_finish(request, INOX_ERR_UNSUPPORTED, 0);
  }

  memcpy(request->response + request->response_len, bytes, len);
  request->response_len += len;

  return fetch_try_complete(request);
}

static void fetch_on_transport_close(FetchOperation* request) {
  if (request == 0) {
    return;
  }

  if (request->completed) {
    fetch_operation_free(request);
    return;
  }

  if (request->waiting_redirect_close) {
    request->socket = 0;
    request->tls = 0;
    request->waiting_redirect_close = 0;
    inox_status status = fetch_start_connection(request);

    if (status != INOX_OK) {
      fetch_finish(request, status, 0);
      fetch_operation_free(request);
    }

    return;
  }

  fetch_finish(request, INOX_ERR_FIELD, 0);
  fetch_operation_free(request);
}

static inox_status fetch_transport_write(FetchOperation* request, const char* bytes, size_t len) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  if (request->secure) {
    return request->tls == 0 ? INOX_ERR_TYPE : inox_tls_client_write(request->tls, bytes, len);
  }

  return request->socket == 0 ? INOX_ERR_TYPE : NetSocket(request->socket).write(inox::StringView(bytes, len));
}

static void fetch_transport_close(FetchOperation* request) {
  if (request == 0) {
    return;
  }

  if (request->tls != 0) {
    inox_tls_client_close(request->tls);
  } else if (request->socket != 0) {
    NetSocket(request->socket).close();
  }
}

static inox_status fetch_abort_poll(void* user) {
  FetchOperation* request = (FetchOperation*)user;

  if (request == 0 || request->completed) {
    return INOX_OK;
  }

  int aborted = 0;
  inox_status status = fetch_operation_is_aborted(request, &aborted);

  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  if (aborted) {
    return fetch_finish(request, INOX_ERR_THROW, 0);
  }

  return INOX_OK;
}

static inox_status fetch_try_complete(FetchOperation* request) {
  const char* header_end = fetch_find_header_end(request->response, request->response_len);

  if (header_end == 0) {
    return INOX_OK;
  }

  size_t header_len = (size_t)(header_end - request->response);
  size_t content_len = 0;

  if (fetch_parse_content_length(request->response, header_len, &content_len)) {
    if (request->response_len < header_len + content_len) {
      return INOX_OK;
    }
  } else {
    const char* transfer_encoding = 0;
    size_t transfer_encoding_len = 0;

    if (
      !fetch_find_header_value(
        request->response,
        header_len,
        "Transfer-Encoding",
        17,
        &transfer_encoding,
        &transfer_encoding_len
      ) ||
      !fetch_header_value_contains_token(transfer_encoding, transfer_encoding_len, "chunked")
    ) {
      return INOX_OK;
    }

    int complete = 0;
    inox_status chunked_status = fetch_decode_chunked_body(
      request->response + header_len,
      request->response_len - header_len,
      &content_len,
      &complete
    );

    if (chunked_status != INOX_OK) {
      return fetch_finish(request, chunked_status, 0);
    }

    if (!complete) {
      return INOX_OK;
    }
  }

  int status = 0;
  const char* status_text = "";
  size_t status_text_len = 0;

  if (!fetch_parse_status_line(request->response, header_len, &status, &status_text, &status_text_len)) {
    return fetch_finish(request, INOX_ERR_FIELD, 0);
  }

  if (fetch_is_redirect_status(status)) {
    const char* location = 0;
    size_t location_len = 0;

    if (request->redirect_mode == INOX_FETCH_REDIRECT_ERROR) {
      return fetch_finish(request, INOX_ERR_UNSUPPORTED, 0);
    }

    if (
      request->redirect_mode == INOX_FETCH_REDIRECT_FOLLOW &&
      fetch_find_header_value(request->response, header_len, "Location", 8, &location, &location_len)
    ) {
      return fetch_follow_redirect(request, location, location_len);
    }
  }

  FetchNativeResponse response = {
    status,
    status >= 200 && status < 300,
    request->redirected ? true : false,
    request->url,
    request->url_len,
    status_text,
    status_text_len,
    request->response,
    header_len,
    request->response + header_len,
    content_len
  };

  return fetch_finish(request, INOX_OK, &response);
}

static const char* fetch_find_header_end(const char* bytes, size_t len) {
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

static int fetch_parse_status_line(
  const char* bytes,
  size_t len,
  int* status_out,
  const char** status_text,
  size_t* status_text_len
) {
  if (bytes == 0 || status_out == 0 || status_text == 0 || status_text_len == 0) {
    return 0;
  }

  const char* first_space = (const char*)memchr(bytes, ' ', len);

  if (first_space == 0 || first_space + 3 >= bytes + len) {
    return 0;
  }

  int status = 0;

  for (int index = 1; index <= 3; index += 1) {
    char ch = first_space[index];

    if (!isdigit((unsigned char)ch)) {
      return 0;
    }

    status = status * 10 + (ch - '0');
  }

  const char* line_end = bytes;

  while (line_end < bytes + len && *line_end != '\r' && *line_end != '\n') {
    line_end += 1;
  }

  const char* reason = first_space + 4;

  while (reason < line_end && (*reason == ' ' || *reason == '\t')) {
    reason += 1;
  }

  *status_out = status;
  *status_text = reason;
  *status_text_len = (size_t)(line_end - reason);

  return 1;
}

static int fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out) {
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

static int fetch_find_header_value(
  const char* bytes,
  size_t header_len,
  const char* name,
  size_t name_len,
  const char** value,
  size_t* value_len
) {
  if (bytes == 0 || name == 0 || name_len == 0 || value == 0 || value_len == 0) {
    return 0;
  }

  const char* cursor = bytes;
  const char* end = bytes + header_len;

  while (cursor < end && !(cursor[0] == '\r' && cursor + 1 < end && cursor[1] == '\n')) {
    cursor += 1;
  }

  if (cursor + 2 <= end) {
    cursor += 2;
  }

  while (cursor < end && !(cursor[0] == '\r' && cursor + 1 < end && cursor[1] == '\n')) {
    const char* line_end = cursor;

    while (line_end < end && *line_end != '\r' && *line_end != '\n') {
      line_end += 1;
    }

    const char* colon = (const char*)memchr(cursor, ':', (size_t)(line_end - cursor));

    if (colon != 0 && (size_t)(colon - cursor) == name_len && strncasecmp(cursor, name, name_len) == 0) {
      const char* field_value = colon + 1;

      while (field_value < line_end && (*field_value == ' ' || *field_value == '\t')) {
        field_value += 1;
      }

      while (line_end > field_value && (line_end[-1] == ' ' || line_end[-1] == '\t')) {
        line_end -= 1;
      }

      *value = field_value;
      *value_len = (size_t)(line_end - field_value);
      return 1;
    }

    cursor = line_end;

    while (cursor < end && (*cursor == '\r' || *cursor == '\n')) {
      cursor += 1;
    }
  }

  return 0;
}

static int fetch_header_value_contains_token(const char* value, size_t value_len, const char* token) {
  if (value == 0 || token == 0) {
    return 0;
  }

  size_t token_len = strlen(token);
  size_t cursor = 0;

  while (cursor < value_len) {
    while (cursor < value_len && (value[cursor] == ',' || value[cursor] == ' ' || value[cursor] == '\t')) {
      cursor += 1;
    }

    size_t start = cursor;

    while (cursor < value_len && value[cursor] != ',') {
      cursor += 1;
    }

    size_t end = cursor;

    while (end > start && (value[end - 1] == ' ' || value[end - 1] == '\t')) {
      end -= 1;
    }

    if (end - start == token_len && strncasecmp(value + start, token, token_len) == 0) {
      return 1;
    }
  }

  return 0;
}

static inox_status fetch_decode_chunked_body(char* bytes, size_t len, size_t* out_len, int* complete) {
  inox_status status = fetch_scan_chunked_body(bytes, len, out_len, complete, 0);

  if (status != INOX_OK || complete == 0 || !*complete) {
    return status;
  }

  return fetch_scan_chunked_body(bytes, len, out_len, complete, 1);
}

static inox_status fetch_scan_chunked_body(char* bytes, size_t len, size_t* out_len, int* complete, int decode) {
  if (bytes == 0 || out_len == 0 || complete == 0) {
    return INOX_ERR_TYPE;
  }

  size_t read = 0;
  size_t write = 0;
  *out_len = 0;
  *complete = 0;

  while (read < len) {
    const char* line_end = fetch_find_crlf(bytes + read, len - read);

    if (line_end == 0) {
      return INOX_OK;
    }

    size_t line_len = (size_t)(line_end - (bytes + read));
    size_t chunk_size = 0;
    size_t index = 0;
    int saw_digit = 0;

    while (index < line_len) {
      int digit = fetch_hex_digit(bytes[read + index]);

      if (digit < 0) {
        break;
      }

      if (chunk_size > (SIZE_MAX - (size_t)digit) / 16) {
        return INOX_ERR_UNSUPPORTED;
      }

      chunk_size = chunk_size * 16 + (size_t)digit;
      saw_digit = 1;
      index += 1;
    }

    if (!saw_digit) {
      return INOX_ERR_FIELD;
    }

    while (index < line_len && (bytes[read + index] == ' ' || bytes[read + index] == '\t')) {
      index += 1;
    }

    if (index < line_len && bytes[read + index] != ';') {
      return INOX_ERR_FIELD;
    }

    read += line_len + 2;

    if (chunk_size == 0) {
      for (;;) {
        const char* trailer_end = fetch_find_crlf(bytes + read, len - read);

        if (trailer_end == 0) {
          return INOX_OK;
        }

        if (trailer_end == bytes + read) {
          *out_len = write;
          *complete = 1;
          return INOX_OK;
        }

        read = (size_t)(trailer_end - bytes) + 2;
      }
    }

    if (chunk_size > len - read || len - read - chunk_size < 2) {
      return INOX_OK;
    }

    if (bytes[read + chunk_size] != '\r' || bytes[read + chunk_size + 1] != '\n') {
      return INOX_ERR_FIELD;
    }

    if (decode && chunk_size > 0 && write != read) {
      memmove(bytes + write, bytes + read, chunk_size);
    }

    write += chunk_size;
    read += chunk_size + 2;
  }

  return INOX_OK;
}

static const char* fetch_find_crlf(const char* bytes, size_t len) {
  if (bytes == 0 || len < 2) {
    return 0;
  }

  for (size_t index = 0; index + 1 < len; index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n') {
      return bytes + index;
    }
  }

  return 0;
}

static int fetch_hex_digit(char value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }

  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }

  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }

  return -1;
}

static int fetch_is_redirect_status(int status) {
  return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
}

static inox_status fetch_resolve_redirect_url(
  FetchOperation* request,
  const char* location,
  size_t location_len,
  char* out,
  size_t out_len
) {
  if (request == 0 || location == 0 || out == 0 || out_len == 0) {
    return INOX_ERR_TYPE;
  }

  if (location_len >= out_len) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (
    (location_len >= strlen("http://") && strncasecmp(location, "http://", strlen("http://")) == 0) ||
    (location_len >= strlen("https://") && strncasecmp(location, "https://", strlen("https://")) == 0)
  ) {
    memcpy(out, location, location_len);
    out[location_len] = '\0';
    return INOX_OK;
  }

  if (location_len == 0 || location[0] != '/') {
    return INOX_ERR_UNSUPPORTED;
  }

  char origin[512];
  const char* scheme = request->secure ? "https" : "http";
  int default_port = request->secure ? 443 : 80;
  int written = request->port == default_port
                  ? snprintf(origin, sizeof(origin), "%s://%s", scheme, request->host)
                  : snprintf(origin, sizeof(origin), "%s://%s:%d", scheme, request->host, request->port);

  if (written < 0 || (size_t)written >= sizeof(origin)) {
    return INOX_ERR_UNSUPPORTED;
  }

  size_t origin_len = (size_t)written;

  if (origin_len + location_len >= out_len) {
    return INOX_ERR_UNSUPPORTED;
  }

  memcpy(out, origin, origin_len);
  memcpy(out + origin_len, location, location_len);
  out[origin_len + location_len] = '\0';

  return INOX_OK;
}

static inox_status fetch_follow_redirect(FetchOperation* request, const char* location, size_t location_len) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  if (!request->replayable || request->redirect_count >= INOX_FETCH_MAX_REDIRECTS) {
    return fetch_finish(request, INOX_ERR_UNSUPPORTED, 0);
  }

  char next_url[1024];
  inox_status status = fetch_resolve_redirect_url(request, location, location_len, next_url, sizeof(next_url));

  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  status = fetch_set_url(request, next_url, strlen(next_url));

  if (status == INOX_OK) {
    status = fetch_build_request(request, 0);
  }

  if (status != INOX_OK) {
    return fetch_finish(request, status, 0);
  }

  request->response_len = 0;
  request->redirect_count += 1;
  request->redirected = 1;
  request->waiting_redirect_close = 1;

  if (request->socket != 0 || request->tls != 0) {
    fetch_transport_close(request);
  } else {
    request->waiting_redirect_close = 0;
    status = fetch_start_connection(request);

    if (status != INOX_OK) {
      fetch_finish(request, status, 0);
      fetch_operation_free(request);
      return status;
    }
  }

  return INOX_OK;
}

static inox_status fetch_finish(FetchOperation* request, inox_status status, const FetchNativeResponse* response) {
  if (request->completed) {
    return INOX_OK;
  }

  request->completed = 1;

  if (request->abort_timer != 0) {
    inox_loop_clear_timer(request->abort_timer);
    request->abort_timer = 0;
  }

  inox_status callback_status = request->done(request->user, status, response);

  fetch_transport_close(request);

  return callback_status;
}

static inox_status fetch_promise_done(void* user, inox_status status, const FetchNativeResponse* response) {
  FetchPromiseRequest* request = (FetchPromiseRequest*)user;

  if (request == 0 || request->promise == 0 || request->loop == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status result = INOX_OK;

  if (status != INOX_OK || response == 0) {
    result = fetch_reject_status(request->loop, request->promise, status == INOX_OK ? INOX_ERR_FIELD : status);
  } else {
    inox_value value = inox_undefined_value();
    result = fetch_response_new(request->loop->allocator, request->url, request->url_len, response, &value);

    if (result == INOX_OK) {
      inox_status resolve_status = inox_promise_resolve(request->promise, value);
      inox_release(value);
      result = resolve_status;
    } else {
      result = fetch_reject_status(request->loop, request->promise, result);
    }
  }

  fetch_promise_request_free(request);

  return result;
}

static inox_status fetch_response_new(
  inox_allocator* allocator,
  const char* url,
  size_t url_len,
  const FetchNativeResponse* response,
  inox_value* out
) {
  static const inox_field_info fields[] = { { "status", INOX_FIELD_READONLY },
                                            { "ok", INOX_FIELD_READONLY },
                                            { "url", INOX_FIELD_READONLY },
                                            { "statusText", INOX_FIELD_READONLY },
                                            { "redirected", INOX_FIELD_READONLY },
                                            { "headers", INOX_FIELD_READONLY },
                                            { "__inoxBody", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 7, fields };

  if (allocator == 0 || response == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value object = inox_undefined_value();
  inox_value url_value = inox_undefined_value();
  inox_value status_text_value = inox_undefined_value();
  inox_value headers_value = inox_undefined_value();
  inox_value body_value = inox_undefined_value();
  inox_status status = inox_object_new(allocator, &shape, &object);

  if (status == INOX_OK) {
    status = inox::String::fromLiteral(
      allocator,
      response->url == 0 ? (url == 0 ? "" : url) : response->url,
      response->url == 0 ? url_len : response->url_len,
      &url_value
    );
  }

  if (status == INOX_OK) {
    status = inox::String::fromLiteral(
      allocator,
      response->status_text == 0 ? "" : response->status_text,
      response->status_text == 0 ? 0 : response->status_text_len,
      &status_text_value
    );
  }

  if (status == INOX_OK) {
    status = fetch_headers_new(
      allocator,
      response->headers == 0 ? "" : response->headers,
      response->headers == 0 ? 0 : response->headers_len,
      &headers_value
    );
  }

  if (status == INOX_OK) {
    status = inox::String::fromLiteral(
      allocator,
      response->body == 0 ? "" : response->body,
      response->body == 0 ? 0 : response->body_len,
      &body_value
    );
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_STATUS_INDEX, inox_number_value((inox_number)response->status));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_OK_INDEX, inox_bool_value(response->ok));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_URL_INDEX, url_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_STATUS_TEXT_INDEX, status_text_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_REDIRECTED_INDEX, inox_bool_value(response->redirected));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_HEADERS_INDEX, headers_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_RESPONSE_BODY_INDEX, body_value);
  }

  inox_release(url_value);
  inox_release(status_text_value);
  inox_release(headers_value);
  inox_release(body_value);

  if (status != INOX_OK) {
    inox_release(object);
    return status;
  }

  *out = object;

  return INOX_OK;
}

static inox_status fetch_headers_new(inox_allocator* allocator, const char* headers, size_t headers_len, inox_value* out) {
  static const inox_field_info fields[] = { { "__inoxHeaders", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 1, fields };

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value object = inox_undefined_value();
  inox_value raw = inox_undefined_value();
  inox_status status = inox_object_new(allocator, &shape, &object);

  if (status == INOX_OK) {
    status = inox::String::fromLiteral(allocator, headers == 0 ? "" : headers, headers == 0 ? 0 : headers_len, &raw);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, INOX_FETCH_HEADERS_RAW_INDEX, raw);
  }

  inox_release(raw);

  if (status != INOX_OK) {
    inox_release(object);
    return status;
  }

  *out = object;

  return INOX_OK;
}

static inox_status fetch_reject_status(inox_loop* loop, inox_promise* promise, inox_status status) {
  if (loop == 0 || promise == 0 || loop->allocator == 0) {
    return INOX_ERR_TYPE;
  }

  inox_value error = inox_undefined_value();
  inox_status error_status = fetch_error_from_status(loop->allocator, status, &error);

  if (error_status != INOX_OK) {
    return inox_promise_reject(promise, inox_number_value((inox_number)status));
  }

  inox_status reject_status = inox_promise_reject(promise, error);
  inox_release(error);

  return reject_status == INOX_OK ? INOX_OK : reject_status;
}

static inox_status fetch_error_from_status(inox_allocator* allocator, inox_status status, inox_value* out) {
  static const inox_field_info fields[] = { { "name", INOX_FIELD_READONLY },
                                            { "message", INOX_FIELD_READONLY },
                                            { "code", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 3, fields };

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value error = inox_undefined_value();
  const char* name_text = status == INOX_ERR_THROW ? "AbortError" : "FetchError";
  const char* code_text = status == INOX_ERR_THROW ? "ABORT_ERR" : "ERR_FETCH";
  const char* message_text = fetch_error_message(status);
  inox_status result = inox_object_new(allocator, &shape, &error);

  if (result == INOX_OK) {
    result = fetch_error_field(allocator, error, 0, name_text, strlen(name_text));
  }

  if (result == INOX_OK) {
    result = fetch_error_field(allocator, error, 1, message_text, strlen(message_text));
  }

  if (result == INOX_OK) {
    result = fetch_error_field(allocator, error, 2, code_text, strlen(code_text));
  }

  if (result != INOX_OK) {
    inox_release(error);
    return result;
  }

  *out = error;

  return INOX_OK;
}

static inox_status fetch_error_field(
  inox_allocator* allocator,
  inox_value error,
  uint32_t index,
  const char* value,
  size_t value_len
) {
  inox_value field = inox_undefined_value();
  inox_status status = inox::String::fromLiteral(allocator, value, value_len, &field);

  if (status == INOX_OK) {
    status = inox_object_init_known(error, index, field);
  }

  inox_release(field);

  return status;
}

static const char* fetch_error_message(inox_status status) {
  if (status == INOX_ERR_THROW) {
    return "fetch request aborted";
  }

  if (status == INOX_ERR_UNSUPPORTED) {
    return "unsupported fetch URL or response";
  }

  if (status == INOX_ERR_OOM) {
    return "fetch allocation failed";
  }

  return "fetch request failed";
}

static void fetch_promise_request_free(FetchPromiseRequest* request) {
  if (request == 0 || request->loop == 0 || request->loop->allocator == 0) {
    return;
  }

  inox_allocator* allocator = request->loop->allocator;

  if (request->url != 0) {
    allocator->free(allocator->user, request->url, request->url_len + 1, alignof(char));
  }

  inox_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(FetchPromiseRequest), alignof(FetchPromiseRequest));
}

#else

static inox_status fetch_backend_with_init(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const FetchNativeInit* init,
  inox_promise** out
) {
  (void)loop;
  (void)url;
  (void)url_len;
  (void)init;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_response_text(inox_loop* loop, inox_value response, inox_promise** out) {
  (void)loop;
  (void)response;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_headers_get(inox_allocator* allocator, inox_value headers, const char* name, size_t name_len, inox_value* out) {
  (void)allocator;
  (void)headers;
  (void)name;
  (void)name_len;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_headers_has(inox_value headers, const char* name, size_t name_len, int* out) {
  (void)headers;
  (void)name;
  (void)name_len;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_abort_controller_new(inox_allocator* allocator, inox_value* out) {
  (void)allocator;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_abort_controller_abort(inox_value controller) {
  (void)controller;
  return INOX_ERR_UNSUPPORTED;
}

static inox_status fetch_backend_signal_aborted(inox_value signal, int* out) {
  (void)signal;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

#endif

namespace inox {

FetchInit::FetchInit() : method(), headers(nullptr), header_count(0), body(), signal(), redirect() {}

FetchInit::FetchInit(
  StringView method,
  const FetchHeader* headers,
  size_t header_count,
  StringView body,
  Value signal,
  StringView redirect
) : method(method),
    headers(headers),
    header_count(header_count),
    body(body),
    signal(std::move(signal)),
    redirect(redirect) {}

FetchResponse::FetchResponse() : value_() {}

FetchResponse::FetchResponse(Value value) : value_(std::move(value)) {}

bool FetchResponse::valid() const {
  inox_value value = value_.raw();

  return value.tag == INOX_TAG_OBJECT && value.as.ref != nullptr;
}

inox_number FetchResponse::status() const {
  Value value;

  if (
    !valid() ||
    inox_object_get(value_, "status", 6, value.out()) != INOX_OK ||
    value.tag != INOX_TAG_NUMBER
  ) {
    return 0;
  }

  return value.as.number;
}

bool FetchResponse::ok() const {
  Value value;

  return valid() &&
         inox_object_get(value_, "ok", 2, value.out()) == INOX_OK &&
         value.tag == INOX_TAG_BOOL &&
         value.as.boolean;
}

bool FetchResponse::redirected() const {
  Value value;

  return valid() &&
         inox_object_get(value_, "redirected", 10, value.out()) == INOX_OK &&
         value.tag == INOX_TAG_BOOL &&
         value.as.boolean;
}

Promise FetchResponse::text() const {
  inox_promise* promise = nullptr;

  if (!valid()) {
    return Promise();
  }

  if (fetch_backend_response_text(loop(), value_, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

inox_value FetchResponse::raw() const {
  return value_.raw();
}

FetchResponse::operator inox_value() const {
  return value_.raw();
}

Promise fetch(StringView url) {
  inox_promise* promise = nullptr;

  if (fetch_backend_with_init(loop(), url.bytes, url.len, nullptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(const char* url) {
  const char* bytes = url == nullptr ? "" : url;
  inox_promise* promise = nullptr;

  if (fetch_backend_with_init(loop(), bytes, strlen(bytes), nullptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(StringView url, const FetchInit* init) {
  inox_promise* promise = nullptr;
  FetchNativeInit native_init = {};
  std::vector<FetchNativeHeader> native_headers;
  const FetchNativeInit* native_init_ptr = nullptr;

  if (init != nullptr) {
    native_headers.reserve(init->header_count);

    for (size_t index = 0; index < init->header_count; ++index) {
      const FetchHeader& header = init->headers[index];
      native_headers.push_back({
        header.name.bytes,
        header.name.len,
        header.value.bytes,
        header.value.len
      });
    }

    native_init.method = init->method.bytes;
    native_init.method_len = init->method.len;
    native_init.headers = native_headers.data();
    native_init.header_count = native_headers.size();
    native_init.body = init->body.bytes;
    native_init.body_len = init->body.len;
    native_init.signal = init->signal.raw();
    native_init.redirect = init->redirect.bytes;
    native_init.redirect_len = init->redirect.len;
    native_init_ptr = &native_init;
  }

  if (fetch_backend_with_init(loop(), url.bytes, url.len, native_init_ptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(const char* url, const FetchInit* init) {
  const char* bytes = url == nullptr ? "" : url;
  inox_promise* promise = nullptr;
  FetchNativeInit native_init = {};
  std::vector<FetchNativeHeader> native_headers;
  const FetchNativeInit* native_init_ptr = nullptr;

  if (init != nullptr) {
    native_headers.reserve(init->header_count);

    for (size_t index = 0; index < init->header_count; ++index) {
      const FetchHeader& header = init->headers[index];
      native_headers.push_back({
        header.name.bytes,
        header.name.len,
        header.value.bytes,
        header.value.len
      });
    }

    native_init.method = init->method.bytes;
    native_init.method_len = init->method.len;
    native_init.headers = native_headers.data();
    native_init.header_count = native_headers.size();
    native_init.body = init->body.bytes;
    native_init.body_len = init->body.len;
    native_init.signal = init->signal.raw();
    native_init.redirect = init->redirect.bytes;
    native_init.redirect_len = init->redirect.len;
    native_init_ptr = &native_init;
  }

  if (fetch_backend_with_init(loop(), bytes, strlen(bytes), native_init_ptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

bool fetch_headers_has(inox_value headers, StringView name) {
  int out = 0;

  if (fetch_backend_headers_has(headers, name.bytes, name.len, &out) != INOX_OK) {
    throw_value(Value());
    return false;
  }

  return out != 0;
}

Value fetch_headers_get(inox_value headers, StringView name) {
  Value out;

  if (fetch_backend_headers_get(&inox_default_allocator, headers, name.bytes, name.len, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

Value fetch_abort_controller() {
  Value out;

  if (fetch_backend_abort_controller_new(&inox_default_allocator, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

Value fetch_abort_controller_signal(inox_value controller) {
  Value out;

  if (inox_object_get_known(controller, INOX_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

void fetch_abort_controller_abort(inox_value controller) {
  if (fetch_backend_abort_controller_abort(controller) != INOX_OK) {
    throw_value(Value());
  }
}

} // namespace inox
