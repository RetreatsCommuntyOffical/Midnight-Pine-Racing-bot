-- client/controls.lua
-- MIDNIGHT PINE RACING — Keybind registration

-- Toggle music on/off
RegisterCommand('togglemusic', function()
    exports['midnight-music']:toggleMusic()
end, false)
RegisterKeyMapping('togglemusic', 'Toggle Music On/Off', 'keyboard', Config.Keys.toggle_music)

-- Skip track
RegisterCommand('skiptrack', function()
    exports['midnight-music']:skipTrack()
end, false)
RegisterKeyMapping('skiptrack', 'Skip Music Track', 'keyboard', Config.Keys.skip_track)

-- Next station
RegisterCommand('nextstation', function()
    local order   = Config.StationOrder
    local current = exports['midnight-music']:getStation()
    local idx     = 1
    for i, s in ipairs(order) do
        if s == current then idx = i; break end
    end
    local next = order[(idx % #order) + 1]
    exports['midnight-music']:setStation(next)
    TriggerServerEvent('midnight-music:savePrefs', { stationSlug = next })
end, false)
RegisterKeyMapping('nextstation', 'Next Radio Station', 'keyboard', Config.Keys.next_station)

-- Volume up
RegisterCommand('volumeup', function()
    local vol = exports['midnight-music']:getVolume()
    local new = math.min(1.0, vol + 0.1)
    exports['midnight-music']:setVolume(new)
    TriggerServerEvent('midnight-music:savePrefs', { volume = math.floor(new * 100) })
end, false)
RegisterKeyMapping('volumeup', 'Music Volume Up', 'keyboard', Config.Keys.volume_up)

-- Volume down
RegisterCommand('volumedown', function()
    local vol = exports['midnight-music']:getVolume()
    local new = math.max(0.0, vol - 0.1)
    exports['midnight-music']:setVolume(new)
    TriggerServerEvent('midnight-music:savePrefs', { volume = math.floor(new * 100) })
end, false)
RegisterKeyMapping('volumedown', 'Music Volume Down', 'keyboard', Config.Keys.volume_down)
