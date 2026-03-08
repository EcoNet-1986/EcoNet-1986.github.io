import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child, push, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCV8R0gETJdLjrnBRY3TAZ61AWRANLFApE",
    authDomain: "econet-2ff67.firebaseapp.com",
    databaseURL: "https://econet-2ff67-default-rtdb.europe-west1.firebasedatabase.app/", 
    projectId: "econet-2ff67"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.currentPath = "posts-public"; 
let myId = "", myData = null, selectedContactId = null;
let localMutedSalons = {}; // Cache pour éviter les "get" lents à chaque clic

// --- CONNEXION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp();
        } else {
            document.getElementById('screen-login').style.display = 'block';
        }
    } else {
        document.getElementById('screen-login').style.display = 'block';
    }
});

window.doLogin = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const snapUser = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (!snapUser.exists()) {
            const rolesValides = ["eleve", "parent", "professeur", "directeur"];
            let roleChoisi = "";
            while(!rolesValides.includes(roleChoisi)){
                roleChoisi = prompt("Rôle ? (eleve, parent, professeur, directeur)")?.toLowerCase().trim();
            }
            if(roleChoisi !== "eleve") {
                const snapCodes = await get(ref(db, `codes/${roleChoisi}`));
                if(prompt(`Code ${roleChoisi}`) !== snapCodes.val()) return signOut(auth);
            }
            myData = { nom: user.displayName, role: roleChoisi, enLigne: true, email: user.email };
            await set(ref(db, `utilisateurs/${user.uid}`), myData);
        } else { myData = snapUser.val(); }
        myId = user.uid;
        startApp();
    } catch(err) { alert(err.message); }
};

window.logout = () => {
    set(ref(db, `utilisateurs/${myId}/enLigne`), false);
    signOut(auth).then(() => location.reload());
};

// --- DÉMARRAGE ---
function startApp() {
    set(ref(db, `utilisateurs/${myId}/enLigne`), true);
    onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
    
    // On écoute les salons masqués une seule fois pour tout le reste de la session
    onValue(ref(db, `utilisateurs/${myId}/salons_masques`), (snap) => {
        localMutedSalons = snap.val() || {};
        if(window.currentPath !== 'chat') loadFeed(window.currentPath);
    });

    if (myData.role === 'professeur' || myData.role === 'directeur') document.getElementById('tab-posts-staff').style.display = 'block';
    if (['parent', 'professeur', 'directeur'].includes(myData.role)) document.getElementById('tab-posts-parents').style.display = 'block';

    document.getElementById('prof-name').innerText = myData.nom;
    document.getElementById('prof-badge').innerHTML = `<span class="badge badge-${myData.role}">${myData.role}</span>`;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-app').style.display = 'block';
    window.switchMainTab('posts-public');
}

// --- NAVIGATION ---
window.switchMainTab = (path) => {
    // 1. On coupe tout de suite les anciennes écoutes Firebase
    if(window.currentPath && window.currentPath !== 'chat') off(ref(db, window.currentPath));
    
    window.currentPath = path;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + path)?.classList.add('active');

    const feedView = document.getElementById('view-feed');
    const chatView = document.getElementById('view-chat');
    const editor = document.getElementById('editor-container');
    document.getElementById('feed-content').innerHTML = ""; // Vidage immédiat

    if (path === 'chat') {
        feedView.style.display = 'none';
        editor.style.display = 'none';
        chatView.style.display = 'grid';
        loadContacts();
    } else {
        chatView.style.display = 'none';
        feedView.style.display = 'block';
        loadFeed(path);
    }
};

async function loadFeed(path) {
    const feedDiv = document.getElementById('feed-content');
    const editor = document.getElementById('editor-container');
    const btnMute = document.getElementById('btn-mute');
    
    off(ref(db, path)); // Nettoyage de sécurité

    // Vérification instantanée via le cache local
    if (localMutedSalons[path]) {
        btnMute.innerText = "🚫";
        feedDiv.innerHTML = `<div style="text-align:center; padding:50px; color:#666; background:#f9f9f9; border-radius:15px; margin:20px;">
                                <p style="font-size:40px;">🔇</p><p>Salon masqué</p>
                                <button onclick="toggleMutePath('${path}')" class="btn btn-blue">Réactiver</button>
                             </div>`;
        editor.style.display = 'none';
        return;
    }

    btnMute.innerText = "👁️";
    editor.style.display = 'block';

    onValue(ref(db, path), (snap) => {
        // VERROU DE SÉCURITÉ : On vérifie qu'on est toujours sur le bon onglet
        if (window.currentPath !== path) return;

        let html = "";
        snap.forEach(c => {
            const p = c.val();
            const canDelete = (p.senderId === myId || myData.role === 'directeur');
            const delBtn = canDelete ? `<span onclick="deleteMsg('${path}', '${c.key}')" style="float:right; cursor:pointer; color:red;">🗑️</span>` : "";
            html = `<div class="post">${delBtn}<strong>${escapeHTML(p.name)}</strong> <span class="badge badge-${p.role}">${p.role}</span><br>${render(p.text)}</div>` + html;
        });
        feedDiv.innerHTML = html || "<p style='text-align:center; color:#999; margin:20px;'>Aucun message ici.</p>";
    });
}

