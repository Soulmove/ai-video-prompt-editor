param(
    [ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Start',
    [int]$JingxuPort = 4174,
    [string]$MuseInstallDir = 'E:\MuseCanvas',
    [string]$MuseDataDir = '',
    [switch]$NoBrowser,
    [switch]$WithoutMuse
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$PidFile = Join-Path $RepoRoot '.jingxu-muse-pids.json'
$Utf8NoBom = New-Object Text.UTF8Encoding($false)

# Bypass system/VPN proxies for local 127.0.0.1 health checks
try { [System.Net.WebRequest]::DefaultWebProxy = New-Object System.Net.WebProxy } catch {}

function Save-JsonFile([string]$Path, $Obj) {
    $text = ConvertTo-Json -InputObject $Obj -Depth 8
    [IO.File]::WriteAllText($Path, $text, $Utf8NoBom)
}

function Load-Records {
    if (!(Test-Path -LiteralPath $PidFile)) { return @() }
    try {
        $raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $PidFile
        if (-not $raw.Trim()) { return @() }
        $parsed = $raw | ConvertFrom-Json
        if ($parsed -is [array]) { return @($parsed) }
        if ($null -ne $parsed) { return @($parsed) }
    } catch {}
    return @()
}

function Find-OwnedProc($Record) {
    if (-not $Record -or -not $Record.pid) { return $null }
    $proc = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
    if (-not $proc) { return $null }
    try {
        $ticks = $proc.StartTime.ToUniversalTime().Ticks.ToString()
        if ($Record.startedTicks -and $ticks -ne [string]$Record.startedTicks) { return $null }
        if ($Record.executable -and $proc.Path -and $proc.Path -ne [string]$Record.executable) { return $null }
    } catch {
        return $null
    }
    return $proc
}

function Get-PortOwners([int]$Port) {
    $conns = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if (-not $conns.Count) { return @() }
    return @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-HttpReady([string]$Url) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400)
    } catch {
        return $false
    }
}

function Resolve-NodeExe([string]$MuseRoot) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $miniforgeNode = 'E:\pinokio\bin\miniforge\node.exe'
    if (Test-Path -LiteralPath $miniforgeNode) { return $miniforgeNode }
    if ($MuseRoot) {
        $bundled = Join-Path $MuseRoot 'node\node.exe'
        if (Test-Path -LiteralPath $bundled) { return $bundled }
    }
    throw 'Node.js executable not found in PATH or E:\MuseCanvas\node\node.exe.'
}

function Resolve-MuseLayout([string]$InstallDir, [string]$ExplicitDataDir) {
    $instPath = Join-Path $InstallDir 'instance.json'
    $dataDir = $ExplicitDataDir
    if (-not $dataDir -and (Test-Path -LiteralPath $instPath)) {
        try {
            $inst = Get-Content -Raw -Encoding UTF8 -LiteralPath $instPath | ConvertFrom-Json
            if ($inst.dataDirectory) { $dataDir = [string]$inst.dataDirectory }
        } catch {}
    }
    if (-not $dataDir) { $dataDir = 'E:\MuseCanvasData' }
    $cfgPath = Join-Path $dataDir 'install.json'
    if (!(Test-Path -LiteralPath $InstallDir) -or !(Test-Path -LiteralPath $cfgPath)) {
        return @{ available = $false; installDir = $InstallDir; dataDir = $dataDir }
    }
    $cfg = Get-Content -Raw -Encoding UTF8 -LiteralPath $cfgPath | ConvertFrom-Json
    return @{
        available   = $true
        installDir  = [IO.Path]::GetFullPath($InstallDir)
        dataDir     = [IO.Path]::GetFullPath($dataDir)
        configPath  = $cfgPath
        config      = $cfg
        poolExe     = (Join-Path $InstallDir 'pool\MusePool.exe')
        protocolExe = (Join-Path $InstallDir 'protocol\MuseProtocol.exe')
        poolPort    = if ($cfg.ports.pool) { [int]$cfg.ports.pool } else { 18610 }
        protocolPort= if ($cfg.ports.protocol) { [int]$cfg.ports.protocol } else { 18611 }
    }
}

$layout = Resolve-MuseLayout -InstallDir $MuseInstallDir -ExplicitDataDir $MuseDataDir

if ($Action -eq 'Stop') {
    $records = Load-Records
    foreach ($rec in $records) {
        $proc = Find-OwnedProc $rec
        if ($proc) {
            & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
            Write-Output ("[Stopped] {0} (PID {1})" -f $rec.name, $proc.Id)
        }
    }
    Save-JsonFile -Path $PidFile -Obj @()
    Write-Output 'Done. Note: Muse user data and unrelated programs were left untouched.'
    exit 0
}

