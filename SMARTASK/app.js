import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. YOUR FIREBASE CONFIGURATION OBJECT
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBw-u4Pzc8zqj4r_Drh6kAY8BIMFcr6gJ8",
    authDomain: "smarttask-fd2f4.firebaseapp.com",
    projectId: "smarttask-fd2f4",
    storageBucket: "smarttask-fd2f4.firebasestorage.app",
    messagingSenderId: "854448533703",
    appId: "1:854448533703:web:5f11346a36e96ae4f58ee2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global state trackers for dashboard data filtering
let currentCategoryFilter = "All";
let currentSearchQuery = "";
let snapshotUnsubscribe = null;

// Safe DOM Element Detection Flags
const loginBtn = document.getElementById('loginBtn');
const createAccBtn = document.getElementById('createAccBtn');
const addTaskBtn = document.getElementById('addTaskBtn');
const logoutBtn = document.getElementById('logoutBtn');

// --- CENTRAL AUTH STATE ROUTER PIPELINE ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Auth State: Logged in as ->", user.email);
        
        // If user is logged in but sitting on the login screen, teleport them to the dashboard
        if (loginBtn || createAccBtn) {
            window.location.replace("dashboard.html");
        } 
        
        // If they are on the dashboard, safely spin up the dashboard subsystems
        if (addTaskBtn) {
            const emailDisplay = document.getElementById('userEmail');
            if (emailDisplay) emailDisplay.textContent = user.email;
            initClockUtilities();
            setupRealtimeTasks();
            setupDashboardInterfaceListeners();
        }
    } else {
        console.log("Auth State: No active user session.");
        
        // If they are unauthenticated but trying to view the dashboard, kick them back to login
        if (addTaskBtn || logoutBtn) {
            window.location.replace("LOGIN.html");
        }
        
        // If they are on the login page, spin up the authentication listeners
        if (loginBtn || createAccBtn) {
            setupLoginInterfaceListeners();
        }
    }
});

// --- LOGIN & REGISTER PAGE LOGIC ---
function setupLoginInterfaceListeners() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    // Handle Login Button Click
    if (loginBtn) {
        // Clear any old event listeners by cloning the button node
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        
        newLoginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!emailInput.value || !passwordInput.value) return alert("Please enter both email and password.");
            
            try {
                newLoginBtn.textContent = "Logging in...";
                await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
                // onAuthStateChanged will automatically redirect to dashboard.html
            } catch (error) {
                alert("Login Failed: " + error.message);
                newLoginBtn.textContent = "Login";
            }
        });
    }

    // Handle Create Account Button Click
    if (createAccBtn) {
        const newCreateBtn = createAccBtn.cloneNode(true);
        createAccBtn.parentNode.replaceChild(newCreateBtn, createAccBtn);

        newCreateBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!emailInput.value || !passwordInput.value) return alert("Please enter both email and password.");
            
            try {
                newCreateBtn.textContent = "Creating Account...";
                await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
                // onAuthStateChanged will automatically redirect to dashboard.html
            } catch (error) {
                alert("Registration Failed: " + error.message);
                newCreateBtn.textContent = "Create Account";
            }
        });
    }
}

// --- TIME UTILITIES CLOCK ROUTINE ---
function initClockUtilities() {
    const timeEl = document.getElementById('liveTime');
    const dateEl = document.getElementById('liveDate');
    
    function refreshClock() {
        const now = new Date();
        if(timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if(dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    refreshClock();
    setInterval(refreshClock, 1000);
}

// --- DASHBOARD UI INTERFACE LISTENERS ---
function setupDashboardInterfaceListeners() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');

    // Mobile Hamburger Menu Drawer Toggle
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('-translate-x-full');
        };
        document.body.onclick = () => {
            sidebar.classList.add('-translate-x-full');
        };
    }

    // Logout Process Button Action
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth);
    }

    // Real-time Text Query Search Filter
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            setupRealtimeTasks(); 
        };
    }

    // Filter Buttons UI Mode Switching Actions
    const filters = { 'filterAll': 'All', 'filterWork': 'Work', 'filterPersonal': 'Personal' };
    Object.keys(filters).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => {
                currentCategoryFilter = filters[id];
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#252836]', 'text-white');
                    b.classList.add('text-gray-400');
                });
                btn.classList.add('bg-[#252836]', 'text-white');
                btn.classList.remove('text-gray-400');
                setupRealtimeTasks();
            };
        }
    });

    // Create New Task Document Entry Dialog
    if (addTaskBtn) {
        addTaskBtn.onclick = async () => {
            const title = prompt("Enter priority description context:");
            if (!title || !title.trim()) return;
            
            const categoryInput = prompt("Set category tracking domain (Work / Personal):", "Work");
            let finalCategory = "Work";
            if(categoryInput && categoryInput.toLowerCase() === 'personal') finalCategory = "Personal";

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            try {
                await addDoc(collection(db, "tasks"), {
                    title: title.trim(),
                    category: finalCategory,
                    time: timeStr,
                    completed: false,
                    createdAt: new Date()
                });
            } catch (error) {
                alert("Task Write Blocked: " + error.message);
            }
        };
    }
}

