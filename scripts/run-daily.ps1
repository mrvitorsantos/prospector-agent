# Roda o pipeline completo (collect -> qualify -> buildQueue) para os
# segmento/cidade configurados abaixo. Pensado para ser chamado pelo
# Windows Task Scheduler todo dia às 6h — ver README.md, seção
# "Automação diária" para instruções de registro/remoção da tarefa.

$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$logDir = Join-Path $projectRoot 'logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $logDir "run-daily_$timestamp.log"

# Adicione ou remova combinações de segmento/cidade aqui.
$combos = @(
    @{ Segmento = 'barbearia'; Cidade = 'Arujá' },
    @{ Segmento = 'barbearia'; Cidade = 'Mogi das Cruzes' }
)

foreach ($combo in $combos) {
    $header = "=== $($combo.Segmento) / $($combo.Cidade) --- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
    Add-Content -Path $logFile -Value $header
    Write-Output $header

    & npm start -- "$($combo.Segmento)" "$($combo.Cidade)" 2>&1 |
        Tee-Object -FilePath $logFile -Append
}
