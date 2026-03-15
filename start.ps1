# Script de démarrage JitPlus
# Usage: .\start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   JitPlus Application Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Fonction pour vérifier si Docker est en cours d'exécution
function Test-DockerRunning {
    try {
        docker ps | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# Fonction pour vérifier si le conteneur PostgreSQL est en cours d'exécution
function Test-PostgreSQLRunning {
    $container = docker ps --filter "name=jit-db" --format "{{.Names}}"
    return $container -eq "jit-db"
}

Write-Host "[1/4] Verification de Docker..." -ForegroundColor Yellow
if (-not (Test-DockerRunning)) {
    Write-Host "ERREUR: Docker n'est pas en cours d'execution." -ForegroundColor Red
    Write-Host "Veuillez demarrer Docker Desktop et reessayer." -ForegroundColor Red
    exit 1
}
Write-Host "Docker est actif." -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] Verification de PostgreSQL..." -ForegroundColor Yellow
if (-not (Test-PostgreSQLRunning)) {
    Write-Host "Le conteneur PostgreSQL n'est pas actif. Demarrage..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 3
    
    if (Test-PostgreSQLRunning) {
        Write-Host "PostgreSQL demarre avec succes." -ForegroundColor Green
    } else {
        Write-Host "ERREUR: Impossible de demarrer PostgreSQL." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "PostgreSQL est actif (jit-db)." -ForegroundColor Green
}
Write-Host ""

Write-Host "[3/4] Demarrage du backend..." -ForegroundColor Yellow
Write-Host "Backend NestJS: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Pour arreter: Ctrl+C dans le terminal backend" -ForegroundColor Gray
Write-Host ""

# Démarrer le backend dans une nouvelle fenêtre PowerShell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\backend'; Write-Host 'Backend NestJS - Port 3000' -ForegroundColor Green; pnpm start:dev"

Write-Host "Attente du demarrage du backend (5 secondes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host ""

Write-Host "[4/4] Demarrage de l'application JitPlus Pro..." -ForegroundColor Yellow
Write-Host "Expo Metro: http://localhost:8081" -ForegroundColor Cyan
Write-Host "Pour tester:" -ForegroundColor Gray
Write-Host "  - Appuyez sur 'a' pour Android emulator" -ForegroundColor Gray
Write-Host "  - Appuyez sur 'i' pour iOS simulator" -ForegroundColor Gray
Write-Host "  - Scannez le QR code avec Expo Go" -ForegroundColor Gray
Write-Host ""

# Démarrer l'app mobile dans une nouvelle fenêtre PowerShell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\jitpluspro'; Write-Host 'Expo Metro Bundler' -ForegroundColor Green; pnpm start"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Application demarree avec succes!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Comptes de test:" -ForegroundColor Yellow
Write-Host "  Cafe:     cafe@example.com / password123" -ForegroundColor White
Write-Host "  Epicerie: epicerie@example.com / password123" -ForegroundColor White
Write-Host "  Admin:    admin@jitplus.com / admin123" -ForegroundColor White
Write-Host ""
Write-Host "Endpoints backend:" -ForegroundColor Yellow
Write-Host "  POST http://localhost:3000/auth/login" -ForegroundColor White
Write-Host "  POST http://localhost:3000/auth/register" -ForegroundColor White
Write-Host "  GET  http://localhost:3000/merchant/profile" -ForegroundColor White
Write-Host ""
Write-Host "Ecrans mobiles:" -ForegroundColor Yellow
Write-Host "  /login        - Connexion" -ForegroundColor White
Write-Host "  /profile      - Profil commerçant avec icones dynamiques" -ForegroundColor White
Write-Host "  /demo-icons   - Demo interactive des icones" -ForegroundColor White
Write-Host ""
Write-Host "Pour arreter tout:" -ForegroundColor Red
Write-Host "  1. Fermez les fenetres PowerShell du backend et jitpluspro" -ForegroundColor White
Write-Host "  2. Arretez PostgreSQL: docker-compose down" -ForegroundColor White
Write-Host ""
