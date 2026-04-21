@echo off
title Midnight Pine Racing - Launching...
cd /d "D:\midnight pine racing bot"

echo [MPR] Checking for updates...
git pull --ff-only 2>&1
if %errorlevel% neq 0 (
    echo [MPR] Could not pull updates (offline or merge conflict - launching with current version)
)

echo [MPR] Starting Midnight Pine Racing...
npx electron desktop-app/electron-main.js
