// Global state
let activeBranch = 'main';
let activeCommit = '8f5b3a9';
let buildCount = 100;
let pipelineIsRunning = false;
let pipelineSeconds = 0;
let pipelineTimerInterval;
let metricsInterval;
let cpuChart, memoryChart;

// In-memory cache of past pipeline runs
const buildHistory = [];

// Docker Containers list managed by our mock engine supervisor
let dockerContainers = [];

// DOM Elements
const btnTrigger = document.getElementById('btn-trigger');
const btnReset = document.getElementById('btn-reset');
const btnCommitPush = document.getElementById('btn-commit-push');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logsConsole = document.getElementById('logs-console');
const statusBadge = document.getElementById('pipeline-status-badge');
const timerBadge = document.getElementById('pipeline-timer-badge');
const envStatusText = document.getElementById('env-status-text');
const envStatusDot = document.getElementById('env-status-dot');

const branchSelect = document.getElementById('git-branch');
const commitInput = document.getElementById('git-message');
const authorInput = document.getElementById('git-author');
const activeBranchIndicator = document.getElementById('active-branch-indicator');
const activeCommitIndicator = document.getElementById('active-commit-indicator');

const scaleSlider = document.getElementById('k8s-scale-slider');
const scaleDisplay = document.getElementById('replica-count-display');
const podsGrid = document.getElementById('k8s-pods-grid');
const activeReplicasSummary = document.getElementById('active-replicas-summary');

const trivyGateSelect = document.getElementById('config-trivy-gate');
const slackToggle = document.getElementById('config-slack');
const runsHistoryList = document.getElementById('runs-history-list');

// Fault Injector Toggles
const injBuild = document.getElementById('inj-build');
const injTest = document.getElementById('inj-test');
const injSecurity = document.getElementById('inj-security');
const injPackage = document.getElementById('inj-package');
const injDeploy = document.getElementById('inj-deploy');

// Modal Elements
const podLogsModal = document.getElementById('pod-logs-modal');
const modalPodName = document.getElementById('modal-pod-name');
const modalLogsBody = document.getElementById('modal-pod-logs-body');
const btnCloseModal = document.getElementById('btn-close-modal');
let activeModalPodId = null;
let modalLogsInterval = null;

// Target triggers
const modeSim = document.getElementById('mode-sim');
const modeJson = document.getElementById('mode-json');
let triggerMode = 'Simulate'; // 'Simulate' or 'LoadRun'

// Pipeline workflow stages
const stages = {
    checkout: { element: document.getElementById('stage-checkout'), connector: document.getElementById('conn-checkout'), name: 'Checkout' },
    build: { element: document.getElementById('stage-build'), connector: document.getElementById('conn-build'), name: 'Maven Build' },
    test: { element: document.getElementById('stage-test'), connector: document.getElementById('conn-test'), name: 'Unit Test' },
    security: { element: document.getElementById('stage-security'), connector: document.getElementById('conn-security'), name: 'Security Scan' },
    containerize: { element: document.getElementById('stage-containerize'), connector: document.getElementById('conn-containerize'), name: 'Containerize' },
    deploy: { element: document.getElementById('stage-deploy'), connector: null, name: 'CD Deploy' }
};

// ----------------------------------------------------
// UI INITIALIZATION & INITIAL RENDER
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    resetPipelineUI();
    syncDockerContainers();
    
    // Bind change events
    scaleSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        scaleDisplay.textContent = val;
        syncDockerContainers();
    });
    
    btnCommitPush.addEventListener('click', triggerGitCommitPush);
    btnTrigger.addEventListener('click', () => {
        if (triggerMode === 'Simulate') {
            runPipelineSimulation();
        } else {
            loadLatestPipelineRun();
        }
    });
    
    btnReset.addEventListener('click', () => {
        resetPipelineUI();
        log('SYSTEM: Reset state indicators and restored default containers.', 'system-msg');
    });
    
    btnClearLogs.addEventListener('click', () => { logsConsole.innerHTML = ''; });
    
    btnCloseModal.addEventListener('click', closePodLogsModal);
    window.addEventListener('click', (e) => {
        if (e.target === podLogsModal) closePodLogsModal();
    });
    
    // Mode selectors
    modeSim.addEventListener('click', () => {
        triggerMode = 'Simulate';
        modeSim.classList.add('active');
        modeJson.classList.remove('active');
        log('SYSTEM: Changed runner mode to Simulation.', 'system-msg');
    });
    
    modeJson.addEventListener('click', () => {
        triggerMode = 'LoadRun';
        modeJson.classList.add('active');
        modeSim.classList.remove('active');
        log('SYSTEM: Changed runner mode to load run-pipeline.json.', 'system-msg');
    });
});

// Helper for generating custom commit SHAs
function generateShortSHA() {
    return Math.random().toString(16).substring(2, 9);
}

// ----------------------------------------------------
// GIT COMMIT SIMULATION
// ----------------------------------------------------
function triggerGitCommitPush() {
    if (pipelineIsRunning) return;
    
    activeBranch = branchSelect.value;
    activeCommit = generateShortSHA();
    
    // Update status indicators
    activeBranchIndicator.innerHTML = `<i class="fa-solid fa-code-branch"></i> branch: <strong>${activeBranch}</strong>`;
    activeCommitIndicator.innerHTML = `<i class="fa-solid fa-hashtag"></i> sha: <strong>${activeCommit}</strong>`;
    
    clearConsole();
    log(`Git Webhook received: Pushed to branch [${activeBranch}]`, 'system-msg');
    log(`Commit SHA: ${activeCommit}`, 'muted-msg');
    log(`Author: ${authorInput.value}`, 'muted-msg');
    log(`Commit Message: ${commitInput.value}`, 'info-msg');
    log(`Repository: github.com/devops/java-cicd-pipeline.git`, 'muted-msg');
    
    // Automatically trigger the pipeline when a push occurs
    runPipelineSimulation();
}

