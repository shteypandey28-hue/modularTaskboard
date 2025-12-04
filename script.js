const TEAM_OPTIONS = ["Unassigned", "Alex Design", "Sam Dev", "Jordan PM", "Riley QA", "Project Lead"];
const CURRENT_USER = TEAM_OPTIONS[5];

// --- 1. WEB WORKER SETUP (Performance) ---
// We create a Blob to run the worker code without a separate file.
const workerCode = `
self.onmessage = function(e) {
    if (e.data.type === 'INIT_TASKS' || e.data.type === 'UPDATE_TASKS') {
        self.tasks = e.data.tasks;
    }
};

// Run check every 1 second (1000ms)
setInterval(() => {
    if (!self.tasks) return;
    
    const now = new Date();
    let changed = false;
    
    self.tasks.forEach(t => {
        const deadline = t.due ? new Date(t.due) : null;
        // Logic: If deadline passed, not done, and not already marked incomplete
        if (deadline && deadline < now && t.col !== 'done' && t.col !== 'incomplete') {
            t.col = 'incomplete';
            t.lateStatus = 'missed';
            
            // Add history log inside worker (simplified)
            if (!t.history) t.history = [];
            t.history.push({ 
                user: 'System', 
                action: 'Moved to incomplete (Expired)', 
                timestamp: Date.now() 
            });
            
            changed = true;
        }
    });

    if (changed) {
        self.postMessage({ type: 'TASKS_EXPIRED', tasks: self.tasks });
    }
}, 1000);
`;

const blob = new Blob([workerCode], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(blob));

// Handle messages from the Worker
worker.onmessage = function(e) {
    if (e.data.type === 'TASKS_EXPIRED') {
        tasks = e.data.tasks;
        save(false); // Save to localstorage, false = don't post to worker again (loop prevention)
    }
};

// --- MAIN APP LOGIC ---

let tasks = JSON.parse(localStorage.getItem('tasks_v5_simple')) || [
    // { id: 1, title: "Final Backend Deployment", team: ["Sam Dev"], col: "done", due: "2023-10-01T10:00", lateStatus: 'none', history: [] },
    // { id: 2, title: "Create User Onboarding Flow", team: ["Alex Design", "Project Lead"], col: "todo", due: new Date(Date.now() + 86400000).toISOString().slice(0, 16), lateStatus: 'none', history: [] },
    // { id: 3, title: "Write Release Notes", team: ["Jordan PM"], col: "progress", due: new Date(Date.now() - 3600000).toISOString().slice(0, 16), lateStatus: 'missed', history: [] },
];

// Global variable to track if a drag action is pending a date update
let pendingDropCol = null; 

// Initialize
renderBoard();
syncWorker(); // Send initial data to worker

function syncWorker() {
    worker.postMessage({ type: 'UPDATE_TASKS', tasks: tasks });
}

function createAvatarGroup(teamArray) {
    const team = Array.isArray(teamArray) && teamArray.length > 0 ? teamArray : ["Unassigned"];
    const avatarsHTML = team.map(member => {
        const initials = member === 'Unassigned' ? '?' : member.split(' ').map(n => n[0]).join('');
        return `<div class="avatar" title="${member}">${initials}</div>`;
    }).join('');
    return `<div class="avatar-group">${avatarsHTML}</div>`;
}

function logActivity(task, newColId) {
    if (!task.history) task.history = [];
    task.history.push({ user: CURRENT_USER, action: `Moved to ${newColId}`, timestamp: Date.now() });
}

function renderActivityLog(history) {
    const logElement = document.getElementById('activity-log-display');
    if (!history || history.length === 0) { logElement.innerHTML = 'No activity.'; return; }
    logElement.innerHTML = history.slice().reverse().map(log => { // slice to avoid mutating original
        return `<div class="log-item"><strong>${log.user}</strong>: ${log.action}</div>`;
    }).join('');
}

function renderBoard(filter = "") {
    const counts = { todo: 0, progress: 0, incomplete: 0, done: 0 };
    const cols = { todo: [], progress: [], incomplete: [], done: [] };

    tasks.forEach(t => {
        const teamString = Array.isArray(t.team) ? t.team.join(' ') : t.team;
        if (t.title.toLowerCase().includes(filter.toLowerCase()) || teamString.toLowerCase().includes(filter.toLowerCase())) {
            if (cols[t.col]) {
                cols[t.col].push(t);
                counts[t.col]++;
            }
        }
    });

    for (const k in cols) {
        const colEl = document.getElementById(`list-${k}`);
        if (colEl) colEl.innerHTML = cols[k].map(t => createCard(t)).join('');
        
        const countEl = document.getElementById(`c-${k}`);
        if (countEl) countEl.innerText = counts[k];
    }
    updateAnalytics(counts);
}

