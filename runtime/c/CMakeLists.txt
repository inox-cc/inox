cmake_minimum_required(VERSION 3.20)

project(ccjs_c_runtime C)

set(CCJS_LOOP_BACKEND "embedded" CACHE STRING "ccjs C runtime event loop backend")
set_property(CACHE CCJS_LOOP_BACKEND PROPERTY STRINGS embedded libuv)
set(CCJS_TLS_BACKEND "none" CACHE STRING "ccjs C runtime TLS backend")
set_property(CACHE CCJS_TLS_BACKEND PROPERTY STRINGS none boringssl openssl)
option(CCJS_DEBUG_MEMORY "Enable ccjs debug memory counters and OOM injection helpers" OFF)
option(CCJS_ENABLE_WEAK "Enable ccjs weak reference runtime support" OFF)
set(CCJS_BORINGSSL_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../third_party/boringssl" CACHE PATH "BoringSSL source root")
set(CCJS_TLS_CA_BUNDLE "" CACHE FILEPATH "TLS CA bundle path")
set(CCJS_TLS_CA_PATH "" CACHE PATH "TLS CA directory path")

set(CCJS_RUNTIME_DIR "${CMAKE_CURRENT_LIST_DIR}")
set(CCJS_REPO_ROOT "${CCJS_RUNTIME_DIR}/../..")

set(CCJS_RUNTIME_SOURCES
  "${CCJS_RUNTIME_DIR}/src/arrays/array.c"
  "${CCJS_RUNTIME_DIR}/src/async/promise.c"
  "${CCJS_RUNTIME_DIR}/src/binary/binary.c"
  "${CCJS_RUNTIME_DIR}/src/child_process/child_process.c"
  "${CCJS_RUNTIME_DIR}/src/collections/map.c"
  "${CCJS_RUNTIME_DIR}/src/collections/set.c"
  "${CCJS_RUNTIME_DIR}/src/console/console.c"
  "${CCJS_RUNTIME_DIR}/src/core/allocator.c"
  "${CCJS_RUNTIME_DIR}/src/core/callback.c"
  "${CCJS_RUNTIME_DIR}/src/core/debug.c"
  "${CCJS_RUNTIME_DIR}/src/core/value.c"
  "${CCJS_RUNTIME_DIR}/src/crypto/crypto.c"
  "${CCJS_RUNTIME_DIR}/src/fs/fs.c"
  "${CCJS_RUNTIME_DIR}/src/json/json.c"
  "${CCJS_RUNTIME_DIR}/src/network/dgram.c"
  "${CCJS_RUNTIME_DIR}/src/network/fetch.c"
  "${CCJS_RUNTIME_DIR}/src/network/http.c"
  "${CCJS_RUNTIME_DIR}/src/network/net.c"
  "${CCJS_RUNTIME_DIR}/src/objects/object.c"
  "${CCJS_RUNTIME_DIR}/src/os/os.c"
  "${CCJS_RUNTIME_DIR}/src/path/path.c"
  "${CCJS_RUNTIME_DIR}/src/process/process.c"
  "${CCJS_RUNTIME_DIR}/src/strings/string.c"
  "${CCJS_RUNTIME_DIR}/src/time/time.c"
  "${CCJS_RUNTIME_DIR}/src/url/url.c"
)

if(CCJS_LOOP_BACKEND STREQUAL "embedded")
  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/async/loop.c")
elseif(CCJS_LOOP_BACKEND STREQUAL "libuv")
  set(CCJS_LIBUV_DIR "${CCJS_REPO_ROOT}/third_party/libuv")

  if(NOT EXISTS "${CCJS_LIBUV_DIR}/include/uv.h")
    message(FATAL_ERROR "libuv submodule is not initialized. Run `pnpm run libuv:bootstrap` from the repository root.")
  endif()

  set(LIBUV_BUILD_SHARED OFF CACHE BOOL "Build shared libuv" FORCE)
  set(LIBUV_BUILD_TESTS OFF CACHE BOOL "Build libuv tests" FORCE)
  set(LIBUV_BUILD_BENCH OFF CACHE BOOL "Build libuv benchmarks" FORCE)
  add_subdirectory("${CCJS_LIBUV_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/libuv" EXCLUDE_FROM_ALL)

  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/async/loop-libuv.c")
else()
  message(FATAL_ERROR "Unsupported CCJS_LOOP_BACKEND=${CCJS_LOOP_BACKEND}. Expected embedded or libuv.")
endif()

set(CCJS_TLS_COMPILE_DEFINITION "")
set(CCJS_TLS_INCLUDE_DIRS "")
set(CCJS_TLS_LIBRARIES "")

if(CCJS_TLS_BACKEND STREQUAL "none")
  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/network/tls.c")
  set(CCJS_TLS_COMPILE_DEFINITION CCJS_TLS_BACKEND_NONE=1)
elseif(CCJS_TLS_BACKEND STREQUAL "boringssl")
  if(NOT CCJS_LOOP_BACKEND STREQUAL "libuv")
    message(FATAL_ERROR "CCJS_TLS_BACKEND=boringssl requires CCJS_LOOP_BACKEND=libuv.")
  endif()

  if(NOT EXISTS "${CCJS_BORINGSSL_ROOT}/include/openssl/ssl.h")
    message(FATAL_ERROR "BoringSSL submodule is not initialized. Run `pnpm run boringssl:bootstrap` from the repository root.")
  endif()

  set(BUILD_TESTING OFF CACHE BOOL "Build dependency tests" FORCE)
  add_subdirectory("${CCJS_BORINGSSL_ROOT}" "${CMAKE_CURRENT_BINARY_DIR}/boringssl" EXCLUDE_FROM_ALL)
  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/network/tls-boringssl.c")
  list(APPEND CCJS_TLS_INCLUDE_DIRS "${CCJS_BORINGSSL_ROOT}/include")
  list(APPEND CCJS_TLS_LIBRARIES ssl crypto)
  set(CCJS_TLS_COMPILE_DEFINITION CCJS_TLS_BACKEND_BORINGSSL=1)
elseif(CCJS_TLS_BACKEND STREQUAL "openssl")
  find_package(OpenSSL REQUIRED)
  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/network/tls-openssl.c")
  list(APPEND CCJS_TLS_LIBRARIES OpenSSL::SSL OpenSSL::Crypto)
  set(CCJS_TLS_COMPILE_DEFINITION CCJS_TLS_BACKEND_OPENSSL=1)
else()
  message(FATAL_ERROR "Unsupported CCJS_TLS_BACKEND=${CCJS_TLS_BACKEND}. Expected none, boringssl or openssl.")
endif()

add_library(ccjs_runtime STATIC ${CCJS_RUNTIME_SOURCES})
target_include_directories(ccjs_runtime PUBLIC
  "${CCJS_RUNTIME_DIR}/include"
  ${CCJS_TLS_INCLUDE_DIRS}
)
target_compile_definitions(ccjs_runtime PUBLIC ${CCJS_TLS_COMPILE_DEFINITION})

if(CCJS_TLS_LIBRARIES)
  target_link_libraries(ccjs_runtime PUBLIC ${CCJS_TLS_LIBRARIES})
endif()

if(CCJS_TLS_CA_BUNDLE)
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_TLS_CA_BUNDLE="${CCJS_TLS_CA_BUNDLE}")
endif()

if(CCJS_TLS_CA_PATH)
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_TLS_CA_PATH="${CCJS_TLS_CA_PATH}")
endif()

if(CCJS_DEBUG_MEMORY)
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_DEBUG_MEMORY=1)
endif()

if(CCJS_ENABLE_WEAK)
  target_sources(ccjs_runtime PRIVATE "${CCJS_RUNTIME_DIR}/src/core/weak.c")
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_ENABLE_WEAK=1)
endif()

if(CCJS_LOOP_BACKEND STREQUAL "libuv")
  target_link_libraries(ccjs_runtime PUBLIC uv_a)
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_LOOP_BACKEND_LIBUV=1)
else()
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_LOOP_BACKEND_EMBEDDED=1)
endif()