// ----------------------------------------------------
// DOCKER CONTAINER INSTANCES TOPOLOGY MANAGER
// ----------------------------------------------------
function syncDockerContainers() {
    const targetScale = parseInt(scaleSlider.value);
    
    // Filter out stopped containers completely after transition
    dockerContainers = dockerContainers.filter(c => c.status !== 'DEAD_CLEANED');
    
    const activeContainers = dockerContainers.filter(c => c.status === 'RUNNING' || c.status === 'PENDING' || c.status === 'TERMINATING');
    const diff = targetScale - activeContainers.length;
    
    if (diff > 0) {
        // Scale Up: Create new containers
        for (let i = 0; i < diff; i++) {
            const containerId = `java-web-app-${generateShortSHA()}`;
            const newContainer = {
                id: containerId,
                name: `container-${dockerContainers.length + 1}`,
                status: 'PENDING',
                cpu: 0,
                memory: 0,
                version: activeCommit,
                startTime: Date.now()
            };
            dockerContainers.push(newContainer);
            showToast('Docker Engine', `Container ${newContainer.id.substring(0, 18)} created.`, 'info');
            
            // Transition from PENDING to RUNNING after 2 seconds
            setTimeout(() => {
                const c = dockerContainers.find(x => x.id === containerId);
                if (c && c.status === 'PENDING') {
                    c.status = 'RUNNING';
                    c.cpu = Math.round(15 + Math.random() * 10);
                    c.memory = Math.round(150 + Math.random() * 20);
                    showToast('Docker Daemon', `Container ${c.id.substring(0, 12)} is now Running.`, 'success');
                    renderContainersGrid();
                }
            }, 2000);
        }
    } else if (diff < 0) {
        // Scale Down: Stop container instances
        const toTerminate = Math.abs(diff);
        let terminatedCount = 0;
        
        for (let i = dockerContainers.length - 1; i >= 0; i--) {
            if (terminatedCount >= toTerminate) break;
            const container = dockerContainers[i];
            if (container.status === 'RUNNING' || container.status === 'PENDING') {
                container.status = 'TERMINATING';
                container.cpu = 0;
                container.memory = 0;
                showToast('Docker Engine', `Stopping container ${container.id.substring(0, 12)}...`, 'warning');
                terminatedCount++;
                
                // Clean up container resources after 1.5s
                const containerId = container.id;
                setTimeout(() => {
                    const c = dockerContainers.find(x => x.id === containerId);
                    if (c) c.status = 'DEAD_CLEANED';
                    renderContainersGrid();
                }, 1500);
            }
        }
    }
    
    renderContainersGrid();
}

function renderContainersGrid() {
    const visibleContainers = dockerContainers.filter(c => c.status !== 'DEAD_CLEANED');
    
    if (visibleContainers.length === 0) {
        podsGrid.innerHTML = '<div class="no-history-msg">No containers currently running. Use the slider to scale up.</div>';
        activeReplicasSummary.innerHTML = `Active Containers: <strong>0 / ${scaleSlider.value}</strong>`;
        drawRoutingLines(0);
        return;
    }
    
    let html = '';
    let runningCount = 0;
    
    visibleContainers.forEach(c => {
        let statusClass = 'pod-dead';
        let statusBadge = 'dead';
        if (c.status === 'RUNNING') { statusClass = 'pod-running'; statusBadge = 'running'; runningCount++; }
        else if (c.status === 'PENDING') { statusClass = 'pod-pending'; statusBadge = 'pending'; }
        else if (c.status === 'TERMINATING') { statusClass = 'pod-terminating'; statusBadge = 'terminating'; }
        
        html += `
            <div class="pod-card ${statusClass}">
                <div class="pod-icon"><i class="fa-solid fa-box"></i></div>
                <div class="pod-details">
                    <div class="pod-header">
                        <span class="pod-name" title="${c.id}">${c.id.substring(0, 19)}</span>
                        <span class="pod-status-badge ${statusBadge}">${c.status}</span>
                    </div>
                    <div class="pod-metrics">
                        <span>CPU: <strong>${c.cpu}%</strong></span>
                        <span>Mem: <strong>${c.memory}MB</strong></span>
                        <span>Ver: <strong class="text-primary font-mono">${c.version}</strong></span>
                    </div>
                </div>
                <div class="pod-actions">
                    <button class="pod-btn-action btn-logs" onclick="openPodLogsModal('${c.id}')" title="View Container Logs"><i class="fa-solid fa-file-invoice"></i></button>
                    <button class="pod-btn-action btn-kill" onclick="killContainerChaos('${c.id}')" title="Kill Container (Docker Failure)" ${c.status !== 'RUNNING' ? 'disabled' : ''}><i class="fa-solid fa-power-off"></i></button>
                </div>
            </div>
        `;
    });
    
    podsGrid.innerHTML = html;
    activeReplicasSummary.innerHTML = `Active Containers: <strong>${runningCount} / ${scaleSlider.value}</strong>`;
    
    // Redraw proxy routes
    drawRoutingLines(visibleContainers.length);
}

