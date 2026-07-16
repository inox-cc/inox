// @targets cc
// @expect pass
// @stdout native

type ItemInfo = {
  native: boolean
}

function itemIsNative(items: Map<string, ItemInfo>, name: string): boolean {
  const item = itemInfo(items, name)

  if (item === null || typeof item === 'undefined') {
    return false
  }

  return item.native
}

function itemInfo(items: Map<string, ItemInfo>, name: string): ItemInfo | null {
  const item = items.get(name)

  if (item !== null && typeof item !== 'undefined') {
    return item
  }

  return null
}

const items = new Map<string, ItemInfo>()
items.set('item', { native: true })

if (itemIsNative(items, 'item')) {
  console.log('native')
}
