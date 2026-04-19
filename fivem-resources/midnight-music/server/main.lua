-- server/main.lua
-- MIDNIGHT PINE RACING — Music Server
-- Handles: player preference caching, Discord webhook bridge

local playerPrefs = {}  -- [source] = { stationSlug, volume, enabled }

-- ── Config (read from server.cfg convars) ─────────────────────────────────────

local function getWebhookUrl()    return GetConvar('midnight_music_webhook_url', '')    end
local function getWebhookSecret() return GetConvar('midnight_music_webhook_secret', '') end

-- ── HMAC-SHA256 via built-in hashing (FiveM provides GetHashKey but not HMAC)  ──
-- We use a simple bearer token in the header matching the integration server.
local function buildHeaders()
    local secret = getWebhookSecret()
    if secret == '' then return { ['Content-Type'] = 'application/json' } end
    return {
        ['Content-Type']          = 'application/json',
        ['x-midnight-signature']  = 'token ' .. secret,  -- validated by bot as simple bearer
    }
end

local function postToDiscord(eventType, discordId, payload)
    if not Config.WebhookEnabled then return end
    local url = getWebhookUrl()
    if url == '' then return end

    local body = json.encode({
        eventId   = eventType .. '_' .. tostring(os.time()) .. '_' .. tostring(discordId or 'srv'),
        eventType = eventType,
        discordId = tostring(discordId or '0'),
        payload   = payload or {},
    })

    PerformHttpRequest(url, function(status, _, _)
        if status ~= 200 and status ~= 201 and status ~= 0 then
            print('[midnight-music] Discord bridge HTTP status: ' .. tostring(status))
        end
    end, 'POST', body, buildHeaders())
end

-- ── Identifier helpers ────────────────────────────────────────────────────────

local function getDiscordId(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if string.find(id, 'discord:') then
            return string.sub(id, 9)
        end
    end
    return nil
end

-- ── Net events ────────────────────────────────────────────────────────────────

RegisterNetEvent('midnight-music:requestPrefs', function()
    local src = source
    local prefs = playerPrefs[src] or {
        stationSlug = Config.DefaultStation,
        volume      = math.floor(Config.DefaultVolume * 100),
        enabled     = true,
    }
    TriggerClientEvent('midnight-music:syncPrefs', src, prefs)
end)

RegisterNetEvent('midnight-music:savePrefs', function(updates)
    local src = source
    if not playerPrefs[src] then
        playerPrefs[src] = {
            stationSlug = Config.DefaultStation,
            volume      = math.floor(Config.DefaultVolume * 100),
            enabled     = true,
        }
    end
    for k, v in pairs(updates) do
        playerPrefs[src][k] = v
    end
    local discordId = getDiscordId(src)
    postToDiscord('player_music_prefs', discordId, {
        prefs   = playerPrefs[src],
        fivemId = tostring(src),
    })
end)

RegisterNetEvent('midnight-music:trackChange', function(stationKey, title, artist)
    local src       = source
    local discordId = getDiscordId(src)
    postToDiscord('music_track_change', discordId, {
        station = stationKey,
        title   = title,
        artist  = artist,
    })
end)

RegisterNetEvent('midnight-music:syncHudState', function()
    local src       = source
    local discordId = getDiscordId(src)
    if not discordId then return end

    local url = getWebhookUrl()
    if url == '' then return end

    local hudStateUrl = url:gsub('/ingest/activity', '/hud/state') .. '?discordId=' .. discordId
    PerformHttpRequest(hudStateUrl, function(status, response, _)
        if status == 200 then
            local ok, data = pcall(function() return json.decode(response) end)
            if ok and data then
                TriggerClientEvent('midnight-music:hudUpdate', src, {
                    rank = data.rank or 'CERTIFIED',
                    isPro = data.isPro or false,
                    xpPercent = data.xpPercent or 0,
                    tapsUsed = data.tapsUsed or 0,
                    tapsMax = data.tapsMax or 3,
                })
            end
        end
    end, 'GET')
end)

AddEventHandler('playerDropped', function()
    playerPrefs[source] = nil
end)

-- ── Staff server commands ─────────────────────────────────────────────────────

-- /setstation <playerId> <stationSlug>
RegisterCommand('setstation', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(tostring(src), 'midnight.staff') then return end
    local target  = tonumber(args[1])
    local station = args[2]
    if target and station then
        TriggerClientEvent('midnight-music:forceStation', target, station)
        print(string.format('[midnight-music] Staff forced player %d to station: %s', target, station))
    end
end, true)

-- /seteventmusic <stationSlug>   — broadcast event music to all players
RegisterCommand('seteventmusic', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(tostring(src), 'midnight.staff') then return end
    local station = args[1] or 'rush-fm'
    TriggerClientEvent('midnight-music:setEventMusic', -1, station)
    postToDiscord('event_music_start', nil, { station = station })
    print('[midnight-music] Event music broadcast to all: ' .. station)
end, true)

-- /cleareventmusic
RegisterCommand('cleareventmusic', function(src, _)
    if src ~= 0 and not IsPlayerAceAllowed(tostring(src), 'midnight.staff') then return end
    TriggerClientEvent('midnight-music:clearEventMusic', -1)
    print('[midnight-music] Event music cleared for all players')
end, true)
