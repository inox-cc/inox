cmake_minimum_required(VERSION 3.20)

project(inox_c_runtime C)

set(INOX_LOOP_BACKEND "embedded" CACHE STRING "inox C runtime event loop backend")
set_property(CACHE INOX_LOOP_BACKEND PROPERTY STRINGS embedded libuv)
set(INOX_TLS_BACKEND "none" CACHE STRING "inox C runtime TLS backend")
set_property(CACHE INOX_TLS_BACKEND PROPERTY STRINGS none boringssl openssl)
option(INOX_DEBUG_MEMORY "Enable inox debug memory counters and OOM injection helpers" OFF)
option(INOX_ENABLE_WEAK "Enable inox weak reference runtime support" OFF)
set(INOX_BORINGSSL_ROOT "${CMAKE_CURRENT_LIST_DIR}/../third_party/boringssl" CACHE PATH "BoringSSL source root")
set(INOX_TLS_CA_BUNDLE "" CACHE FILEPATH "TLS CA bundle path")
set(INOX_TLS_CA_PATH "" CACHE PATH "TLS CA directory path")

set(INOX_RUNTIME_DIR "${CMAKE_CURRENT_LIST_DIR}")
set(INOX_REPO_ROOT "${INOX_RUNTIME_DIR}/..")
file(READ "${INOX_REPO_ROOT}/package.json" INOX_PACKAGE_JSON)
string(REGEX MATCH "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"" INOX_PACKAGE_VERSION_MATCH "${INOX_PACKAGE_JSON}")
if(CMAKE_MATCH_1)
  set(INOX_PACKAGE_VERSION "${CMAKE_MATCH_1}")
else()
  set(INOX_PACKAGE_VERSION "0.0.0")
endif()
set(INOX_STDLIB_GLOBAL_DIR "${INOX_REPO_ROOT}/stdlib/global")
set(INOX_STDLIB_NODE_DIR "${INOX_REPO_ROOT}/stdlib/node")
file(GLOB INOX_STDLIB_GLOBAL_SOURCES
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_GLOBAL_DIR}/*/c/*.c"
  "${INOX_STDLIB_GLOBAL_DIR}/*/*/c/*.c"
)
file(GLOB INOX_STDLIB_NODE_SOURCES
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_NODE_DIR}/*/c/*.c"
  "${INOX_STDLIB_NODE_DIR}/*/*/c/*.c"
)
file(GLOB INOX_STDLIB_GLOBAL_INCLUDE_DIRS
  LIST_DIRECTORIES true
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_GLOBAL_DIR}/*/include"
  "${INOX_STDLIB_GLOBAL_DIR}/*/*/include"
)
file(GLOB INOX_STDLIB_NODE_INCLUDE_DIRS
  LIST_DIRECTORIES true
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_NODE_DIR}/*/include"
  "${INOX_STDLIB_NODE_DIR}/*/*/include"
)

set(INOX_RUNTIME_SOURCES
  "${INOX_RUNTIME_DIR}/src/async/promise.c"
  "${INOX_RUNTIME_DIR}/src/core/allocator.c"
  "${INOX_RUNTIME_DIR}/src/core/callback.c"
  "${INOX_RUNTIME_DIR}/src/core/class_descriptor.c"
  "${INOX_RUNTIME_DIR}/src/core/value.c"
  "${INOX_RUNTIME_DIR}/src/objects/object.c"
  ${INOX_STDLIB_GLOBAL_SOURCES}
  ${INOX_STDLIB_NODE_SOURCES}
)

if(INOX_LOOP_BACKEND STREQUAL "embedded")
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/async/loop.c")
elseif(INOX_LOOP_BACKEND STREQUAL "libuv")
  set(INOX_LIBUV_DIR "${INOX_REPO_ROOT}/third_party/libuv")

  if(NOT EXISTS "${INOX_LIBUV_DIR}/include/uv.h")
    message(FATAL_ERROR "libuv submodule is not initialized. Run `pnpm run libuv:bootstrap` from the repository root.")
  endif()

  set(LIBUV_BUILD_SHARED OFF CACHE BOOL "Build shared libuv" FORCE)
  set(LIBUV_BUILD_TESTS OFF CACHE BOOL "Build libuv tests" FORCE)
  set(LIBUV_BUILD_BENCH OFF CACHE BOOL "Build libuv benchmarks" FORCE)
  add_subdirectory("${INOX_LIBUV_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/libuv" EXCLUDE_FROM_ALL)

  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/async/loop-libuv.c")
