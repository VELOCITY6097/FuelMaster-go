// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered'))
            .catch(err => console.log('Service Worker Failed', err));
    });
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StaffManager } from "./staff.js";

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://hmfuxypluzozbwoleqnn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mP-3LuhOE7uXLOV5t4IrBg_WWvUUmmb';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const staffManager = new StaffManager(supabase);
window.StaffApp = staffManager;

// --- STATE MANAGEMENT ---
let currentStation = null;
let currentTank = null;
let systemCharts = null; 
let systemDensity = null; 
let currentUserRole = 'manager'; 
let systemStatusLive = false;

const getDensityTable = () => systemDensity || window.densityTable; 

// --- THEME DEFINITIONS ---
const THEMES = {
    'bpcl': { primary: '#fbbf24', text: '#d97706', bg: '#fffbeb' }, 
    'iocl': { primary: '#f97316', text: '#c2410c', bg: '#fff7ed' }, 
    'hpcl': { primary: '#ef4444', text: '#b91c1c', bg: '#fef2f2' }, 
    'jio':  { primary: '#10b981', text: '#047857', bg: '#ecfdf5' }  
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    checkSession();
    
    // Auto-fill login if remembered
    const savedId = localStorage.getItem('fm_saved_id');
    const savedPass = localStorage.getItem('fm_saved_pass');
    if (savedId && savedPass) {
        document.getElementById('login-user').value = savedId;
        document.getElementById('login-pass').value = savedPass;
        document.getElementById('rememberMe').checked = true;
    }
});

// --- CUSTOM ALERT & TOAST UTILS ---
window.showCustomAlert = (msg, title = "Notice", onConfirm = null) => {
    const overlay = document.getElementById('custom-alert');
    if(!overlay) {
        if(onConfirm) {
            if(confirm(msg)) onConfirm();
        } else {
            alert(msg);
        }
        return;
    }

    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-msg').innerText = msg;

    const okBtn = document.getElementById('custom-alert-ok-btn');
    const confirmButtons = document.getElementById('custom-confirm-buttons');
    const confirmBtn = document.getElementById('custom-alert-confirm-btn');

    if (onConfirm) {
        okBtn.style.display = 'none';
        confirmButtons.style.display = 'grid';

        confirmBtn.onclick = () => {
            closeCustomAlert();
            onConfirm();
        };
    } else {
        okBtn.style.display = 'block';
        confirmButtons.style.display = 'none';
    }

    overlay.style.display = 'flex';
};

window.closeCustomAlert = () => {
    document.getElementById('custom-alert').style.display = 'none';
};

function showUpdateToast(msg = "System Sync Complete") {
    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.innerHTML = `<i data-lucide="refresh-cw" width="14"></i> ${msg}`;
    document.body.appendChild(toast);
    if(window.lucide) lucide.createIcons();
    setTimeout(() => toast.remove(), 3000);
}

// --- EVENT BINDING ---
function bindEvents() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('btnTogglePass').addEventListener('click', togglePassword);
    
    // Navigation
    window.switchView = (id) => {
        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        setTimeout(() => {
            const target = document.getElementById(`view-${id}`);
            if(target) {
                target.classList.remove('hidden');
                target.style.display = 'block';
                void target.offsetWidth; 
                target.classList.add('active');
            }
        }, 50);

        if(id === 'home' && !systemStatusLive) testConnections();
        if(window.lucide) lucide.createIcons();
    };

    // Staff Modal
    const modal = document.getElementById('staff-modal');
    document.getElementById('btnStaff').addEventListener('click', () => { 
        modal.style.display = 'flex'; 
        staffManager.loadStaff(); 
    });
    document.getElementById('btnCloseStaff').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btnAddStaff').addEventListener('click', () => staffManager.add());
    
    // Logout & Refresh
    document.getElementById('btnLogout')?.addEventListener('click', logout);
    document.getElementById('btnHeaderLogout').addEventListener('click', logout);
    document.getElementById('btnRefreshConn').addEventListener('click', testConnections);

    // Density Calculator
    document.getElementById('btnCalcDensity').addEventListener('click', calculateDensityFromTable);
    document.getElementById('btnResetDensity').addEventListener('click', () => {
        document.getElementById('inpTemp').value = '';
        document.getElementById('inpDen').value = '';
        document.getElementById('density-result').classList.add('hidden');
    });

    // Stock Calculator
    document.getElementById('btnCalcVolume').addEventListener('click', calculateVolumeFromChart);
    document.getElementById('btnResetStock').addEventListener('click', () => {
        document.getElementById('inpDip').value = '';
        const volRes = document.getElementById('volume-result');
        volRes.classList.add('hidden');
        volRes.innerHTML = `
            <div>
                <span class="label">Current Stock</span>
                <span id="resVolume" class="val">0</span>
                <small>Liters</small>
            </div>
        `;
    });

    // Invoice Audit
    document.getElementById('btnCalcInvoice').addEventListener('click', verifyInvoice);
    document.getElementById('btnResetInvoice').addEventListener('click', () => {
        document.getElementById('tkrObsDensity').value = '';
        document.getElementById('tkrTemp').value = '';
        document.getElementById('challanDensity').value = '';
        document.getElementById('resInvoice').innerHTML = '';
    });
}

