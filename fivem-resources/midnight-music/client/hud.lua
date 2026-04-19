-- client/hud.lua
-- MIDNIGHT PINE RACING — NUI HUD controller

local hudVisible = Config.HudEnabled

local function setHudVisible(visible)
    hudVisible = visible
    SendNUIMessage({ type = 'SET_HUD_VISIBLE', visible = visible })
end

-- /musichud — toggle HUD
RegisterCommand('musichud', function()
    setHudVisible(not hudVisible)
end, false)

-- Init NUI when resource starts
AddEventHandler('onClientResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    Wait(1500)  -- brief delay so NUI iframe has fully mounted
    SendNUIMessage({
        type     = 'INIT',
        position = Config.HudPosition,
        enabled  = Config.HudEnabled,
    })
    setHudVisible(Config.HudEnabled)
end)
