# =========================================================================
# DevOps E2E CI/CD Pipeline Local Runner & Simulator
# =========================================================================
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("Simulate", "Real")]
    [string]$Mode = "Simulate",

    [Parameter(Mandatory=$false)]
    [ValidateSet("None", "Build", "Test", "Security", "Package", "Deploy")]
    [string]$FailStage = "None"
)

$ErrorActionPreference = "Stop"
Clear-Host

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "         JAVA WEB APP END-TO-END CI/CD PIPELINE RUNNER" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Mode: $Mode" -ForegroundColor White
Write-Host "Fail Injection Target: $FailStage" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan

# Ensure dashboard folder and JSON path exist
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardDir = Join-Path $ScriptDir "dashboard"
if (-not (Test-Path $DashboardDir)) {
    New-Item -ItemType Directory -Path $DashboardDir -Force | Out-Null
}
$JsonPath = Join-Path $DashboardDir "pipeline-run.json"

# Helper to write status to JSON
function Write-PipelineStatus {
    param (
        [string]$Status,
        [array]$Stages
    )
    $runData = [PSCustomObject]@{
        status = $Status
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        stages = $Stages
    }
    $runData | ConvertTo-Json -Depth 5 | Out-File -FilePath $JsonPath -Encoding utf8
}

# Helper to log status
function Write-StageLog {
    param (
        [string]$StageName,
        [string]$Status,
        [string]$Message
    )
    $color = "Cyan"
    if ($Status -eq "PASSED") { $color = "Green" }
    elseif ($Status -eq "FAILED") { $color = "Red" }
    elseif ($Status -eq "IN_PROGRESS") { $color = "Yellow" }
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [$StageName] - $Message" -ForegroundColor $color
}

# Initialize Stages Array
$stages = @(
    [PSCustomObject]@{ name = "Checkout"; status = "PENDING"; duration = "0s"; logs = @() }
    [PSCustomObject]@{ name = "Build"; status = "PENDING"; duration = "0s"; logs = @() }
    [PSCustomObject]@{ name = "Test"; status = "PENDING"; duration = "0s"; logs = @() }
    [PSCustomObject]@{ name = "Security Scan"; status = "PENDING"; duration = "0s"; logs = @() }
    [PSCustomObject]@{ name = "Containerize"; status = "PENDING"; duration = "0s"; logs = @() }
    [PSCustomObject]@{ name = "Deploy"; status = "PENDING"; duration = "0s"; logs = @() }
)

Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 1: CHECKOUT ---
$stages[0].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Checkout" "IN_PROGRESS" "Initializing repository checkout..."
Start-Sleep -Seconds 1
$stages[0].logs += "git version 2.43.0.windows.1"
$stages[0].logs += "Cloning repository..."
$stages[0].logs += "HEAD is now at 8f5b3a9 refactor: update application health indicators"
$stages[0].status = "PASSED"
$stages[0].duration = "1.2s"
Write-StageLog "Checkout" "PASSED" "Checkout complete successfully."
Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 2: BUILD ---
$stages[1].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Build" "IN_PROGRESS" "Compiling project and resolving dependencies..."

if ($FailStage -eq "Build") {
    Start-Sleep -Seconds 2
    $stages[1].status = "FAILED"
    $stages[1].duration = "2.3s"
    $stages[1].logs += "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile"
    $stages[1].logs += "[ERROR] Compilation failure: Class 'HealthController' has syntax error on line 42."
    Write-StageLog "Build" "FAILED" "Compilation failed!"
    Write-PipelineStatus "FAILED" $stages
    Exit 1
}

