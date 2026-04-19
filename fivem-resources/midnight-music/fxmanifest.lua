fx_version 'cerulean'
game 'gta5'

name        'midnight-music'
description 'MIDNIGHT PINE RACING — Radio & Dynamic Music System'
version     '1.0.0'
author      'Midnight Pine Racing'

lua54 'yes'

client_scripts {
    'config.lua',
    'client/main.lua',
    'client/hud.lua',
    'client/controls.lua',
}

server_scripts {
    'config.lua',
    'server/main.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
}
