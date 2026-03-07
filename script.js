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

let myId = "", myData = null, currentPath = "posts-public", selectedContactId = null;

// --- CONNEXION AUTOMATIQUE ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp();
        } else {
            // Premier passage : Choix du rôle
            let roleChoisi = prompt("Quel est ton rôle ? (eleve, professeur, parent, directeur)").toLowerCase();
            const rolesValides = ["eleve", "professeur", "parent", "directeur"];
            if (!rolesValides.includes(roleChoisi)) roleChoisi = "eleve";

            myData = { nom: user.displayName, role: roleChoisi, enLigne: true, email: user.email };
            await set(ref(db, `utilisateurs/${user.uid}`), myData);
            myId = user.uid;
            startApp();
        }
    } else {
        document.getElementById('screen-login').style.display = 'block';
        document.getElementById('screen-app').style.display = 'none';
    }
});

window.doLogin = () => signInWithPopup(auth, provider).catch(err => alert("Erreur : " + err.message));

window.logout = () => {
    set(ref(db, `utilisateurs/${myId}/enLigne`), false);
    signOut(auth).then(() => location.reload());
};

// --- DÉMARRAGE APP ---
function startApp() {
    set(ref(db, `utilisateurs/${myId}/enLigne`), true);
    onDisconnect(ref(db, `utilisateurs/${myId}/enLigne`)).set(false);
    
    // Affichage selon rôle
    if (myData.role === 'professeur' || myData.role === 'directeur') document.getElementById('tab-posts-staff').style.display = 'block';
    if (['parent', 'professeur', 'directeur'].includes(myData.role)) document.getElementById('tab-posts-parents').style.display = 'block';

    document.getElementById('prof-name').innerText = myData.nom;
    document.getElementById('prof-badge').innerHTML = `<span class="badge badge-${myData.role}">${myData.role}</span>`;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-app').style.display = 'block';
    switchMainTab('posts-public');
}

// --- NAVIGATION ---
window.switchMainTab = (path) => {
    if (path === 'posts-staff' && !['professeur', 'directeur'].includes(myData.role)) return alert("Accès réservé !");
    if (currentPath) off(ref(db, currentPath));
    currentPath = path;
    const isChat = (path === 'chat');
    
    document.getElementById('view-feed').style.display = isChat ? 'none' : 'block';
    document.getElementById('view-chat').style.display = isChat ? 'grid' : 'none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-'+path).classList.add('active');
    
    if (!isChat) {
        let canWrite = (path === 'posts-public') || (path === 'posts-parents' && myData.role !== 'eleve') || (myData.role === 'directeur' || myData.role === 'professeur');
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
        snap.forEach(c => {
            const p = c.val();
            html = `<div class="post"><strong>${p.name}</strong> <span class="badge badge-${p.role}">${p.role}</span><br>${render(p.text)}</div>` + html;
        });
        document.getElementById('feed-content').innerHTML = html;
    });
}

window.sendPost = () => {
    const val = document.getElementById('post-text').value;
    if (!val.trim()) return;
    push(ref(db, currentPath), { name: myData.nom, role: myData.role, text: val });
    document.getElementById('post-text').value = "";
};

// --- CHAT ET PROFIL ---
window.toggleProfile = () => {
    const m = document.getElementById('modal-profile'), o = document.getElementById('overlay');
    const isHidden = m.style.display === 'none' || m.style.display === '';
    m.style.display = isHidden ? 'block' : 'none';
    o.style.display = isHidden ? 'block' : 'none';
};

function render(text) {
    return text.replace(/\[IMG\](.*?)\[\/IMG\]/g, '<img src="$1" class="media-preview">')
               .replace(/\[VID\](.*?)\[\/VID\]/g, '<video src="$1" controls class="media-preview"></video>');
}

window.handleFile = (input, targetId) => {
    const file = input.files[0];
    if(!file || file.size > 1000000) return alert("Fichier trop lourd (Max 1Mo)");
    const reader = new FileReader();
    reader.onload = (e) => {
        const tag = file.type.startsWith('image') ? 'IMG' : 'VID';
        document.getElementById(targetId).value += ` [${tag}]${e.target.result}[/${tag}]`;
    };
    reader.readAsDataURL(file);
};