// --- ASSET LOADING ---
async function loadSystemAssets() {
    try {
        const { data: chartsData } = await supabase.from('system_assets').select('data').eq('key', 'tank_charts').single();
        if (chartsData) systemCharts = chartsData.data;

        const { data: densityData } = await supabase.from('system_assets').select('data').eq('key', 'density_table').single();
        if (densityData) systemDensity = densityData.data;
    } catch (err) { console.error(err); }
}

// --- AUTHENTICATION ---
async function checkSession() {
    const storedStationId = localStorage.getItem('fm_station_id');
    const storedRole = localStorage.getItem('fm_user_role'); 

    if (storedStationId) {
        currentUserRole = storedRole || 'manager';
        const { data, error } = await supabase.from('stations').select('*').eq('station_id', storedStationId).single();
        if (data && !error) {
            initApp(data);
        } else {
            showLogin();
        }
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-panel').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const remember = document.getElementById('rememberMe').checked;
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('login-error');

    err.innerText = "";
    btn.innerHTML = '<div class="spinner-mini"></div> Connecting...';
    btn.disabled = true;

    try {
        let stationData = null;
        let role = 'manager';

        // 1. Try Manager
        const { data: managerData } = await supabase
            .from('stations').select('*').eq('manager_user', user).eq('manager_pass', pass).maybeSingle();

        if (managerData) {
            stationData = managerData;
            role = 'manager';
        } else {
            // 2. Try Staff
            const { data: staffData } = await supabase
                .from('staff').select('*, stations(*)').eq('phone', user).eq('pin', pass).maybeSingle();

            if (staffData && staffData.stations) {
                stationData = staffData.stations; 
                role = 'staff';
            }
        }

        if (!stationData) throw new Error("Invalid ID or Password");

        if (remember) {
            localStorage.setItem('fm_saved_id', user);
            localStorage.setItem('fm_saved_pass', pass);
        } else {
            localStorage.removeItem('fm_saved_id');
            localStorage.removeItem('fm_saved_pass');
        }

        localStorage.setItem('fm_station_id', stationData.station_id);
        localStorage.setItem('fm_user_role', role); 
        
        currentUserRole = role;
        initApp(stationData);

    } catch (error) {
        err.innerText = error.message;
        btn.innerHTML = '<span>Connect Station</span><i data-lucide="arrow-right"></i>';
        btn.disabled = false;
        if(window.lucide) lucide.createIcons();
    }
}

// --- APP INITIALIZATION ---
async function initApp(stationData) {
    currentStation = stationData;
    staffManager.setStationId(stationData.station_id);

    await loadSystemAssets();

    document.getElementById('login-panel').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    
    setTimeout(() => {
        const home = document.getElementById('view-home');
        if(home) {
            home.classList.remove('hidden'); 
            home.style.display = 'block';
            home.classList.add('active');
        }
    }, 100);
    
    updateUI(stationData);
    initRealtime(stationData.station_id);
    renderTanks(stationData.tanks || []);
    testConnections(); 
    
    if(window.lucide) lucide.createIcons();
}

function updateUI(data) {
    document.getElementById('display-station-name').innerText = data.name; 
    
    const tankSummaryEl = document.getElementById('station-tank-summary');
    if (tankSummaryEl && data.tanks) {
        const names = data.tanks.map(t => t.name).join(', ');
        tankSummaryEl.innerText = `${data.tanks.length} Active Tanks: ${names}`;
        tankSummaryEl.style.fontSize = "0.85rem";
        tankSummaryEl.style.opacity = "0.8";
        tankSummaryEl.style.marginTop = "5px";
    }

    if (currentUserRole === 'staff') {
        document.getElementById('btnStaff').style.display = 'none';
    } else {
        document.getElementById('btnStaff').style.display = 'flex';
    }
    // Logout always visible
    document.getElementById('btnHeaderLogout').style.display = 'flex';

    // Theme Application
    if (data.theme && THEMES[data.theme]) {
        const t = THEMES[data.theme];
        document.documentElement.style.setProperty('--primary', t.primary);
        document.documentElement.style.setProperty('--primary-dark', t.text);
        document.documentElement.style.setProperty('--primary-light', t.bg);
        document.documentElement.style.setProperty('--primary-glow', t.primary + '40'); 
    }
}

// --- REALTIME UPDATES ---
function initRealtime(stationId) {
    supabase.channel('station-updates')
    .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stations', filter: `station_id=eq.${stationId}` },
        (payload) => {
            currentStation = payload.new;
            updateUI(currentStation);
            renderTanks(currentStation.tanks);
            showUpdateToast("Station Data Updated");
        }
    )
    .subscribe();
}

