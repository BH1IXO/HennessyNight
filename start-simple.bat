@echo off
echo Starting HennessyNight...
echo.

echo Step 1: Starting PostgreSQL...
docker-compose up -d postgres
if %errorlevel% neq 0 (
    echo ERROR: Failed to start PostgreSQL
    pause
    exit /b 1
)

echo Step 2: Waiting for database...
timeout /t 15 /nobreak >nul

echo Step 3: Generating Prisma Client...
call npm run prisma:generate
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate Prisma Client
    pause
    exit /b 1
)

echo Step 4: Running database migrations...
call npm run prisma:migrate
if %errorlevel% neq 0 (
    echo WARNING: Migration might have failed, continuing...
)

echo Step 5: Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Success! Starting server...
echo Open browser: http://localhost:3000
echo ========================================
echo.

call npm run dev
