local handlers, replies = {}, {}
package.loaded["selene.network"] = {
    handlePayload = function(name, callback) handlers[name] = callback end,
    sendToPlayer = function(_, name, payload)
        assert(name == "moonlight-editor:scripted-schema")
        replies[#replies + 1] = payload
    end,
}
package.loaded["selene.json"] = { encode = function(value) return tostring(value) end }
package.loaded["selene.event"] = { of = function() return {} end }
for _, name in ipairs({ "registries", "grid", "permissions" }) do
    package.loaded["selene." .. name] = {}
end
local definitions = {
    ["test:rolls"] = { type = "object", properties = { pools = { type = "array", valueType = "test:pool" } } },
    ["test:pool"] = { type = "object", properties = { rolls = "integer" } },
    ["test:cycle"] = { type = "object", properties = { nested = "test:cycle" } },
}
definitions["moonlight:rolls"] = { type = "object", editor = "moonlight:rolls", properties = definitions["test:rolls"].properties }
package.loaded["selene.registries"].findByName = function(registry, name)
    assert(registry == "selene:schemas")
    if definitions[name] then return { getField = function(_, field)
        assert(field == "definition")
        return definitions[name]
    end } end
end
definitions["test:pool"].properties.entries = { type = "array", valueType = {
    type = "object", properties = {
        type = { ["$parameter"] = "entryTypes", transform = "enum", default = "string" }, weight = "number",
        data = { type = "schema_lookup", property = "type", variants = { ["$parameter"] = "entryTypes", default = {} } }
    }
} }
definitions["moonlight:rolls"].properties = { pools = { type = "array", valueType = definitions["test:pool"] } }
local Editor = dofile("server/lua/editor.lua")
local enabled = true
Editor.isEnabled = function() return enabled end
local calls = 0
package.preload["test.scripted-schema"] = function()
    return {
        schema = function()
            calls = calls + 1
            return { amount = "integer", options = { type = "object", properties = { active = "boolean" } } }
        end,
        custom = function() return { title = "string" } end,
        broken = function() error("provider failed") end,
        invalid = function() return "invalid" end,
        invalidProperty = function() return { title = 5 } end,
        named = function() return { herbs = "moonlight:rolls", optional = { type = "test:pool", optional = true } } end,
        variants = function() return { data = { type = "schema_lookup", property = "type",
            variants = { item = "test:pool" } } } end,
        static = function() return { drops = { type = "moonlight:rolls", optional = true,
            parameters = { entryTypes = { item = "integer", nothing = "any" } } } } end,
        unknown = function() return { herbs = "test:missing" } end,
        cycle = function() return { herbs = "test:cycle" } end,
    }
end
local handler = handlers["moonlight-editor:request-scripted-schema"]
local function request(functionName, module)
    handler({}, { requestId = "test:1", module = module or "test.scripted-schema", functionName = functionName })
    local reply = replies[#replies]
    assert(reply.requestId == "test:1")
    return reply
end
assert(request().schema.amount == "integer")
assert(calls == 1)
assert(request("custom").schema.title == "string")
local static = request("static").schema.drops
local entry = static.properties.pools.valueType.properties.entries.valueType.properties
assert(entry.type.type == "enum" and #entry.type.values == 2)
assert(entry.data.variants.item == "integer")
assert(static.optional and static.parameters == nil)
assert(definitions["test:pool"].properties.entries.valueType.properties.type["$parameter"] == "entryTypes")
assert(request("variants").schema.data.variants.item.properties.rolls == "integer")
local named = request("named").schema
assert(named.herbs.type == "object" and named.herbs.properties.pools.valueType.properties.rolls == "integer")
assert(named.herbs.editor == "moonlight:rolls")
assert(definitions["moonlight:rolls"].editor == "moonlight:rolls")
assert(named.optional.optional == true and named.optional.properties.rolls == "integer")
assert(definitions["test:rolls"].properties.pools.valueType == "test:pool")
for _, functionName in ipairs({ "broken", "invalid", "invalidProperty", "missing", "unknown", "cycle" }) do
    local reply = request(functionName)
    assert(reply.schema == nil and type(reply.message) == "string")
end
assert(request(nil, "test.missing-module").message)
assert(next(request(nil, "").schema) == nil)
local count = #replies
enabled = false
request()
assert(#replies == count and calls == 1)
enabled = true
handler({}, { requestId = "invalid", module = 42 })
assert(#replies == count)
-- Named schemas can use a fixed Lua provider, including inside arrays.
definitions["test:behaviors"] = {
    type = "scripted_schema_lookup", module = "test.behavior-defaults"
}
package.loaded["test.behavior-defaults"] = {
    schema = function() return { actions = { type = "array", valueType = {
        type = "object", properties = {
            type = { type = "enum", values = { { value = "swap_item", label = "swap_item" } } },
            data = { type = "schema_lookup", property = "type", variants = {
                swap_item = { type = "object", properties = {
                    position = "coordinate", oldItem = { type = "registry", registry = "illarion:items" }
                } }
            } }
        }
    } } } end
}
package.loaded["test.area-schema"] = { schema = function()
    return { behaviors = { type = "array", optional = true, valueType = "test:behaviors" } }
end }
local behavior = request(nil, "test.area-schema").schema.behaviors.valueType
assert(behavior.type == "scripted_schema_lookup" and behavior.module == "test.behavior-defaults")
local action = request(nil, behavior.module).schema.actions.valueType.properties
assert(action.type.values[1].value == "swap_item")
assert(action.data.variants.swap_item.properties.position == "coordinate")
assert(action.data.variants.swap_item.properties.oldItem.registry == "illarion:items")
-- Load the real provider to guard against eager nested schema expansion.
package.loaded["selene.dimensions"] = {}
package.loaded["illarion-script-loader.server.lua.lib.inventoryManager"] = {}
package.loaded["moonlight-behaviors.server.lua.behaviors"] = dofile("../moonlight-behaviors/server/lua/behaviors.lua")
package.loaded["moonlight-rolls.server.lua.rolls"] = dofile("../moonlight-rolls/server/lua/rolls.lua")
local defaults = dofile("../../illarion-script-loader/server/lua/lib/behaviorDefaults.lua")
local schema = defaults.schema()
local nodes = 0
local function countNodes(value)
    nodes = nodes + 1
    if type(value) == "table" then for _, child in pairs(value) do countNodes(child) end end
end
countNodes(schema)
assert(nodes < 10000, "Behavior schema expanded eagerly: " .. nodes)
local variants = schema.actions.valueType.properties.data.variants
assert(variants.schedule.properties.actions.valueType.type == "scripted_schema_lookup")
assert(variants.transform_item.properties.onSuccess.valueType["function"] == "actionSchema")
assert(defaults.actionSchema().type.type == "enum")
print("scripted schema regression tests passed")
