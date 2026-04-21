module.exports = {
    apps: [
        {
            name:        'midnight-pine-bot',
            script:      'bot.js',
            cwd:         __dirname,
            instances:   1,
            exec_mode:   'fork',
            autorestart: true,
            watch:       false,
            max_memory_restart: '256M',
            env: {
                NODE_ENV: 'production',
            },
            error_file: 'logs/err.log',
            out_file:   'logs/out.log',
            log_file:   'logs/combined.log',
            time:       true,
        },
    ],
};