// --- ACTIONS ---
window.sendPost = async () => {
    const val = document.getElementById('post-text').value;
    if (!val.trim()) return;
    await push(ref(db, window.currentPath), { 
        senderId: myId, name: myData.nom, role: myData.role, text: val, timestamp: Date.now() 
    });
    document.getElementById('post-text').value = "";
    autoPurge(window.currentPath);
};

window.toggleMutePath = async (path) => {
    const isMuted = localMutedSalons[path];
    await set(ref(db, `utilisateurs/${myId}/salons_masques/${path}`), isMuted ? null : true);
};

// --- CHAT PRIVÉ ---
function loadContacts() {
    onValue(ref(db, 'utilisateurs'), async (snap) => {
        const mutesSnap = await get(ref(db, `utilisateurs/${myId}/contacts_masques`));
        const mutes = mutesSnap.exists() ? mutesSnap.val() : {};
        let html = "";
        snap.forEach(cs => {
            const u = cs.val();
            if (cs.key !== myId && !mutes[cs.key]) {
                html += `<div class="contact-item" onclick="selectContact('${cs.key}', '${u.nom}')">
                            <div class="status-dot" style="background:var(--${u.enLigne?'online':'offline'})"></div> ${escapeHTML(u.nom)}
                         </div>`;
            }
        });
        document.getElementById('contact-list').innerHTML = html;
    });
}

window.selectContact = (id, nom) => {
    selectedContactId = id;
    const chatId = myId < id ? `${myId}_${id}` : `${id}_${myId}`;
    document.getElementById('chat-header').innerText = "Chat avec " + nom;
    off(ref(db, `messages_prives/${chatId}`));
    onValue(ref(db, `messages_prives/${chatId}`), (snap) => {
        const chatDiv = document.getElementById('chat-messages');
        chatDiv.innerHTML = "";
        snap.forEach(m => {
            const msg = m.val();
            chatDiv.innerHTML += `<div class="msg ${msg.senderId === myId ? 'msg-me':'msg-them'}"><strong>${escapeHTML(msg.name)}</strong>: ${render(msg.text)}</div>`;
        });
    });
};

window.sendPrivateMsg = () => {
    const text = document.getElementById('chat-input').value;
    if (!text.trim() || !selectedContactId) return;
    const chatId = myId < selectedContactId ? `${myId}_${selectedContactId}` : `${selectedContactId}_${myId}`;
    push(ref(db, `messages_prives/${chatId}`), { senderId: myId, name: myData.nom, text: text, timestamp: Date.now() });
    document.getElementById('chat-input').value = "";
};

// --- UTILITAIRES ---
function escapeHTML(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

function render(t){
    t = escapeHTML(t);
    t = t.replace(/\[AUD\](.*?)\[\/AUD\]/g, (m,s) => `<audio src="${s}" controls style="width:100%; height:30px;"></audio>`);
    t = t.replace(/\[IMG\](.*?)\[\/IMG\]/g, (m,s) => `<img src="${s}" style="max-width:100%; border-radius:10px; margin-top:5px;">`);
    t = t.replace(/\[VID\](.*?)\[\/VID\]/g, (m,s) => `<video src="${s}" controls style="max-width:100%; border-radius:10px;"></video>`);
    return t;
}

window.deleteMsg = async (path, id) => {
    if (confirm("Supprimer ?")) await set(ref(db, `${path}/${id}`), null);
};

async function autoPurge(path) {
    const snap = await get(ref(db, path));
    if (snap.exists() && snap.size > 30) {
        let entries = [];
        snap.forEach(c => entries.push(c.key));
        for (let i = 0; i < entries.length - 30; i++) await set(ref(db, `${path}/${entries[i]}`), null);
    }
}

window.toggleProfile = () => {
    const m = document.getElementById('modal-profile'), o = document.getElementById('overlay');
    const isHidden = m.style.display === 'none' || m.style.display === '';
    m.style.display = o.style.display = isHidden ? 'block' : 'none';
};
