import { auth, db } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global Runtime State Management Object
const state = {
    user: null,
    localName: localStorage.getItem("wedding_user_name") || "",
    isAdmin: false,
    appSettings: { totalBudget: 0, adminPin: "000000" },
    items: [],
    events: [],
    members: [],
    logs: [],
    recycleBin: [],
    activeView: "dashboard",
    securityCallback: null
};

const ADMIN_EMAIL = "rahul@work.com";

// --- SECURITY PIN INTERCEPTOR ---
function requestPinVerification(successCallback) {
    state.securityCallback = successCallback;
    document.getElementById("secure-pin-input").value = "";
    document.getElementById("pin-modal").classList.remove("hidden");
}

document.getElementById("pin-confirm-btn").addEventListener("click", () => {
    const inputPin = document.getElementById("secure-pin-input").value;
    if (inputPin === state.appSettings.adminPin) {
        document.getElementById("pin-modal").classList.add("hidden");
        if (state.securityCallback) {
            state.securityCallback();
            state.securityCallback = null;
        }
    } else {
        alert("ভুল নিরাপত্তা পিন প্রদান করা হয়েছে! অপারেশন প্রত্যাখ্যাত।");
    }
});

document.getElementById("pin-cancel-btn").addEventListener("click", () => {
    document.getElementById("pin-modal").classList.add("hidden");
    state.securityCallback = null;
});

