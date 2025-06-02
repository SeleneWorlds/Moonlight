local Network = require("selene.network")

Network.HandlePayload("moonlight:inform", function(Payload)
    print(Payload.Message)
end)

return {}