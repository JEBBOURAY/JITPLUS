# Script pour tester en mode production-like
param(
    [ValidateSet("backend", "jitplus", "jitpluspro", "all")]
    [string]$App = "all",
    
    [ValidateSet("preview", "production")]
    [string]$Profile = "preview"
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

Write-Host "`n=== JitPlus Test Production-Like ===" -ForegroundColor Cyan

function Start-Backend {
    Write-Host "`n[Backend] Demarrage en mode production..." -ForegroundColor Yellow
    Set-Location $RootDir
    docker-compose -f docker-compose.prod.yml up --build -d
    Write-Host "[Backend] En cours sur http://localhost:3000" -ForegroundColor Green
}

function Test-MobileApp {
    param([string]$AppName)
    
    $AppDir = Join-Path $RootDir "apps\$AppName"
    Set-Location $AppDir
    
    Write-Host "`n[$AppName] Lancement en mode production-like..." -ForegroundColor Yellow
    Write-Host "  - __DEV__ = false" -ForegroundColor Gray
    Write-Host "  - Code minifie" -ForegroundColor Gray
    Write-Host "  - Profil: $Profile" -ForegroundColor Gray
    
    # Charger les variables d'environnement du profil
    $easConfig = Get-Content "eas.json" | ConvertFrom-Json
    $envVars = $easConfig.build.$Profile.env
    
    if ($envVars.EXPO_PUBLIC_API_URL) {
        $env:EXPO_PUBLIC_API_URL = $envVars.EXPO_PUBLIC_API_URL
        Write-Host "  - API URL: $($envVars.EXPO_PUBLIC_API_URL)" -ForegroundColor Gray
    }
    
    # Lancer en mode production-like
    npx expo start --no-dev --minify
}

function Build-MobileAPK {
    param([string]$AppName)
    
    $AppDir = Join-Path $RootDir "apps\$AppName"
    Set-Location $AppDir
    
    Write-Host "`n[$AppName] Build APK ($Profile)..." -ForegroundColor Yellow
    npx eas build --platform android --profile $Profile --local
}

# Execution
switch ($App) {
    "backend" {
        Start-Backend
    }
    "jitplus" {
        Test-MobileApp -AppName "jitplus"
    }
    "jitpluspro" {
        Test-MobileApp -AppName "jitpluspro"
    }
    "all" {
        Start-Backend
        Write-Host "`n[Info] Backend demarre. Pour tester une app mobile:" -ForegroundColor Cyan
        Write-Host "  .\test-prod.ps1 -App jitplus" -ForegroundColor White
        Write-Host "  .\test-prod.ps1 -App jitpluspro" -ForegroundColor White
        Write-Host "`nOu builder un APK:" -ForegroundColor Cyan
        Write-Host "  .\test-prod.ps1 -App jitplus -Profile preview" -ForegroundColor White
    }
}

Set-Location $RootDir
