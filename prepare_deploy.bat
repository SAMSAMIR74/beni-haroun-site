@echo off
echo ==========================================
echo   Barrage Beni Haroun - Auto Deploy Tool
echo ==========================================
echo.
echo Initializing Git repository...
git init

echo.
echo Adding files...
git add .

echo.
echo Creating commit...
git commit -m "Auto deploy - Site Update"

echo.
echo ------------------------------------------
echo IMPORTANT: To finish deployment:
echo 1. Create a repository on GitHub named 'beni-haroun-site'
echo 2. Run the following command (replace USERNAME):
echo    git remote add origin https://github.com/USERNAME/beni-haroun-site.git
echo 3. Run: git push -u origin main
echo ------------------------------------------
echo.
pause
