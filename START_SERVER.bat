@echo off
title UPI Offline Mesh Server
echo ===================================================
echo   Starting UPI Offline Mesh Backend (Port 8080)
echo ===================================================
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.21.9-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%~dp0UPI_Without_Internet"
call mvnw.cmd spring-boot:run
pause
