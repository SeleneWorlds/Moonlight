local InventoryItem = {}

function InventoryItem:getItem()
    return self.item
end

function InventoryItem:getInventory()
    return self.inventory
end

function InventoryItem:getSlotId()
    return self.slotId
end

function InventoryItem:increase(amount)
    self.inventory:increaseCountAt(self.slotId, amount)
end

function InventoryItem:decrease(amount)
    self.inventory:decreaseCountAt(self.slotId, amount)
end

function InventoryItem:fromInventorySlot(inventory, slotId, item)
    if item == nil then
        return nil
    end

    local o = {
        inventory = inventory,
        slotId = slotId,
        item = item
    }
    setmetatable(o, self)
    self.__index = self
    return o
end

return InventoryItem