// --- HELPER: SIMULATE CALCULATION ---
async function simulateCalculation(btnId, resultId, duration = 800) {
    const btn = document.getElementById(btnId);
    const res = document.getElementById(resultId);
    
    const originalText = btn.innerText;
    btn.innerHTML = `<div class="spinner-mini"></div> Calculating...`;
    btn.disabled = true;
    res.classList.add('hidden'); 

    await new Promise(r => setTimeout(r, duration));

    btn.innerText = originalText;
    btn.disabled = false;
    res.classList.remove('hidden');
    res.classList.add('pop-in'); 
    
    setTimeout(() => res.classList.remove('pop-in'), 500);
}

// --- 1. DENSITY CALCULATOR ---
async function calculateDensityFromTable() {
    const tempInput = parseFloat(document.getElementById('inpTemp').value);
    const denInput = parseFloat(document.getElementById('inpDen').value);
    
    if (isNaN(tempInput) || isNaN(denInput)) return showCustomAlert("Please enter valid Temperature and Density values.");

    await simulateCalculation('btnCalcDensity', 'density-result');

    const table = getDensityTable(); 
    if(!table) return showCustomAlert("System Assets Loading...");

    const roundedTemp = (Math.round(tempInput * 2) / 2).toFixed(1);
    const densityArray = table[roundedTemp];

    if (!densityArray) return showCustomAlert("Temperature out of range (0-50°C)");

    const index = Math.round(denInput - 700);
    if (index < 0 || index >= densityArray.length) return showCustomAlert("Density out of range (700-1000)");

    document.getElementById('resDensity').innerText = densityArray[index] + " kg/m³";
}

