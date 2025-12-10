export const TEAM_OPTIONS = ["Unassigned", "Alex Design", "Sam Dev", "Jordan PM", "Riley QA", "Project Lead"];
export const CURRENT_USER = TEAM_OPTIONS[5];

let tasks = JSON.parse(localStorage.getItem('tasks_v5_simple')) || [];
let subscribers = [];

export function getTasks() {
    return tasks;
}

export function setTasks(newTasks) {
    tasks = newTasks;
    saveToStorage();
    notifySubscribers();
}

export function addTask(task) {
    tasks.push(task);
    saveToStorage();
    notifySubscribers();
}

export function updateTask(updatedTask) {
    const idx = tasks.findIndex(t => t.id == updatedTask.id);
    if (idx !== -1) {
        tasks[idx] = updatedTask;
        saveToStorage();
        notifySubscribers();
    }
}

export function removeTask(id) {
    tasks = tasks.filter(t => t.id != id);
    saveToStorage();
    notifySubscribers();
}

export function findTask(id) {
    return tasks.find(t => t.id == id);
}

function saveToStorage() {
    localStorage.setItem('tasks_v5_simple', JSON.stringify(tasks));
}

export function subscribe(callback) {
    subscribers.push(callback);
}

function notifySubscribers() {
    subscribers.forEach(cb => cb(tasks));
}
