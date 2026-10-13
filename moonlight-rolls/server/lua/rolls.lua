local Rolls = {}
Rolls.__index = Rolls

local function finite(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
end

local function name(value)
    assert(type(value) == "string" and value ~= "", "Type must be a non-empty string")
end

-- Require dense arrays so malformed data cannot silently drop pools or entries.
local function array(value, label)
    assert(type(value) == "table", label .. " must be an array")
    local count = 0
    for key in pairs(value) do
        assert(type(key) == "number" and key >= 1 and key % 1 == 0,
            label .. " must be an array")
        count = count + 1
    end
    for i = 1, count do assert(value[i] ~= nil, label .. " must be a dense array") end
end

function Rolls:new(options)
    options = options or {}
    assert(type(options) == "table", "Options must be a table")
    assert(options.random == nil or type(options.random) == "function", "Random must be a function")
    return setmetatable({
        _handlers = {},
        _conditions = {},
        _typeSchemas = {},
        _conditionSchemas = {},
        _random = options.random or math.random
    }, self)
end

local function schemaDefinition(schema)
    assert(schema == nil or (type(schema) == "string" and schema ~= "")
        or (type(schema) == "table" and type(schema.type) == "string" and schema.type ~= ""),
        "Schema must be a type name or property definition")
end

function Rolls:registerType(entryType, handler, schema)
    name(entryType)
    assert(type(handler) == "function", "Entry handler must be a function")
    schemaDefinition(schema)
    self._handlers[entryType] = handler
    self._typeSchemas[entryType] = schema
    return self
end

function Rolls:registerCondition(conditionType, handler, schema)
    name(conditionType)
    assert(type(handler) == "function", "Condition handler must be a function")
    schemaDefinition(schema)
    self._conditions[conditionType] = handler
    self._conditionSchemas[conditionType] = schema
    return self
end

-- Return a fresh editor definition for this instance's registered payload types.
local function copy(value)
    if type(value) ~= "table" then return value end
    local result = {}
    for key, child in pairs(value) do result[key] = copy(child) end
    return result
end

local function typedSchema(handlers, schemas, properties)
    local names, values, variants = {}, {}, {}
    for kind in pairs(handlers) do names[#names + 1] = kind end
    table.sort(names)
    for _, kind in ipairs(names) do
        values[#values + 1] = { value = kind, label = kind }
        variants[kind] = copy(schemas[kind] or "any")
    end
    properties.type = { type = "enum", values = values }
    properties.data = { type = "schema_lookup", property = "type", variants = variants, optional = true }
    return { type = "object", properties = properties }
end

function Rolls:schema()
    local conditions = { type = "array", optional = true,
        valueType = typedSchema(self._conditions, self._conditionSchemas, {}) }
    local entry = typedSchema(self._handlers, self._typeSchemas, {
        label = { type = "string", optional = true },
        weight = { type = "number", min = 0, optional = true },
        conditions = copy(conditions)
    })
    return { type = "object", editor = "moonlight:rolls", properties = {
        conditions = conditions,
        pools = { type = "array", valueType = { type = "object", properties = {
            name = { type = "string", optional = true },
            rolls = { type = "integer", min = 0, optional = true },
            conditions = copy(conditions),
            entries = { type = "array", valueType = entry }
        } } }
    } }
end

local function validateConditions(self, conditions)
    if conditions == nil then return end
    array(conditions, "Conditions")
    for _, condition in ipairs(conditions) do
        if type(condition) ~= "function" then
            assert(type(condition) == "table", "Condition must be a function or typed table")
            name(condition.type)
            assert(self._conditions[condition.type], "Unknown condition type: " .. condition.type)
        end
    end
end

-- Validate the entire definition before invoking any consumer callbacks.
function Rolls:validate(definition)
    assert(type(definition) == "table", "Definition must be a table")
    validateConditions(self, definition.conditions)
    array(definition.pools, "Pools")
    for _, pool in ipairs(definition.pools) do
        assert(type(pool) == "table", "Pool must be a table")
        validateConditions(self, pool.conditions)
        local count = pool.rolls == nil and 1 or pool.rolls
        assert(finite(count) and count >= 0 and count % 1 == 0, "Pool rolls must be a non-negative integer")
        array(pool.entries, "Entries")
        local total = 0
        for _, entry in ipairs(pool.entries) do
            assert(type(entry) == "table", "Entry must be a table")
            name(entry.type)
            assert(self._handlers[entry.type], "Unknown entry type: " .. entry.type)
            validateConditions(self, entry.conditions)
            local weight = entry.weight == nil and 1 or entry.weight
            assert(finite(weight) and weight >= 0, "Entry weight must be a finite non-negative number")
            total = total + weight
            assert(finite(total), "Pool total weight must be finite")
        end
    end
    return true
end

local function matches(self, conditions, context, subject)
    for _, condition in ipairs(conditions or {}) do
        local accepted
        if type(condition) == "function" then
            accepted = condition(context, subject)
        else
            accepted = self._conditions[condition.type](condition, context, subject)
        end
        if not accepted then return false end
    end
    return true
end

function Rolls:roll(definition, context)
    self:validate(definition)
    local results = {}
    if not matches(self, definition.conditions, context, definition) then return results end
    for poolIndex, pool in ipairs(definition.pools) do
        local count = pool.rolls == nil and 1 or pool.rolls
        if count > 0 and matches(self, pool.conditions, context, pool) then
            for rollIndex = 1, count do
                -- Re-evaluate eligibility so earlier handlers can update the context.
                local eligible, total = {}, 0
                for _, entry in ipairs(pool.entries) do
                    local weight = entry.weight == nil and 1 or entry.weight
                    if weight > 0 and matches(self, entry.conditions, context, entry) then
                        total = total + weight
                        eligible[#eligible + 1] = { entry = entry, upper = total }
                    end
                end
                if total > 0 then
                    local random = self._random()
                    assert(finite(random) and random >= 0 and random < 1,
                        "Random must return a number in [0, 1)")
                    local target = random * total
                    -- Fall back to the last entry if floating-point rounding reaches total.
                    local selected = eligible[#eligible].entry
                    for _, candidate in ipairs(eligible) do
                        if target < candidate.upper then selected = candidate.entry; break end
                    end
                    local value = self._handlers[selected.type](selected, context)
                    results[#results + 1] = {
                        entry = selected, value = value,
                        poolIndex = poolIndex, rollIndex = rollIndex
                    }
                end
            end
        end
    end
    return results
end

return Rolls
