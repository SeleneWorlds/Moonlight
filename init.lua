local m = {}

m.Chat = SELENE_IS_SERVER and require("moonlight.server.lua.chat") or require("moonlight.client.lua.chat")
if SELENE_IS_SERVER then
    m.Persistence = require("moonlight.server.lua.persistence")
    m.Permissions = require("moonlight.server.lua.permissions")
    m.Attributes = require("moonlight.server.lua.attributes")
    m.Skills = require("moonlight.server.lua.skills")
    m.Actions = require("moonlight.server.lua.actions")
    m.Combat = require("moonlight.server.lua.combat")
    m.Dialogs = require("moonlight.server.lua.dialogs")
end

return m