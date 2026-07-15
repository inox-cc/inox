// @targets cc
// @expect pass
// @stdout 1

type Bounds = {
  maximum?: number
}

function fitsUint32(bounds: Bounds): boolean {
  const maximum = bounds.maximum

  return maximum !== null && typeof maximum !== 'undefined' && maximum <= 4294967295
}

console.log(fitsUint32({ maximum: 7 }))