// --- 2. TANK RENDERER ---
function renderTanks(tanks) {
    const container = document.getElementById('tank-selector-wrapper');
    if(!container) return;
    container.innerHTML = '';
    
    tanks.forEach((tank, index) => {
        const btn = document.createElement('button');
        
        // Preserve active state if re-rendering or default to first
        const isActive = (currentTank && currentTank.name === tank.name) || (!currentTank && index === 0);
        btn.className = `tank-btn ${isActive ? 'active' : ''}`;
        if(isActive) {
            currentTank = tank; // Ensure logic matches visual
            document.getElementById('active-tank-label').innerText = tank.name;
        }

        btn.innerHTML = `<i data-lucide="cylinder"></i><span>${tank.name}</span>`;
        btn.onclick = () => {
            currentTank = tank;
            document.querySelectorAll('.tank-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('active-tank-label').innerText = tank.name;
            document.getElementById('volume-result').classList.add('hidden');
        };
        container.appendChild(btn);
    });
    
    if(window.lucide) lucide.createIcons();
}

// --- 3. STOCK CALCULATOR (UPDATED ICON) ---
async function calculateVolumeFromChart() {
    const dipInput = parseFloat(document.getElementById('inpDip').value);
    
    if (isNaN(dipInput)) return showCustomAlert("Please enter a valid Dip value.");
    if (!currentTank || !systemCharts) return showCustomAlert("System Loading...");

    // Hide result box first and clear content
    const resContainer = document.getElementById('volume-result');
    resContainer.classList.add('hidden');
    resContainer.innerHTML = ''; 

    const chartKey = `${currentTank.type}_CHART`; 
    const chart = systemCharts[chartKey];
    
    if (!chart) {
        return showCustomAlert(`Chart data missing for ${currentTank.type}`);
    }

    // RANGE CHECK LOGIC
    const dips = Object.keys(chart).map(Number).sort((a, b) => a - b);
    const minDip = dips[0];
    const maxDip = dips[dips.length - 1];

    if (dipInput < minDip || dipInput > maxDip) {
        return showCustomAlert(`Dip value ${dipInput} is out of range.\nMin: ${minDip}, Max: ${maxDip}`);
    }

    await simulateCalculation('btnCalcVolume', 'volume-result');

    let finalVol = 0;
    // Exact Match Logic with Interpolation
    if (chart[dipInput.toFixed(1)]) {
        finalVol = chart[dipInput.toFixed(1)];
    } else if (chart[dipInput.toFixed(2)]) {
        finalVol = chart[dipInput.toFixed(2)];
    } else {
        // Interpolation
        let lowerDip = null, upperDip = null;

        for (let i = 0; i < dips.length; i++) {
            if (dips[i] <= dipInput) lowerDip = dips[i];
            if (dips[i] > dipInput) { upperDip = dips[i]; break; }
        }

        if (lowerDip !== null && upperDip !== null) {
             const getVol = (v) => chart[v.toFixed(1)] || chart[v.toFixed(2)];
             const lowerVol = getVol(lowerDip);
             const upperVol = getVol(upperDip);
             finalVol = lowerVol + ((upperVol - lowerVol) / (upperDip - lowerDip)) * (dipInput - lowerDip);
        }
    }
    
    // RENDER NEW RESULT HTML (THEME BOX)
    const volString = Math.floor(finalVol).toLocaleString(); 
    
    resContainer.innerHTML = `
        <div class="theme-box pop-in">
            <div>
                <span class="label">Current Volume</span>
                <div class="val">${volString}<small>L</small></div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-droplet vol-icon">
                <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
            </svg>
        </div>
    `;
    
    resContainer.classList.remove('hidden');
}

// --- 4. INVOICE AUDIT (UPDATED UNSELECTABLE DETAILS) ---
async function verifyInvoice() {
    const tkrObs = parseFloat(document.getElementById('tkrObsDensity').value);
    const tkrTemp = parseFloat(document.getElementById('tkrTemp').value);
    const challan = parseFloat(document.getElementById('challanDensity').value);
    
    if (isNaN(tkrObs) || isNaN(tkrTemp) || isNaN(challan)) return showCustomAlert("Please fill all fields correctly.");

    const resBox = document.getElementById('resInvoice');
    resBox.innerHTML = ''; 

    // Loading State
    const loadingDiv = document.createElement('div');
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '20px';
    loadingDiv.innerHTML = `
        <div class="spinner-mini spinner-result darker"></div>
        <div style="margin-top:10px; font-size:0.9rem; color:var(--text-muted);">Verifying density...</div>
    `;
    resBox.appendChild(loadingDiv);
    
    await new Promise(r => setTimeout(r, 800));

    const table = getDensityTable();
    if (!table) return showCustomAlert("System Loading...");

    const roundedTemp = (Math.round(tkrTemp * 2) / 2).toFixed(1);
    const arr = table[roundedTemp];
    
    resBox.innerHTML = ''; // Clear loading

    if(!arr) {
        resBox.innerHTML = '<p style="color:red;text-align:center;">Temperature Error</p>';
        return;
    }
    
    const idx = Math.round(tkrObs - 700);
    const calcStd = arr[idx];
    
    if(!calcStd) {
        resBox.innerHTML = '<p style="color:red;text-align:center;">Density Error</p>';
        return;
    }

    const diff = (calcStd - challan).toFixed(1);
    const isPass = Math.abs(diff) <= 3.0;

    // Render Detailed Result
    const statusClass = isPass ? 'pass' : 'fail';
    const iconName = isPass ? 'check' : 'x';
    const statusText = isPass ? 'AUDIT PASSED' : 'AUDIT FAILED';

    const resultHTML = `
        <div class="audit-result ${statusClass}">
            <div class="audit-icon">
                <i data-lucide="${iconName}"></i>
            </div>
            <h3>${statusText}</h3>
            
            <div style="width:100%; margin-top:10px; border-top:1px solid rgba(0,0,0,0.05); padding-top:10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
                    <span style="opacity:0.7">Calculated Density:</span>
                    <span style="font-weight:700">${calcStd.toFixed(1)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
                    <span style="opacity:0.7">Invoice Density:</span>
                    <span style="font-weight:700">${challan.toFixed(1)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                    <span style="opacity:0.7">Difference:</span>
                    <span style="font-weight:700; color:${Math.abs(diff) > 3 ? 'var(--danger)' : 'var(--text-main)'}">${diff > 0 ? '+' : ''}${diff}</span>
                </div>
            </div>

            ${!isPass ? `<div class="warning-box">DO NOT UNLOAD TANKER<br>RECHECK DENSITY</div>` : ''}
        </div>
    `;

    resBox.innerHTML = resultHTML;
    if(window.lucide) lucide.createIcons();
}

// --- UTILITIES ---
window.togglePassword = () => {
    const x = document.getElementById('login-pass');
    const btn = document.getElementById('btnTogglePass');
    if (x.type === 'password') {
        x.type = 'text';
        btn.style.color = 'var(--primary)';
    } else {
        x.type = 'password';
        btn.style.color = 'var(--text-muted)';
    }
};

window.logout = () => { 
    localStorage.removeItem('fm_station_id'); 
    localStorage.removeItem('fm_user_role');
    location.reload(); 
};

window.testConnections = async () => {
    const pulseEl = document.getElementById('system-pulse');
    const textEl = document.getElementById('system-text');
    const detailsEl = document.getElementById('system-details');
    const btn = document.getElementById('btnRefreshConn');

    if(!pulseEl) return;

    if(btn) btn.classList.add('fa-spin'); 
    
    pulseEl.className = "pulse-dot"; 
    pulseEl.style.backgroundColor = "#fbbf24"; 
    textEl.innerText = "SYNCING...";
    textEl.style.color = "#d97706";
    detailsEl.innerHTML = "<span>Verifying subsystems...</span>";

    const errors = [];
    const successes = [];

    const { error: dbError } = await supabase.from('stations').select('count', { count: 'exact', head: true });
    if (dbError) errors.push("Database Connection Failed");
    else successes.push("Database: Connected");

    const session = localStorage.getItem('fm_station_id');
    if (!session) errors.push("Admin Session Invalid");
    else successes.push("Admin Panel: Active");

    if (!systemDensity || !systemCharts) errors.push("Calc Engine: Loading Assets...");
    else successes.push("Engine: Ready (ASTM 53B)");

    await new Promise(r => setTimeout(r, 600));

    detailsEl.innerHTML = '';
    pulseEl.style.backgroundColor = ""; 

    if (errors.length > 0) {
        pulseEl.className = "pulse-dot red";
        textEl.innerText = "SYSTEM ALERT";
        textEl.style.color = "var(--danger)";
        errors.forEach(err => detailsEl.innerHTML += `<div class="error-item"><i data-lucide="alert-circle" width="12"></i> ${err}</div>`);
        systemStatusLive = false;
    } else {
        pulseEl.className = "pulse-dot green";
        textEl.innerText = "ALL SYSTEMS LIVE";
        textEl.style.color = "var(--success)";
        
        const tankCount = currentStation && currentStation.tanks ? currentStation.tanks.length : 0;
        detailsEl.innerHTML = `
            <div class="success-item"><i data-lucide="check" width="12"></i> Database</div>
            <div class="success-item"><i data-lucide="check" width="12"></i> Admin Panel</div>
            <div class="success-item"><i data-lucide="check" width="12"></i> ${tankCount} Tanks Configured</div>
        `;
        systemStatusLive = true;
    }
    
    if(window.lucide) lucide.createIcons();
    if(btn) btn.classList.remove('fa-spin');
};