function drawRoutingLines(count) {
    const routeContainer = document.getElementById('network-routes');
    if (!routeContainer) return;
    
    if (count === 0) {
        routeContainer.innerHTML = '';
        return;
    }
    
    const height = 220;
    const width = 110;
    const centerSourceY = height / 2;
    
    let svgHtml = `<svg width="${width}" height="${height}">`;
    const step = height / (count + 1);
    
    for (let i = 0; i < count; i++) {
        const destY = step * (i + 1);
        const isActive = dockerContainers[i] && dockerContainers[i].status === 'RUNNING';
        const pathClass = isActive ? 'topology-routing-path active' : 'topology-routing-path';
        
        svgHtml += `
            <path class="${pathClass}" d="M 0,${centerSourceY} C ${width/2},${centerSourceY} ${width/2},${destY} ${width},${destY}" />
        `;
    }
    
    svgHtml += `</svg>`;
    routeContainer.innerHTML = svgHtml;
}

// ----------------------------------------------------
// CHAOS ENGINEERING: KILL CONTAINER (DOCKER RESTART RECOVERY)
// ----------------------------------------------------
function killContainerChaos(containerId) {
    const container = dockerContainers.find(c => c.id === containerId);
    if (!container || container.status !== 'RUNNING') return;
    
    container.status = 'TERMINATING';
    container.cpu = 0;
    container.memory = 0;
    renderContainersGrid();
    
    showToast('Docker Daemon', `Injected SIGKILL signal on container ${containerId.substring(0, 12)}.`, 'error');
    log(`CHAOS INJECTION: Container [${containerId}] stopped unexpectedly.`, 'error-msg');
    
    setTimeout(() => {
        container.status = 'DEAD';
        renderContainersGrid();
        
        // Simulates Docker restart policy monitoring (--restart always)
        log(`DOCKER SUPERVISOR: Container [${containerId}] exited with code 137. Inspecting restart policy...`, 'warning-msg');
        log('DOCKER DAEMON: Policy "--restart always" active. Re-spawning new container instance...', 'system-msg');
        
        container.status = 'DEAD_CLEANED';
        syncDockerContainers();
    }, 1500);
}

// ----------------------------------------------------
// CONTAINER CONSOLE LOGS DIALOG (MODAL)
// ----------------------------------------------------
function openPodLogsModal(containerId) {
    const container = dockerContainers.find(c => c.id === containerId);
    if (!container) return;
    
    activeModalPodId = containerId;
    modalPodName.textContent = containerId;
    modalLogsBody.innerHTML = '';
    
    podLogsModal.classList.add('open');
    
    // JVM boot logs
    const bootLogs = [
        `[INFO]  Starting Java virtual machine environment on port 8080...`,
        `[INFO]  JVM Version: 17.0.10 (Temurin openjdk-alpine build)`,
        `[INFO]  Spring Boot Framework Version: 3.2.5 initializing...`,
        `[INFO]  Active execution profile: production`,
        `[INFO]  Connecting to PostgreSQL backend database at 192.168.1.5... connected.`,
        `[INFO]  Tomcat embedded web engine started on port 8080`,
        `[INFO]  Java service started successfully in 2.1 seconds.`
    ];
    
    bootLogs.forEach((l, index) => {
        setTimeout(() => {
            const div = document.createElement('div');
            div.className = 'log-line info-msg';
            div.textContent = `[CONTAINER-INIT] ${l}`;
            modalLogsBody.appendChild(div);
            modalLogsBody.scrollTop = modalLogsBody.scrollHeight;
        }, index * 100);
    });
    
    // Dynamic requests generator while logs are open
    let counter = 0;
    clearInterval(modalLogsInterval);
    modalLogsInterval = setInterval(() => {
        if (container.status !== 'RUNNING') {
            const div = document.createElement('div');
            div.className = 'log-line error-msg';
            div.textContent = `[CONTAINER-STOP] Process terminated. Exiting Java Runtime Environment.`;
            modalLogsBody.appendChild(div);
            clearInterval(modalLogsInterval);
            return;
        }
        
        const isMetricsScrape = counter % 2 === 0;
        const p = document.createElement('div');
        if (isMetricsScrape) {
            p.className = 'log-line muted-msg';
            p.textContent = `[${new Date().toLocaleTimeString()}] HTTP GET /api/metrics - 200 OK (Source: Prometheus Scraper Agent)`;
        } else {
            p.className = 'log-line success-msg';
            p.textContent = `[${new Date().toLocaleTimeString()}] HTTP GET /api/health - status: UP (Source: Nginx Proxy LoadBalancer)`;
        }
        modalLogsBody.appendChild(p);
        modalLogsBody.scrollTop = modalLogsBody.scrollHeight;
        counter++;
    }, 1500);
}

function closePodLogsModal() {
    podLogsModal.classList.remove('open');
    clearInterval(modalLogsInterval);
    activeModalPodId = null;
}