// --- CORE UTILITIES ---
async function writeLog(action) {
    try {
        await addDoc(collection(db, "activity_logs"), {
            userName: state.localName || state.user.email,
            action: action,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("অ্যাক্টিভিটি লগ রাইট করতে ত্রুটি: ", e);
    }
}

// --- VIEW NAVIGATION ENGINE ---
window.switchView = function(viewId) {
    if (!state.user) return;
    if (viewId === 'admin' && !state.isAdmin) return;

    state.activeView = viewId;
    document.querySelectorAll(".app-view").forEach(el => el.classList.add("hidden"));
    document.getElementById(`view-${viewId}`).classList.remove("hidden");

    document.querySelectorAll(".bottom-nav-item").forEach(btn => btn.classList.remove("active"));
    const activeBtnIndex = ['dashboard', 'items', 'members', 'reports', 'admin'].indexOf(viewId);
    if(activeBtnIndex !== -1) {
        document.querySelectorAll(".bottom-nav-item")[activeBtnIndex].classList.add("active");
    }
};

// --- REALTIME DATA STREAM SYNCHRONIZER ---
function initializeRealtimeSync() {
    // 1. Settings Synchronization
    onSnapshot(doc(db, "settings", "app"), (snapshot) => {
        if (snapshot.exists()) {
            state.appSettings = snapshot.data();
            renderDashboard();
            if (state.isAdmin) {
                document.getElementById("admin-total-budget").value = state.appSettings.totalBudget;
            }
        } else {
            setDoc(doc(db, "settings", "app"), { adminEmail: ADMIN_EMAIL, adminPin: "000000", totalBudget: 0 });
        }
    });

    // 2. Events Sync
    onSnapshot(query(collection(db, "events"), orderBy("name")), (snap) => {
        state.events = [];
        snap.forEach(d => state.events.push({ id: d.id, ...d.data() }));
        populateDropdowns();
        renderAdminSubsystems();
        renderMembersAndEventsLists();
    });

    // 3. Family Members Sync
    onSnapshot(query(collection(db, "family_members"), orderBy("name")), (snap) => {
        state.members = [];
        snap.forEach(d => state.members.push({ id: d.id, ...d.data() }));
        populateDropdowns();
        renderAdminSubsystems();
        renderMembersAndEventsLists();
    });

    // 4. Items Sync
    onSnapshot(collection(db, "items"), (snap) => {
        state.items = [];
        snap.forEach(d => state.items.push({ id: d.id, ...d.data() }));
        renderDashboard();
        renderItemsList();
    });

    // 5. Recycle Bin Sync
    onSnapshot(collection(db, "recycle_bin"), (snap) => {
        state.recycleBin = [];
        snap.forEach(d => state.recycleBin.push({ id: d.id, ...d.data() }));
        if (state.isAdmin) renderRecycleBin();
    });

    // 6. Activity Logs Sync
    onSnapshot(query(collection(db, "activity_logs"), orderBy("timestamp", "desc")), (snap) => {
        state.logs = [];
        snap.forEach(d => state.logs.push({ id: d.id, ...d.data() }));
        if (state.isAdmin) renderActivityLogs();
    });
}

// --- DOM RENDERERS ---
function renderDashboard() {
    const totalBudget = Number(state.appSettings.totalBudget || 0);
    
    const spentBudget = state.items
        .filter(i => i.status === "Purchased")
        .reduce((acc, i) => acc + Number(i.actualPrice || 0), 0);

    const pendingCost = state.items
        .filter(i => i.status === "Pending")
        .reduce((acc, i) => acc + (Number(i.expectedPrice || 0) * Number(i.quantity || 1)), 0);

    const remainingBudget = totalBudget - spentBudget;
    const projectedRemaining = totalBudget - (spentBudget + pendingCost);

    document.getElementById("dash-total-budget").innerText = `৳ ${totalBudget.toLocaleString()}`;
    document.getElementById("dash-spent-budget").innerText = `৳ ${spentBudget.toLocaleString()}`;
    document.getElementById("dash-remaining-budget").innerText = `৳ ${remainingBudget.toLocaleString()}`;
    document.getElementById("dash-pending-cost").innerText = `৳ ${pendingCost.toLocaleString()}`;
    document.getElementById("dash-projected-budget").innerText = `৳ ${projectedRemaining.toLocaleString()}`;

    // Budget Warning Controller
    const warningEl = document.getElementById("budget-warning");
    if (projectedRemaining < 0) {
        warningEl.classList.remove("hidden");
    } else {
        warningEl.classList.add("hidden");
    }

    // Quantitative Status Counters
    document.getElementById("dash-total-items").innerText = state.items.length;
    document.getElementById("dash-pending-items").innerText = state.items.filter(i => i.status === "Pending").length;
    document.getElementById("dash-purchased-items").innerText = state.items.filter(i => i.status === "Purchased").length;
    document.getElementById("dash-total-members").innerText = `${state.members.length} জন`;
    document.getElementById("dash-total-events").innerText = `${state.events.length} টি`;

    // Render Recent Purchases Module
    const recentContainer = document.getElementById("dash-recent-purchases");
    recentContainer.innerHTML = "";
    const purchasedItems = state.items.filter(i => i.status === "Purchased").slice(0, 3);
    
    if(purchasedItems.length === 0) {
        recentContainer.innerHTML = `<p class="text-xs text-gray-400 italic text-center py-2">এখনো কোনো কেনাকাটা করা হয়নি</p>`;
    } else {
        purchasedItems.forEach(item => {
            recentContainer.innerHTML += `
                <div class="p-3 bg-white/60 border border-emerald-100 rounded-xl flex justify-between items-center text-xs">
                    <div>
                        <p class="font-bold text-[#6B1025]">${item.itemName}</p>
                        <p class="text-[10px] text-gray-400">${item.event} • দায়ী: ${item.member}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-emerald-600">৳ ${Number(item.actualPrice).toLocaleString()}</p>
                        <p class="text-[9px] text-gray-400">ক্রেতা: ${item.addedBy}</p>
                    </div>
                </div>`;
        });
    }
}

function renderItemsList() {
    const container = document.getElementById("items-container");
    container.innerHTML = "";

    const searchQuery = document.getElementById("search-input").value.toLowerCase();
    const fEvent = document.getElementById("filter-event").value;
    const fMember = document.getElementById("filter-member").value;
    const fStatus = document.getElementById("filter-status").value;

    const filtered = state.items.filter(item => {
        const matchesSearch = item.itemName.toLowerCase().includes(searchQuery) || 
                              item.member.toLowerCase().includes(searchQuery) || 
                              item.addedBy.toLowerCase().includes(searchQuery);
        const matchesEvent = fEvent === "" || item.event === fEvent;
        const matchesMember = fMember === "" || item.member === fMember;
        const matchesStatus = fStatus === "" || item.status === fStatus;
        return matchesSearch && matchesEvent && matchesMember && matchesStatus;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-400 italic text-center py-6">কোনো আইটেম পাওয়া যায়নি</p>`;
        return;
    }

    filtered.forEach(item => {
        const isPurchased = item.status === "Purchased";
        container.innerHTML += `
            <div class="p-4 royal-card space-y-3 relative">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[#F8F4EC] text-[#6B1025]">${item.event}</span>
                        <h4 class="text-sm font-bold text-gray-800 mt-1">${item.itemName}</h4>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${isPurchased ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}">
                        ${isPurchased ? 'ক্রয়কৃত' : 'বাকি আছে'}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-y-1.5 text-[11px] text-gray-500 border-t border-b border-gray-50 py-2">
                    <div><span class="text-gray-400">সদস্য:</span> <span class="font-medium text-gray-700">${item.member}</span></div>
                    <div><span class="text-gray-400">পরিমাণ:</span> <span class="font-medium text-gray-700">${item.quantity} টি</span></div>
                    <div><span class="text-gray-400">আনুমানিক বাজেট:</span> <span class="font-medium text-gray-700">৳ ${Number(item.expectedPrice).toLocaleString()}</span></div>
                    <div><span class="text-gray-400">প্রকৃত খরচ:</span> <span class="font-bold ${isPurchased ? 'text-emerald-600':'text-gray-400'}">${isPurchased ? '৳ '+Number(item.actualPrice).toLocaleString() : 'N/A'}</span></div>
                </div>

                <div class="flex justify-between items-center text-[10px] text-gray-400">
                    <div><span>যুক্ত করেছেন: </span><span class="font-semibold text-gray-600">${item.addedBy}</span></div>
                    <div class="flex gap-2">
                        <button onclick="openEditItem('${item.id}')" class="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 font-medium text-gray-600 flex items-center gap-1"><i class="fa-solid fa-pen-to-square"></i> এডিট</button>
                        <button onclick="deleteItemAction('${item.id}')" class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 font-medium text-red-600 flex items-center gap-1"><i class="fa-solid fa-trash"></i> ডিলিট</button>
                    </div>
                </div>
            </div>`;
    });
}

function renderMembersAndEventsLists() {
    const memContainer = document.getElementById("members-container");
    memContainer.innerHTML = "";
    state.members.forEach(m => {
        const itemAllocated = state.items.filter(i => i.member === m.name).length;
        memContainer.innerHTML += `
            <div class="p-3 royal-card flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-[#6B1025] text-[#D4AF37] flex items-center justify-center text-xs font-bold">${m.name.charAt(0)}</div>
                    <div>
                        <h4 class="text-xs font-bold text-gray-800">${m.name}</h4>
                        <p class="text-[10px] text-gray-400">পরিচালিত আইটেম সংখ্যা: ${itemAllocated} টি</p>
                    </div>
                </div>
            </div>`;
    });
}

function populateDropdowns() {
    const eSelectFilter = document.getElementById("filter-event");
    const mSelectFilter = document.getElementById("filter-member");
    const eSelectForm = document.getElementById("form-item-event");
    const mSelectForm = document.getElementById("form-item-member");

    eSelectFilter.innerHTML = '<option value="">সব ইভেন্ট</option>';
    mSelectFilter.innerHTML = '<option value="">সব মেম্বার</option>';
    eSelectForm.innerHTML = '';
    mSelectForm.innerHTML = '';

    state.events.forEach(e => {
        eSelectFilter.innerHTML += `<option value="${e.name}">${e.name}</option>`;
        eSelectForm.innerHTML += `<option value="${e.name}">${e.name}</option>`;
    });

    state.members.forEach(m => {
        mSelectFilter.innerHTML += `<option value="${m.name}">${m.name}</option>`;
        mSelectForm.innerHTML += `<option value="${m.name}">${m.name}</option>`;
    });
}

function renderAdminSubsystems() {
    const evList = document.getElementById("admin-events-list");
    evList.innerHTML = "";
    state.events.forEach(e => {
        evList.innerHTML += `
            <div class="flex justify-between items-center py-2 text-xs">
                <span>${e.name}</span>
                <button onclick="deleteEvent('${e.id}', '${e.name}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-square-minus"></i></button>
            </div>`;
    });

    const memList = document.getElementById("admin-members-list");
    memList.innerHTML = "";
    state.members.forEach(m => {
        memList.innerHTML += `
            <div class="flex justify-between items-center py-2 text-xs">
                <span>${m.name}</span>
                <button onclick="deleteMember('${m.id}', '${m.name}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-square-minus"></i></button>
            </div>`;
    });
}

function renderRecycleBin() {
    const container = document.getElementById("admin-recycle-container");
    container.innerHTML = "";
    if(state.recycleBin.length === 0) {
        container.innerHTML = `<p class="text-[11px] text-gray-400 italic text-center py-2">বিন ফাঁকা রয়েছে</p>`;
        return;
    }
    state.recycleBin.forEach(item => {
        container.innerHTML += `
            <div class="p-2.5 bg-white border rounded-lg flex justify-between items-center text-[11px]">
                <div>
                    <p class="font-bold text-gray-700">${item.itemName}</p>
                    <p class="text-[9px] text-gray-400">ইভেন্ট: ${item.event}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="restoreItem('${item.id}')" class="text-emerald-600 hover:underline">রিস্টোর</button>
                    <button onclick="permanentDeleteItem('${item.id}')" class="text-red-600 hover:underline font-bold">মুছে ফেলুন</button>
                </div>
            </div>`;
    });
}

function renderActivityLogs() {
    const container = document.getElementById("admin-logs-container");
    container.innerHTML = "";
    state.logs.forEach(log => {
        const timeStr = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString() : 'এখনই';
        container.innerHTML += `
            <div class="py-1.5 flex justify-between items-start gap-4">
                <span class="text-gray-700"><strong>${log.userName}</strong>: ${log.action}</span>
                <span class="text-gray-400 whitespace-nowrap">${timeStr}</span>
            </div>`;
    });
}

// --- ITEM MUTATION OPERATIONS ---
document.getElementById("form-item-status").addEventListener("change", (e) => {
    const wrapper = document.getElementById("actual-price-wrapper");
    if(e.target.value === "Purchased") {
        wrapper.classList.remove("hidden");
        document.getElementById("form-item-actual").setAttribute("required", "required");
    } else {
        wrapper.classList.add("hidden");
        document.getElementById("form-item-actual").removeAttribute("required");
    }
});

window.openEditItem = function(id) {
    requestPinVerification(() => {
        const item = state.items.find(i => i.id === id);
        if(!item) return;
        document.getElementById("form-item-id").value = item.id;
        document.getElementById("form-item-name").value = item.itemName;
        document.getElementById("form-item-event").value = item.event;
        document.getElementById("form-item-member").value = item.member;
        document.getElementById("form-item-qty").value = item.quantity;
        document.getElementById("form-item-expected").value = item.expectedPrice;
        document.getElementById("form-item-status").value = item.status;
        document.getElementById("form-item-notes").value = item.notes || "";
        
        const wrapper = document.getElementById("actual-price-wrapper");
        if(item.status === "Purchased") {
            wrapper.classList.remove("hidden");
            document.getElementById("form-item-actual").value = item.actualPrice;
            document.getElementById("form-item-actual").setAttribute("required", "required");
        } else {
            wrapper.classList.add("hidden");
            document.getElementById("form-item-actual").value = "";
        }
        document.getElementById("modal-title").innerText = "আইটেম তথ্য এডিট করুন";
        document.getElementById("item-modal").classList.remove("hidden");
    });
};

window.deleteItemAction = function(id) {
    requestPinVerification(async () => {
        const item = state.items.find(i => i.id === id);
        if(!item) return;
        await setDoc(doc(db, "recycle_bin", item.id), item);
        await deleteDoc(doc(db, "items", item.id));
        await writeLog(`আইটেম "${item.itemName}" রিসাইকেল বিনে পাঠানো হয়েছে`);
    });
};

window.restoreItem = async function(id) {
    const item = state.recycleBin.find(i => i.id === id);
    if(!item) return;
    await setDoc(doc(db, "items", item.id), item);
    await deleteDoc(doc(db, "recycle_bin", item.id));
    await writeLog(`আইটেম "${item.itemName}" পুনরুদ্ধার করা হয়েছে`);
};

window.permanentDeleteItem = function(id) {
    requestPinVerification(async () => {
        const item = state.recycleBin.find(i => i.id === id);
        if(!item) return;
        await deleteDoc(doc(db, "recycle_bin", id));
        await writeLog(`আইটেম "${item.itemName}" চিরতরে ডিলিট করা হয়েছে`);
    });
};

// --- ADMIN CONTROL ACTIONS ---
window.deleteEvent = function(id, name) {
    const safe = state.items.every(i => i.event !== name);
    if(!safe) { alert("ত্রুটি: এই ইভেন্টের অধীনে আইটেম বরাদ্দ থাকায় এটি ডিলিট করা যাবে না।"); return; }
    requestPinVerification(async () => {
        await deleteDoc(doc(db, "events", id));
        await writeLog(`ইভেন্ট "${name}" ডিলিট করা হয়েছে`);
    });
};

window.deleteMember = function(id, name) {
    const safe = state.items.every(i => i.member !== name);
    if(!safe) { alert("ত্রুটি: এই মেম্বারের ওপর আইটেম বরাদ্দ থাকায় ডিলিট করা যাবে না।"); return; }
    requestPinVerification(async () => {
        await deleteDoc(doc(db, "family_members", id));
        await writeLog(`ফ্যামিলি মেম্বার "${name}" ডিলিট করা হয়েছে`);
    });
};

// --- EVENTS BINDING ---
document.getElementById("fab-add-item").addEventListener("click", () => {
    if(state.events.length === 0 || state.members.length === 0) {
        alert("প্রথমে এডমিন প্যানেল থেকে ইভেন্ট এবং ফ্যামিলি মেম্বার তৈরি করুন!");
        return;
    }
    document.getElementById("item-form").reset();
    document.getElementById("form-item-id").value = "";
    document.getElementById("actual-price-wrapper").classList.add("hidden");
    document.getElementById("modal-title").innerText = "নতুন আইটেম যুক্ত করুন";
    document.getElementById("item-modal").classList.remove("hidden");
});

document.getElementById("modal-close-btn").addEventListener("click", () => {
    document.getElementById("item-modal").classList.add("hidden");
});

document.getElementById("item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("form-item-id").value;
    const itemData = {
        itemName: document.getElementById("form-item-name").value,
        event: document.getElementById("form-item-event").value,
        member: document.getElementById("form-item-member").value,
        quantity: Number(document.getElementById("form-item-qty").value),
        expectedPrice: Number(document.getElementById("form-item-expected").value),
        status: document.getElementById("form-item-status").value,
        actualPrice: document.getElementById("form-item-status").value === "Purchased" ? Number(document.getElementById("form-item-actual").value) : 0,
        notes: document.getElementById("form-item-notes").value,
        addedBy: state.localName
    };

    if(id) {
        await updateDoc(doc(db, "items", id), itemData);
        await writeLog(`আইটেম "${itemData.itemName}" আপডেট করা হয়েছে`);
    } else {
        await addDoc(collection(db, "items"), itemData);
        await writeLog(`নতুন আইটেম "${itemData.itemName}" যোগ করা হয়েছে`);
    }
    document.getElementById("item-modal").classList.add("hidden");
});

document.getElementById("save-budget-btn").addEventListener("click", async () => {
    const b = Number(document.getElementById("admin-total-budget").value);
    await updateDoc(doc(db, "settings", "app"), { totalBudget: b });
    await writeLog(`গ্লোবাল বিবাহ বাজেট পরিবর্তন করে ৳ ${b.toLocaleString()} করা হয়েছে`);
    alert("বাজেট সফলভাবে আপডেট হয়েছে!");
});

document.getElementById("save-pin-btn").addEventListener("click", async () => {
    const p = document.getElementById("admin-pin-input").value;
    if(p.length !== 6) { alert("পিন অবশ্যই ৬ ডিজিটের হতে হবে!"); return; }
    await updateDoc(doc(db, "settings", "app"), { adminPin: p });
    await writeLog(`নিরাপত্তা এডমিন পিন পরিবর্তন করা হয়েছে`);
    alert("সিকিউরিটি পিন সফলভাবে পরিবর্তিত হয়েছে!");
});

document.getElementById("admin-event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("admin-event-name").value.trim();
    await addDoc(collection(db, "events"), { name });
    await writeLog(`নতুন ইভেন্ট "${name}" যোগ করা হয়েছে`);
    document.getElementById("admin-event-name").value = "";
});

document.getElementById("admin-member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("admin-member-name").value.trim();
    await addDoc(collection(db, "family_members"), { name });
    await writeLog(`নতুন ফ্যামিলি মেম্বার "${name}" যোগ করা হয়েছে`);
    document.getElementById("admin-member-name").value = "";
});

