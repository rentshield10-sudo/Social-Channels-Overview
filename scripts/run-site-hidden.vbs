' Starts the Mission Control site (http://localhost:5180) with no visible window. Run at logon by Task Scheduler.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\mocha\Documents\CODES\social-mission-control"
sh.Run """C:\Program Files\nodejs\node.exe"" node_modules\vite\bin\vite.js --port 5180 --strictPort", 0, False
