#!/bin/bash
# usage: render.sh "<query>" W H DPR outname
WD=/mnt/c/Users/ayoub/AppData/Local/Temp/storeshots
WW='C:\Users\ayoub\AppData\Local\Temp\storeshots'
mkdir -p $WD/out
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=$4 --window-size=$2,$3 --user-data-dir="$WW\\prof_$5" --virtual-time-budget=5000 --screenshot="$WW\\out\\$5.png" "file:///C:/Users/ayoub/AppData/Local/Temp/storeshots/index.html?$1" >/dev/null 2>&1
test -f $WD/out/$5.png && echo "ok $5" || echo "FAIL $5"
