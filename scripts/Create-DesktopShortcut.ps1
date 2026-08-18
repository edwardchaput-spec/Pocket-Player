[CmdletBinding()]
param(
    [string]$ExecutablePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$candidates = @()
if ($ExecutablePath) {
    $candidates += $ExecutablePath
}
$candidates += @(
    (Join-Path $repositoryRoot "src-tauri\target\release\navidrome-desktop.exe"),
    (Join-Path $env:LOCALAPPDATA "Navidrome Desktop\navidrome-desktop.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Navidrome Desktop\navidrome-desktop.exe")
)

$target = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $target) {
    throw "Pocket Player's production executable was not found. Run 'npm.cmd run tauri build' first."
}

$target = (Resolve-Path -LiteralPath $target).Path
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
if (-not $desktop) {
    throw "Windows did not return a Desktop folder for the current user."
}

$shortcutPath = Join-Path $desktop "Pocket Player.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = Split-Path -Parent $target
$shortcut.IconLocation = "$target,0"
$shortcut.Description = "Open Pocket Player"
$shortcut.Save()

Write-Output "Created $shortcutPath"
Write-Output "Target: $target"