// ----------------------------------------------------
// NOTIFICATION TOAST FEEDS
// ----------------------------------------------------
function showToast(title, msg, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-alert toast-${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    else if (type === 'warning') icon = 'fa-triangle-exclamation';
    else if (type === 'error') icon = 'fa-skull-crossbones';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${msg}</div>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ----------------------------------------------------
// CI/CD PIPELINE RUNNER (SIMULATION OR LOAD JSON)
// ----------------------------------------------------
async function runPipelineSimulation() {
    if (pipelineIsRunning) return;
    
    pipelineIsRunning = true;
    btnTrigger.disabled = true;
    btnTrigger.classList.add('muted');
    btnCommitPush.disabled = true;
    btnCommitPush.classList.add('muted');
    
    statusBadge.textContent = 'EXECUTING';
    statusBadge.className = 'badge warning pulse';
    
    log(`Orchestrator: Initiated build cycle #${buildCount}...`, 'system-msg');
    
    // Reset timer
    pipelineSeconds = 0;
    clearInterval(pipelineTimerInterval);
    pipelineTimerInterval = setInterval(() => {
        pipelineSeconds += 0.1;
        timerBadge.textContent = pipelineSeconds.toFixed(1) + 's';
    }, 100);
    
    // Mark running containers as pending update
    dockerContainers.forEach(c => {
        if (c.status === 'RUNNING') {
            c.version = `${activeCommit} (Update Pending)`;
        }
    });
    renderContainersGrid();

    // 1. Checkout
    const checkoutSuccess = await runStageSimulation('checkout');
    if (!checkoutSuccess) { pipelineComplete('FAILED'); return; }

    // 2. Build
    const buildSuccess = await runStageSimulation('build');
    if (!buildSuccess) { pipelineComplete('FAILED'); return; }

    // 3. Test
    const testSuccess = await runStageSimulation('test');
    if (!testSuccess) { pipelineComplete('FAILED'); return; }

    // 4. Security Scan
    const securitySuccess = await runSecurityStage();
    if (!securitySuccess) { pipelineComplete('FAILED'); return; }

    // 5. Containerize
    const containerizeSuccess = await runStageSimulation('containerize');
    if (!containerizeSuccess) { pipelineComplete('FAILED'); return; }

    // 6. Deploy (Target: Docker Host VM)
    const deploySuccess = await runDeployStage();
    if (!deploySuccess) {
        pipelineComplete('FAILED', true); // Fails with Deploy OOM
        return;
    }

    pipelineComplete('SUCCESS');
}

// Trivy scanning with configuration gates
async function runSecurityStage() {
    const stageKey = 'security';
    updateStageState(stageKey, 'running');
    log('Security Scan: Initiating dependency audits and code quality scans...', 'system-msg');
    
    const gateValue = trivyGateSelect.value;
    const leakInjected = injSecurity.checked;
    
    const scanDelay = 2200;
    
    const promise = new Promise((resolve) => {
        setTimeout(() => {
            log('[INFO] Scanning project configurations and dependencies...', 'muted-msg');
            
            if (leakInjected) {
                log('[WARNING] Found vulnerability: tomcat-embed-core-10.1.7.jar (CVE-2023-4567)', 'warning-msg');
                log('[WARNING] Vulnerability Severity: HIGH (CVSS score: 8.2)', 'warning-msg');
                
                if (gateValue === 'HIGH' || gateValue === 'MEDIUM') {
                    log('[ERROR] Security Gate Breach: Found vulnerability matching configured block threshold (HIGH).', 'error-msg');
                    log('[ERROR] Security scans failed. Terminating pipeline.', 'error-msg');
                    resolve(false);
                } else {
                    log('[INFO] Warning: High severity vulnerability found, but permitted by gate setting (CRITICAL ONLY).', 'warning-msg');
                    log('Security scans completed with warnings. 0 critical, 1 high issues.', 'success-msg');
                    resolve(true);
                }
            } else {
                log('Trivy scanner: 0 critical, 0 high, 0 medium vulnerabilities detected.', 'success-msg');
                log('Security Scan completed. Quality gates verified successfully.', 'success-msg');
                resolve(true);
            }
        }, scanDelay);
    });
    
    const success = await promise;
    updateStageState(stageKey, success ? 'passed' : 'failed', '2.2s');
    return success;
}

// Staging VM container deployment rollout
async function runDeployStage() {
    const stageKey = 'deploy';
    updateStageState(stageKey, 'running');
    log('CD Deploy: Rollout started. Establishing SSH connection to target VM...', 'system-msg');
    
    const hasOom = injDeploy.checked;
    const scaleCount = parseInt(scaleSlider.value);
    
    const promise = new Promise((resolve) => {
        setTimeout(() => {
            log('SSH: Connected to Docker Host VM (192.168.1.10).', 'info-msg');
            log('Docker: Pulling latest compiled image from repository...', 'info-msg');
            log('Docker: Stopping existing java-web-app containers...', 'info-msg');
            
            if (hasOom) {
                log('Docker: Spawning container instances...', 'muted-msg');
                log('[ERROR] Container java-web-app-1 exited with code 137 (OOMKilled - heap memory space allocation error)', 'error-msg');
                log('[ERROR] Docker deployment failed. Rolling back changes.', 'error-msg');
                resolve(false);
            } else {
                log(`Docker Daemon: Target instance count set to ${scaleCount}. Updating running configurations.`, 'system-msg');
                resolve(true);
            }
        }, 2500);
    });
    
    const success = await promise;
    updateStageState(stageKey, success ? 'passed' : 'failed', '2.5s');
    return success;
}

// Master complete trigger
function pipelineComplete(finalStatus, oomError = false) {
    clearInterval(pipelineTimerInterval);
    pipelineIsRunning = false;
    
    btnTrigger.disabled = false;
    btnTrigger.classList.remove('muted');
    btnCommitPush.disabled = false;
    btnCommitPush.classList.remove('muted');
    
    statusBadge.textContent = finalStatus;
    
    if (finalStatus === 'SUCCESS') {
        statusBadge.className = 'badge success';
        envStatusText.textContent = 'Production Host VM Online';
        envStatusDot.className = 'status-dot green pulse';
        showToast('CD Deploy', 'Deployment completed successfully. Staging VMs active.', 'success');
        
        // Update containers to the new version
        dockerContainers.forEach(c => {
            if (c.status === 'RUNNING') {
                c.version = activeCommit;
                c.cpu = Math.round(15 + Math.random() * 20);
                c.memory = Math.round(160 + Math.random() * 50);
            }
        });
        
        updateMetrics(true, false);
        
        if (slackToggle.checked) {
            log(`Slack Integration: Payload notification sent to channel #deployments-alert: Build #${buildCount} SUCCESS on branch ${activeBranch}.`, 'muted-msg');
        }
    } else {
        statusBadge.className = 'badge error';
        envStatusText.textContent = 'Host VM Unstable - Deployment Failed';
        envStatusDot.className = 'status-dot red pulse';
        showToast('Pipeline Failed', `Pipeline build #${buildCount} failed.`, 'error');
        
        if (oomError) {
            dockerContainers.forEach(c => {
                c.status = 'DEAD';
                c.cpu = 0;
                c.memory = 512; // Max out
            });
            updateMetrics(true, true);
        } else {
            updateMetrics(false, false);
        }
        
        if (slackToggle.checked) {
            log(`Slack Integration: Alert notification sent to #deployments-alert: Build #${buildCount} FAILED on branch ${activeBranch}.`, 'error-msg');
        }
    }
    
    syncDockerContainers();
    cacheRunHistory(finalStatus);
    buildCount++;
}

// Wrapper for stages simulation
async function runStageSimulation(stageKey) {
    updateStageState(stageKey, 'running');
    
    const isFailed = (stageKey === 'build' && injBuild.checked) ||
                     (stageKey === 'test' && injTest.checked) ||
                     (stageKey === 'containerize' && injPackage.checked);
                     
    const stepConfigs = logSteps[stageKey];
    const lines = isFailed ? (stepConfigs.fail || stepConfigs) : (stepConfigs.success || stepConfigs);
    
    const stagePromise = new Promise((resolve) => {
        let maxDelay = 0;
        lines.forEach(line => {
            maxDelay = Math.max(maxDelay, line.delay);
            setTimeout(() => {
                log(line.text, line.type);
            }, line.delay);
        });
        
        setTimeout(() => resolve(!isFailed), maxDelay + 100);
    });
    
    const success = await stagePromise;
    const duration = (Math.random() * 1.5 + 1).toFixed(1) + 's';
    updateStageState(stageKey, success ? 'passed' : 'failed', duration);
    return success;
}

// ----------------------------------------------------
// BUILD RUNS HISTORY LOGGER & RESTORE
// ----------------------------------------------------
function cacheRunHistory(status) {
    const logsHTML = logsConsole.innerHTML;
    const stageStates = {};
    for (const key in stages) {
        const classes = Array.from(stages[key].element.classList);
        let s = 'pending';
        if (classes.includes('passed')) s = 'passed';
        else if (classes.includes('failed')) s = 'failed';
        else if (classes.includes('running')) s = 'running';
        
        stageStates[key] = {
            status: s,
            duration: stages[key].element.querySelector('.stage-duration').textContent
        };
    }
    
    const run = {
        buildNumber: buildCount,
        status: status,
        branch: activeBranch,
        commit: activeCommit,
        timestamp: new Date().toLocaleTimeString(),
        duration: timerBadge.textContent,
        logs: logsHTML,
        stages: stageStates
    };
    
    buildHistory.unshift(run);
    renderHistoryList();
}

function renderHistoryList() {
    if (buildHistory.length === 0) {
        runsHistoryList.innerHTML = '<div class="no-history-msg">No runs stored in this session yet.</div>';
        return;
    }
    
    let html = '';
    buildHistory.forEach((run, index) => {
        let iconClass = 'fa-circle-check success';
        if (run.status === 'FAILED') iconClass = 'fa-circle-xmark failed';
        
        html += `
            <div class="history-run-item" onclick="restoreHistoricalRun(${index})">
                <div class="run-status-icon"><i class="fa-solid ${iconClass}"></i></div>
                <div class="run-meta">
                    <div class="run-meta-title">
                        <span>Build #${run.buildNumber}</span>
                        <span class="run-duration">${run.duration}</span>
                    </div>
                    <div class="run-meta-time">Time: ${run.timestamp}</div>
                    <div class="run-meta-commit">Branch: ${run.branch} | SHA: ${run.commit}</div>
                </div>
            </div>
        `;
    });
    
    runsHistoryList.innerHTML = html;
}

function restoreHistoricalRun(historyIndex) {
    const run = buildHistory[historyIndex];
    if (!run) return;
    
    log(`SYSTEM: Restoring workspace states from Build #${run.buildNumber}...`, 'system-msg');
    showToast('Logs Restored', `Console logs from Build #${run.buildNumber} loaded.`, 'info');
    
    activeBranchIndicator.innerHTML = `<i class="fa-solid fa-code-branch"></i> branch: <strong>${run.branch}</strong>`;
    activeCommitIndicator.innerHTML = `<i class="fa-solid fa-hashtag"></i> sha: <strong>${run.commit}</strong>`;
    
    logsConsole.innerHTML = run.logs;
    logsConsole.scrollTop = logsConsole.scrollHeight;
    timerBadge.textContent = run.duration;
    
    for (const key in stages) {
        const cache = run.stages[key];
        if (cache) {
            updateStageState(key, cache.status, cache.duration);
        }
    }
    
    statusBadge.textContent = run.status;
    if (run.status === 'SUCCESS') {
        statusBadge.className = 'badge success';
        envStatusText.textContent = 'Production Host VM Online';
        envStatusDot.className = 'status-dot green pulse';
        updateMetrics(true, false);
    } else {
        statusBadge.className = 'badge error';
        envStatusText.textContent = 'Host VM Unstable - Deployment Failed';
        envStatusDot.className = 'status-dot red pulse';
        updateMetrics(false, false);
    }
}

// ----------------------------------------------------
// STATIC SIMULATION LOGS DICTIONARY
// ----------------------------------------------------
const logSteps = {
    checkout: [
        { text: 'git version 2.43.0.windows.1', type: 'muted-msg', delay: 100 },
        { text: 'git clone https://github.com/devops/java-cicd-pipeline.git .', type: 'info-msg', delay: 300 },
        { text: 'Cloning into \'.\'...', type: 'info-msg', delay: 500 },
        { text: 'remote: Enumerating objects: 153, done.', type: 'muted-msg', delay: 800 },
        { text: 'Receiving objects: 100% (153/153), 2.3 MiB | 12.4 MiB/s, done.', type: 'muted-msg', delay: 1100 },
        { text: 'HEAD is now at active git reference code index', type: 'info-msg', delay: 1300 },
        { text: 'SUCCESS: Source code workspace synchronization complete.', type: 'success-msg', delay: 1550 }
    ],
    build: {
        success: [
            { text: '[INFO] Scanning for projects...', type: 'muted-msg', delay: 100 },
            { text: '[INFO] ----------------< com.devops:app >----------------', type: 'muted-msg', delay: 300 },
            { text: '[INFO] Building DevOps Java Web App 1.0.0', type: 'info-msg', delay: 500 },
            { text: '[INFO] Deleting target folder resources', type: 'muted-msg', delay: 800 },
            { text: '[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) ---', type: 'muted-msg', delay: 1100 },
            { text: '[INFO] Compiling 2 source files to target/classes', type: 'info-msg', delay: 1400 },
            { text: '[INFO] BUILD SUCCESS', type: 'success-msg', delay: 1800 }
        ],
        fail: [
            { text: '[INFO] Scanning for projects...', type: 'muted-msg', delay: 100 },
            { text: '[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) ---', type: 'muted-msg', delay: 400 },
            { text: '[INFO] Compiling 2 source files to target/classes', type: 'info-msg', delay: 700 },
            { text: '[ERROR] HealthController.java:[42,12] \';\' expected', type: 'error-msg', delay: 1000 },
            { text: '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile', type: 'error-msg', delay: 1300 },
            { text: '[INFO] BUILD FAILURE', type: 'error-msg', delay: 1550 }
        ]
    },
    test: {
        success: [
            { text: '[INFO] --- maven-surefire-plugin:3.1.2:test (default-test) ---', type: 'muted-msg', delay: 100 },
            { text: '[INFO] Running com.devops.app.HealthControllerTest', type: 'info-msg', delay: 400 },
            { text: '[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.876 s', type: 'success-msg', delay: 1000 },
            { text: '[INFO] Results: Tests run: 3, Failures: 0, Errors: 0, Skipped: 0', type: 'success-msg', delay: 1300 },
            { text: 'JUnit Unit Test execution completed successfully. All assertions passed.', type: 'success-msg', delay: 1500 }
        ],
        fail: [
            { text: '[INFO] --- maven-surefire-plugin:3.1.2:test (default-test) ---', type: 'muted-msg', delay: 100 },
            { text: '[INFO] Running com.devops.app.HealthControllerTest', type: 'info-msg', delay: 400 },
            { text: '[ERROR] Failures: ', type: 'error-msg', delay: 800 },
            { text: '[ERROR]   HealthControllerTest.testGetHealth:34 Expected UP but was DOWN', type: 'error-msg', delay: 1100 },
            { text: '[ERROR] Tests run: 3, Failures: 1, Errors: 0', type: 'error-msg', delay: 1400 }
        ]
    },
    containerize: {
        success: [
            { text: 'docker build -t devops-java-app:1.0.0 -f Dockerfile .', type: 'info-msg', delay: 100 },
            { text: 'Sending build context to Docker daemon  2.41MB', type: 'muted-msg', delay: 300 },
            { text: 'Step 1/12 : FROM maven:3.9.6-eclipse-temurin-17-alpine AS builder', type: 'muted-msg', delay: 500 },
            { text: 'Step 5/12 : RUN mvn clean package -DskipTests ... success', type: 'muted-msg', delay: 900 },
            { text: 'Successfully built image devops-java-app:latest (size: 145MB)', type: 'success-msg', delay: 1300 },
            { text: 'docker push docker.io/devops/java-devops-app:1.0.0', type: 'info-msg', delay: 1500 },
            { text: 'SUCCESS: Container image pushed to Docker Hub registry.', type: 'success-msg', delay: 1800 }
        ],
        fail: [
            { text: 'docker build -t devops-java-app:1.0.0 -f Dockerfile .', type: 'info-msg', delay: 100 },
            { text: 'Step 5/12 : RUN mvn clean package -DskipTests', type: 'muted-msg', delay: 450 },
            { text: '[ERROR] Connection timeout to Docker Engine registry socket.', type: 'error-msg', delay: 800 },
            { text: '[ERROR] Docker build process failed to execute upload requests.', type: 'error-msg', delay: 1100 }
        ]
    }
};

// ----------------------------------------------------
// CHART CONFIGURATIONS & SCRAPING ENGINE
// ----------------------------------------------------
function initCharts() {
    const ctxCpu = document.getElementById('cpuChart').getContext('2d');
    const ctxMem = document.getElementById('memoryChart').getContext('2d');

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                color: '#8b9bb4',
                font: { family: 'Outfit', size: 11, weight: '600' }
            }
        },
        scales: {
            x: { display: false },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color: '#8b9bb4', font: { family: 'JetBrains Mono', size: 8 } },
                min: 0,
                max: 100
            }
        }
    };

    cpuChart = new Chart(ctxCpu, {
        type: 'line',
        data: {
            labels: Array(15).fill(''),
            datasets: [
                { data: Array(15).fill(0), borderColor: '#58a6ff', borderWidth: 2, tension: 0.4, fill: false, pointRadius: 0 },
                { data: Array(15).fill(0), borderColor: '#ab47bc', borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0 },
                { data: Array(15).fill(0), borderColor: '#3fb950', borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0 }
            ]
        },
        options: {
            ...chartOptions,
            plugins: { ...chartOptions.plugins, title: { ...chartOptions.plugins.title, text: 'CONTAINER CPU UTILIZATION (%)' } }
        }
    });

    memoryChart = new Chart(ctxMem, {
        type: 'line',
        data: {
            labels: Array(15).fill(''),
            datasets: [
                { data: Array(15).fill(0), borderColor: '#58a6ff', borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 },
                { data: Array(15).fill(0), borderColor: '#ab47bc', borderWidth: 1.5, tension: 0.3, fill: false, pointRadius: 0 },
                { data: Array(15).fill(0), borderColor: '#3fb950', borderWidth: 1.5, tension: 0.3, fill: false, pointRadius: 0 }
            ]
        },
        options: {
            ...chartOptions,
            plugins: { ...chartOptions.plugins, title: { ...chartOptions.plugins.title, text: 'CONTAINER MEMORY ALLOCATED (MB)' } },
            scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 512 } }
        }
    });
}

