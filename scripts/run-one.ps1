# Roda o pipeline completo (collect -> qualify -> buildQueue) para UM
# segmento/cidade, recebido por parâmetro. Pensado pra ser chamado pelo
# Windows Task Scheduler várias vezes ao dia, uma cidade por vez — ver
# README.md, seção "Automação diária".
#
# Rodar uma cidade pequena por vez (em vez de todas de uma tacada, como o
# script antigo scripts/run-daily.ps1 fazia) espalha o consumo de quota da
# Gemini API ao longo do dia em vez de concentrar tudo num único horário.

param(
    [Parameter(Mandatory = $true)][string]$Segmento,
    [Parameter(Mandatory = $true)][string]$Cidade
)

$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$logDir = Join-Path $projectRoot 'logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$cidadeSlug = ($Cidade -replace '[^a-zA-Z0-9]', '_').ToLower()
$logFile = Join-Path $logDir "run_${cidadeSlug}_$timestamp.log"

# Overpass já tenta de novo sozinho em erros transitórios (ver
# src/sources/overpass.js) — aqui é só um retry a mais no nível do processo
# inteiro, pra cobrir falhas fora do escopo do Overpass (ex: rede caiu
# durante o qualify/buildQueue).
$MAX_TENTATIVAS = 2
$ESPERA_ENTRE_TENTATIVAS_SEGUNDOS = 30

# Toda escrita no log passa por aqui, sempre com -Encoding utf8, pra evitar
# misturar encodings no mesmo arquivo.
function Escrever-Log {
    param([string]$Texto)
    Write-Output $Texto
    Add-Content -Path $logFile -Value $Texto -Encoding utf8
}

$tentativa = 1
$sucesso = $false

while (-not $sucesso -and $tentativa -le $MAX_TENTATIVAS) {
    $header = "=== $Segmento / $Cidade --- tentativa $tentativa/$MAX_TENTATIVAS --- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
    Escrever-Log $header

    $saida = & npm start -- "$Segmento" "$Cidade" 2>&1
    $saida | ForEach-Object { Escrever-Log $_.ToString() }

    if ($LASTEXITCODE -eq 0) {
        $sucesso = $true
    } elseif ($tentativa -lt $MAX_TENTATIVAS) {
        Escrever-Log "Falhou (exit $LASTEXITCODE) — tentando de novo em $ESPERA_ENTRE_TENTATIVAS_SEGUNDOS segundos..."
        Start-Sleep -Seconds $ESPERA_ENTRE_TENTATIVAS_SEGUNDOS
    } else {
        Escrever-Log "Falhou (exit $LASTEXITCODE) após $MAX_TENTATIVAS tentativa(s)."
    }

    $tentativa++
}