else()
  message(FATAL_ERROR "Unsupported INOX_LOOP_BACKEND=${INOX_LOOP_BACKEND}. Expected embedded or libuv.")
endif()

set(INOX_TLS_COMPILE_DEFINITION "")
set(INOX_TLS_INCLUDE_DIRS "")
set(INOX_TLS_LIBRARIES "")

if(INOX_TLS_BACKEND STREQUAL "none")
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/network/tls.c")
  set(INOX_TLS_COMPILE_DEFINITION INOX_TLS_BACKEND_NONE=1)
elseif(INOX_TLS_BACKEND STREQUAL "boringssl")
  if(NOT INOX_LOOP_BACKEND STREQUAL "libuv")
    message(FATAL_ERROR "INOX_TLS_BACKEND=boringssl requires INOX_LOOP_BACKEND=libuv.")
  endif()

  if(NOT EXISTS "${INOX_BORINGSSL_ROOT}/include/openssl/ssl.h")
    message(FATAL_ERROR "BoringSSL submodule is not initialized. Run `pnpm run boringssl:bootstrap` from the repository root.")
  endif()

  set(BUILD_TESTING OFF CACHE BOOL "Build dependency tests" FORCE)
  add_subdirectory("${INOX_BORINGSSL_ROOT}" "${CMAKE_CURRENT_BINARY_DIR}/boringssl" EXCLUDE_FROM_ALL)
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/network/tls-boringssl.c")
  list(APPEND INOX_TLS_INCLUDE_DIRS "${INOX_BORINGSSL_ROOT}/include")
  list(APPEND INOX_TLS_LIBRARIES ssl crypto)
  set(INOX_TLS_COMPILE_DEFINITION INOX_TLS_BACKEND_BORINGSSL=1)
elseif(INOX_TLS_BACKEND STREQUAL "openssl")
  find_package(OpenSSL REQUIRED)
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/network/tls-openssl.c")
  list(APPEND INOX_TLS_LIBRARIES OpenSSL::SSL OpenSSL::Crypto)
  set(INOX_TLS_COMPILE_DEFINITION INOX_TLS_BACKEND_OPENSSL=1)
else()
  message(FATAL_ERROR "Unsupported INOX_TLS_BACKEND=${INOX_TLS_BACKEND}. Expected none, boringssl or openssl.")
endif()

add_library(inox_runtime STATIC ${INOX_RUNTIME_SOURCES})
target_include_directories(inox_runtime PUBLIC
  "${INOX_RUNTIME_DIR}/include"
  "${INOX_RUNTIME_DIR}/src/async"
  ${INOX_STDLIB_GLOBAL_INCLUDE_DIRS}
  ${INOX_STDLIB_NODE_INCLUDE_DIRS}
  ${INOX_TLS_INCLUDE_DIRS}
)
target_compile_definitions(inox_runtime PUBLIC ${INOX_TLS_COMPILE_DEFINITION} INOX_PACKAGE_VERSION=\"${INOX_PACKAGE_VERSION}\")

if(INOX_TLS_LIBRARIES)
  target_link_libraries(inox_runtime PUBLIC ${INOX_TLS_LIBRARIES})
endif()

if(INOX_TLS_CA_BUNDLE)
  target_compile_definitions(inox_runtime PUBLIC INOX_TLS_CA_BUNDLE="${INOX_TLS_CA_BUNDLE}")
endif()

if(INOX_TLS_CA_PATH)
  target_compile_definitions(inox_runtime PUBLIC INOX_TLS_CA_PATH="${INOX_TLS_CA_PATH}")
endif()

if(INOX_DEBUG_MEMORY)
  target_compile_definitions(inox_runtime PUBLIC INOX_DEBUG_MEMORY=1)
endif()

if(INOX_ENABLE_WEAK)
  target_sources(inox_runtime PRIVATE "${INOX_RUNTIME_DIR}/src/core/weak.c")
  target_compile_definitions(inox_runtime PUBLIC INOX_ENABLE_WEAK=1)
endif()

if(INOX_LOOP_BACKEND STREQUAL "libuv")
  target_link_libraries(inox_runtime PUBLIC uv_a)
  target_compile_definitions(inox_runtime PUBLIC INOX_LOOP_BACKEND_LIBUV=1)
else()
  target_compile_definitions(inox_runtime PUBLIC INOX_LOOP_BACKEND_EMBEDDED=1)
endif()