function updateMetrics(active = true, oom = false) {
    clearInterval(metricsInterval);
    
    if (!active) {
        cpuChart.data.datasets.forEach(ds => ds.data.fill(0));
        memoryChart.data.datasets.forEach(ds => ds.data.fill(0));
        cpuChart.update();
        memoryChart.update();
        document.getElementById('val-rt').textContent = '--';
        document.getElementById('val-throughput').textContent = '0 req/s';
        document.getElementById('val-err').textContent = '0.00%';
        
        dockerContainers.forEach(c => { c.cpu = 0; c.memory = 0; });
        renderContainersGrid();
        return;
    }

    if (oom) {
        cpuChart.data.datasets.forEach(ds => {
            ds.data.shift();
            ds.data.push(98 + Math.random() * 2);
        });
        memoryChart.data.datasets.forEach(ds => {
            ds.data.shift();
            ds.data.push(512);
        });
        cpuChart.update();
        memoryChart.update();
        document.getElementById('val-rt').textContent = '12000ms';
        document.getElementById('val-throughput').textContent = '0 req/s';
        document.getElementById('val-err').textContent = '100.00%';
        
        dockerContainers.forEach(c => { c.cpu = 99; c.memory = 512; });
        renderContainersGrid();
        return;
    }

    // Normal active metric cycle
    metricsInterval = setInterval(() => {
        const activeContainers = dockerContainers.filter(c => c.status === 'RUNNING');
        if (activeContainers.length === 0) return;
        
        activeContainers.forEach((container, index) => {
            container.cpu = Math.round(15 + Math.random() * 25);
            container.memory = Math.round(180 + Math.random() * 60);
            
            const datasetIndex = index % 3;
            cpuChart.data.datasets[datasetIndex].data.shift();
            cpuChart.data.datasets[datasetIndex].data.push(container.cpu);
            
            memoryChart.data.datasets[datasetIndex].data.shift();
            memoryChart.data.datasets[datasetIndex].data.push(container.memory);
        });
        
        cpuChart.update();
        memoryChart.update();
        renderContainersGrid();

        document.getElementById('val-rt').textContent = Math.round(35 + Math.random() * 20) + 'ms';
        document.getElementById('val-throughput').textContent = Math.round(180 + Math.random() * 80) * activeContainers.length + ' req/s';
        document.getElementById('val-err').textContent = (Math.random() * 0.01).toFixed(2) + '%';
    }, 2000);
}

