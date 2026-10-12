# Moonlight inventory

Inventories store their items, slots and subscriptions in Lua tables. Require
`moonlight-inventory.server.lua.inventory` and construct an instance with
`Inventory:new({ slots = { 0, 1, 2 } })`. Optional initial items belong in `items`,
keyed by integer slot ID. Subclasses can override stacking rules and item limits.

`subscribe(callback)` returns the callback as a handle for `unsubscribe(handle)`.
Callbacks receive the inventory, with `dirtySlot` identifying the changed slot.
Changing an item in place requires an explicit `slotUpdated(slotId)` call.
Callback failures are logged without preventing subsequent callbacks.

`copyItem(item)` recursively copies Lua tables and nested inventories, preserving
userdata references and metatables. Copied inventories have no subscribers or
owner. Moving an item preserves its nested inventory instance.