// Search & Filtering Execution Triggers
document.getElementById("search-input").addEventListener("input", renderItemsList);
document.getElementById("filter-event").addEventListener("change", renderItemsList);
document.getElementById("filter-member").addEventListener("change", renderItemsList);
document.getElementById("filter-status").addEventListener("change", renderItemsList);

// --- AUTHENTICATION FLOW PIPELINE ---
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("auth-name").value.trim();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;

    try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        localStorage.setItem("wedding_user_name", name);
        state.localName = name;
        // Auth Observer handles redirection view toggles
    } catch (err) {
        alert("অথেনটিকেশন ব্যর্থ হয়েছে: " + err.message);
    }
});

document.getElementById("logout-btn").addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.removeItem("wedding_user_name");
        location.reload();
    });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        state.user = user;
        state.isAdmin = (user.email === ADMIN_EMAIL);
        state.localName = localStorage.getItem("wedding_user_name") || "পরিবার";
        
        document.getElementById("auth-screen").classList.add("hidden");
        document.getElementById("welcome-user").innerText = `স্বাগতম, ${state.localName}`;
        document.getElementById("role-badge").innerText = state.isAdmin ? "Master Admin" : "Family Account";
        
        if (state.isAdmin) {
            document.getElementById("nav-admin-tab").classList.remove("hidden");
        }
        
        initializeRealtimeSync();
        switchView("dashboard");
    } else {
        state.user = null;
        document.getElementById("auth-screen").classList.remove("hidden");
    }
});

