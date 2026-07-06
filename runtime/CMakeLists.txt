cmake_minimum_required(VERSION 3.20)

project(inox_runtime C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

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
set(INOX_THIRD_PARTY_BUILD_ROOT "${INOX_REPO_ROOT}/dist/third_party/cmake" CACHE PATH "Shared build root for vendored C/C++ dependencies")
file(READ "${INOX_REPO_ROOT}/package.json" INOX_PACKAGE_JSON)
string(REGEX MATCH "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"" INOX_PACKAGE_VERSION_MATCH "${INOX_PACKAGE_JSON}")
if(CMAKE_MATCH_1)
  set(INOX_PACKAGE_VERSION "${CMAKE_MATCH_1}")
else()
  set(INOX_PACKAGE_VERSION "0.0.0")
endif()

function(inox_path_component OUT VALUE)
  if("${VALUE}" STREQUAL "")
    set(SAFE_VALUE "default")
  else()
    set(SAFE_VALUE "${VALUE}")
  endif()

  string(REGEX REPLACE "[^A-Za-z0-9_.+-]" "_" SAFE_VALUE "${SAFE_VALUE}")
  set(${OUT} "${SAFE_VALUE}" PARENT_SCOPE)
endfunction()

set(INOX_CXX_COMPILER_ID_VALUE "${CMAKE_CXX_COMPILER_ID}")
set(INOX_CXX_COMPILER_VERSION_VALUE "${CMAKE_CXX_COMPILER_VERSION}")
if(NOT DEFINED CMAKE_CXX_COMPILER_ID)
  set(INOX_CXX_COMPILER_ID_VALUE "no-cxx")
endif()
if(NOT DEFINED CMAKE_CXX_COMPILER_VERSION)
  set(INOX_CXX_COMPILER_VERSION_VALUE "")
endif()

if(CMAKE_CONFIGURATION_TYPES)
  set(INOX_BUILD_CONFIG_VALUE "multi-config")
elseif(CMAKE_BUILD_TYPE)
  set(INOX_BUILD_CONFIG_VALUE "${CMAKE_BUILD_TYPE}")
else()
  set(INOX_BUILD_CONFIG_VALUE "default")
endif()

inox_path_component(INOX_SYSTEM_COMPONENT "${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}")
inox_path_component(INOX_C_COMPILER_COMPONENT "${CMAKE_C_COMPILER_ID}-${CMAKE_C_COMPILER_VERSION}")
inox_path_component(INOX_CXX_COMPILER_COMPONENT "${INOX_CXX_COMPILER_ID_VALUE}-${INOX_CXX_COMPILER_VERSION_VALUE}")
inox_path_component(INOX_BUILD_CONFIG_COMPONENT "${INOX_BUILD_CONFIG_VALUE}")
set(
  INOX_THIRD_PARTY_BUILD_ID
  "${INOX_SYSTEM_COMPONENT}/${INOX_C_COMPILER_COMPONENT}/${INOX_CXX_COMPILER_COMPONENT}/${INOX_BUILD_CONFIG_COMPONENT}"
)

set(INOX_THIRD_PARTY_CMAKE_ARGS -G "${CMAKE_GENERATOR}")
if(CMAKE_GENERATOR_PLATFORM)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS -A "${CMAKE_GENERATOR_PLATFORM}")
endif()
if(CMAKE_GENERATOR_TOOLSET)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS -T "${CMAKE_GENERATOR_TOOLSET}")
endif()
if(CMAKE_C_COMPILER)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_C_COMPILER=${CMAKE_C_COMPILER}")
endif()
if(CMAKE_CXX_COMPILER)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}")
endif()
if(CMAKE_BUILD_TYPE)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}")
endif()
if(CMAKE_OSX_ARCHITECTURES)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_OSX_ARCHITECTURES=${CMAKE_OSX_ARCHITECTURES}")
endif()
if(CMAKE_OSX_DEPLOYMENT_TARGET)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_OSX_DEPLOYMENT_TARGET=${CMAKE_OSX_DEPLOYMENT_TARGET}")
endif()
if(CMAKE_SYSROOT)
  list(APPEND INOX_THIRD_PARTY_CMAKE_ARGS "-DCMAKE_SYSROOT=${CMAKE_SYSROOT}")
endif()

function(inox_third_party_build_dir OUT NAME)
  set(${OUT} "${INOX_THIRD_PARTY_BUILD_ROOT}/${INOX_THIRD_PARTY_BUILD_ID}/${NAME}" PARENT_SCOPE)
endfunction()

