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
        const snapUser = await get(child(ref(db), `utilisateurs/${user.uid}`));
        let roleChoisi;

        if (!snapUser.exists()) {
            // Premier passage : demander le rôle
            const rolesValides = ["eleve", "parent", "professeur", "directeur"];
            roleChoisi = "";

            while(!rolesValides.includes(roleChoisi)){
                roleChoisi = prompt("Quel est ton rôle ? (eleve, parent, professeur, directeur)");
                if(roleChoisi){
                    roleChoisi = roleChoisi.toLowerCase().trim();
                }
                if(!rolesValides.includes(roleChoisi)){
                    alert("Veuillez écrire seulement : eleve, parent, professeur ou directeur.");
                }
            }

            // Si ce n'est pas un élève, vérifier le code dans Firebase
            if(roleChoisi !== "eleve") {
                const snapCodes = await get(ref(db, `codes/${roleChoisi}`));
                const codeCorrect = snapCodes.exists() ? snapCodes.val() : null;

                let codeValide = prompt(`Entrez le code pour ${roleChoisi}`);
                if(codeValide !== codeCorrect){
                    alert("Code incorrect ! Vous ne pouvez pas créer ce compte.");
                    await signOut(auth); // déconnecte l'utilisateur Google
                    return; // stoppe la création du compte
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
            myData = snapUser.val();
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

window.sendPost = async () => {
    const val = document.getElementById('post-text').value;
    if (!val.trim()) return;

    try {
        // 1. On publie dans l'onglet actuel (que ce soit posts-exercises, posts-staff, etc.)
        await push(ref(db, currentPath), { 
            name: myData.nom, 
            role: myData.role, 
            text: val,
            timestamp: Date.now() 
        });

        document.getElementById('post-text').value = "";

        // 2. NETTOYAGE AUTOMATIQUE de l'onglet en cours
        // Cette ligne va nettoyer l'onglet où tu viens d'écrire !
        autoPurge(currentPath);

    } catch (e) {
        alert("Erreur : " + e.message);
    }
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
    // À l'intérieur de ta fonction qui affiche les messages
    text = text.replace(/\[AUD\](.*?)\[\/AUD\]/g, (match, src) => {
        return `<div style="margin-top:10px;">
                    <audio src="${src}" controls style="width:100%; height:30px;"></audio>
                </div>`;
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
// --- FONCTION POUR CHARGER LES CONTACTS ---
function loadContacts() {
    onValue(ref(db, 'utilisateurs'), (snap) => {
        let html = "";
        snap.forEach(childSnap => {
            const user = childSnap.val();
            const userId = childSnap.key;
            if (userId !== myId) { // Ne pas s'afficher soi-même
                const statusClass = user.enLigne ? 'online' : 'offline';
                html += `
                <div class="contact-item" onclick="selectContact('${userId}', '${user.nom}')">
                    <div class="status-dot" style="background: var(--${statusClass})"></div>
                    ${escapeHTML(user.nom)} <span class="badge badge-${user.role}">${user.role}</span>
                </div>`;
            }
        });
        document.getElementById('contact-list').innerHTML = html;
    });
}

// --- FONCTION POUR SÉLECTIONNER UN CONTACT ---
window.selectContact = (id, nom) => {
    selectedContactId = id;
    document.getElementById('chat-header').innerText = "Chat avec " + nom;
    document.getElementById('chat-messages').innerHTML = "";
    
    // On crée un ID de chat unique (le plus petit ID en premier pour que ce soit le même pour les deux)
    const chatId = myId < id ? `${myId}_${id}` : `${id}_${myId}`;
    
    off(ref(db, `messages_prives/${chatId}`)); // Nettoie l'ancien écouteur
    onValue(ref(db, `messages_prives/${chatId}`), (snap) => {
        document.getElementById('chat-messages').innerHTML = "";
        snap.forEach(m => {
            const msg = m.val();
            displayChatMessage(msg, msg.role, msg.senderId === myId);
        });
    });
};

// --- FONCTION POUR ENVOYER UN MESSAGE PRIVÉ ---
window.sendPrivateMsg = () => {
    const text = document.getElementById('chat-input').value;
    if (!text.trim() || !selectedContactId) return;
    
    const chatId = myId < selectedContactId ? `${myId}_${selectedContactId}` : `${selectedContactId}_${myId}`;
    
    push(ref(db, `messages_prives/${chatId}`), {
        senderId: myId,
        name: myData.nom,
        role: myData.role,
        text: text,
        timestamp: Date.now()
    });
    
    document.getElementById('chat-input').value = "";
};
async function autoPurge(path) {
    const postsRef = ref(db, path);
    // On récupère tous les messages du dossier actuel
    const snap = await get(postsRef);
    
    if (snap.exists()) {
        let entries = [];
        snap.forEach(child => {
            entries.push({ id: child.key, data: child.val() });
        });

        // Si on dépasse 30 messages
        if (entries.length > 30) {
            // On trie pour être sûr d'avoir les plus anciens en premier
            // (Même si Firebase le fait souvent par défaut avec les clés push)
            const toDelete = entries.length - 30;
            
            for (let i = 0; i < toDelete; i++) {
                // Suppression définitive du message trop vieux
                await set(ref(db, `${path}/${entries[i].id}`), null);
            }
            console.log(`Auto-Purge : ${toDelete} messages supprimés pour faire de la place.`);
        }
    }
}
let mediaRecorder;
let audioChunks = [];

window.toggleRecord = async () => {
    const status = document.getElementById('recording-status');
    const btn = document.getElementById('mic-btn');

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // On utilise un bitrate faible (16kbps) pour que le fichier soit MINUSCULE
            mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    // On injecte le tag audio dans le champ de texte
                    document.getElementById('post-text').value += ` [AUD]${base64Audio}[/AUD]`;
                };
                status.style.display = 'none';
                btn.style.filter = "none";
            };

            mediaRecorder.start();
            status.style.display = 'inline';
            btn.style.filter = "drop-shadow(0 0 5px red)"; // Effet visuel "Enregistre"
        } catch (err) {
            alert("Microphone refusé ou non trouvé.");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
};
