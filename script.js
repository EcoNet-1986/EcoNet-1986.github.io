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
let localMutedSalons = {}; 
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp();
        } else {
            document.getElementById('screen-login').style.display = 'block';
            document.getElementById('screen-app').style.display = 'none';
        }
    } else {
        document.getElementById('screen-login').style.display = 'block';
        document.getElementById('screen-app').style.display = 'none';
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
                if(prompt(`Code ${roleChoisi}`) !== snapCodes.val()) {
                    await signOut(auth);
                    return;
                }
            }
            myData = { nom: user.displayName, role: roleChoisi, enLigne: true, email: user.email };
            await set(ref(db, `utilisateurs/${user.uid}`), myData);
        } else { 
            myData = snapUser.val(); 
        }
        myId = user.uid;
        startApp();
    } catch(err) { alert("Erreur: " + err.message); }
};
window.logout = () => {
    set(ref(db, `utilisateurs/${myId}/enLigne`), false);
    signOut(auth).then(() => location.reload());
};
function startApp() {
    set(ref(db, `utilisateurs/${myId}/enLigne`), true);
    onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
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
window.switchMainTab = (path) => {
    off(ref(db, window.currentPath)); 
    window.currentPath = path;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + path)?.classList.add('active'))
    const feedView = document.getElementById('view-feed');
    const chatView = document.getElementById('view-chat');
    const editor = document.getElementById('editor-container');
    document.getElementById('feed-content').innerHTML = ""; 
    if (path === 'chat') {
        feedView.style.display = 'none';
        editor.style.display = 'none';
        chatView.style.display = 'block';
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
    off(ref(db, path)); 
    if (localMutedSalons[path]) {
        btnMute.innerText = "🚫";
        feedDiv.innerHTML = `<div class="mute-screen">🔇<br>Salon masqué<br><button class="btn btn-blue" onclick="toggleMutePath('${path}')">Réactiver</button></div>`;
        editor.style.display = 'none';
        return;
    }
    btnMute.innerText = "👁️";
    let canWrite = true;
    if (path === 'posts-cours' && !['professeur', 'directeur'].includes(myData.role)) {
        canWrite = false;
    }
    else if (path === 'posts-info' && myData.role !== 'directeur') {
        canWrite = false;
    }
    else if (path === 'posts-staff' && !['professeur', 'directeur'].includes(myData.role)) {
        canWrite = false;
    }
    editor.style.display = canWrite ? 'block' : 'none';
    onValue(ref(db, path), (snap) => {
        if (window.currentPath !== path) return;
        let html = "";
        snap.forEach(childSnap => {
            const p = childSnap.val();
            const msgId = childSnap.key;
            const canDelete = (p.senderId === myId || myData.role === 'directeur');
            const delBtn = canDelete ? `<span onclick="deleteMsg('${path}', '${msgId}')" style="float:right; cursor:pointer; color:red; font-size:18px;">🗑️</span>` : "";
            html = `
                <div class="post">
                    ${delBtn}
                    <strong>${escapeHTML(p.name)}</strong> 
                    <span class="badge badge-${p.role}">${p.role}</span>
                    <div style="margin-top:8px;">${render(p.text)}</div>
                </div>
            ` + html; // Nouveau message en haut
        });
        feedDiv.innerHTML = html || "<p style='text-align:center; color:#999; margin-top:20px;'>Aucun message dans ce salon.</p>";
    });
}
window.sendPost = async () => {
    const val = document.getElementById('post-text').value;
    if (!val.trim()) return;
    try {
        await push(ref(db, window.currentPath), { 
            senderId: myId, name: myData.nom, role: myData.role, text: val, timestamp: Date.now() 
        });
        document.getElementById('post-text').value = "";
        autoPurge(window.currentPath);
    } catch(e) { alert("Erreur d'envoi"); }
};
function escapeHTML(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
function render(t){
    t = escapeHTML(t);
    t = t.replace(/\[AUD\](.*?)\[\/AUD\]/g, (m,s) => `<audio src="${s}" controls style="width:100%; height:30px;"></audio>`);
    t = t.replace(/\[IMG\](.*?)\[\/IMG\]/g, (m,s) => `<img src="${s}" class="media-preview">`);
    t = t.replace(/\[VID\](.*?)\[\/VID\]/g, (m,s) => `<video src="${s}" controls class="media-preview"></video>`);
    return t;
}
window.deleteMsg = async (path, id) => {
    if (confirm("Supprimer ce message ?")) await set(ref(db, `${path}/${id}`), null);
};
window.toggleMutePath = async (path) => {
    const isMuted = localMutedSalons[path];
    await set(ref(db, `utilisateurs/${myId}/salons_masques/${path}`), isMuted ? null : true);
};
function loadContacts() {
    onValue(ref(db, 'utilisateurs'), async (snap) => {
        const mutesSnap = await get(ref(db, `utilisateurs/${myId}/contacts_masques`));
        const mutes = mutesSnap.exists() ? mutesSnap.val() : {};
        let html = "";
        snap.forEach(cs => {
            const u = cs.val();
            if (cs.key !== myId && !mutes[cs.key]) {
                html += `<div class="contact-item" onclick="selectContact('${cs.key}', '${u.nom}')">
                            <div class="status-dot ${u.enLigne?'online':'offline'}"></div> ${escapeHTML(u.nom)}
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