// --- DATA READ QUERY RENDERING PIPELINE STREAM ---
function setupRealtimeTasks() {
    if (snapshotUnsubscribe) snapshotUnsubscribe(); 

    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

    snapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        taskList.innerHTML = '';
        
        let total = 0;
        let completedCount = 0;
        let pendingCount = 0;

        snapshot.forEach((docSnapshot) => {
            const task = docSnapshot.data();
            const id = docSnapshot.id;

            total++;
            if (task.completed) completedCount++;
            else pendingCount++;

            // Evaluate Filter Matrices
            if (currentCategoryFilter !== "All" && task.category !== currentCategoryFilter) return;
            if (currentSearchQuery && !task.title.toLowerCase().includes(currentSearchQuery)) return;

            // Generate Task List Rows
            const row = document.createElement('div');
            row.className = `flex items-center justify-between bg-[#1E2030] p-4 rounded-xl mb-1 border border-transparent hover:border-[#7B51D3] transition group ${task.completed ? 'opacity-50' : ''}`;
            
            const tagColorClass = task.category === 'Work' ? 'bg-[#7B51D3]/20 text-[#9366F9]' : 'bg-emerald-500/20 text-emerald-400';

            row.innerHTML = `
                <div class="flex items-center space-x-4 flex-1 min-w-0">
                    <input type="checkbox" data-id="${id}" ${task.completed ? 'checked' : ''} class="task-toggle-checkbox w-5 h-5 rounded bg-[#0F1015] border-gray-600 text-[#7B51D3] focus:ring-[#7B51D3] cursor-pointer accent-[#7B51D3]">
                    <div class="truncate">
                        <p class="font-semibold text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'} truncate">${task.title}</p>
                        <p class="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span class="${tagColorClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${task.category}</span>
                            <span><i class="fa-regular fa-clock mr-1"></i>${task.time}</span>
                        </p>
                    </div>
                </div>
                <button data-id="${id}" class="delete-task-btn text-gray-500 hover:text-red-400 text-xs font-semibold md:opacity-0 group-hover:opacity-100 transition px-2 py-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            taskList.appendChild(row);
        });

        // Safe Dashboard Metrics Counter Assignments
        if(document.getElementById('totalTasksCount')) document.getElementById('totalTasksCount').textContent = total;
        if(document.getElementById('completedTasksCount')) document.getElementById('completedTasksCount').textContent = completedCount;
        if(document.getElementById('pendingTasksCount')) document.getElementById('pendingTasksCount').textContent = pendingCount;
        if(document.getElementById('sideBadgeTasks')) document.getElementById('sideBadgeTasks').textContent = pendingCount;

        if (taskList.children.length === 0) {
            taskList.innerHTML = `<p class="text-gray-500 text-xs text-center py-8">No matching priority items found.</p>`;
        }

        attachDynamicItemListeners();
    });
}

function attachDynamicItemListeners() {
    // Checkbox State Updates Loop
    document.querySelectorAll('.task-toggle-checkbox').forEach(box => {
        box.onchange = async (e) => {
            const targetId = e.target.getAttribute('data-id');
            const isChecked = e.target.checked;
            try {
                await updateDoc(doc(db, "tasks", targetId), { completed: isChecked });
            } catch (err) {
                console.error("Task modification failed:", err);
            }
        };
    });

    // Delete Task Item Row Event Action Loop
    document.querySelectorAll('.delete-task-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const targetId = e.currentTarget.getAttribute('data-id');
            if (confirm("Permanently delete this task item?")) {
                try {
                    await deleteDoc(doc(db, "tasks", targetId));
                } catch (err) {
                    console.error("Deletion failed:", err);
                }
            }
        };
    });
}