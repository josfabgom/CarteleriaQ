@echo off
schtasks /End /TN "CarteleriaQ Itegra Worker" >nul 2>&1
schtasks /Delete /TN "CarteleriaQ Itegra Worker" /F