if ($Action -eq 'Status') {
    $records = Load-Records
    $rows = @()
    foreach ($rec in $records) {
        $proc = Find-OwnedProc $rec
        $rows += [pscustomobject]@{
            Component = $rec.name
            PID       = $rec.pid
            Running   = [bool]$proc
            Port      = $rec.port
        }
    }
    if ($rows.Count) {
        $rows | Format-Table -AutoSize
    } else {
        Write-Output 'No tracked Jingxu/Muse processes in .jingxu-muse-pids.json.'
    }
    Write-Output ("Jingxu 2.0 (127.0.0.1:{0}/api/health): {1}" -f $JingxuPort, (Test-HttpReady ("http://127.0.0.1:{0}/api/health" -f $JingxuPort)))
    if ($layout.available) {
        Write-Output ("MusePool (127.0.0.1:{0}/healthz): {1}" -f $layout.poolPort, (Test-HttpReady ("http://127.0.0.1:{0}/healthz" -f $layout.poolPort)))
        Write-Output ("MuseProtocol (127.0.0.1:{0}/health): {1}" -f $layout.protocolPort, (Test-HttpReady ("http://127.0.0.1:{0}/health" -f $layout.protocolPort)))
    }
    exit 0
}

# Action = Start
$newRecords = @()
foreach ($old in (Load-Records)) {
    $alive = Find-OwnedProc $old
    if ($alive) { $newRecords += $old }
}

$logDir = if ($layout.available) { Join-Path $layout.dataDir 'logs' } else { $RepoRoot }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Start-TrackedProcess([string]$Name, [int]$Port, [string]$Exe, [string]$ProcArgs, [string]$WorkDir) {
    $splat = @{
        FilePath               = $Exe
        WorkingDirectory       = $WorkDir
        WindowStyle            = 'Hidden'
        PassThru               = $true
        RedirectStandardOutput = (Join-Path $logDir ("jingxu-" + $Name + ".out.log"))
        RedirectStandardError  = (Join-Path $logDir ("jingxu-" + $Name + ".err.log"))
    }
    if ($ProcArgs) { $splat.ArgumentList = $ProcArgs }
    $proc = Start-Process @splat
    Start-Sleep -Milliseconds 150
    if ($proc.HasExited) {
        throw ("Failed to keep {0} running. Check log: {1}" -f $Name, $splat.RedirectStandardError)
    }
    return [pscustomobject]@{
        name         = $Name
        port         = $Port
        pid          = $proc.Id
        executable   = $proc.Path
        startedTicks = $proc.StartTime.ToUniversalTime().Ticks.ToString()
    }
}

