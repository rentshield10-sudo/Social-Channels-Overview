' Runs one dashboard refresh with no visible window (window style 0). Called hourly by Task Scheduler.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\mocha\Documents\CODES\social-mission-control"
sh.Run """C:\Program Files\nodejs\node.exe"" scripts\update.mjs", 0, True
