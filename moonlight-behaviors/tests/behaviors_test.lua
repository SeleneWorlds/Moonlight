package.path = "bundles/moonlight/?.lua;" .. package.path
local Behaviors = require("moonlight-behaviors.server.lua.behaviors")
local runner = Behaviors:new()
local context = { log = {}, debuffed = false }
runner:registerAction("inform", function(action, state, behavior)
    assert(behavior.actions)
    state.log[#state.log + 1] = action.data
    return false
end, "string")
runner:registerAction("debuff", function(_, state) state.debuffed = true end)
runner:registerCondition("debuffed", function(condition, state, subject)
    assert(subject.actions or subject.type)
    return state.debuffed == condition.data
end, "boolean")
runner:registerCondition("never", function() error("Short circuit failed") end)

local definition = { event = "enter", actions = {
    { type = "inform", data = "before" },
    { type = "inform", data = "skipped", conditions = { { type = "debuffed", data = true } } },
    { type = "debuff" },
    { type = "inform", data = "after", conditions = { { type = "debuffed", data = true } } }
} }
local results = runner:run(definition, context)
assert(#results == 3 and context.log[1] == "before" and context.log[2] == "after")
assert(results[1].value == false and results[2].value == nil)
assert(results[3].actionIndex == 4 and results[3].action == definition.actions[4])
assert(#definition.actions == 4)

local rejected = { event = "enter", conditions = {
    { type = "debuffed", data = false }, { type = "never" }
}, actions = { { type = "inform", data = "rejected" } } }
assert(#runner:run(rejected, context) == 0)
local skippedAction = { actions = { { type = "inform", conditions = rejected.conditions } } }
assert(#runner:run(skippedAction, context) == 0)
local dispatched = runner:emit("enter", {
    { event = "other", actions = {} }, rejected, definition, { actions = definition.actions }
}, context)
assert(#dispatched == 2 and dispatched[1].behaviorIndex == 2 and #dispatched[1].results == 0)
assert(dispatched[2].behavior == definition and #dispatched[2].results == 4)
assert(#runner:emit("missing", { definition }, context) == 0)
assert(#runner:run({ actions = {} }) == 0)

-- Whole-list validation prevents even early valid actions from running.
local calls = 0
local isolated = Behaviors:new():registerAction("count", function() calls = calls + 1 end)
local valid = { event = "enter", actions = { { type = "count" } } }
assert(not pcall(function() isolated:run({ actions = { { type = "count" }, { type = "unknown" } } }) end))
assert(not pcall(function() isolated:emit("enter", { valid, { event = "other", actions = {{ type = "unknown" }} } }) end))
assert(calls == 0)
for _, invalid in ipairs({
    {}, { event = "", actions = {} }, { event = false, actions = {} },
    { actions = { [2] = { type = "count" } } },
    { actions = { extra = { type = "count" } } },
    { actions = { false } }, { actions = { { type = "" } } },
    { actions = {}, conditions = { { type = "unknown" } } },
    { actions = { { type = "count", conditions = false } } },
    { actions = {}, conditions = { [2] = { type = "unknown" } } }
}) do assert(not pcall(function() isolated:validate(invalid) end)) end
assert(not pcall(function() isolated:emit("", {}) end))
assert(not pcall(function() isolated:emit("enter", { [2] = valid }) end))
assert(not pcall(function() isolated:validate(definition) end))
isolated:registerAction("count", function() return "replacement" end)
assert(isolated:run(valid)[1].value == "replacement")
isolated:registerAction("fail", function() error("Callback failed") end)
assert(not pcall(function() isolated:run({ actions = { { type = "fail" } } }) end))

-- Registered schemas, deterministic dropdowns, and independent returned copies.
local payload = { type = "object", properties = { id = "string" } }
runner:registerAction("debuff", function() end, payload)
local schema = runner:schema()
local action = schema.properties.actions.valueType.properties
assert(action.type.values[1].value == "debuff" and action.type.values[2].value == "inform")
assert(action.data.variants.inform == "string")
assert(action.conditions.valueType.properties.data.variants.debuffed == "boolean")
action.data.variants.debuff.properties.id = "number"
assert(payload.properties.id == "string")
assert(runner:schema().properties.actions.valueType.properties.data.variants.debuff.properties.id == "string")
runner:registerAction("debuff", function() end)
assert(runner:schema().properties.actions.valueType.properties.data.variants.debuff == "any")
for _, register in ipairs({ "registerAction", "registerCondition" }) do
    assert(not pcall(function() runner[register](runner, "", function() end) end))
    assert(not pcall(function() runner[register](runner, "bad", false) end))
    assert(not pcall(function() runner[register](runner, "bad", function() end, {}) end))
end
print("behaviors tests passed")
