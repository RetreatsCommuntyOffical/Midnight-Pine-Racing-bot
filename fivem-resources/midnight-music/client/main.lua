-- client/main.lua
-- MIDNIGHT PINE RACING — Core Music Engine
-- State machine: free_roam | drifting | high_speed | race_event | drift_event | off

local currentStation  = Config.DefaultStation
local currentTrackIdx = 1
local musicEnabled    = true
local currentVolume   = Config.DefaultVolume
local targetVolume    = Config.DefaultVolume
local gameState       = 'free_roam'
local isInEvent       = false
local overrideStation = nil

local hudCombo       = 0
local hudMultiplier  = 1.0
local hudDriftStart  = nil

-- ── Track info update → HUD + server ─────────────────────────────────────────

local function onTrackChange(stationKey, track)
    local data = Config.Stations[stationKey]
    if not data then return end
    SendNUIMessage({
        type    = 'SET_TRACK',
        station = data.name,
        icon    = data.icon,
        title   = track.title,
        artist  = track.artist,
        enabled = musicEnabled,
    })
    TriggerServerEvent('midnight-music:trackChange', stationKey, track.title, track.artist)
end

-- ── Pick next track index ─────────────────────────────────────────────────────

local function pickNextIndex(stationKey)
    local station = Config.Stations[stationKey]
    if not station or #station.tracks == 0 then return 1 end
    if station.shuffle then
        return math.random(1, #station.tracks)
    else
        return (currentTrackIdx % #station.tracks) + 1
    end
end

local function getTrack(stationKey, idx)
    local station = Config.Stations[stationKey]
    if not station or #station.tracks == 0 then return nil end
    return station.tracks[idx] or station.tracks[1]
end

-- ── Volume fade ───────────────────────────────────────────────────────────────

local fadeActive = false

local function fadeVolume(target, onDone)
    targetVolume = math.max(0.0, math.min(1.0, target))
    if fadeActive then return end
    fadeActive = true
    CreateThread(function()
        while math.abs(currentVolume - targetVolume) > (Config.FadeStep * 0.5) do
            if currentVolume < targetVolume then
                currentVolume = math.min(currentVolume + Config.FadeStep, targetVolume)
            else
                currentVolume = math.max(currentVolume - Config.FadeStep, targetVolume)
            end
            SendNUIMessage({ type = 'SET_VOLUME', volume = currentVolume })
            Wait(Config.FadeTick)
        end
        currentVolume = targetVolume
        SendNUIMessage({ type = 'SET_VOLUME', volume = currentVolume })
        fadeActive = false
        if onDone then onDone() end
    end)
end

-- ── Play a track via NUI ──────────────────────────────────────────────────────

local function playTrack(track, vol)
    if not track or not track.url or track.url == '' then
        -- No URL yet — show track info without audio
        SendNUIMessage({
            type    = 'SET_TRACK',
            station = (Config.Stations[currentStation] or {}).name or '',
            icon    = (Config.Stations[currentStation] or {}).icon or '📻',
            title   = track and track.title  or 'No Track',
            artist  = track and track.artist or 'Add URL via /music-admin',
            enabled = musicEnabled,
        })
        return
    end
    SendNUIMessage({
        type   = 'PLAY',
        url    = track.url,
        volume = vol or currentVolume,
    })
end

-- ── Switch station with crossfade ─────────────────────────────────────────────

local switching = false

local function switchStation(newKey, announce)
    if switching or not Config.Stations[newKey] then return end
    switching = true

    fadeVolume(0.0, function()
        currentStation  = newKey
        currentTrackIdx = pickNextIndex(newKey)
        local track     = getTrack(newKey, currentTrackIdx)

        playTrack(track, 0.0)
        if track then onTrackChange(newKey, track) end
        fadeVolume(targetVolume > 0.02 and targetVolume or Config.DefaultVolume)

        if announce then
            local stData = Config.Stations[newKey]
            SendNUIMessage({
                type    = 'ANNOUNCE',
                message = 'Tuned to ' .. (stData and stData.name or newKey),
            })
        end
        switching = false
    end)
end

-- ── Resolve correct station from game state ────────────────────────────────────

local function resolveStation()
    if overrideStation then return overrideStation end
    return Config.StateStations[gameState] or Config.DefaultStation
end

-- ── Game-state transition ─────────────────────────────────────────────────────

local function onGameStateChange(newState)
    if newState == gameState then return end
    gameState = newState
    local desired = resolveStation()
    if desired ~= currentStation then
        switchStation(desired, false)
    end
end

-- ── Gameplay detection thread ─────────────────────────────────────────────────

CreateThread(function()
    while true do
        Wait(600)
        if not musicEnabled then goto skip end

        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)

        if veh == 0 then
            onGameStateChange('free_roam')
            goto skip
        end

        local speed    = GetEntitySpeed(veh) * 2.237  -- m/s → mph
        local vel      = GetEntityVelocity(veh)
        local heading  = GetEntityHeading(veh)
        local velMag   = math.sqrt(vel.x * vel.x + vel.y * vel.y)
        local driftAng = 0.0

        if velMag > 1.0 then
            local velAngle = math.deg(math.atan(vel.x, vel.y))
            driftAng = math.abs(((heading - velAngle + 180.0) % 360.0) - 180.0)
        end

        if not isInEvent then
            if speed >= Config.DriftSpeedMin and driftAng >= Config.DriftAngleMin then
                onGameStateChange('drifting')
            elseif speed >= Config.HighSpeedThresh then
                onGameStateChange('high_speed')
            else
                onGameStateChange('free_roam')
            end
        end

        ::skip::
    end
end)

-- ── High-frequency HUD telemetry thread ──────────────────────────────────────

CreateThread(function()
    while true do
        Wait(120)

        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)

        if veh == 0 then
            hudCombo = math.max(0, hudCombo - 220)
            hudMultiplier = math.max(1.0, hudMultiplier - 0.45)
            hudDriftStart = nil

            SendNUIMessage({
                type       = 'HUD_UPDATE',
                combo      = hudCombo,
                multiplier = hudMultiplier,
                timer      = 0,
                speed      = 0,
                rpm        = 0,
                rpmMax     = 9000,
                gear       = 'N',
                driftPoints = 0,
            })

            goto continue
        end

        local speed  = GetEntitySpeed(veh) * 2.237
        local rpmRaw = GetVehicleCurrentRpm(veh) or 0.0
        local rpmMax = 9000
        local rpm    = rpmRaw * rpmMax
        local gear   = GetVehicleCurrentGear(veh)

        local vel = GetEntityVelocity(veh)
        local heading = GetEntityHeading(veh)
        local velMag = math.sqrt(vel.x * vel.x + vel.y * vel.y)
        local driftAng = 0.0

        if velMag > 1.0 then
            local velAngle = math.deg(math.atan(vel.x, vel.y))
            driftAng = math.abs(((heading - velAngle + 180.0) % 360.0) - 180.0)
        end

        local isDrifting = speed >= Config.DriftSpeedMin and driftAng >= Config.DriftAngleMin
        if isDrifting then
            if not hudDriftStart then hudDriftStart = GetGameTimer() end

            local driftPower = math.max(0.0, (speed - Config.DriftSpeedMin) * 0.24 + (driftAng - Config.DriftAngleMin) * 1.15)
            hudCombo = hudCombo + math.floor(driftPower)

            local elapsed = (GetGameTimer() - hudDriftStart) / 1000.0
            hudMultiplier = math.min(45.0, 1.0 + (elapsed * 0.62))
            local driftPoints = math.floor(hudCombo * hudMultiplier * 0.08)

            SendNUIMessage({
                type        = 'HUD_UPDATE',
                combo       = hudCombo,
                multiplier  = hudMultiplier,
                timer       = elapsed,
                speed       = speed,
                rpm         = rpm,
                rpmMax      = rpmMax,
                gear        = gear,
                driftPoints = driftPoints,
            })
        else
            hudDriftStart = nil
            hudCombo = math.max(0, hudCombo - 140)
            hudMultiplier = math.max(1.0, hudMultiplier - 0.18)

            SendNUIMessage({
                type        = 'HUD_UPDATE',
                combo       = hudCombo,
                multiplier  = hudMultiplier,
                timer       = 0,
                speed       = speed,
                rpm         = rpm,
                rpmMax      = rpmMax,
                gear        = gear,
                driftPoints = 0,
            })
        end

        ::continue::
    end
end)

