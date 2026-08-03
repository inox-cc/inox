cmake_minimum_required(VERSION 3.20)

project(inox_http_server C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(INOX_TOOLCHAIN_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(INOX_COMPILER_MODE "node" CACHE STRING "Inox compiler runner")
set_property(CACHE INOX_COMPILER_MODE PROPERTY STRINGS node native)
set(INOX_LOOP_BACKEND "libuv" CACHE STRING "Inox event loop backend")
set(INOX_OUTPUT_DIR "${INOX_TOOLCHAIN_ROOT}/dist/http-server/out" CACHE PATH "HTTP server output directory")
set(INOX_STATIC_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/public")
set(INOX_STATIC_OUTPUT_DIR "${INOX_OUTPUT_DIR}/static")

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${INOX_OUTPUT_DIR}/${INOX_COMPILER_MODE}")

foreach(config DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${config} "${INOX_OUTPUT_DIR}/${INOX_COMPILER_MODE}")
endforeach()

include("${INOX_TOOLCHAIN_ROOT}/cmake/Inox.cmake")

file(GLOB_RECURSE INOX_STATIC_SOURCES CONFIGURE_DEPENDS
  "${INOX_STATIC_SOURCE_DIR}/*"
)

add_custom_target(inox_http_server_static_assets ALL
  COMMAND "${CMAKE_COMMAND}" -E rm -rf "${INOX_STATIC_OUTPUT_DIR}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${INOX_STATIC_OUTPUT_DIR}"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${INOX_STATIC_SOURCE_DIR}" "${INOX_STATIC_OUTPUT_DIR}"
  DEPENDS ${INOX_STATIC_SOURCES}
  VERBATIM
)

inox_add_executable(http-server
  ENTRY "index.ts"
)

add_dependencies(http-server inox_http_server_static_assets)
