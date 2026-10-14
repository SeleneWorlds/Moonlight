# Moonlight rolls

Require `moonlight-rolls.server.lua.rolls` and create a roller with `Rolls:new()`.
Each instance has its own entry and condition handlers. There are no built-in
entry types: consumers register them with `roller:registerType(type, handler)`.
Both registration methods accept an optional third argument describing the `data`
payload using a Moonlight Editor type name or property definition. Registering
the same type again replaces its handler and schema. Schemas describe editor
controls; they do not add runtime payload validation.

The bundle also provides the shared `moonlight:rolls` type in the
`selene:schemas` registry. Script schema providers can return
`{ herbs = "moonlight:rolls" }`; Moonlight Editor resolves named types recursively.
The shared schema exposes pools, roll counts, conditions, entry types, weights,
optional labels, and `data` payloads. Store consumer-specific entry and condition
fields inside `data` when using this schema; handlers receive the complete entry
or condition and can read its payload. The shared schema edits payloads as JSON.
To use registered schemas and type dropdowns, return the instance schema from
your script provider: `return { herbs = roller:schema() }`. The editor selects
the payload controls using each entry or condition's `type`, including conditions
on definitions, pools, and entries. Types without schemas retain JSON controls.
Schemas are instance-local, and each `schema()` call returns a fresh definition.

```lua
local Rolls = require("moonlight-rolls.server.lua.rolls")
local roller = Rolls:new()
roller:registerType("item", function(entry, context)
    return context.inventory:addItem(entry.data.item)
end, { type = "object", properties = { item = "any" } })
roller:registerCondition("level", function(condition, context)
    return context.level >= condition.data.min
end, { type = "object", properties = { min = { type = "integer", min = 0 } } })

local function schema()
    return { herbs = roller:schema() }
end

local definition = {
    pools = {
        {
            rolls = 2,
            conditions = { { type = "level", data = { min = 5 } } },
            entries = {
                { type = "item", weight = 3, data = { item = { name = "coin" } } },
                { type = "item", weight = 1, data = { item = { name = "gem" } } }
            }
        },
        {
            entries = { { type = "item", data = { item = { name = "token" } } } }
        }
    }
}
local results = roller:roll(definition, { inventory = inventory, level = 7 })
```

Definitions contain an ordered `pools` array. Each pool contains an `entries`
array and an optional non-negative integer `rolls` (default `1`). Each draw
selects one eligible entry with probability `weight / totalEligibleWeight`.
Weights default to `1`, may be fractional, and must be finite and non-negative.
Zero-weight entries are never selected. Draws use replacement; an entry may be
selected repeatedly. Empty pools or pools without eligible positive weights
produce no results and consume no randomness.

Definitions, pools, and entries may each have a `conditions` array. All conditions
must pass; an empty or absent array passes. A condition can be a Lua function
`function(context, subject)` or a data table with a `type` handled by
`registerCondition(type, function(condition, context, subject))`. `subject` is
the definition, pool, or entry carrying that condition. Conditions use Lua
truthiness and short-circuit in array order. Definition conditions run once per
call, pool conditions once when the pool is reached, and entry conditions before
every draw. Handlers may update the context, affecting later draws and pools.
Arbitrary additional fields on entries and conditions are passed through.

Entry handlers receive `(entry, context)`. Results are ordered records with
`entry`, `value` (the handler's first return value), `poolIndex`, and `rollIndex`.
Even a handler returning `nil` produces a record. Definitions are not copied or
modified by the roller. Consumers should not modify their structure during a roll.

`roller:validate(definition)` returns `true` or raises an error. Every roll
validates the entire definition, including registered types, before running any
callbacks. Invalid data and callback failures raise errors. Callback side effects
are not rolled back if a later callback fails.

For reproducible draws, use `Rolls:new({ random = function() ... end })`. The
function is called without arguments once per draw with positive eligible weight
and must return a finite number in `[0, 1)`. The default is `math.random`.

Run tests from the Selene repository root:

```sh
lua bundles/moonlight/moonlight-rolls/tests/rolls_test.lua
```

For registry fields without a Lua schema provider, define payload types statically:

```json
{
  "type": "moonlight:rolls",
  "optional": true,
  "parameters": {
    "entryTypes": {
      "item": { "type": "object", "properties": { "item": "string" } },
      "nothing": "any"
    },
    "conditionTypes": {
      "level": { "type": "object", "properties": { "min": "integer" } }
    }
  }
}
```

Each map key becomes a type dropdown option and its value defines that type's
`data` controls. Values may also reference named schemas. Omit either map to
keep free-form types and JSON payloads; an empty map offers no registered types.
Condition schemas apply at definition, pool, and entry level. These options are
resolved by both registry and script schema providers and do not register runtime
handlers or validate runtime payloads.

Named schemas support generic template parameters. A node such as
`{ "$parameter": "payload", "default": "any" }` is replaced by the caller's
`parameters.payload` before resolving nested types. The optional `"transform":
"enum"` converts an object parameter's keys into sorted enum options. Defaults
apply when a parameter is omitted. Bindings are scoped to each named schema;
these template features do not depend on rolls or any other bundle editor.
