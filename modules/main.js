   import { getTasks, subscribe } from './store.js';
import { initWorker, syncWorker } from './worker-manager.js';
import { renderBoard, switchView, toggleTheme, toggleSidebar, closeModal } from './ui.js';
import {
    handleSaveTask,
    handleEditClick,
    handleDeleteClick,
    handleOpenModal,
    handleDragStart,
    handleDragOver,
    handleDrop
} from './event-handlers.js';

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Subscriber to store updates
    subscribe((tasks) => {
        const currentSearch = document.getElementById('search-input') ? document.getElementById('search-input').value : "";
        renderBoard(tasks, currentSearch);
        syncWorker(tasks);
    });

    // Initial Load
    const initialTasks = getTasks();
    renderBoard(initialTasks);
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    document.getElementById('btn-theme').innerText = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    initWorker(initialTasks);

    setupEventListeners();
});

function setupEventListeners() {
    // Navigation
    document.getElementById('nav-board').addEventListener('click', () => switchView('board'));
    document.getElementById('nav-analytics').addEventListener('click', () => switchView('analytics'));

    // Sidebar & Theme
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm("Reset data?")) {
            localStorage.removeItem('tasks_v5_simple');
            location.reload();
        }
    });

    const menuBtn = document.querySelector('.btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);

    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    // Add tasks and Search buttons Actions
    document.getElementById('btn-add-task').addEventListener('click', handleOpenModal);
    document.getElementById('search-input').addEventListener('keyup', (e) => {
        renderBoard(getTasks(), e.target.value);
    });

    // Modal : Save & Cancel
    document.getElementById('btn-modal-save').addEventListener('click', handleSaveTask);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);

    // Columns (Drag & Drop)
    ['todo', 'progress', 'incomplete', 'done'].forEach(col => {
        const el = document.getElementById(`col-${col}`);
        if (el) {
            el.addEventListener('dragover', handleDragOver);
            el.addEventListener('drop', handleDrop);
        }
    });

    // Delegated Events for Tasks (Edit/Delete/DragStart on cards)
    ['list-todo', 'list-progress', 'list-incomplete', 'list-done'].forEach(listId => {
        const listEl = document.getElementById(listId);
        if (listEl) {
            listEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-btn')) {
                    handleEditClick(e.target.dataset.id);
                } else if (e.target.classList.contains('delete-btn')) {
                    handleDeleteClick(e.target.dataset.id);
                }
            });

            // For dragstart, we need to handle it carefully since it bubbles.
            listEl.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('task-card')) {
                    handleDragStart(e);
                }
            });
        }
    });
}