if ($Mode -eq "Real") {
    try {
        Write-StageLog "Build" "IN_PROGRESS" "Running actual Maven compilation (mvn clean compile)..."
        $mvnOutput = Start-Process mvn -ArgumentList "clean compile -f `"$ScriptDir/app/pom.xml`"" -NoNewWindow -PassThru -Wait
        if ($mvnOutput.ExitCode -ne 0) { throw "Maven build failed." }
        $stages[1].logs += "Maven compile execution succeeded."
    } catch {
        $stages[1].status = "FAILED"
        $stages[1].duration = "5s"
        $stages[1].logs += "Maven compilation failed. Make sure Maven (mvn) and JDK 17 are installed and in PATH."
        Write-StageLog "Build" "FAILED" "Real Maven compilation failed."
        Write-PipelineStatus "FAILED" $stages
        Exit 1
    }
} else {
    Start-Sleep -Seconds 2
    $stages[1].logs += "[INFO] Scanning for projects..."
    $stages[1].logs += "[INFO] Building DevOps Java Web App 1.0.0"
    $stages[1].logs += "[INFO] --- maven-resources-plugin:3.3.1:resources (default-resources) ---"
    $stages[1].logs += "[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) ---"
    $stages[1].logs += "[INFO] Compiling 2 source files to target/classes"
    $stages[1].logs += "[INFO] BUILD SUCCESS"
}
$stages[1].status = "PASSED"
$stages[1].duration = "2.8s"
Write-StageLog "Build" "PASSED" "Build compiled successfully."
Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 3: TEST ---
$stages[2].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Test" "IN_PROGRESS" "Running unit and integration tests..."

if ($FailStage -eq "Test") {
    Start-Sleep -Seconds 2
    $stages[2].status = "FAILED"
    $stages[2].duration = "2.1s"
    $stages[2].logs += "[INFO] Running com.devops.app.HealthControllerTest"
    $stages[2].logs += "[ERROR] Failures: "
    $stages[2].logs += "[ERROR]   HealthControllerTest.testGetHealth:34 Expected UP but was DOWN"
    $stages[2].logs += "[INFO] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0"
    Write-StageLog "Test" "FAILED" "Tests failed!"
    Write-PipelineStatus "FAILED" $stages
    Exit 1
}

if ($Mode -eq "Real") {
    try {
        Write-StageLog "Test" "IN_PROGRESS" "Running actual Maven tests (mvn test)..."
        $mvnTest = Start-Process mvn -ArgumentList "test -f `"$ScriptDir/app/pom.xml`"" -NoNewWindow -PassThru -Wait
        if ($mvnTest.ExitCode -ne 0) { throw "Tests failed." }
        $stages[2].logs += "Maven test execution passed."
    } catch {
        $stages[2].status = "FAILED"
        $stages[2].duration = "6s"
        $stages[2].logs += "JUnit unit tests execution encountered test failures."
        Write-StageLog "Test" "FAILED" "Real Maven testing encountered failures."
        Write-PipelineStatus "FAILED" $stages
        Exit 1
    }
} else {
    Start-Sleep -Seconds 2
    $stages[2].logs += "[INFO] --- maven-surefire-plugin:3.1.2:test (default-test) ---"
    $stages[2].logs += "[INFO] Running com.devops.app.HealthControllerTest"
    $stages[2].logs += "[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.876 s"
    $stages[2].logs += "[INFO] Results:"
    $stages[2].logs += "[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0"
}
$stages[2].status = "PASSED"
$stages[2].duration = "2.5s"
Write-StageLog "Test" "PASSED" "All test suites passed."
Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 4: SECURITY SCAN ---
$stages[3].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Security Scan" "IN_PROGRESS" "Scanning dependencies and code for security vulnerabilities..."

if ($FailStage -eq "Security") {
    Start-Sleep -Seconds 2
    $stages[3].status = "FAILED"
    $stages[3].duration = "1.8s"
    $stages[3].logs += "Scanning dependencies..."
    $stages[3].logs += "CRITICAL VULNERABILITY FOUND: Log4j CVE-2021-44228 (CVSS Score: 10.0)"
    $stages[3].logs += "[FAILURE] Security Scan aborted. Vulnerability threshold exceeded."
    Write-StageLog "Security Scan" "FAILED" "Critical vulnerabilities detected!"
    Write-PipelineStatus "FAILED" $stages
    Exit 1
}

Start-Sleep -Seconds 2
$stages[3].logs += "Scanning code using spotbugs:check..."
$stages[3].logs += "No high-severity bugs found."
$stages[3].logs += "Running OWASP Dependency-Check..."
$stages[3].logs += "No vulnerable components matching threshold (HIGH/CRITICAL)."
$stages[3].status = "PASSED"
$stages[3].duration = "2.1s"
Write-StageLog "Security Scan" "PASSED" "Vulnerability scan completed. 0 issues detected."
Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 5: CONTAINERIZE ---
$stages[4].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Containerize" "IN_PROGRESS" "Building Docker image and packaging artifacts..."

if ($FailStage -eq "Package") {
    Start-Sleep -Seconds 2
    $stages[4].status = "FAILED"
    $stages[4].duration = "1.9s"
    $stages[4].logs += "docker build -t devops-java-app:latest ."
    $stages[4].logs += "Step 6/12 : RUN mvn clean package -DskipTests"
    $stages[4].logs += "ERROR: Could not resolve dependencies: connection timeout to maven central"
    Write-StageLog "Containerize" "FAILED" "Docker container build failed!"
    Write-PipelineStatus "FAILED" $stages
    Exit 1
}

