// staff.js
export class StaffManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.stationId = null;
    }

    setStationId(id) {
        this.stationId = id;
    }

    async loadStaff() {
        if (!this.stationId) return;
        const list = document.getElementById('staff-list');
        list.innerHTML = 'Loading...';
        
        const { data, error } = await this.supabase
            .from('staff')
            .select('*')
            .eq('station_id', this.stationId)
            .order('name');
            
        list.innerHTML = '';
        
        if (error) {
            console.error(error);
            list.innerHTML = '<p style="color:red">Error loading staff</p>';
            return;
        }

        if (data && data.length > 0) {
            data.forEach(s => {
                list.innerHTML += `
                    <div class="staff-item">
                        <div class="staff-info">
                            <b>${s.name}</b>
                            <span style="font-size:0.85em; color:#666; display:block;">
                                ID: ${s.phone} | PIN: ${s.pin}
                            </span>
                        </div>
                        <button onclick="window.StaffApp.remove('${s.id}')" class="icon-btn-danger">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>`;
            });
        } else {
            list.innerHTML = '<p style="padding:10px; color:#666;">No staff found.</p>';
        }
        
        if(window.lucide) lucide.createIcons();
    }

    async add() {
        const nameInput = document.getElementById('newStaffName');
        const phoneInput = document.getElementById('newStaffPhone');
        const pinInput = document.getElementById('newStaffPin'); // NEW

        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const pin = pinInput.value.trim(); // NEW

        if (!name || !phone || !pin) return alert("Please fill Name, Phone, and PIN.");
        if (!this.stationId) return;

        const btn = document.getElementById('btnAddStaff');
        btn.innerText = '...';
        btn.disabled = true;

        const { error } = await this.supabase
            .from('staff')
            .insert({ 
                station_id: this.stationId, 
                name: name, 
                phone: phone,
                pin: pin // NEW
            });

        btn.innerText = 'Add';
        btn.disabled = false;

        if (error) {
            alert("Error: " + error.message);
        } else {
            nameInput.value = '';
            phoneInput.value = '';
            pinInput.value = '';
            this.loadStaff();
        }
    }

    async remove(id) {
        if(!confirm("Remove this staff member?")) return;
        const { error } = await this.supabase.from('staff').delete().eq('id', id);
        if (error) alert("Error: " + error.message);
        else this.loadStaff();
    }
}