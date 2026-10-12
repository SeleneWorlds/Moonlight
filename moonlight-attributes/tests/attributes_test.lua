package.path = "bundles/moonlight/?.lua;" .. package.path
local errors = {}
package.loaded["selene.logging"] = { error = function(message) errors[#errors + 1] = message end }
local Attribute = require("moonlight-attributes.server.lua.attribute")
local Attributes = require("moonlight-attributes.server.lua.attributes")

-- Regeneration at the cap never publishes a change to the constrained value.
local points = Attribute:new({}, "points", 21)
points:addConstraint("clamp", Attributes.clampFilter(-math.huge, 21))
local notifications = 0
local observer = points:subscribe(function(attribute)
    assert(attribute == points)
    notifications = notifications + 1
end)
for i = 1, 100 do points:setValue(points:getValue() + 1) end
assert(points:getValue() == 21 and notifications == 0)
points:setValue(1)
points:setValue(2)
points:setValue(100)
assert(points:getValue() == 21 and notifications == 3)
points:refresh()
assert(notifications == 4)
points:unsubscribe(observer)
points:refresh()
assert(notifications == 4)

-- Constraint order, enabled handles and replacement order matter.
local ordered = Attribute:new({}, "ordered", 5)
local applied = {}
ordered:addConstraint("first", function(_, value) applied[#applied + 1] = "first"; return value + 1 end)
local disabled = ordered:addConstraint("disabled", function() error("Disabled filter ran") end)
disabled.enabled = false
ordered:addConstraint("last", function() applied[#applied + 1] = "last"; return 5 end)
ordered:subscribe(function() error("Unchanged final value notified") end)
ordered:setValue(10)
assert(table.concat(applied, ",") == "first,last" and ordered:getValue() == 5)

local number = Attribute:new({}, "number", 10)
number:addModifier("add", Attributes.mathOpFilter(2, "+"))
number:addModifier("multiply", Attributes.mathOpFilter(3, "*"))
assert(number:getEffectiveValue() == 36 and number:getValue() == 10)
number:addModifier("add", Attributes.mathOpFilter(1, "+"))
assert(number:getEffectiveValue() == 31)
number:removeModifier("multiply")
assert(number:getEffectiveValue() == 11)
number:removeModifier("add")
number:addModifier("divide", Attributes.mathOpFilter(3, "/"))
assert(number:getEffectiveValue() == 3)
number:setValue(-10)
assert(number:getEffectiveValue() == -3)
number:removeModifier("divide")
number:addModifier("float", Attributes.mathOpFilter(0.5, "*"))
assert(number:getEffectiveValue() == -5)

-- Dependencies are evaluated live but notifications remain explicit.
local offset = Attribute:new({}, "offset", 2)
local total = Attribute:new({}, "total", 10)
total:addModifier("offset", Attributes.mathOpFilter(offset, "+"))
total:addModifier("clamp", Attributes.clampFilter(0, points))
local updates = 0
total:subscribe(function() updates = updates + 1 end)
offset:setValue(3)
assert(total:getEffectiveValue() == 13 and updates == 0)
total:refresh()
assert(updates == 1)
total:addModifier("extra", Attributes.mathOpFilter(1, "+"))
assert(updates == 2 and total:getEffectiveValue() == 14)
total:removeModifier("extra")
assert(updates == 3 and total:getEffectiveValue() == 13)
total:removeModifier("missing")
assert(updates == 3)

-- Values remain Lua objects; separate wrappers can retrieve the same attribute.
local runtime = {}
local function wrapper()
    return { getRuntimeData = function(_, key)
        runtime[key] = runtime[key] or {}
        return runtime[key]
    end }
end
local owner, value = wrapper(), { colour = { 1, 2, 3 } }
local stored = Attributes.create(owner, "appearance", value)
assert(Attributes.get(wrapper(), "appearance") == stored)
assert(stored:getValue() == value and stored:getOwner() == owner and stored:getName() == "appearance")
assert(not pcall(Attributes.create, owner, "appearance", 0))

local faulty = Attribute:new({}, "faulty", 1)
faulty:addConstraint("bad", function() error("Expected filter failure") end)
faulty:subscribe(function() error("Expected observer failure") end)
local afterFailure = false
faulty:subscribe(function() afterFailure = true end)
faulty:setValue(2)
assert(faulty:getValue() == 2 and afterFailure and #errors == 2)
local selfRemoving
selfRemoving = faulty:subscribe(function() faulty:unsubscribe(selfRemoving) end)
faulty:refresh()
assert(#faulty._observers == 2)

print("Attribute tests passed")
