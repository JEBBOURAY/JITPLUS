# Script de test de connexion PostgreSQL
# Executer depuis la racine du projet

Write-Host "Test de connexion PostgreSQL JitPlus" -ForegroundColor Cyan
Write-Host ""

# Verifier si Docker est lance
Write-Host "1. Verification de Docker..." -ForegroundColor Yellow
$null = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR: Docker n'est pas lance!" -ForegroundColor Red
    Write-Host "   Lancez Docker Desktop et reessayez." -ForegroundColor Yellow
    exit 1
}
Write-Host "OK: Docker est actif" -ForegroundColor Green

# Verifier si le container PostgreSQL existe
Write-Host ""
Write-Host "2. Verification du container PostgreSQL..." -ForegroundColor Yellow
$container = docker ps --filter "name=jit-db" --format "{{.Names}}" 2>$null

if (-not $container) {
    Write-Host "ATTENTION: Container PostgreSQL non trouve. Demarrage..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 5
    $container = docker ps --filter "name=jit-db" --format "{{.Names}}" 2>$null
}

if ($container) {
    Write-Host "OK: Container PostgreSQL actif: $container" -ForegroundColor Green
} else {
    Write-Host "ERREUR: Impossible de demarrer PostgreSQL" -ForegroundColor Red
    exit 1
}

# Tester la connexion
Write-Host ""
Write-Host "3. Test de connexion a la base de donnees..." -ForegroundColor Yellow
$null = docker exec jit-db psql -U admin -d jit_db -c "SELECT version();" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: Connexion reussie a PostgreSQL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Informations de connexion (dev local via docker-compose.yml):" -ForegroundColor Cyan
    Write-Host "   Host: localhost" -ForegroundColor White
    Write-Host "   Port: 5432" -ForegroundColor White
    Write-Host "   User: admin" -ForegroundColor White
    Write-Host "   Database: jit_db" -ForegroundColor White
    Write-Host ""
    
    # Liste des tables
    Write-Host "4. Verification des tables..." -ForegroundColor Yellow
    $tables = docker exec jit-db psql -U admin -d jit_db -c "\dt" 2>$null
    
    if ($tables -match "merchants") {
        Write-Host "OK: Tables Prisma detectees (migrations appliquees)" -ForegroundColor Green
    } else {
        Write-Host "ATTENTION: Aucune table trouvee" -ForegroundColor Yellow
        Write-Host "   Executez les migrations:" -ForegroundColor White
        Write-Host "   cd apps/backend" -ForegroundColor Gray
        Write-Host "   pnpm generate" -ForegroundColor Gray
        Write-Host "   pnpm migrate" -ForegroundColor Gray
    }
} else {
    Write-Host "ERREUR: Echec de la connexion" -ForegroundColor Red
    Write-Host "   Verifiez les logs: docker-compose logs -f" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Cyan
Write-Host "   docker-compose logs -f db    # Voir les logs PostgreSQL" -ForegroundColor Gray
Write-Host "   docker exec -it jit-db psql -U admin -d jit_db   # Se connecter a psql" -ForegroundColor Gray
Write-Host "   cd apps/backend && pnpm studio    # Ouvrir Prisma Studio" -ForegroundColor Gray
Write-Host ""