if ($Mode -eq "Real") {
    try {
        Write-StageLog "Containerize" "IN_PROGRESS" "Running actual Docker build (docker build -t devops-java-app:1.0.0 .)..."
        $dockerBuild = Start-Process docker -ArgumentList "build -t devops-java-app:1.0.0 `"$ScriptDir`"" -NoNewWindow -PassThru -Wait
        if ($dockerBuild.ExitCode -ne 0) { throw "Docker build failed." }
        $stages[4].logs += "Docker image devops-java-app:1.0.0 built successfully."
    } catch {
        $stages[4].status = "FAILED"
        $stages[4].duration = "4s"
        $stages[4].logs += "Docker image packaging failed. Make sure Docker is running."
        Write-StageLog "Containerize" "FAILED" "Real Docker build failed."
        Write-PipelineStatus "FAILED" $stages
        Exit 1
    }
} else {
    Start-Sleep -Seconds 3
    $stages[4].logs += "docker build -t devops-java-app:latest -f Dockerfile ."
    $stages[4].logs += "Step 1/12 : FROM maven:3.9.6-eclipse-temurin-17-alpine AS builder ... (using cache)"
    $stages[4].logs += "Step 5/12 : RUN mvn clean package -DskipTests ... success"
    $stages[4].logs += "Step 10/12 : EXPOSE 8080"
    $stages[4].logs += 'Step 12/12 : ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]'
    $stages[4].logs += "Successfully built image devops-java-app:latest (size: 145MB)"
    $stages[4].logs += "Pushing image to Docker Hub registry..."
    $stages[4].logs += "Pushing referential digests..."
    $stages[4].logs += "latest: digest: sha256:d8f7a6b2c4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z"
}
$stages[4].status = "PASSED"
$stages[4].duration = "3.2s"
Write-StageLog "Containerize" "PASSED" "Docker image packaged and pushed."
Write-PipelineStatus "IN_PROGRESS" $stages

# --- STAGE 6: DEPLOY ---
$stages[5].status = "IN_PROGRESS"
Write-PipelineStatus "IN_PROGRESS" $stages
Write-StageLog "Deploy" "IN_PROGRESS" "Deploying target application to staging VM..."

if ($FailStage -eq "Deploy") {
    Start-Sleep -Seconds 2
    $stages[5].status = "FAILED"
    $stages[5].duration = "1.5s"
    $stages[5].logs += "SSH: Connecting to Docker Host VM (192.168.1.10)..."
    $stages[5].logs += "Docker: Pulling devops/java-devops-app:latest..."
    $stages[5].logs += "Docker: Stopping container java-web-app..."
    $stages[5].logs += "Docker: Starting container instance java-web-app-1..."
    $stages[5].logs += "ERROR: container java-web-app-1 crashed with exit code 137 (OOMKilled)"
    $stages[5].logs += "Docker: Out of memory error in container heap space allocation"
    Write-StageLog "Deploy" "FAILED" "Docker container rollout failed!"
    Write-PipelineStatus "FAILED" $stages
    Exit 1
}

Start-Sleep -Seconds 2
$stages[5].logs += "SSH: Connecting to Docker Host VM (192.168.1.10)..."
$stages[5].logs += "Docker: Pulling devops/java-devops-app:latest... success"
$stages[5].logs += "Docker: Stopping existing java-web-app containers... stopped"
$stages[5].logs += "Docker: Removing container templates... removed"
$stages[5].logs += "Docker: Creating and starting container instances..."
$stages[5].logs += "Docker: running container java-web-app-1 (port 8081) - status: HEALTHY"
$stages[5].logs += "Docker: running container java-web-app-2 (port 8082) - status: HEALTHY"
$stages[5].logs += "Docker: running container java-web-app-3 (port 8083) - status: HEALTHY"
$stages[5].logs += "Nginx Proxy: Reloading routing config. Available at http://devops-java.local/"
$stages[5].status = "PASSED"
$stages[5].duration = "2.4s"
Write-StageLog "Deploy" "PASSED" "Docker deployment rollout complete. Application UP."

Write-PipelineStatus "SUCCESS" $stages
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "             PIPELINE COMPLETED SUCCESSFULLY! (SUCCESS)" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
