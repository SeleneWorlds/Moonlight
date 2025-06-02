local Mixins = require("selene.mixins")

Mixins.Mixin("Entity", "IsInCombat", function(Entity)
    return false -- TODO
end)

Mixins.Mixin("Entity", "GetFightPoints", function(Entity)
    return 0 -- TODO
end)

return {}