function createCard(t) {
    const dateObj = t.due ? new Date(t.due) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const isMissed = t.col === 'incomplete' || t.lateStatus === 'late_done' ? 'missed' : '';

    let statusTag = '';
    if (t.col === 'incomplete') statusTag = `<span class="tag" style="color:var(--danger); border-color:var(--danger)">Late</span>`;
    else if (t.lateStatus === 'late_done') statusTag = `<span class="tag" style="color:var(--warning)">Late Done</span>`;

    return `
        <div class="task-card ${isMissed}" id="${t.id}" draggable="true" ondragstart="drag(event)">
            ${statusTag}
            <div class="card-title">${t.title}</div>
            <div class="meta-row">
                ${createAvatarGroup(t.team)}
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>${dateStr}</span>
                    <span style="cursor:pointer" onclick="editTask(${t.id})">Edit</span>
                    <span style="cursor:pointer; color:var(--danger)" onclick="deleteTask(${t.id})">&times;</span>
                </div>
            </div>
        </div>
    `;
}

function getSelectedTeam() {
    const select = document.getElementById('t-team');
    if(!select) return ["Unassigned"];
    return Array.from(select.options).filter(o => o.selected && o.value !== 'Unassigned').map(o => o.value);
}

// --- 2. UPDATED SAVE LOGIC (Constraints) ---
function saveTask() {
    const id = document.getElementById('t-id').value;
    const title = document.getElementById('t-title').value;
    const team = getSelectedTeam();
    const due = document.getElementById('t-due').value;

    if (!title) return alert("Title required");

    // CONSTRAINT B: If we are in a "Rescue" state (pendingDropCol exists)
    if (pendingDropCol) {
        const now = new Date();
        const newDate = due ? new Date(due) : null;
        
        if (!newDate || newDate <= now) {
            alert("To move a task out of Incomplete, you must update the Due Date to the future.");
            return; // Block save
        }
    }

    if (id) {
        const idx = tasks.findIndex(t => t.id == id);
        let updatedTask = { ...tasks[idx], title, team, due };
        
        // Apply pending column move if valid
        if (pendingDropCol) {
            updatedTask.col = pendingDropCol;
            updatedTask.lateStatus = 'none'; // Clear late status
            updatedTask.history.push({ user: CURRENT_USER, action: `Rescued to ${pendingDropCol} (Date Updated)`, timestamp: Date.now() });
            pendingDropCol = null; // Reset flag
        } else {
            updatedTask.history.push({ user: CURRENT_USER, action: `Updated`, timestamp: Date.now() });
        }
        
        tasks[idx] = updatedTask;
    } else {
        tasks.push({ id: Date.now(), title, team, due, col: 'todo', lateStatus: 'none', history: [] });
    }
    
    closeModal(); 
    save();
}

function editTask(id) {
    // Keep `pendingDropCol` intact here so a rescue flow
    // (drag -> drop sets `pendingDropCol` -> edit modal -> save) can complete.
    // Clearing `pendingDropCol` here prevented the subsequent save from moving the task.

    const t = tasks.find(x => x.id == id);
    document.getElementById('t-id').value = t.id;
    document.getElementById('t-title').value = t.title;
    document.getElementById('t-due').value = t.due;
    
    const teamSelect = document.getElementById('t-team');
    if(teamSelect) {
        Array.from(teamSelect.options).forEach(o => o.selected = t.team.includes(o.value));
    }
    
    renderActivityLog(t.history);
    document.getElementById('task-modal').style.display = 'grid';
}

function deleteTask(id) {
    if (confirm("Delete?")) { tasks = tasks.filter(t => t.id != id); save(); }
}

function openModal() {
    pendingDropCol = null; // Ensure reset
    document.getElementById('t-id').value = '';
    document.getElementById('t-title').value = '';
    document.getElementById('t-due').value = '';
    
    const teamSelect = document.getElementById('t-team');
    if(teamSelect) {
        Array.from(teamSelect.options).forEach(o => o.selected = o.value === 'Unassigned');
    }
    
    renderActivityLog(null);
    document.getElementById('task-modal').style.display = 'grid';
}

function closeModal() { 
    pendingDropCol = null; // Clear any pending drags if cancelled
    document.getElementById('task-modal').style.display = 'none'; 
}

function allowDrop(e) { e.preventDefault(); }
function drag(e) { e.dataTransfer.setData("text", e.target.id); }

