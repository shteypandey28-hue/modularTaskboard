import { setTasks } from './store.js';

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

let worker;

export function initWorker(initialTasks) {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = function (e) {
        if (e.data.type === 'TASKS_EXPIRED') {
            setTasks(e.data.tasks); // Update store, which triggers UI update
        }
    };

    syncWorker(initialTasks);
}

export function syncWorker(tasks) {
    if (worker) {
        worker.postMessage({ type: 'UPDATE_TASKS', tasks: tasks });
    }
}
