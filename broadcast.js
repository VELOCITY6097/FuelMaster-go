/**
 * broadcast.js
 * Handles Maintenance Mode and Interactive Broadcast Banners
 */

export async function initBroadcast(supabase) {
    console.log("📡 Broadcast System: Online");

    try {
        const { data, error } = await supabase
            .from('system_settings').select('*').eq('id', 1).single();
        if (data && !error) applySystemState(data);
    } catch (err) { console.error(err); }

    supabase.channel('client-broadcast')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings', filter: 'id=eq.1' },
            (payload) => applySystemState(payload.new)
        ).subscribe();
}

function applySystemState(settings) {
    // 1. Kill Switch
    if (settings.downtime_active) triggerMaintenanceLock();
    else liftMaintenanceLock();

    // 2. Broadcast Ribbon
    if (settings.broadcast_msg && settings.broadcast_msg.trim() !== "") {
        showBroadcastBanner(settings.broadcast_msg, settings.broadcast_type || 'info');
    } else {
        hideBroadcastBanner();
    }
}

/* --- BANNER LOGIC --- */
function showBroadcastBanner(msg, type) {
    hideBroadcastBanner(); // Clean up old

    let banner = document.createElement('div');
    banner.id = 'global-broadcast-banner';
    banner.className = `broadcast-banner ${type}`;
    
    // Add Click Event for Popup
    banner.onclick = (e) => {
        // Don't open if clicking the close button
        if(e.target.closest('.broadcast-close')) return;
        openBroadcastPopup(msg, type);
    };

    const icons = { 'info': 'info', 'warning': 'alert-triangle', 'critical': 'alert-octagon' };
    const iconName = icons[type] || 'info';

    banner.innerHTML = `
        <div class="broadcast-icon-box">
            <i data-lucide="${iconName}" width="20"></i>
        </div>
        
        <div class="broadcast-marquee">
            <span class="broadcast-text">
                ${msg} <span class="click-hint">Click for details</span> &nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp; 
                ${msg} <span class="click-hint">Click for details</span>
            </span>
        </div>

        <button class="broadcast-close" onclick="this.closest('.broadcast-banner').remove()">
            <i data-lucide="x" width="20"></i>
        </button>
    `;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.prepend(banner);
    else document.body.insertBefore(banner, document.body.firstChild);
    
    if(window.lucide) lucide.createIcons();
}

function hideBroadcastBanner() {
    const banner = document.getElementById('global-broadcast-banner');
    if (banner) banner.remove();
}

/* --- POPUP LOGIC --- */
function openBroadcastPopup(msg, type) {
    // Create Popup Overlay if not exists
    let overlay = document.getElementById('broadcast-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'broadcast-popup-overlay';
        document.body.appendChild(overlay);
    }

    const titles = { 'info': 'Information', 'warning': 'System Warning', 'critical': 'Critical Alert' };
    const icons = { 'info': 'info', 'warning': 'alert-triangle', 'critical': 'alert-octagon' };

    overlay.innerHTML = `
        <div class="broadcast-popup-card">
            <div class="broadcast-popup-header ${type}">
                <i data-lucide="${icons[type]}" width="24"></i>
                <h3>${titles[type]}</h3>
                <button onclick="document.getElementById('broadcast-popup-overlay').style.display='none'" style="background:none; border:none; color:white; cursor:pointer;">
                    <i data-lucide="x" width="24"></i>
                </button>
            </div>
            <div class="broadcast-popup-body">
                ${msg}
            </div>
            <div class="broadcast-popup-footer">
                <button class="primary-btn" onclick="document.getElementById('broadcast-popup-overlay').style.display='none'" style="padding:10px 20px;">Dismiss</button>
            </div>
        </div>
    `;

    overlay.style.display = 'flex';
    if(window.lucide) lucide.createIcons();
}

/* --- LOCK LOGIC --- */
function triggerMaintenanceLock() {
    localStorage.removeItem('fm_station_id');
    localStorage.removeItem('fm_user_role');
    
    const loginPanel = document.getElementById('login-panel');
    const appScreen = document.getElementById('app-screen');
    if(loginPanel) { appScreen.style.display = 'none'; loginPanel.style.display = 'flex'; document.getElementById('loginForm').reset(); }

    if (!document.getElementById('maintenance-overlay')) {
        let lock = document.createElement('div');
        lock.id = 'maintenance-overlay';
        lock.innerHTML = `<div class="lock-card"><h2 style="color:#ef4444">System Maintenance</h2><p>Locked by Administrator.</p><div class="loader-bar"></div></div>`;
        document.body.appendChild(lock);
    }
    document.body.classList.add('locked-mode');
}

function liftMaintenanceLock() {
    const lock = document.getElementById('maintenance-overlay');
    if (lock) lock.remove();
    document.body.classList.remove('locked-mode');
}
