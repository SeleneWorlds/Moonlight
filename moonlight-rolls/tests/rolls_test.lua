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
print("moonlight-rolls tests passed")