// Reset Pipeline Status States
function resetPipelineUI() {
    pipelineIsRunning = false;
    clearInterval(pipelineTimerInterval);
    clearInterval(metricsInterval);
    pipelineSeconds = 0;
    timerBadge.textContent = '0.0s';
    statusBadge.textContent = 'READY';
    statusBadge.className = 'badge';
    
    for (const key in stages) {
        updateStageState(key, 'pending');
    }
    
    // Clear and restore original 3 containers
    dockerContainers = [
        { id: `java-web-app-${generateShortSHA()}`, name: 'container-1', status: 'RUNNING', cpu: 22, memory: 184, version: '8f5b3a9', startTime: Date.now() },
        { id: `java-web-app-${generateShortSHA()}`, name: 'container-2', status: 'RUNNING', cpu: 18, memory: 195, version: '8f5b3a9', startTime: Date.now() },
        { id: `java-web-app-${generateShortSHA()}`, name: 'container-3', status: 'RUNNING', cpu: 25, memory: 172, version: '8f5b3a9', startTime: Date.now() }
    ];
    
    scaleSlider.value = 3;
    scaleDisplay.textContent = '3';
    
    renderContainersGrid();
    updateMetrics(true, false);
    
    envStatusText.textContent = 'Production Host VM Online';
    envStatusDot.className = 'status-dot green pulse';
}

