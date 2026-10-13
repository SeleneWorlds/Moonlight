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
for _, functionName in ipairs({ "broken", "invalid", "invalidProperty", "missing" }) do
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
print("scripted schema regression tests passed")