# 1. Start MusePool (18610) and MuseProtocol (18611) ONLY (skipping port 3000 so nothing collides)
if (-not $WithoutMuse -and $layout.available -and (Test-Path -LiteralPath $layout.poolExe) -and (Test-Path -LiteralPath $layout.protocolExe)) {
    $cfg = $layout.config
    $poolHome = Join-Path $layout.dataDir 'pool'
    $protoHome = Join-Path $layout.dataDir 'protocol'
    New-Item -ItemType Directory -Force -Path $poolHome, $protoHome | Out-Null

    $installerCommon = Join-Path $layout.installDir 'scripts\Installer-Common.ps1'
    $env:CANVAS_APP_DIR = $layout.installDir
    $env:CANVAS_STATE_DIR = $layout.dataDir
    $env:CANVAS_INSTALL_CONFIG = $layout.configPath
    $env:CANVAS_BROWSER_CONFIG = Join-Path $layout.dataDir 'browser.json'
    $env:CANVAS_BROWSER_LOOKUP_EXE = $layout.poolExe
    if (Test-Path -LiteralPath $installerCommon) {
        try {
            . $installerCommon
            $null = Invoke-BrowserLookup $layout.installDir $env:CANVAS_BROWSER_CONFIG -Save
        } catch {}
    }
    if ($cfg.serviceKey) { $env:CANVAS_SERVICE_KEY = [string]$cfg.serviceKey }
    $env:MUSE2API_KEY = [string]$cfg.poolKey
    $env:MUSE2API_HOME = $poolHome
    $env:MUSE2API_PROFILE_ROOT = Join-Path $layout.dataDir 'browser-profiles\pool'
    $env:MUSE2API_HOME_DIR = $layout.dataDir
    if ($cfg.ports.cdp) { $env:MUSE2API_CDP_PORT = [string]$cfg.ports.cdp }
    $env:MUSE2API_PUBLIC_BASE = ('http://127.0.0.1:' + $layout.poolPort)
    $env:MC_DOUBAO_PROFILE = Join-Path $layout.dataDir 'provider-profiles\doubao'
    if ($cfg.ports.doubaoCdp) { $env:MC_DOUBAO_CDP_PORT = [string]$cfg.ports.doubaoCdp }
    $env:MC_POOL_ACCOUNTS = Join-Path $poolHome 'data\accounts.json'
    $env:MC_PROTOCOL_DATA = $protoHome
    $env:MC_PROTOCOL_PORT = [string]$layout.protocolPort
    $env:MUSECANVAS_DATA_DIR = $layout.dataDir

    if (Test-HttpReady ("http://127.0.0.1:{0}/healthz" -f $layout.poolPort)) {
        Write-Output ("[OK] MusePool already listening on 127.0.0.1:{0}" -f $layout.poolPort)
    } elseif ((Get-PortOwners $layout.poolPort).Count -gt 0) {
        Write-Warning ("Port {0} is already occupied by another process; skipping MusePool start." -f $layout.poolPort)
    } else {
        $poolArgs = ('--host 127.0.0.1 --port ' + $layout.poolPort + ' --state-dir "' + $poolHome + '"')
        $rec = Start-TrackedProcess -Name 'muse-pool' -Port $layout.poolPort -Exe $layout.poolExe -ProcArgs $poolArgs -WorkDir $layout.installDir
        $newRecords = @($newRecords | Where-Object { $_.name -ne 'muse-pool' }) + $rec
        Save-JsonFile -Path $PidFile -Obj $newRecords
    }

    if (Test-HttpReady ("http://127.0.0.1:{0}/health" -f $layout.protocolPort)) {
        Write-Output ("[OK] MuseProtocol already listening on 127.0.0.1:{0}" -f $layout.protocolPort)
    } elseif ((Get-PortOwners $layout.protocolPort).Count -gt 0) {
        Write-Warning ("Port {0} is already occupied by another process; skipping MuseProtocol start." -f $layout.protocolPort)
    } else {
        $rec = Start-TrackedProcess -Name 'muse-protocol' -Port $layout.protocolPort -Exe $layout.protocolExe -ProcArgs '' -WorkDir $layout.installDir
        $newRecords = @($newRecords | Where-Object { $_.name -ne 'muse-protocol' }) + $rec
        Save-JsonFile -Path $PidFile -Obj $newRecords
    }

    foreach ($ep in @(
        @{ name = 'MusePool'; url = ("http://127.0.0.1:{0}/healthz" -f $layout.poolPort) },
        @{ name = 'MuseProtocol'; url = ("http://127.0.0.1:{0}/health" -f $layout.protocolPort) }
    )) {
        $ok = $false
        for ($i = 0; $i -lt 40; $i++) {
            if (Test-HttpReady $ep.url) { $ok = $true; break }
            Start-Sleep -Milliseconds 350
        }
        if ($ok) { Write-Output ("[Ready] {0}: {1}" -f $ep.name, $ep.url) }
        else { Write-Warning ("Timed out waiting for {0} at {1}" -f $ep.name, $ep.url) }
    }
}

# 2. Start Jingxu 2.0 server.mjs on JingxuPort (default 4174)
if (Test-HttpReady ("http://127.0.0.1:{0}/api/health" -f $JingxuPort)) {
    Write-Output ("[OK] Jingxu 2.0 already running at http://127.0.0.1:{0}/" -f $JingxuPort)
} elseif ((Get-PortOwners $JingxuPort).Count -gt 0) {
    throw ("Port {0} is already in use by another process. Close it or pass -JingxuPort <otherPort>." -f $JingxuPort)
} else {
    $nodeExe = Resolve-NodeExe $layout.installDir
    $env:PORT = [string]$JingxuPort
    $rec = Start-TrackedProcess -Name 'jingxu-server' -Port $JingxuPort -Exe $nodeExe -ProcArgs 'server.mjs' -WorkDir $RepoRoot
    $newRecords = @($newRecords | Where-Object { $_.name -ne 'jingxu-server' }) + $rec
    Save-JsonFile -Path $PidFile -Obj $newRecords

    $serverReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-HttpReady ("http://127.0.0.1:{0}/api/health" -f $JingxuPort)) { $serverReady = $true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $serverReady) {
        throw ("Jingxu server did not respond on http://127.0.0.1:{0}/api/health" -f $JingxuPort)
    }
    Write-Output ("[Ready] Jingxu 2.0 Web UI: http://127.0.0.1:{0}/" -f $JingxuPort)
}

if ($layout.available) {
    Write-Output ("Muse Pool Admin (Login): http://127.0.0.1:{0}/admin" -f $layout.poolPort)
}

if (-not $NoBrowser) {
    Start-Process ("http://127.0.0.1:{0}/" -f $JingxuPort)
}
