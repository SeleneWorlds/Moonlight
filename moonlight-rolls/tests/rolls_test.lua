package.path = "bundles/moonlight/?.lua;" .. package.path
local Rolls = require("moonlight-rolls.server.lua.rolls")

local draws, samples = 0, { 0, 0.749, 0.75, 0.999 }
local roller = Rolls:new({ random = function()
    draws = draws + 1
    return samples[draws]
end })
roller:registerType("value", function(entry, context)
    assert(context.marker == "context")
    return entry.value
end)
local a, b = { type = "value", weight = 3, value = "a" },
    { type = "value", weight = 1, value = "b" }
local definition = { pools = {
    { rolls = 4, entries = { a, b } },
    { rolls = 0, entries = { a } },
    { entries = {} },
    { entries = { { type = "value", weight = 0 } } }
} }
local results = roller:roll(definition, { marker = "context" })
assert(#results == 4 and draws == 4)
assert(results[1].entry == a and results[2].value == "a")
assert(results[3].entry == b and results[4].value == "b")
assert(results[4].poolIndex == 1 and results[4].rollIndex == 4)
assert(a.weight == 3 and #definition.pools[1].entries == 2)

-- Conditions at all levels, dynamic eligibility, default and fractional weights.
local context = { remaining = 1, calls = 0 }
local dynamic = Rolls:new({ random = function() return 0 end })
dynamic:registerType("consume", function(_, state)
    state.remaining = state.remaining - 1
end)
dynamic:registerType("fallback", function(_, state)
    state.calls = state.calls + 1
    return false
end)
dynamic:registerCondition("available", function(condition, state, subject)
    assert(condition.min == 1 and subject.type == "consume")
    return state.remaining >= condition.min
end)
local conditioned = { conditions = { function(state, subject)
    assert(state == context and subject.pools)
    return true
end }, pools = {
    { conditions = { function() return false end, function() error("No short circuit") end },
        entries = { { type = "fallback" } } },
    { rolls = 2, entries = {
        { type = "consume", weight = 0.5, conditions = { { type = "available", min = 1 } } },
        { type = "fallback" }
    } },
    { conditions = { function(state, subject)
        assert(subject.entries and state.remaining == 0)
        return true
    end }, entries = { { type = "fallback" } } }
} }
results = dynamic:roll(conditioned, context)
assert(#results == 3 and context.remaining == 0 and context.calls == 2)
assert(results[1].value == nil and results[2].value == false)
assert(results[1].poolIndex == 2 and results[3].poolIndex == 3)
conditioned.conditions = { function() return false end }
assert(#dynamic:roll(conditioned, context) == 0 and context.calls == 2)

-- Instance isolation and replacement.
assert(not pcall(function() Rolls:new():validate({ pools = { { entries = { a } } } }) end))
roller:registerType("value", function() return "replaced" end)
local fixed = Rolls:new({ random = function() return 0 end })
fixed:registerType("value", function() return "fixed" end)
assert(fixed:roll({ pools = { { entries = { a } } } })[1].value == "fixed")
roller._random = function() return 0 end
assert(roller:roll({ pools = { { entries = { a } } } })[1].value == "replaced")

local function invalid(value)
    assert(not pcall(function() fixed:validate(value) end))
end
invalid({})
invalid({ pools = { [2] = { entries = {} } } })
invalid({ pools = { { entries = { [1] = a, extra = b } } } })
for _, weight in ipairs({ -1, math.huge, 0/0, "1", false }) do
    invalid({ pools = { { entries = { { type = "value", weight = weight } } } } })
end
for _, count in ipairs({ -1, 1.5, math.huge, 0/0, "1", false }) do
    invalid({ pools = { { rolls = count, entries = {} } } })
end
invalid({ pools = { { entries = { { type = "" } } } } })
invalid({ conditions = { { type = "missing" } }, pools = {} })
invalid({ conditions = { true }, pools = {} })
invalid({ pools = { { entries = {
    { type = "value", weight = 1e308 }, { type = "value", weight = 1e308 }
} } } })

-- A malformed later pool is rejected before any earlier handler runs.
local calls = 0
fixed:registerType("value", function() calls = calls + 1 end)
invalid({ pools = { { entries = { a } }, { entries = { { type = "unknown" } } } } })
assert(not pcall(function() fixed:roll({ pools = {
    { entries = { a } }, { entries = { { type = "unknown" } } }
} }) end) and calls == 0)
for _, random in ipairs({ -0.1, 1, math.huge, 0/0, "0" }) do
    local bad = Rolls:new({ random = function() return random end })
    bad:registerType("value", function() error("Should not run") end)
    assert(not pcall(function() bad:roll({ pools = { { entries = { a } } } }) end))
end
fixed:registerType("value", function() error("Handler failure") end)
assert(not pcall(function() fixed:roll({ pools = { { entries = { a } } } }) end))
assert(not pcall(function() fixed:roll({ conditions = { function() error("Condition failure") end }, pools = {} }) end))
assert(Rolls:new():validate({ pools = {} }))
-- Editor schemas cover every condition location, isolate instances, and replace metadata.
local editor = Rolls:new()
local payload = { type = "object", properties = { amount = "integer" } }
assert(editor:registerType("z", function() end, payload) == editor)
editor:registerType("a", function() end)
assert(editor:registerCondition("level", function() return true end, "integer") == editor)
local schema = editor:schema()
local pool = schema.properties.pools.valueType.properties
local entry = pool.entries.valueType.properties
assert(entry.type.values[1].value == "a" and entry.type.values[2].value == "z")
assert(entry.data.variants.a == "any" and entry.data.variants.z.properties.amount == "integer")
for _, conditions in ipairs({ schema.properties.conditions, pool.conditions, entry.conditions }) do
    assert(conditions.valueType.properties.data.variants.level == "integer")
end
entry.data.variants.z.properties.amount = "boolean"
assert(payload.properties.amount == "integer")
assert(editor:schema().properties.pools.valueType.properties.entries.valueType.properties
    .data.variants.z.properties.amount == "integer")
assert(#Rolls:new():schema().properties.conditions.valueType.properties.type.values == 0)
editor:registerType("z", function() end)
editor:registerCondition("level", function() return true end)
schema = editor:schema()
assert(schema.properties.pools.valueType.properties.entries.valueType.properties.data.variants.z == "any")
assert(schema.properties.conditions.valueType.properties.data.variants.level == "any")
for _, invalidSchema in ipairs({ false, 4, {}, { type = 4 }, "" }) do
    assert(not pcall(function() editor:registerType("bad", function() end, invalidSchema) end))
    assert(not pcall(function() editor:registerCondition("bad", function() end, invalidSchema) end))
end
-- Strategies deduplicate per pool and per invocation, preserving weighted draws.
local function strategyRoll(strategy, samples, entries, count)
    local draws, calls = 0, 0
    local instance = Rolls:new({ random = function()
        draws = draws + 1
        return assert(samples[draws], "Unexpected extra draw")
    end })
    instance:registerType("value", function(entry)
        calls = calls + 1
        return entry.value
    end)
    local pool = { strategy = strategy, rolls = count or 4, entries = entries or { a, b } }
    local results = instance:roll({ pools = { pool } })
    assert(calls == #results)
    return results, draws, instance, pool
end
local repeated = { 0, 0.1, 0.8, 0.9 }
for _, strategy in ipairs({ "basic", "deduplicate_skip", "deduplicate_reroll" }) do
    local results, draws = strategyRoll(strategy, repeated)
    if strategy == "basic" then
        assert(#results == 4 and draws == 4)
    elseif strategy == "deduplicate_skip" then
        assert(#results == 2 and draws == 4)
        assert(results[1].entry == a and results[1].rollIndex == 1)
        assert(results[2].entry == b and results[2].rollIndex == 3)
    else
        assert(#results == 2 and draws == 2)
        assert(results[1].entry == a and results[2].entry == b)
    end
end
local _, _, unique, uniquePool = strategyRoll("deduplicate_skip", {0,0,0,0})
-- A new pool or invocation gets its own selection history.
unique._random = function() return 0 end
assert(#unique:roll({pools={uniquePool, uniquePool}}) == 2)
assert(#unique:roll({pools={uniquePool}}) == 1)
for _, strategy in ipairs({ "deduplicate_skip", "deduplicate_reroll" }) do
    local results, draws = strategyRoll(strategy, {}, {}, 4)
    assert(#results == 0 and draws == 0)
    results, draws = strategyRoll(strategy, {}, {{type="value",weight=0}}, 4)
    assert(#results == 0 and draws == 0)
    -- Entry identity, not payload equality, determines duplicates.
    results, draws = strategyRoll(strategy, {0,0.9}, {
        {type="value",value="same"}, {type="value",value="same"}
    }, 2)
    assert(#results == 2 and draws == 2)
end
-- Reroll retains relative weights among remaining entries.
local c = {type="value",weight=2,value="c"}
local results = strategyRoll("deduplicate_reroll", {0,0.32}, {a,b,c}, 2)
assert(results[1].entry == a and results[2].entry == b)
results = strategyRoll("deduplicate_reroll", {0,0.34}, {a,b,c}, 2)
assert(results[2].entry == c)
-- Context changes still affect later eligibility with either deduplication strategy.
for _, strategy in ipairs({"deduplicate_skip", "deduplicate_reroll"}) do
    local state = {remaining=1,calls=0}
    conditioned.conditions = nil
    conditioned.pools[2].strategy = strategy
    local results = dynamic:roll(conditioned, state)
    assert(#results == 3 and state.remaining == 0 and state.calls == 2)
end
for _, strategy in ipairs({false, 1, "unique", ""}) do
    invalid({pools={{strategy=strategy,entries={a}}}})
end
local strategySchema = fixed:schema().properties.pools.valueType.properties.strategy
assert(strategySchema.optional and #strategySchema.values == 3)
assert(strategySchema.values[1].value == "basic")
assert(strategySchema.values[2].value == "deduplicate_skip")
assert(strategySchema.values[3].value == "deduplicate_reroll")

print("moonlight-rolls tests passed")