-- ── NUI callbacks ─────────────────────────────────────────────────────────────

RegisterNUICallback('trackEnded', function(_, cb)
    if musicEnabled then
        currentTrackIdx = pickNextIndex(currentStation)
        local track = getTrack(currentStation, currentTrackIdx)
        if track then
            playTrack(track, currentVolume)
            onTrackChange(currentStation, track)
        end
    end
    cb({})
end)

RegisterNUICallback('nuiReady', function(_, cb)
    TriggerServerEvent('midnight-music:requestPrefs')
    cb({})
end)

-- ── Server → Client events ────────────────────────────────────────────────────

RegisterNetEvent('midnight-music:syncPrefs', function(prefs)
    if prefs.stationSlug and Config.Stations[prefs.stationSlug] then
        currentStation = prefs.stationSlug
    end
    if type(prefs.volume) == 'number' then
        currentVolume = math.max(0.0, math.min(1.0, prefs.volume / 100.0))
        targetVolume  = currentVolume
    end
    musicEnabled = prefs.enabled ~= false

    SendNUIMessage({ type = 'SET_ENABLED', enabled = musicEnabled })

    if musicEnabled then
        currentTrackIdx = pickNextIndex(currentStation)
        local track = getTrack(currentStation, currentTrackIdx)
        playTrack(track, currentVolume)
        if track then onTrackChange(currentStation, track) end
    end
end)

