' Silent launcher for Al2z Island
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
sh.CurrentDirectory = dir
sh.Run """" & exe & """ .", 0, False
