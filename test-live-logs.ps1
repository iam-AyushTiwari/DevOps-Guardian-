param([string]$ProjectId)

$ApiUrl = "http://localhost:3001"

if (-not $ProjectId) {
    Write-Host "Please provide a Project ID." -ForegroundColor Red
    exit
}

Write-Host "--- Simulating Live Production Logs for Project $ProjectId ---" -ForegroundColor Cyan

# 1. Send Normal Log
$InfoPayload = @{
    projectId = $ProjectId
    source = "production-app"
    message = "[INFO] User login successful. Session started."
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

Write-Host "Sending INFO log..." -ForegroundColor Green
Invoke-RestMethod -Uri "$ApiUrl/api/v1/logs/$ProjectId" -Method Post -Body $InfoPayload -Headers @{ "Content-Type" = "application/json" }
Start-Sleep -Seconds 1

# 2. Send Warning
$WarnPayload = @{
    projectId = $ProjectId
    source = "production-app"
    message = "[WARN] Response time high (500ms) for /api/dashboard"
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

Write-Host "Sending WARN log..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "$ApiUrl/api/v1/logs/$ProjectId" -Method Post -Body $WarnPayload -Headers @{ "Content-Type" = "application/json" }
Start-Sleep -Seconds 2

# 3. Send CRITICAL Error (Triggers Incident)
$ErrorPayload = @{
    projectId = $ProjectId
    source = "production-app"
    message = "[FATAL] Database connection lost! ECONNREFUSED 10.0.0.5:5432"
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

Write-Host "Sending CRITICAL log (Should trigger incident)..." -ForegroundColor Red
Invoke-RestMethod -Uri "$ApiUrl/api/v1/logs/$ProjectId" -Method Post -Body $ErrorPayload -Headers @{ "Content-Type" = "application/json" }

Write-Host "`nDone! Check the 'Live Logs' tab." -ForegroundColor Magenta