RegisterNetEvent('midnight-music:setEventMusic', function(stationKey)
    isInEvent      = true
    overrideStation = stationKey
    switchStation(stationKey, false)
end)

RegisterNetEvent('midnight-music:clearEventMusic', function()
    isInEvent       = false
    overrideStation = nil
    switchStation(resolveStation(), false)
end)

RegisterNetEvent('midnight-music:forceStation', function(stationKey)
    switchStation(stationKey, true)
end)

RegisterNetEvent('midnight-music:hudUpdate', function(payload)
    if type(payload) ~= 'table' then return end
    payload.type = 'HUD_UPDATE'
    SendNUIMessage(payload)
end)

RegisterNetEvent('midnight-music:hudTap', function(payload)
    payload = type(payload) == 'table' and payload or {}
    payload.type = 'HUD_TAP'
    SendNUIMessage(payload)
end)

RegisterNetEvent('midnight-music:hudXpGain', function(payload)
    payload = type(payload) == 'table' and payload or {}
    payload.type = 'HUD_XP_GAIN'
    SendNUIMessage(payload)
end)

-- ── Sync player state to HUD on spawn ──────────────────────────────────────────

local function syncPlayerHud()
    local playerServerId = GetPlayerServerId(PlayerId())
    if playerServerId ~= 0 then
        TriggerServerEvent('midnight-music:syncHudState')
    end
end

AddEventHandler('playerSpawned', syncPlayerHud)
AddEventHandler('onClientResourceStart', function(resName)
    if resName == GetCurrentResourceName() then
        Wait(2000)
        syncPlayerHud()
    end
end)

-- ── Exports for other resources ──────────────────────────────────────────────

exports('setStation',  function(s)  switchStation(s, true) end)
exports('getStation',  function()   return currentStation  end)
exports('getVolume',   function()   return currentVolume   end)
exports('setVolume',   function(v)  fadeVolume(v)          end)
exports('isEnabled',   function()   return musicEnabled    end)

exports('toggleMusic', function()
    musicEnabled = not musicEnabled
    if musicEnabled then
        currentTrackIdx = pickNextIndex(currentStation)
        local track = getTrack(currentStation, currentTrackIdx)
        playTrack(track, currentVolume)
        if track then onTrackChange(currentStation, track) end
    else
        SendNUIMessage({ type = 'STOP' })
    end
    SendNUIMessage({ type = 'SET_ENABLED', enabled = musicEnabled })
    TriggerServerEvent('midnight-music:savePrefs', { enabled = musicEnabled })
end)

exports('skipTrack', function()
    currentTrackIdx = pickNextIndex(currentStation)
    local track = getTrack(currentStation, currentTrackIdx)
    if track then
        playTrack(track, currentVolume)
        onTrackChange(currentStation, track)
    end
end)
