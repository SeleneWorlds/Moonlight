local Behaviors = {}
Behaviors.__index = Behaviors

local function name(value, label)
    assert(type(value) == "string" and value ~= "", label .. " must be a non-empty string")
end

local function array(value, label)
    assert(type(value) == "table", label .. " must be an array")
    local count = 0
    for key in pairs(value) do
        assert(type(key) == "number" and key >= 1 and key % 1 == 0, label .. " must be an array")
        count = count + 1
    end
    for i = 1, count do assert(value[i] ~= nil, label .. " must be a dense array") end
end

function Behaviors:new()
    local instance = setmetatable({ _actions = {}, _conditions = {}, _actionSchemas = {}, _conditionSchemas = {} }, self)
    instance._conditions["not"] = function(condition, context, subject)
        local nested = condition.data
        return not instance._conditions[nested.type](nested, context, subject)
    end
    return instance
end

local function register(handlers, schemas, kind, handler, schema)
    name(kind, "Type")
    assert(type(handler) == "function", "Handler must be a function")
    assert(schema == nil or (type(schema) == "string" and schema ~= "")
        or (type(schema) == "table" and type(schema.type) == "string" and schema.type ~= ""),
        "Schema must be a type name or property definition")
    handlers[kind], schemas[kind] = handler, schema
end

function Behaviors:registerAction(kind, handler, schema)
    register(self._actions, self._actionSchemas, kind, handler, schema)
    return self
end

function Behaviors:registerCondition(kind, handler, schema)
    assert(kind ~= "not", "The built-in not condition cannot be replaced")
    register(self._conditions, self._conditionSchemas, kind, handler, schema)
    return self
end

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

function Behaviors:schema()
    local conditionSchema = typedSchema(self._conditions, self._conditionSchemas, {})
    -- A finite schema exposes registered types inside not; further nested not
    -- payloads use JSON controls rather than creating a cyclic schema table.
    local nestedSchema = copy(conditionSchema)
    conditionSchema.properties.data.variants["not"] = nestedSchema
    local conditions = { type = "array", optional = true, valueType = conditionSchema }
    return { type = "object", properties = {
        event = { type = "string", optional = true },
        conditions = conditions,
        actions = { type = "array", valueType = typedSchema(self._actions, self._actionSchemas, {
            conditions = copy(conditions)
        }) }
    } }
end

local function validateCondition(self, condition, visiting)
    assert(type(condition) == "table", "Condition must be a typed table")
    assert(not visiting[condition], "Conditions must not contain cycles")
    name(condition.type, "Condition type")
    assert(self._conditions[condition.type], "Unknown condition type: " .. condition.type)
    if condition.type == "not" then
        visiting[condition] = true
        validateCondition(self, condition.data, visiting)
        visiting[condition] = nil
    end
end

local function validateConditions(self, conditions)
    if conditions == nil then return end
    array(conditions, "Conditions")
    for _, condition in ipairs(conditions) do
        validateCondition(self, condition, {})
    end
end

-- Check every action before any callback can produce side effects.
function Behaviors:validate(definition)
    assert(type(definition) == "table", "Behavior must be a table")
    if definition.event ~= nil then name(definition.event, "Event") end
    validateConditions(self, definition.conditions)
    array(definition.actions, "Actions")
    for _, action in ipairs(definition.actions) do
        assert(type(action) == "table", "Action must be a typed table")
        name(action.type, "Action type")
        assert(self._actions[action.type], "Unknown action type: " .. action.type)
        validateConditions(self, action.conditions)
    end
    return true
end

local function matches(self, conditions, context, subject)
    for _, condition in ipairs(conditions or {}) do
        if not self._conditions[condition.type](condition, context, subject) then return false end
    end
    return true
end

local function execute(self, definition, context)
    local results = {}
    if not matches(self, definition.conditions, context, definition) then return results end
    for index, action in ipairs(definition.actions) do
        -- Evaluate at execution time so earlier actions can affect later conditions.
        if matches(self, action.conditions, context, action) then
            local value = self._actions[action.type](action, context, definition)
            results[#results + 1] = { action = action, actionIndex = index, value = value }
        end
    end
    return results
end

function Behaviors:run(definition, context)
    self:validate(definition)
    return execute(self, definition, context)
end

-- Consumers bridge their event sources to this dispatcher; no global listeners.
function Behaviors:emit(event, definitions, context)
    name(event, "Event")
    array(definitions, "Behaviors")
    for _, definition in ipairs(definitions) do self:validate(definition) end
    local results = {}
    for index, definition in ipairs(definitions) do
        if definition.event == event then
            results[#results + 1] = {
                behavior = definition, behaviorIndex = index,
                results = execute(self, definition, context)
            }
        end
    end
    return results
end

return Behaviors