set(INOX_THIRD_PARTY_TARGETS)
set(INOX_STDLIB_GLOBAL_DIR "${INOX_REPO_ROOT}/stdlib/global")
set(INOX_STDLIB_NODE_DIR "${INOX_REPO_ROOT}/stdlib/node")
file(GLOB INOX_STDLIB_GLOBAL_SOURCES
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_GLOBAL_DIR}/*/src/*.c"
  "${INOX_STDLIB_GLOBAL_DIR}/*/src/*.cc"
  "${INOX_STDLIB_GLOBAL_DIR}/*/*/src/*.c"
  "${INOX_STDLIB_GLOBAL_DIR}/*/*/src/*.cc"
)
file(GLOB INOX_STDLIB_NODE_SOURCES
  CONFIGURE_DEPENDS
  "${INOX_STDLIB_NODE_DIR}/*/src/*.c"
  "${INOX_STDLIB_NODE_DIR}/*/src/*.cc"
  "${INOX_STDLIB_NODE_DIR}/*/*/src/*.c"
  "${INOX_STDLIB_NODE_DIR}/*/*/src/*.cc"
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
  "${INOX_RUNTIME_DIR}/src/async/time_bridge.cc"
  "${INOX_RUNTIME_DIR}/src/async/promise.c"
  "${INOX_RUNTIME_DIR}/src/core/allocator.c"
  "${INOX_RUNTIME_DIR}/src/core/callback.c"
  "${INOX_RUNTIME_DIR}/src/core/class_descriptor.c"
  "${INOX_RUNTIME_DIR}/src/core/debug_bridge.cc"
  "${INOX_RUNTIME_DIR}/src/core/value.c"
  "${INOX_RUNTIME_DIR}/src/objects/object.cc"
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
  inox_third_party_build_dir(INOX_LIBUV_BUILD_DIR "libuv")
  set(INOX_LIBUV_LIBRARY "${INOX_LIBUV_BUILD_DIR}/${CMAKE_STATIC_LIBRARY_PREFIX}uv${CMAKE_STATIC_LIBRARY_SUFFIX}")

  add_custom_command(
    OUTPUT "${INOX_LIBUV_LIBRARY}"
    COMMAND "${CMAKE_COMMAND}" -S "${INOX_LIBUV_DIR}" -B "${INOX_LIBUV_BUILD_DIR}" ${INOX_THIRD_PARTY_CMAKE_ARGS} -DLIBUV_BUILD_SHARED=OFF -DLIBUV_BUILD_TESTS=OFF -DLIBUV_BUILD_BENCH=OFF
    COMMAND "${CMAKE_COMMAND}" --build "${INOX_LIBUV_BUILD_DIR}" --target uv_a
    VERBATIM
  )
  add_custom_target(inox_third_party_libuv DEPENDS "${INOX_LIBUV_LIBRARY}")
  add_library(uv_a STATIC IMPORTED GLOBAL)
  set_target_properties(uv_a PROPERTIES
    IMPORTED_LOCATION "${INOX_LIBUV_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${INOX_LIBUV_DIR}/include"
  )
  list(APPEND INOX_THIRD_PARTY_TARGETS inox_third_party_libuv)

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
  inox_third_party_build_dir(INOX_BORINGSSL_BUILD_DIR "boringssl")
  set(INOX_BORINGSSL_CRYPTO_LIBRARY "${INOX_BORINGSSL_BUILD_DIR}/${CMAKE_STATIC_LIBRARY_PREFIX}crypto${CMAKE_STATIC_LIBRARY_SUFFIX}")
  set(INOX_BORINGSSL_SSL_LIBRARY "${INOX_BORINGSSL_BUILD_DIR}/${CMAKE_STATIC_LIBRARY_PREFIX}ssl${CMAKE_STATIC_LIBRARY_SUFFIX}")

  add_custom_command(
    OUTPUT "${INOX_BORINGSSL_CRYPTO_LIBRARY}" "${INOX_BORINGSSL_SSL_LIBRARY}"
    COMMAND "${CMAKE_COMMAND}" -S "${INOX_BORINGSSL_ROOT}" -B "${INOX_BORINGSSL_BUILD_DIR}" ${INOX_THIRD_PARTY_CMAKE_ARGS} -DBUILD_TESTING=OFF
    COMMAND "${CMAKE_COMMAND}" --build "${INOX_BORINGSSL_BUILD_DIR}" --target ssl
    VERBATIM
  )
  add_custom_target(inox_third_party_boringssl DEPENDS "${INOX_BORINGSSL_CRYPTO_LIBRARY}" "${INOX_BORINGSSL_SSL_LIBRARY}")
  add_library(crypto STATIC IMPORTED GLOBAL)
  set_target_properties(crypto PROPERTIES
    IMPORTED_LOCATION "${INOX_BORINGSSL_CRYPTO_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${INOX_BORINGSSL_ROOT}/include"
  )
  add_library(ssl STATIC IMPORTED GLOBAL)
  set_target_properties(ssl PROPERTIES
    IMPORTED_LOCATION "${INOX_BORINGSSL_SSL_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${INOX_BORINGSSL_ROOT}/include"
  )
  list(APPEND INOX_THIRD_PARTY_TARGETS inox_third_party_boringssl)
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/network/tls-boringssl.cc")
  list(APPEND INOX_TLS_INCLUDE_DIRS "${INOX_BORINGSSL_ROOT}/include")
  list(APPEND INOX_TLS_LIBRARIES ssl crypto)
  set(INOX_TLS_COMPILE_DEFINITION INOX_TLS_BACKEND_BORINGSSL=1)
elseif(INOX_TLS_BACKEND STREQUAL "openssl")
  find_package(OpenSSL REQUIRED)
  list(APPEND INOX_RUNTIME_SOURCES "${INOX_RUNTIME_DIR}/src/network/tls-openssl.cc")
  list(APPEND INOX_TLS_LIBRARIES OpenSSL::SSL OpenSSL::Crypto)
  set(INOX_TLS_COMPILE_DEFINITION INOX_TLS_BACKEND_OPENSSL=1)
else()
  message(FATAL_ERROR "Unsupported INOX_TLS_BACKEND=${INOX_TLS_BACKEND}. Expected none, boringssl or openssl.")
endif()

add_library(inox_runtime STATIC ${INOX_RUNTIME_SOURCES})
if(INOX_THIRD_PARTY_TARGETS)
  add_dependencies(inox_runtime ${INOX_THIRD_PARTY_TARGETS})
endif()
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
