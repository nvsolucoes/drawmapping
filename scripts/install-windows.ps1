$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$version = '24.22.1'
$runtime = Join-Path $root '.runtime'
$nodeDir = Join-Path $runtime "node-v$version-win-x64"
$nodeExe = Join-Path $nodeDir 'node.exe'
$npm = Join-Path $nodeDir 'npm.cmd'
try {
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'Esta instalacao requer Windows de 64 bits.' }
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  if (-not ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npm))) {
    if (Test-Path -LiteralPath $nodeDir) { throw 'A pasta local do Node esta incompleta. Remova apenas a pasta .runtime e tente novamente.' }
    $base = "https://nodejs.org/dist/v$version"
    $archive = "node-v$version-win-x64.zip"
    $temp = Join-Path $runtime ("download-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
      Write-Host 'Baixando o Node.js local...'
      $zip = Join-Path $temp $archive
      $hashFile = Join-Path $temp 'SHASUMS256.txt'
      Invoke-WebRequest -Uri "$base/$archive" -OutFile $zip -UseBasicParsing -TimeoutSec 180
      Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -OutFile $hashFile -UseBasicParsing -TimeoutSec 60
      $line = Get-Content -LiteralPath $hashFile | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($archive) + '$') } | Select-Object -First 1
      if (-not $line) { throw 'Nao foi possivel verificar o arquivo do Node.js.' }
      $expected = ($line -split '\s+')[0]
      if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $expected) { throw 'Falha na verificacao do arquivo do Node.js.' }
      Expand-Archive -LiteralPath $zip -DestinationPath $temp
      Move-Item -LiteralPath (Join-Path $temp "node-v$version-win-x64") -Destination $nodeDir
    } finally {
      if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
    }
  }
  $env:PATH = "$nodeDir;$env:PATH"
  Push-Location $root
  try {
    Write-Host 'Instalando e preparando o DrawMapping...'
    & $npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependencias.' }
    Write-Host 'Criando atalho na area de trabalho...'
    & $nodeExe (Join-Path $root 'scripts/cli.mjs') atalho
    if ($LASTEXITCODE -ne 0) { throw 'O programa foi instalado, mas o atalho nao foi criado. Abra Install.bat para tentar novamente.' }
  } finally { Pop-Location }
} catch {
  Write-Host "Erro: $($_.Exception.Message)"
  exit 1
}
