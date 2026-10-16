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
-- Built-in negation works on fresh instances and preserves callback arguments.
local negation = Behaviors:new()
local negateCalls = 0
local expectedSubject
negation:registerAction("record", function() negateCalls = negateCalls + 1 end)
negation:registerCondition("value", function(condition, state, subject)
    assert(state == context and subject == expectedSubject)
    return condition.data
end, "boolean")
local function inverted(condition) return { type = "not", data = condition } end
local function check(condition, expected, onAction)
    local action = { type = "record" }
    local behavior = { actions = { action } }
    expectedSubject = onAction and action or behavior
    expectedSubject.conditions = { condition }
    negateCalls = 0
    negation:run(behavior, context)
    assert(negateCalls == expected)
end
for _, onAction in ipairs({ false, true }) do
    check(inverted({type="value",data=true}), 0, onAction)
    check(inverted({type="value",data=false}), 1, onAction)
    check(inverted({type="value"}), 1, onAction)
    check(inverted({type="value",data=0}), 0, onAction)
    check(inverted(inverted({type="value",data=true})), 1, onAction)
end
assert(not pcall(negation.registerCondition, negation, "not", function() return true end))
local cycle = inverted(nil)
cycle.data = cycle
for _, invalid in ipairs({ inverted(nil), inverted(false), inverted({}),
    inverted({type="unknown"}), inverted(inverted({type="unknown"})), cycle }) do
    negateCalls = 0
    assert(not pcall(negation.emit, negation, "event", {
        {event="event", actions={{type="record"}}},
        {event="other", actions={}, conditions={invalid}}
    }, context))
    assert(negateCalls == 0, "Invalid nested conditions must fail before side effects")
end
local variants = negation:schema().properties.conditions.valueType.properties.data.variants
assert(variants["not"].properties.data.variants.value == "boolean")
assert(variants["not"].properties.data.variants["not"] == "any")
variants["not"].properties.data.variants.value = "string"
assert(negation:schema().properties.conditions.valueType.properties.data.variants["not"].properties.data.variants.value == "boolean")
assert(Behaviors:new():schema().properties.conditions.valueType.properties.data.variants["not"])
-- Logical groups work at both behavior and action level and short-circuit.
negation:registerCondition("never", function() error("Group did not short-circuit") end)
for _, onAction in ipairs({false, true}) do
    check({type="all", data={}}, 1, onAction)
    check({type="any", data={}}, 0, onAction)
    check({type="all", data={{type="value",data=true}, {type="value",data=false}}}, 0, onAction)
    check({type="any", data={{type="value",data=false}, {type="value",data=true}}}, 1, onAction)
    check({type="all", data={{type="value",data=false}, {type="never"}}}, 0, onAction)
    check({type="any", data={{type="value",data=true}, {type="never"}}}, 1, onAction)
    check(inverted({type="all", data={{type="any",data={{type="value",data=false}}}}}), 1, onAction)
end
for _, kind in ipairs({"all", "any"}) do
    assert(not pcall(negation.registerCondition, negation, kind, function() end))
    local cyclic = {type=kind, data={}}
    cyclic.data[1] = inverted(cyclic)
    for _, invalid in ipairs({
        {type=kind}, {type=kind,data=false}, {type=kind,data={false}},
        {type=kind,data={[2]={type="value"}}}, {type=kind,data={extra={type="value"}}},
        {type=kind,data={{type="unknown"}}}, cyclic,
        {type=kind,data={{type="value",data=kind=="any"}, {type="unknown"}}}
    }) do
        negateCalls = 0
        assert(not pcall(negation.emit, negation, "event", {
            {event="event",actions={{type="record"}}},
            {event="other",actions={{type="record",conditions={invalid}}}}
        }, context))
        assert(negateCalls == 0)
    end
    local group = negation:schema().properties.conditions.valueType.properties.data.variants[kind]
    assert(group.type == "array" and group.valueType.properties.data.variants.value == "boolean")
    assert(group.valueType.properties.data.variants[kind] == "any")
    group.valueType.properties.data.variants.value = "string"
    assert(negation:schema().properties.conditions.valueType.properties.data.variants[kind].valueType.properties.data.variants.value == "boolean")
end
print("behaviors tests passed")
