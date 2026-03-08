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
        // L'utilisateur est déjà connecté avec Google
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        if (snap.exists()) {
            myId = user.uid;
            myData = snap.val();
            startApp(); // Démarre l'application
        } else {
            // Première connexion, utilisateur Google existant mais pas encore dans la DB
            document.getElementById('screen-login').style.display = 'block';
            document.getElementById('screen-app').style.display = 'none';
        }
    } else {
        // Utilisateur pas connecté, afficher écran login
        document.getElementById('screen-login').style.display = 'block';
        document.getElementById('screen-app').style.display = 'none';
    }
});

// --- BOUTON CONNEXION GOOGLE ---
window.doLogin = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Vérifie si l'utilisateur existe déjà
        const snap = await get(child(ref(db), `utilisateurs/${user.uid}`));
        let roleChoisi;

        if (!snap.exists()) {
            // Première connexion : demander le rôle
            const rolesValides = ["eleve", "parent", "professeur", "directeur"];
            roleChoisi = "";
            while (!rolesValides.includes(roleChoisi)) {
                roleChoisi = prompt("Quel est ton rôle ? (eleve, parent, professeur, directeur)");
                if (roleChoisi) roleChoisi = roleChoisi.toLowerCase().trim();
                if (!rolesValides.includes(roleChoisi)) {
                    alert("Veuillez écrire seulement : eleve, parent, professeur ou directeur.");
                }
            }

            if (roleChoisi !== "eleve") {
                const codeValide = prompt(`Entrez le code pour ${roleChoisi}`);
                if (codeValide !== codes[roleChoisi]) {
                    alert("Code incorrect ! Vous ne pouvez pas créer ce compte.");
                    await signOut(auth); // déconnecte l'utilisateur Google
                    return;
                }
            }

            // Création du compte
            myData = {
                nom: user.displayName,
                role: roleChoisi,
                enLigne: true,
                email: user.email
            };
            await set(ref(db, `utilisateurs/${user.uid}`), myData);

        } else {
            // Si l'utilisateur existe déjà
            myData = snap.val();
        }

        // Sauvegarde de l'ID et démarrage de l'app
        myId = user.uid;
        startApp();

    } catch (err) {
        alert("Erreur : " + err.message);
    }
};
            await set(ref(db, `utilisateurs/${user.uid}`), myData);

        } else {
            myData = snap.val();
        }

        myId = user.uid;
        startApp();
    } catch(err) {
        alert("Erreur : " + err.message);
    }
};

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
            html = `<div class="post">
                        <strong>${escapeHTML(p.name)}</strong>
                        <span class="badge badge-${p.role}">${p.role}</span><br>
                        ${render(p.text)}
                    </div>` + html;
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

function render(text){
    text = escapeHTML(text); // nettoyer tout le texte utilisateur

    // remplacer uniquement [IMG] et [VID] par du HTML contrôlé
    text = text.replace(/\[IMG\](.*?)\[\/IMG\]/g, (match, src) => {
        return `<img src="${src}" class="media-preview" />`;
    });

    text = text.replace(/\[VID\](.*?)\[\/VID\]/g, (match, src) => {
        return `<video src="${src}" controls class="media-preview"></video>`;
    });

    return text;
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
// Fonction pour sécuriser tout texte contre XSS
function escapeHTML(text){
    const div = document.createElement('div');
    div.textContent = text;  // transforme tout en texte sûr
    return div.innerHTML;
}
function displayChatMessage(msg, senderRole, isMe){
    const htmlMsg = `<div class="msg ${isMe ? 'msg-me' : 'msg-them'}">
        <strong>${escapeHTML(msg.name)}</strong>: ${render(msg.text)}
    </div>`;
    document.getElementById('chat-messages').innerHTML += htmlMsg;
}
