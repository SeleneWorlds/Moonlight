local Logging = require("selene.logging")

local Attribute = {}
Attribute.__index = Attribute

local function removeFilter(filters, name)
    for i, entry in ipairs(filters) do
        if entry.name == name then
            table.remove(filters, i)
            return true
        end
    end
end

local function addFilter(filters, name, filter)
    assert(type(name) == "string", "Filter name must be a string")
    if type(filter) == "function" then
        filter = { enabled = true, apply = filter }
    end
    assert(type(filter) == "table" and type(filter.apply) == "function", "Invalid attribute filter")
    removeFilter(filters, name)
    filters[#filters + 1] = { name = name, filter = filter }
    return filter
end

local function applyFilters(attribute, value, filters)
    for _, entry in ipairs(filters) do
        local filter = entry.filter
        if filter.enabled ~= false then
            local ok, result = pcall(filter.apply, attribute, value)
            if ok then
                value = result
            else
                Logging.error("Lua Error in attribute filter: " .. tostring(result))
            end
        end
    end
    return value
end

function Attribute:new(owner, name, initialValue)
    assert(type(name) == "string", "Attribute name must be a string")
    return setmetatable({
        _owner = owner,
        _name = name,
        _value = initialValue,
        _constraints = {},
        _modifiers = {},
        _observers = {},
    }, self)
end

function Attribute:getOwner() return self._owner end
function Attribute:getName() return self._name end
function Attribute:getValue() return self._value end

function Attribute:setValue(value)
    if self._value == value then return end
    value = applyFilters(self, value, self._constraints)
    if self._value ~= value then
        self._value = value
        self:refresh()
    end
end

function Attribute:getEffectiveValue()
    return applyFilters(self, self._value, self._modifiers)
end

function Attribute:addConstraint(name, filter)
    return addFilter(self._constraints, name, filter)
end

function Attribute:removeConstraint(name) removeFilter(self._constraints, name) end

function Attribute:addModifier(name, filter)
    local handle = addFilter(self._modifiers, name, filter)
    self:refresh()
    return handle
end

function Attribute:removeModifier(name)
    if removeFilter(self._modifiers, name) then self:refresh() end
end

function Attribute:subscribe(observer)
    assert(type(observer) == "function", "Attribute observer must be a function")
    self._observers[#self._observers + 1] = observer
    return observer
end

function Attribute:unsubscribe(observer)
    for i, candidate in ipairs(self._observers) do
        if candidate == observer then
            table.remove(self._observers, i)
            return
        end
    end
end

function Attribute:refresh()
    local observers = {}
    for i, observer in ipairs(self._observers) do observers[i] = observer end
    for _, observer in ipairs(observers) do
        local ok, err = pcall(observer, self)
        if not ok then Logging.error("Lua Error in attribute observer: " .. tostring(err)) end
    end
end

return Attribute
