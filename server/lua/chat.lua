local Network = require("selene.network")
local Mixins = require("selene.mixins")

Mixins.Mixin("Player", "Inform", function(Client, Message)
    Network.SendToPlayer(Client, "moonlight:inform", { Message = Message })
end)

Mixins.Mixin("Entity", "GetChatHistory", function(Entity)
    return {}
end)

Mixins.Mixin("Entity", "GetChatLanguage", function(Entity)
    return {
        Data = {
            IllarionID = 0
        }
    } -- TODO
end)

return {}