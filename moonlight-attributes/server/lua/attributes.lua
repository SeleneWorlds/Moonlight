local Attribute = require("moonlight-attributes.server.lua.attribute")

local Attributes = {}
local runtimeKey = "moonlight-attributes:attributes"

function Attributes.get(owner, name)
    return owner:getRuntimeData(runtimeKey)[name]
end

function Attributes.create(owner, name, initialValue)
    local attributes = owner:getRuntimeData(runtimeKey)
    assert(attributes[name] == nil, "Attribute already exists: " .. tostring(name))
    local attribute = Attribute:new(owner, name, initialValue)
    attributes[name] = attribute
    return attribute
end

local function operand(value)
    if type(value) == "number" then return function() return value end end
    assert(type(value) == "table" and type(value.getEffectiveValue) == "function",
        "Filter operand must be a number or attribute")
    return function() return value:getEffectiveValue() end
end

function Attributes.clampFilter(min, max)
    local lower, upper = operand(min), operand(max)
    return { enabled = true, apply = function(_, value)
        local low, high = lower(), upper()
        assert(low <= high, "Invalid clamp bounds")
        return math.max(low, math.min(high, value))
    end }
end

function Attributes.mathOpFilter(value, operator)
    assert(operator == "+" or operator == "-" or operator == "*" or operator == "/",
        "Invalid math operator: " .. tostring(operator))
    local right = operand(value)
    return { enabled = true, apply = function(_, left)
        local value = right()
        if operator == "+" then return left + value end
        if operator == "-" then return left - value end
        if operator == "*" then return left * value end
        assert(value ~= 0, "Cannot divide attribute by zero")
        local result = left / value
        -- Preserve truncation toward zero for integer attributes.
        if math.type(left) == "integer" and math.type(value) == "integer" then
            return math.tointeger(math.modf(result))
        end
        return result
    end }
end

return Attributes
