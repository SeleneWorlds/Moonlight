# Moonlight attributes

Require `moonlight-attributes.server.lua.attributes`. Use
`Attributes.create(entity, name, initialValue)` and `Attributes.get(entity, name)`
to store one Lua attribute instance per name in entity runtime data. Creating an
existing name raises an error. For standalone attributes, require
`moonlight-attributes.server.lua.attribute` and use
`Attribute:new(owner, name, initialValue)`.

Attributes expose `getValue`, `setValue`, `getEffectiveValue`, `getName` and
`getOwner`. Constraints run in insertion order on changed assignments; observers
are notified only when the final constrained value changes. Modifiers run on
each effective-value read. Adding or replacing a named filter appends it to the
end of the corresponding pipeline. Initial values are stored without constraints.
Adding, replacing or removing a modifier also notifies observers. After changing
a filter handle's `enabled` field, call `refresh()` to publish the change.

`addConstraint(name, filter)` and `addModifier(name, filter)` accept a function
`function(attribute, value)` or a table with `apply` and `enabled` fields. They
return a filter handle; set `handle.enabled = false` to disable it. Remove filters
with `removeConstraint(name)` or `removeModifier(name)`.

`clampFilter(min, max)` and `mathOpFilter(operand, operator)` accept numbers or
other attributes as operands. Operators are `+`, `-`, `*` and `/`; division of
integers truncates toward zero. Dependency values are read when a filter runs.
Changes to dependencies do not automatically notify observers: call `refresh()`
on the dependent attribute when needed. Attribute dependencies must be acyclic.

`subscribe(callback)` returns the callback handle for `unsubscribe(handle)`.
Observers receive the attribute itself. `refresh()` explicitly notifies them.
Callback failures are logged; failed filters leave the incoming value unchanged.