// --- 3. UPDATED DROP LOGIC (Constraints) ---
function drop(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    // Find closest column and extract ID (assuming id="col-todo", "col-done", etc)
    const colDiv = e.target.closest('.column');
    if (!colDiv) return;
    
    const targetColId = colDiv.id.replace('col-', '').replace('list-', ''); // Handle both ID naming conventions if they vary
    const t = tasks.find(x => x.id == id);

    if (t.col === targetColId) return;

    const now = new Date();
    const deadline = t.due ? new Date(t.due) : null;

    // CONSTRAINT A: Prevent manual drop to 'incomplete' unless expired
    if (targetColId === 'incomplete') {
        if (deadline && deadline > now) {
            alert("Only expired tasks can be moved to Incomplete.");
            return;
        }
    }

    // CONSTRAINT B: From Incomplete -> Todo/Progress (Rescue Mission)
    if (t.col === 'incomplete' && (targetColId === 'todo' || targetColId === 'progress')) {
        // Trigger modal, set flag, and STOP the immediate drop
        pendingDropCol = targetColId;
        editTask(t.id);
        alert(`Task is expired! Update the Due Date to move it to ${targetColId}.`);
        return; 
    }

    // CONSTRAINT B-2: From Done -> Todo/Progress (Rescue Mission when task is expired)
    // If a task is currently 'done' but its due date is in the past, moving it back
    // into active columns should trigger the same rescue flow so the worker
    // doesn't immediately re-mark it as 'incomplete'.
    if (t.col === 'done' && (targetColId === 'todo' || targetColId === 'progress')) {
        if (deadline && deadline < now) {
            pendingDropCol = targetColId;
            editTask(t.id);
            alert(`Task is expired! Update the Due Date to move it to ${targetColId}.`);
            return;
        }
    }

    // CONSTRAINT C: To Done (Always allowed)
    logActivity(t, targetColId);

    if (targetColId === 'done') {
        if (t.due && now > new Date(t.due)) t.lateStatus = 'late_done';
        else t.lateStatus = 'none';
    } else if (targetColId !== 'incomplete') {
        t.lateStatus = 'none';
    }
    
    t.col = targetColId;
    save();
}

function save(sync = true) { 
    localStorage.setItem('tasks_v5_simple', JSON.stringify(tasks)); 
    renderBoard(); 
    if(sync) syncWorker();
}

// View Switching and Analytics Helpers
function switchView(v) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${v}`);
    if(navBtn) navBtn.classList.add('active');
    
    document.getElementById('view-board').style.display = v === 'board' ? 'grid' : 'none';
    document.getElementById('view-analytics').style.display = v === 'analytics' ? 'block' : 'none';
    if (v === 'analytics') renderBoard();
}

function filterTasks() { renderBoard(document.getElementById('search-input').value); }
function toggleTheme() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function resetData() { if (confirm("Reset data?")) { localStorage.removeItem('tasks_v5_simple'); location.reload(); } }

function updateAnalytics(counts) {
    const total = tasks.length;
    const doneTotal = tasks.filter(t => t.col === 'done').length;
    const missedList = tasks.filter(t => t.col === 'incomplete' || t.lateStatus === 'late_done');

    const anTotal = document.getElementById('an-total');
    if(anTotal) anTotal.innerText = total;
    
    const anOnTime = document.getElementById('an-ontime');
    if(anOnTime) anOnTime.innerText = (doneTotal > 0 ? Math.round((tasks.filter(t => t.col === 'done' && t.lateStatus === 'none').length / doneTotal) * 100) : 0) + "%";
    
    const anLate = document.getElementById('an-late');
    if(anLate) anLate.innerText = missedList.length;

    const missedLog = document.getElementById('missed-log');
    if(missedLog) missedLog.innerHTML = missedList.map(t => `<li>${t.title}</li>`).join('') || '<span style="color:var(--text-muted)">None</span>';

    const chartData = [
        { label: 'Todo', count: counts.todo, color: '#4f46e5' },
        { label: 'Progress', count: counts.progress, color: '#f59e0b' },
        { label: 'Incomplete', count: counts.incomplete, color: '#ef4444' },
        { label: 'Done', count: counts.done, color: '#10b981' }
    ];

    const canvas = document.getElementById('taskPieChart');
    if (canvas && total > 0) {
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        let currentAngle = 0;
        let legendHTML = '';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        chartData.forEach(segment => {
            if (segment.count > 0) {
                const sliceAngle = (segment.count / total) * 2 * Math.PI;
                ctx.fillStyle = segment.color;
                ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle); ctx.closePath(); ctx.fill();
                currentAngle += sliceAngle;
                legendHTML += `<div class="legend-item"><div class="legend-color" style="background:${segment.color};"></div><span>${segment.label} (${segment.count})</span></div>`;
            }
        });
        const legend = document.getElementById('chart-legend');
        if(legend) legend.innerHTML = legendHTML;
    }
}