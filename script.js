import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child, push, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
// On ajoute les imports pour l'authentification Google
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

let myId = "", myData = null, currentPath = "posts-public", selectedContactId = null;

// --- GESTION DE LA CONNEXION (SENTINELLE) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // L'utilisateur est connecté via Google
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp();
        } else {
            // Nouveau compte : on demande le rôle une seule fois
            const role = prompt("Bienvenue ! Quel est ton rôle ? (élève, professeur, parent, directeur)") || "élève";
            const nouveauProfil = {
                nom: user.displayName,
                role: role.toLowerCase(),
                enLigne: true,
                email: user.email
            };
            await set(ref(db, `utilisateurs/${user.uid}`), nouveauProfil);
            myId = user.uid;
            myData = nouveauProfil;
            startApp();
        }
    } else {
        // Personne n'est connecté, afficher l'écran de login
        document.getElementById('screen-login').style.display = 'block';
        document.getElementById('screen-app').style.display = 'none';
        document.getElementById('screen-signup').style.display = 'none';
    }
});

// --- ACTIONS DE CONNEXION ---
window.doLogin = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        alert("Erreur de connexion Google : " + error.message);
    }
};

window.logout = async () => {
    if(myId) await set(ref(db, `utilisateurs/${myId}/enLigne`), false);
    signOut(auth).then(() => location.reload());
};

// --- CŒUR DE L'APPLICATION ---
function startApp() {
    set(ref(db, `utilisateurs/${myId}/enLigne`), true);
    onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
    
    // Affichage des onglets selon le rôle
    if(myData.role === 'professeur' || myData.role === 'directeur') {
        document.getElementById('tab-posts-staff').style.display = 'block';
    }
    if(['parent', 'professeur', 'directeur'].includes(myData.role)) {
        document.getElementById('tab-posts-parents').style.display = 'block';
    }

    document.getElementById('prof-name').innerText = myData.nom;
    document.getElementById('prof-badge').innerHTML = `<span class="badge badge-${myData.role}">${myData.role}</span>`;            
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-app').style.display = 'block';
    switchMainTab('posts-public');
}

window.switchMainTab = (path) => {
    if(path === 'posts-staff' && !['professeur', 'directeur'].includes(myData.role)) { 
        alert("Accès réservé !"); return; 
    }

    if (currentPath) off(ref(db, currentPath));
    currentPath = path;
    const isChat = (path === 'chat');
    
    document.getElementById('view-feed').style.display = isChat ? 'none' : 'block';
    document.getElementById('view-chat').style.display = isChat ? 'grid' : 'none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-'+path).classList.add('active');
    
    if(!isChat) {
        let canWrite = (path === 'posts-public') || 
                       (path === 'posts-parents' && myData.role !== 'élève') ||
                       (path === 'posts-exercises' && myData.role !== 'élève') || 
                       (path === 'posts-announcements' && myData.role === 'directeur') ||
                       (path === 'posts-staff' && ['professeur', 'directeur'].includes(myData.role));
        
        document.getElementById('editor-container').style.display = canWrite ? 'block' : 'none';
        document.getElementById('feed-content').innerHTML = "";
        loadFeed(path);
    } else {
        loadContacts();
    }
};

function loadFeed(path) {
    onValue(ref(db, path), (snap) => {
        let html = "";
        const posts = [];
        snap.forEach(c => { posts.push(c.val()); });
        posts.reverse().forEach(p => {
            const rClass = `badge-${p.role}`;
            html += `<div class="post">
                <strong>${p.name}</strong> <span class="badge ${rClass}">${p.role}</span>
                <div style="margin-top:10px;">${render(p.text)}</div>
            </div>`;
        });
        document.getElementById('feed-content').innerHTML = html;
    });
}

window.sendPost = () => {
    const val = document.getElementById('post-text').value;
    if(!val.trim()) return;
    push(ref(db, currentPath), { name: myData.nom, role: myData.role, text: val });
    document.getElementById('post-text').value = "";
};

// --- CHAT PRIVÉ ---
function loadContacts() {
    onValue(ref(db, 'utilisateurs'), (snap) => {
        const list = document.getElementById('contact-list');
        list.innerHTML = "";
        snap.forEach(c => {
            if(c.key !== myId) {
                const u = c.val();
                const div = document.createElement('div');
                div.className = 'contact-item' + (selectedContactId === c.key ? ' active' : '');
                div.innerHTML = `
                    <span class="status-dot" style="background:${u.enLigne?'var(--online)':'var(--offline)'}"></span> 
                    <div style="text-align:left">
                        <div>${u.nom}</div>
                        <span class="badge badge-${u.role}" style="font-size:8px;">${u.role}</span>
                    </div>`;
                div.onclick = () => selectContact(c.key, u.nom);
                list.appendChild(div);
            }
        });
    });
}

function selectContact(id, name) {
    selectedContactId = id; 
    document.getElementById('chat-header').innerText = name;
    const chatId = myId < id ? `${myId}_${id}` : `${id}_${myId}`;
    onValue(ref(db, `messages_prives/${chatId}`), (snap) => {
        const box = document.getElementById('chat-messages'); box.innerHTML = "";
        snap.forEach(mSnap => {
            const m = mSnap.val();
            const div = document.createElement('div');
            div.className = m.sender === myId ? 'msg msg-me' : 'msg msg-them';
            div.innerHTML = render(m.text);
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });
}

window.sendPrivateMsg = () => {
    const val = document.getElementById('chat-input').value;
    if(!val.trim() || !selectedContactId) return;
    const chatId = myId < selectedContactId ? `${myId}_${selectedContactId}` : `${selectedContactId}_${myId}`;
    push(ref(db, `messages_prives/${chatId}`), { sender: myId, text: val });
    document.getElementById('chat-input').value = "";
};

// --- OUTILS ---
function render(text) {
    if(!text) return "";
    text = text.replace(/\[IMG\](.*?)\[\/IMG\]/g, '<img src="$1" class="media-preview">');
    text = text.replace(/\[VID\](.*?)\[\/VID\]/g, '<video src="$1" controls class="media-preview"></video>');
    return text;
}
