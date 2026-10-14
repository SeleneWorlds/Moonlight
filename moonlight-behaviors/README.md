# Moonlight behaviors

Data-driven Event/Condition/Action behaviors. Consumers register all action and
condition types and bridge their event sources to the runner. Instances are
independent; there are no built-in gameplay handlers or global event listeners.

```lua
local Behaviors = require("moonlight-behaviors.server.lua.behaviors")
local behaviors = Behaviors:new()
behaviors:registerAction("inform", function(action, context)
    context.actor:inform(action.data.message)
end, { type = "object", properties = { message = "string" } })
behaviors:registerAction("debuff", function(action, context)
    context.applyDebuff(context.actor, action.data.id)
end, { type = "object", properties = { id = "string" } })
behaviors:registerCondition("unprotected", function(condition, context)
    return not context.hasProtection(context.actor, condition.data.id)
end, { type = "object", properties = { id = "string" } })

-- Loaded from a consumer's registry JSON (see below).
behaviors:emit("entered-marsh", definitions, context)
-- Or execute a single definition directly, regardless of its event field:
behaviors:run(definitions[1], context)
```

A consumer registry object can contain this data:

```json
{
  "behaviors": [
    {
      "event": "entered-marsh",
      "conditions": [
        { "type": "unprotected", "data": { "id": "marsh" } }
      ],
      "actions": [
        { "type": "inform", "data": { "message": "The marsh weakens you." } },
        { "type": "debuff", "data": { "id": "marsh-weakness" } }
      ]
    },
    {
      "event": "entered-marsh",
      "actions": [
        {
          "type": "inform",
          "conditions": [
            { "type": "unprotected", "data": { "id": "fog" } }
          ],
          "data": { "message": "You feel the chill of the fog." }
        }
      ]
    }
  ]
}
```

Each definition requires a dense ordered `actions` array (which may be empty)
and may have an `event` string and `conditions` array. Conditions are typed
tables; all must pass using Lua truthiness, short-circuiting in array order.
Absent or empty conditions pass. Behavior conditions run once per execution.
Action conditions run when that action is reached; a failed condition skips
only that action. Earlier actions can change the shared context for later
actions or behaviors. Actions run synchronously in array order.

Action callbacks receive `(action, context, behavior)`. Condition callbacks
receive `(condition, context, subject)`, where subject is the behavior or action
carrying the condition. Both receive the complete data table, including any
extra fields. Payloads conventionally live under `data`.

`run(definition, context)` returns ordered records containing `action`,
`actionIndex` (the original position), and `value` (the callback's first return
value). A callback returning nil still produces a record. A rejected behavior
returns an empty array.

`emit(event, definitions, context)` matches event names exactly and runs matching
behaviors in array order. Definitions without an event are only used by `run`.
It returns a record for each matching behavior, including rejected behaviors:
`{ behavior, behaviorIndex, results }`. The context is passed through unchanged;
consumers can include event payloads in it.

`validate(definition)` returns true or raises an error for malformed structure or
unknown types. `run` validates before callbacks; `emit` validates the entire list,
including nonmatching behaviors, before any callbacks. Payload validation belongs
to consumers. Callback errors propagate and prior side effects are not rolled
back. Do not modify definition structure or registrations during execution.
Registering an existing type replaces its handler and optional schema.

The bundle provides the shared `moonlight:behaviors` type in `selene:schemas`.
Consumer registries can declare a field as
`{ "type": "array", "valueType": "moonlight:behaviors" }` or embed a single
behavior as `"moonlight:behaviors"`. The bundle does not own a gameplay behavior
registry; consumers choose where definitions live.

For Moonlight Editor type dropdowns and typed payload controls, registration
methods accept an optional third argument (a type name or property definition).
A script schema provider can return
`{ behaviors = { type = "array", valueType = behaviors:schema() } }`.
Each `schema()` call returns a fresh instance-specific definition. Types without
payload schemas and the shared named schema use JSON payload controls. Editor
schemas do not perform runtime payload validation.

Run tests from the Selene repository root:

```sh
lua bundles/moonlight/moonlight-behaviors/tests/behaviors_test.lua
```