// --- ADVANCED UNICODE PDF REPORT ENGINE MODULE ---
window.generateReport = function(type) {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF();
    
    // Fallback safe rendering array configuration
    docPdf.setFont("Helvetica", "normal");
    
    // Core Financial Metrics calculation logic
    const totalBudget = Number(state.appSettings.totalBudget || 0);
    const spentBudget = state.items.filter(i => i.status === "Purchased").reduce((acc, i) => acc + Number(i.actualPrice || 0), 0);
    const pendingCost = state.items.filter(i => i.status === "Pending").reduce((acc, i) => acc + (Number(i.expectedPrice || 0) * Number(i.quantity || 1)), 0);

    // Document Presentation Layout Cover Matrix
    docPdf.setFillColor(107, 16, 37); // Primary Crimson Accent
    docPdf.rect(0, 0, 210, 40, "F");
    
    docPdf.setTextColor(212, 175, 55); // Gold Text Accent
    docPdf.setFontSize(22);
    docPdf.text("WEDDING OPERATIONS ENTERPRISE REPORT", 15, 25);
    
    docPdf.setTextColor(40, 40, 40);
    docPdf.setFontSize(10);
    docPdf.text(`Generated On: ${new Date().toLocaleString()} | Scope: ${type.toUpperCase()}`, 15, 48);
    
    // Draw Financial Statements Grid Panel Block
    docPdf.setFillColor(248, 244, 236);
    docPdf.rect(15, 55, 180, 35, "F");
    
    docPdf.setFontSize(11);
    docPdf.text(`Global Wedding Budget: BDT ${totalBudget.toLocaleString()}`, 20, 63);
    docPdf.text(`Total Liquid Capital Expended (Spent): BDT ${spentBudget.toLocaleString()}`, 20, 71);
    docPdf.text(`Outstanding Liabilities Forecast (Pending): BDT ${pendingCost.toLocaleString()}`, 20, 79);
    docPdf.text(`Projected Surplus Balance: BDT ${(totalBudget - (spentBudget + pendingCost)).toLocaleString()}`, 20, 86);

    docPdf.line(15, 96, 195, 96);
    docPdf.setFontSize(14);
    docPdf.text("OPERATIONAL ITEM AUDIT TRAIL LOGISTICS", 15, 104);
    
    let verticalCursor = 112;
    docPdf.setFontSize(9);
    
    const operationalTargetItems = state.items.filter(item => {
        if (type === "pending") return item.status === "Pending";
        if (type === "purchased") return item.status === "Purchased";
        return true;
    });

    operationalTargetItems.forEach((item, index) => {
        if(verticalCursor > 275) {
            docPdf.addPage();
            verticalCursor = 20;
        }
        
        // Output fields mapped securely avoiding overlapping tracking
        const descriptionLine = `${index + 1}. [${item.status.toUpperCase()}] ${item.itemName} | Qty: ${item.quantity} | Responsibility: ${item.member}`;
        const accountingLine = `Est: BDT ${item.expectedPrice} -> Act: BDT ${item.actualPrice || 0} | Managed By: ${item.addedBy}`;
        
        docPdf.text(descriptionLine, 15, verticalCursor);
        docPdf.text(accountingLine, 15, verticalCursor + 5);
        docPdf.line(15, verticalCursor + 8, 195, verticalCursor + 8);
        verticalCursor += 14;
    });

    // Save Executed Document Context
    docPdf.save(`wedding_operations_report_${type}_${Date.now()}.pdf`);
};