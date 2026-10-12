local Inventory = require("moonlight-inventory.server.lua.inventory")

local ObservableMapInventory = Inventory:new()

local function normalizeSlotId(slotId)
    if type(slotId) == "number" then
        local integerSlotId = math.tointeger(slotId)
        if integerSlotId then
            return integerSlotId
        end
    end
    error("Slot ID must be an integer, got " .. tostring(slotId))
end

function ObservableMapInventory:addSlot(slotId)
    table.insert(self.slots, normalizeSlotId(slotId))
end

function ObservableMapInventory:getItem(slotId)
    return self.data:lookup("items", normalizeSlotId(slotId))
end

function ObservableMapInventory:setItem(slotId, item)
    slotId = normalizeSlotId(slotId)
    self.data:Set("items", slotId, item)
    self:slotUpdated(slotId)
end

function ObservableMapInventory:getSlots()
    return self.slots
end

function ObservableMapInventory:copyItem(item)
    return item:deepCopy()
end

function ObservableMapInventory:subscribe(observer)
    self.data:subscribe(observer)
end

function ObservableMapInventory:slotUpdated(slotId)
    self.data.dirtySlot = slotId
    self.data:notifyObservers()
end

function ObservableMapInventory:new(o)
    o = Inventory:new(o or {})
    o.data = o.data or tablex.observable()
    o.data.items = o.data.items or tablex.observable()
    o.slots = o.slots or {}
    setmetatable(o, self)
    self.__index = self
    return o
end

return ObservableMapInventory