function updateStageState(stageKey, state, duration = '') {
    const stage = stages[stageKey];
    if (!stage) return;
    
    stage.element.classList.remove('pending', 'running', 'passed', 'failed');
    stage.element.classList.add(state);

    if (duration) {
        stage.element.querySelector('.stage-duration').textContent = duration;
    } else if (state === 'running') {
        stage.element.querySelector('.stage-duration').textContent = 'running...';
    } else {
        stage.element.querySelector('.stage-duration').textContent = '--';
    }

    if (stage.connector) {
        stage.connector.classList.remove('running', 'passed', 'failed');
        if (state === 'running') stage.connector.classList.add('running');
        else if (state === 'passed') stage.connector.classList.add('passed');
        else if (state === 'failed') stage.connector.classList.add('failed');
    }
}

function log(msg, type = 'info-msg') {
    const p = document.createElement('div');
    p.className = `log-line ${type}`;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logsConsole.appendChild(p);
    logsConsole.scrollTop = logsConsole.scrollHeight;
}

function clearConsole() {
    logsConsole.innerHTML = '';
}

// ----------------------------------------------------
// FILE-BASED JSON LOADER (run-pipeline.ps1 Integration)
// ----------------------------------------------------
async function loadLatestPipelineRun() {
    clearConsole();
    log('Orchestrator: Fetching pipeline-run.json...', 'system-msg');
    
    try {
        const response = await fetch('pipeline-run.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const runData = await response.json();
        log(`Run metadata loaded. Status: ${runData.status}, Timestamp: ${runData.timestamp}`, 'system-msg');

        // Apply stages status
        runData.stages.forEach(s => {
            let key = '';
            if (s.name === 'Checkout') key = 'checkout';
            else if (s.name === 'Build') key = 'build';
            else if (s.name === 'Test') key = 'test';
            else if (s.name === 'Security Scan') key = 'security';
            else if (s.name === 'Containerize') key = 'containerize';
            else if (s.name === 'Deploy') key = 'deploy';

            if (key) {
                let uiStatus = 'pending';
                if (s.status === 'PASSED') uiStatus = 'passed';
                else if (s.status === 'FAILED') uiStatus = 'failed';
                else if (s.status === 'IN_PROGRESS') uiStatus = 'running';

                updateStageState(key, uiStatus, s.duration);
                
                // Write stage logs
                if (s.logs && s.logs.length > 0) {
                    log(`--- Logs for stage [${s.name}] ---`, 'system-msg');
                    s.logs.forEach(l => {
                        let logType = 'info-msg';
                        if (l.includes('[ERROR]') || l.includes('FAILED')) logType = 'error-msg';
                        else if (l.includes('[WARNING]') || l.includes('vulnerability')) logType = 'warning-msg';
                        else if (l.includes('SUCCESS') || l.includes('PASSED')) logType = 'success-msg';
                        else if (l.includes('[INFO]')) logType = 'muted-msg';
                        log(l, logType);
                    });
                }
            }
        });

        statusBadge.textContent = runData.status;
        if (runData.status === 'SUCCESS') {
            statusBadge.className = 'badge success';
            envStatusText.textContent = 'Production Host VM Online';
            envStatusDot.className = 'status-dot green pulse';
            dockerContainers.forEach(c => {
                c.status = 'RUNNING';
                c.version = 'New Rollout';
            });
            renderContainersGrid();
            updateMetrics(true, false);
            showToast('Loader Success', 'Loaded successful run from JSON file.', 'success');
        } else {
            statusBadge.className = 'badge error';
            envStatusText.textContent = 'Host VM Unstable - Deployment Failed';
            envStatusDot.className = 'status-dot red pulse';
            updateMetrics(false, false);
            showToast('Loader Error', 'Loaded failed run from JSON file.', 'error');
        }

    } catch (err) {
        log(`Failed to load pipeline run data. Details: ${err.message}`, 'error-msg');
        log('NOTE: Make sure to execute run-pipeline.ps1 locally to create pipeline-run.json, and run the dashboard through a local web server to bypass browser file CORS restrictions.', 'warning-msg');
        showToast('Load Failed', 'CORS restriction or file missing. See terminal logs.', 'warning');
    }
}
